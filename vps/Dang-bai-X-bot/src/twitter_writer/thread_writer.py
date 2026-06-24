from __future__ import annotations

from datetime import datetime
import json
import re

from loguru import logger

from src.llm_client import OpenRouterClient, clean_and_parse_json
from src.settings import ROOT_DIR, config, settings

PROMPT_PATH = ROOT_DIR / "prompts" / "twitter_thread_en.md"
TWEET_MAX_CHARS = config.twitter.tweet_max_chars
PLACEHOLDER_URL = "<PLACEHOLDER_URL>"


def _render_prompt(article_content: str) -> str:
    """Load template, replace {article_content}, return string."""
    if not PROMPT_PATH.exists():
        raise FileNotFoundError(f"Không tìm thấy prompt thread: {PROMPT_PATH}")

    template = PROMPT_PATH.read_text(encoding="utf-8")
    return template.replace("{article_content}", article_content)


def _truncate_one_tweet(tweet: str) -> str:
    if len(tweet) <= TWEET_MAX_CHARS:
        return tweet

    target = TWEET_MAX_CHARS - 3
    search_window = tweet[: target + 1]
    punctuation_indexes = [search_window.rfind(mark) for mark in [". ", "! ", "? ", "; ", ", "]]
    split_index = max(punctuation_indexes)
    if split_index < 180:
        split_index = target

    truncated = tweet[: split_index + 1].rstrip(" ,;")
    if len(truncated) > target:
        truncated = truncated[:target].rstrip()
    return truncated + "..."


def _truncate_long_tweets(thread: list[str]) -> list[str]:
    """
    Nếu có tweet > TWEET_MAX_CHARS: cắt thông minh ở dấu câu gần nhất.
    """
    normalized: list[str] = []
    for tweet in thread:
        cleaned = tweet.strip()
        if len(cleaned) > TWEET_MAX_CHARS:
            logger.warning("Tweet dài {} chars, tự động truncate.", len(cleaned))
            cleaned = _truncate_one_tweet(cleaned)
        normalized.append(cleaned)
    return normalized


def _ensure_placeholder_url(thread: list[str]) -> list[str]:
    if not thread:
        return [f"Read the full research: {PLACEHOLDER_URL}"]

    last_tweet = thread[-1]
    if PLACEHOLDER_URL in last_tweet:
        return thread

    suffix = f"\n\nRead the full research: {PLACEHOLDER_URL}"
    if len(last_tweet) + len(suffix) <= TWEET_MAX_CHARS:
        thread[-1] = last_tweet.rstrip() + suffix
    else:
        thread.append(f"Read the full research: {PLACEHOLDER_URL}")
    return thread


def _validate_thread(thread: list[str]) -> tuple[bool, list[str]]:
    """
    Validation mới cho long-form thread.
    """
    warnings: list[str] = []
    tweet_count = len(thread)

    if tweet_count < config.twitter.thread_min_tweets or tweet_count > config.twitter.thread_max_tweets:
        warnings.append(
            f"Thread hiện có {tweet_count} tweet, nằm ngoài khoảng khuyến nghị "
            f"{config.twitter.thread_min_tweets}-{config.twitter.thread_max_tweets}."
        )

    for index, tweet in enumerate(thread, start=1):
        if len(tweet) > TWEET_MAX_CHARS:
            warnings.append(f"Tweet {index} vẫn vượt quá {TWEET_MAX_CHARS} ký tự sau khi xử lý.")
        if len(tweet) < 400:
            warnings.append(f"Tweet {index} chỉ có {len(tweet)} ký tự, hơi ngắn so với mục tiêu long-form.")
        if re.match(r"^\s*\d+\/", tweet):
            warnings.append(f"Tweet {index} đang bị đánh số kiểu '1/', '2/'.")

    if thread and "🧵" not in thread[0]:
        warnings.append("Tweet đầu tiên chưa có ký hiệu 🧵.")

    if thread and PLACEHOLDER_URL not in thread[-1]:
        warnings.append("Tweet cuối chưa chứa PLACEHOLDER_URL.")

    is_valid = all(len(tweet) <= TWEET_MAX_CHARS for tweet in thread)
    return is_valid, warnings


async def write_thread(client: OpenRouterClient, article: dict) -> dict:
    """
    Generate an English Twitter thread from a Vietnamese article.
    """
    prompt = _render_prompt(str(article.get("content", "")).strip())
    response_text = await client.chat(
        model=settings.model_article,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.8,
        max_tokens=4000,
        response_format={"type": "json_object"},
    )

    try:
        payload = clean_and_parse_json(response_text)
    except json.JSONDecodeError as exc:
        raw_preview = response_text[:1200]
        logger.error("LLM trả JSON thread lỗi. Raw response: {}", raw_preview)
        raise ValueError(f"LLM trả về JSON thread không parse được. Raw response: {raw_preview}") from exc

    raw_thread = payload.get("thread")
    if not isinstance(raw_thread, list) or not all(isinstance(item, str) for item in raw_thread):
        raw_preview = response_text[:1200]
        logger.error("LLM trả thread sai format. Raw response: {}", raw_preview)
        raise ValueError(f"LLM trả thread sai format. Raw response: {raw_preview}")

    thread = [tweet.strip() for tweet in raw_thread if tweet.strip()]
    thread = _truncate_long_tweets(thread)
    thread = _ensure_placeholder_url(thread)
    thread = _truncate_long_tweets(thread)

    is_valid, warnings = _validate_thread(thread)
    average_chars = round(sum(len(tweet) for tweet in thread) / len(thread), 2) if thread else 0
    logger.info(
        "Đã tạo thread Twitter: {} tweets | trung bình {} chars/tweet | hợp lệ={}",
        len(thread),
        average_chars,
        is_valid,
    )
    for warning in warnings:
        logger.warning("Cảnh báo thread: {}", warning)

    return {
        "thread": thread,
        "warnings": warnings,
        "tweet_count": len(thread),
    }


