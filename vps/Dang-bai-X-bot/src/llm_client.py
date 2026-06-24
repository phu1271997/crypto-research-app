from __future__ import annotations

import base64
import json
import re
from typing import Any

import httpx
from loguru import logger
from tenacity import AsyncRetrying, retry_if_exception_type, stop_after_attempt, wait_exponential

from src.settings import settings


def repair_truncated_json(s: str) -> str:
    s = s.strip()
    if not s:
        return s
    
    in_quote = False
    escape = False
    stack = []
    
    for i, c in enumerate(s):
        if escape:
            escape = False
            continue
        if c == '\\':
            escape = True
            continue
        if c == '"':
            in_quote = not in_quote
            continue
        if not in_quote:
            if c in ('{', '['):
                stack.append(c)
            elif c in ('}', ']'):
                if stack:
                    stack.pop()
                    
    if in_quote:
        s += '"'
        
    while stack:
        o = stack.pop()
        if o == '{':
            s += '}'
        elif o == '[':
            s += ']'
            
    return s


def clean_and_parse_json(text: str) -> Any:
    """
    Robust JSON parser that extracts JSON content from markdown wrappers
    or prefix/suffix noise, repairs truncated JSON structures, and parses it.
    """
    text = text.strip()
    
    # 1. Try direct parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 2. Try repairing and parsing direct text
    try:
        return json.loads(repair_truncated_json(text))
    except json.JSONDecodeError:
        pass

    # 3. Extract JSON block wrapped in triple backticks
    match = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
    if match: 
        extracted = match.group(1).strip()
        try:
            return json.loads(extracted)
        except json.JSONDecodeError:
            try:
                return json.loads(repair_truncated_json(extracted))
            except json.JSONDecodeError:
                text = extracted

    # 4. Try to find boundaries and parse/repair
    first_curly = text.find('{')
    last_curly = text.rfind('}')
    first_bracket = text.find('[')
    last_bracket = text.rfind(']')

    candidates = []
    if first_curly != -1:
        end_idx = last_curly + 1 if last_curly != -1 and last_curly > first_curly else len(text)
        candidates.append(text[first_curly:end_idx])
    if first_bracket != -1:
        end_idx = last_bracket + 1 if last_bracket != -1 and last_bracket > first_bracket else len(text)
        candidates.append(text[first_bracket:end_idx])

    for candidate in candidates:
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            try:
                return json.loads(repair_truncated_json(candidate))
            except json.JSONDecodeError:
                pass

    # If all fail, perform a final json.loads on repaired text to raise the proper exception
    return json.loads(repair_truncated_json(text))


