from __future__ import annotations

import asyncio
import re
from pathlib import Path

from loguru import logger

from src.llm_client import OpenRouterClient
from src.settings import ROOT_DIR, config

IMAGES_DIR = ROOT_DIR / "storage" / "images"
THUMBNAIL_PROMPT_PATH = ROOT_DIR / "prompts" / "image_thumbnail.md"
INLINE_PROMPT_PATH = ROOT_DIR / "prompts" / "image_inline.md"


def _extract_section_text(article_content: str, section_name: str) -> str | None:
    pattern = rf"##\s+{re.escape(section_name)}\s*(.*?)(?=\n##\s+|\Z)"
    match = re.search(pattern, article_content, flags=re.DOTALL | re.IGNORECASE)
    if not match:
        return None
    return match.group(1).strip()


def _first_sentence(text: str, fallback_chars: int = 160) -> str:
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return ""
    parts = re.split(r"(?<=[.!?])\s+", normalized)
    for part in parts:
        cleaned = part.strip(" -")
        if len(cleaned.split()) >= 4:
            return cleaned
    return normalized[:fallback_chars].strip()


def _extract_key_concept(article_content: str) -> str:
    """
    Trích xuất concept chính từ bài viết để feed vào image prompt.
    """
    title_match = re.search(r"^\s*#\s+(.+?)\s*$", article_content, flags=re.MULTILINE)
    title = title_match.group(1).strip() if title_match else ""
    analysis_text = _extract_section_text(article_content, "Phân tích") or article_content
    concept = _first_sentence(analysis_text, fallback_chars=180)
    if title and concept:
        return f"{title}. {concept}"
    return title or concept or article_content[:100].strip()


def _extract_middle_concept(article_content: str) -> str:
    """
    Trích concept ở giữa bài cho ảnh inline.
    """
    market_impact = _extract_section_text(article_content, "Tác động thị trường")
    risk_factors = _extract_section_text(article_content, "Rủi ro và biến số cần theo dõi")
    for candidate in [market_impact, risk_factors]:
        if candidate:
            sentences = re.split(r"(?<=[.!?])\s+", re.sub(r"\s+", " ", candidate).strip())
            selected = [sentence.strip(" -") for sentence in sentences if sentence.strip()]
            if selected:
                return " ".join(selected[:2])[:220].strip()
    return _extract_key_concept(article_content)


def _render_image_prompt(template_path: Path, title: str, concept: str) -> str:
    """Load template, replace placeholders, return prompt string."""
    if not template_path.exists():
        raise FileNotFoundError(f"Không tìm thấy image prompt template: {template_path}")

    template = template_path.read_text(encoding="utf-8")
    return (
        template.replace("{title}", title.strip())
        .replace("{key_concept}", concept.strip())
        .replace("{middle_concept}", concept.strip())
    )


async def _generate_one_image(
    client: OpenRouterClient,
    prompt: str,
    size: str,
    output_path: Path,
) -> Path:
    """Gọi client.generate_image, lưu bytes vào file, return path."""
    image_bytes = await client.generate_image(prompt=prompt, size=size)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(image_bytes)
    logger.info("✅ Đã tạo ảnh: {} ({} bytes)", output_path.name, len(image_bytes))
    return output_path


async def generate_images(client: OpenRouterClient, article: dict) -> dict:
    """
    Tạo 2 ảnh song song cho bài viết.
    """
    article_id = str(article.get("article_id", "article")).strip()
    title = str(article.get("title", "")).strip()
    content = str(article.get("content", "")).strip()

    key_concept = _extract_key_concept(content)
    middle_concept = _extract_middle_concept(content)

    thumbnail_prompt = _render_image_prompt(THUMBNAIL_PROMPT_PATH, title, key_concept)
    inline_prompt = _render_image_prompt(INLINE_PROMPT_PATH, title, middle_concept)

    thumbnail_path = IMAGES_DIR / f"{article_id}_thumb.png"
    inline_path = IMAGES_DIR / f"{article_id}_inline.png"

    async def safe_generate(prompt: str, size: str, output_path: Path) -> str | None:
        try:
            path = await _generate_one_image(client, prompt, size, output_path)
            return str(path.resolve())
        except Exception as exc:  # noqa: BLE001
            logger.warning("Không tạo được ảnh {}: {}", output_path.name, exc)
            return None

    thumbnail_result, inline_result = await asyncio.gather(
        safe_generate(thumbnail_prompt, config.image.thumbnail_size, thumbnail_path),
        safe_generate(inline_prompt, config.image.inline_size, inline_path),
    )

    if not thumbnail_result and not inline_result:
        logger.warning("Cả 2 ảnh đều không tạo được cho article_id={}.", article_id)

    return {
        "thumbnail_path": thumbnail_result,
        "inline_path": inline_result,
    }