def mock_thread(article: dict, x_format: str = "thread") -> dict:
    """Tạo thread hoặc article giả cho mock mode."""
    marker = datetime.now().strftime("%H:%M:%S.%f")
    if x_format == "article":
        article_text = (
            f"[MOCK ARTICLE {marker}] {article['title']}\n\n"
            "This is a mock long-form article post on X. It is designed to look like a detailed, "
            "comprehensive single-post writeup rather than a thread of multiple smaller tweets. "
            "It will be posted as a single tweet, which is possible for X Premium accounts. "
            "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore. " * 4 +
            f"\n\nRead the full research: {PLACEHOLDER_URL}"
        )
        return {
            "thread": [article_text],
            "warnings": ["[MOCK MODE] X Article giả lập"],
            "tweet_count": 1,
        }

    tweet_1 = (
        f"🧵 [MOCK {marker}] {article['title']}\n\n"
        "This is a mock long-form tweet built to simulate a premium X post with a strong thesis, "
        "clear framing, and enough body text to validate the Telegram preview flow end-to-end. "
        "It should feel like a serious investor note rather than a short social post. " * 6
    )
    tweet_2 = (
        "[MOCK] Core analysis.\n\n"
        "This section simulates deeper analysis, including market structure, positioning, catalyst mapping, "
        "and second-order effects that matter for evaluating the durability, constraints, and broader impact "
        "of the topic over time. " * 7
    )
    tweet_3 = (
        "[MOCK] Nuance and CTA.\n\n"
        "This final tweet is intentionally long enough to behave like a premium long-form post, while also "
        "including the expected call to action for the publishing pipeline and preview approval flow. "
        "Read the full research: "
        f"{PLACEHOLDER_URL}"
    )
    return {
        "thread": _truncate_long_tweets([tweet_1, tweet_2, tweet_3]),
        "warnings": ["[MOCK MODE] Thread giả lập"],
        "tweet_count": 3,
    }


PROMPT_ARTICLE_PATH = ROOT_DIR / "prompts" / "twitter_article_en.md"


def _render_article_prompt(article_content: str) -> str:
    if not PROMPT_ARTICLE_PATH.exists():
        raise FileNotFoundError(f"Không tìm thấy prompt article: {PROMPT_ARTICLE_PATH}")
    template = PROMPT_ARTICLE_PATH.read_text(encoding="utf-8")
    return template.replace("{article_content}", article_content)


def _truncate_article(text: str) -> str:
    if len(text) <= 3500:
        return text
    logger.warning("X Article dài {} chars, tự động truncate.", len(text))
    target = 3497
    search_window = text[:target + 1]
    split_index = max(search_window.rfind(mark) for mark in [". ", "! ", "? ", "; ", "\n"])
    if split_index < 180:
        split_index = target
    truncated = text[:split_index + 1].rstrip(" ,;\n")
    return truncated + "..."


def _ensure_placeholder_url_for_article(text: str) -> str:
    text = text.strip()
    if PLACEHOLDER_URL in text:
        return text
    return f"{text}\n\nRead the full research: {PLACEHOLDER_URL}"


async def write_x_article(client: OpenRouterClient, article: dict) -> dict:
    """
    Generate an English long-form X Article from a Vietnamese article.
    """
    prompt = _render_article_prompt(str(article.get("content", "")).strip())
    response_text = await client.chat(
        model=settings.model_article,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.8,
        max_tokens=4000,
        response_format={"type": "json_object"},
    )

    try:
        payload = clean_and_parse_json(response_text)
    except json.JSONDecodeError as exc:
        raw_preview = response_text[:1200]
        logger.error("LLM trả JSON X article lỗi. Raw response: {}", raw_preview)
        raise ValueError(f"LLM trả về JSON X article không parse được. Raw response: {raw_preview}") from exc

    article_text = payload.get("article")
    if not isinstance(article_text, str) or not article_text.strip():
        raw_preview = response_text[:1200]
        logger.error("LLM trả X article sai format. Raw response: {}", raw_preview)
        raise ValueError(f"LLM trả X article sai format (thiếu key 'article'). Raw response: {raw_preview}")

    article_text = article_text.strip()
    article_text = _ensure_placeholder_url_for_article(article_text)
    article_text = _truncate_article(article_text)

    warnings: list[str] = []
    if PLACEHOLDER_URL not in article_text:
        warnings.append("X Article chưa chứa PLACEHOLDER_URL.")
    if len(article_text) > 3500:
        warnings.append(f"X Article vượt quá 3500 ký tự ({len(article_text)} chars).")

    logger.info("Đã tạo X Article: {} chars", len(article_text))
    return {
        "thread": [article_text],
        "warnings": warnings,
        "tweet_count": 1,
    }