class OpenRouterClient:
    """Thin async wrapper around OpenRouter chat and image generation APIs."""

    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError("OpenRouter API key is required.")

        self.api_key = api_key
        self.base_url = "https://openrouter.ai/api/v1"
        self.default_image_model = settings.model_image
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=httpx.Timeout(120.0, connect=20.0),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://primusspark.com",
                "X-Title": "crypto-research-bot",
            },
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def chat(
        self,
        model: str,
        messages: list[dict[str, Any]],
        temperature: float = 0.7,
        max_tokens: int = 4000,
        response_format: dict[str, Any] | None = None,
    ) -> str:
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False,
        }
        if response_format is not None:
            # Check if this is a Gemini model and JSON mode is enabled
            if "gemini" in model.lower() and response_format.get("type") == "json_object":
                logger.warning(f"Bypassing response_format for Gemini model '{model}' to avoid truncation bug.")
            else:
                payload["response_format"] = response_format

        data = await self._post_chat_completion(payload)
        self._log_usage("chat", model, data)

        try:
            message = data["choices"][0]["message"]
        except (KeyError, IndexError) as exc:
            raise ValueError(f"Malformed OpenRouter chat response: {data}") from exc

        content = self._extract_text_content(message.get("content"))
        if not content:
            raise ValueError(f"OpenRouter returned an empty text response: {data}")
        return content

    async def generate_image(self, prompt: str, size: str = "1200x630") -> bytes:
        payload: dict[str, Any] = {
            "model": self.default_image_model,
            "messages": [{"role": "user", "content": prompt}],
            "modalities": ["image", "text"],
            "stream": False,
            "image_config": self._build_image_config(size),
        }

        data = await self._post_chat_completion(payload)
        self._log_usage("image", self.default_image_model, data)

        try:
            message = data["choices"][0]["message"]
            image_entry = message["images"][0]
        except (KeyError, IndexError) as exc:
            raise ValueError(f"Malformed OpenRouter image response: {data}") from exc

        image_url = self._extract_image_url(image_entry)
        if not image_url.startswith("data:image/"):
            raise ValueError("Expected a base64 image data URL from OpenRouter image generation.")

        _, encoded = image_url.split(",", 1)
        return base64.b64decode(encoded)

    async def _post_chat_completion(self, payload: dict[str, Any]) -> dict[str, Any]:
        async for attempt in AsyncRetrying(
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=2, min=2, max=8),
            retry=retry_if_exception_type((httpx.HTTPError, ValueError)),
            reraise=True,
        ):
            with attempt:
                response = await self._client.post("/chat/completions", json=payload)
                response.raise_for_status()
                data = response.json()

                if "error" in data:
                    raise ValueError(f"OpenRouter returned an error: {data['error']}")

                return data

        raise RuntimeError("Retry loop exhausted unexpectedly.")

    @staticmethod
    def _extract_text_content(content: Any) -> str:
        if isinstance(content, str):
            return content.strip()

        if isinstance(content, list):
            text_parts: list[str] = []
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text":
                    text_parts.append(str(item.get("text", "")))
            return "\n".join(part.strip() for part in text_parts if part.strip()).strip()

        return ""

    @staticmethod
    def _extract_image_url(image_entry: dict[str, Any]) -> str:
        if "image_url" in image_entry:
            return image_entry["image_url"]["url"]
        if "imageUrl" in image_entry:
            return image_entry["imageUrl"]["url"]
        raise ValueError(f"Image entry did not contain image_url/imageUrl: {image_entry}")

    @staticmethod
    def _build_image_config(size: str) -> dict[str, str]:
        width, height = OpenRouterClient._parse_size(size)
        aspect_ratio = OpenRouterClient._to_supported_aspect_ratio(width, height)
        return {
            "aspect_ratio": aspect_ratio,
            "image_size": "1K",
        }

    @staticmethod
    def _parse_size(size: str) -> tuple[int, int]:
        try:
            width_text, height_text = size.lower().split("x", 1)
            return int(width_text), int(height_text)
        except ValueError as exc:
            raise ValueError(f"Invalid image size '{size}'. Expected format WIDTHxHEIGHT.") from exc

    @staticmethod
    def _to_supported_aspect_ratio(width: int, height: int) -> str:
        ratio = width / height
        supported = {
            "1:1": 1 / 1,
            "2:3": 2 / 3,
            "3:2": 3 / 2,
            "3:4": 3 / 4,
            "4:3": 4 / 3,
            "4:5": 4 / 5,
            "5:4": 5 / 4,
            "9:16": 9 / 16,
            "16:9": 16 / 9,
            "21:9": 21 / 9,
        }
        return min(supported, key=lambda key: abs(supported[key] - ratio))

    @staticmethod
    def _log_usage(operation: str, model: str, data: dict[str, Any]) -> None:
        usage = data.get("usage", {})
        logger.info(
            "OpenRouter {} | model={} | prompt_tokens={} | completion_tokens={} | total_tokens={}",
            operation,
            model,
            usage.get("prompt_tokens", "n/a"),
            usage.get("completion_tokens", "n/a"),
            usage.get("total_tokens", "n/a"),
        )
