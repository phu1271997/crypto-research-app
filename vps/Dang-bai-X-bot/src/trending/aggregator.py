from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path
from typing import Any

import httpx
from loguru import logger

from src.db import get_recent_titles
from src.llm_client import OpenRouterClient, clean_and_parse_json
from src.settings import ROOT_DIR, config, settings
from src.trending import rss_feeds

PROMPT_PATH = ROOT_DIR / "prompts" / "trending_aggregator.md"
REQUIRED_TOPIC_FIELDS = {"id", "title", "angle", "key_points", "sources"}
GENERIC_TITLE_WORDS = {
    "la",
    "gi",
    "là",
    "gì",
    "what",
    "how",
    "why",
    "crypto",
    "bitcoin",
    "blockchain",
}


def _load_prompt_template(path: Path = PROMPT_PATH) -> str:
    if not path.exists():
        raise FileNotFoundError(f"Không tìm thấy prompt file: {path}")
    return path.read_text(encoding="utf-8")


def _render_prompt(template: str, recent_titles: list[str], items: list[dict[str, Any]], num_topics: int) -> str:
    return (
        template.replace("{recent_titles}", _normalize_recent_titles(recent_titles))
        .replace("{items_json}", json.dumps(items, ensure_ascii=False, indent=2))
        .replace("{num_topics}", str(num_topics))
    )


def _normalize_recent_titles(recent_titles: list[str]) -> str:
    if not recent_titles:
        return "Chưa có"
    return "\n".join(f"- {title}" for title in recent_titles)


def _dedupe_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    seen_titles: set[str] = set()

    for item in items:
        title_key = str(item.get("title", "")).strip().lower()
        url_key = str(item.get("url", "")).strip().lower()
        if not title_key:
            continue
        if url_key and url_key in seen_urls:
            continue
        if title_key in seen_titles:
            continue

        if url_key:
            seen_urls.add(url_key)
        seen_titles.add(title_key)
        deduped.append(item)

    return deduped


def _validate_topic(topic: Any, index: int) -> dict[str, Any]:
    if not isinstance(topic, dict):
        raise ValueError(f"Topic thứ {index} không phải object.")

    missing_fields = REQUIRED_TOPIC_FIELDS - set(topic)
    if missing_fields:
        missing = ", ".join(sorted(missing_fields))
        raise ValueError(f"Topic thứ {index} thiếu field bắt buộc: {missing}")

    if not isinstance(topic["id"], int):
        raise ValueError(f"Topic thứ {index} có 'id' không phải số nguyên.")
    if not isinstance(topic["title"], str) or not topic["title"].strip():
        raise ValueError(f"Topic thứ {index} có 'title' rỗng hoặc sai kiểu.")
    if not isinstance(topic["angle"], str) or not topic["angle"].strip():
        raise ValueError(f"Topic thứ {index} có 'angle' rỗng hoặc sai kiểu.")
    if not isinstance(topic["key_points"], list) or len(topic["key_points"]) < 2:
        raise ValueError(f"Topic thứ {index} phải có ít nhất 2 key_points.")
    if not all(isinstance(point, str) and point.strip() for point in topic["key_points"]):
        raise ValueError(f"Topic thứ {index} có key_points không hợp lệ.")
    if not isinstance(topic["sources"], list) or not topic["sources"]:
        raise ValueError(f"Topic thứ {index} phải có ít nhất 1 source.")
    if not all(isinstance(source, str) and source.strip() for source in topic["sources"]):
        raise ValueError(f"Topic thứ {index} có sources không hợp lệ.")

    return topic


def _pick_key_points(item: dict[str, Any]) -> list[str]:
    summary = str(item.get("summary", "")).strip()
    title = str(item.get("title", "")).strip()
    source = str(item.get("source", "")).strip()

    candidates = re.split(r"[.!?;]\s+|\n+", summary)
    key_points = [part.strip(" -") for part in candidates if part.strip()]
    cleaned = [point for point in key_points if len(point.split()) >= 4]

    if len(cleaned) >= 3:
        return cleaned[:3]

    fallback = [
        title,
        f"Theo dõi sát diễn biến từ nguồn {source}.",
        "Đánh giá tác động đến narrative, dòng tiền và góc nhìn đầu tư.",
    ]
    return fallback[:3]


def _build_fallback_angle(item: dict[str, Any]) -> str:
    summary = str(item.get("summary", "")).strip()
    source = str(item.get("source", "")).strip() or "nguồn tổng hợp"
    if summary:
        return f"Chủ đề này nổi bật trong 48 giờ qua và đáng đào sâu thêm về tác động thị trường. Nguồn tham chiếu chính: {source}."
    return f"Chủ đề này xuất hiện nổi bật trên {source} và phù hợp để viết góc nhìn research ngắn hạn."


def _build_fallback_topics(items: list[dict[str, Any]], recent_titles: list[str], limit: int) -> list[dict[str, Any]]:
    recent_lower = {title.strip().lower() for title in recent_titles}
    topics: list[dict[str, Any]] = []
    seen_keywords: set[str] = set()

    for item in items:
        title = str(item.get("title", "")).strip()
        title_lower = title.lower()
        if not title or title_lower in recent_lower:
            continue

        title_keywords = {
            token
            for token in re.findall(r"[a-zA-ZÀ-ỹ0-9]{4,}", title_lower)
            if token not in GENERIC_TITLE_WORDS
        }
        if title_keywords and seen_keywords.intersection(title_keywords):
            continue

        topics.append(
            {
                "id": len(topics) + 1,
                "title": title,
                "angle": _build_fallback_angle(item),
                "key_points": _pick_key_points(item),
                "sources": [str(item.get("url", "")).strip()] if str(item.get("url", "")).strip() else [],
            }
        )
        seen_keywords.update(title_keywords)

        if len(topics) >= limit:
            break

    if len(topics) < limit:
        for item in items:
            title = str(item.get("title", "")).strip()
            url = str(item.get("url", "")).strip()
            if not title or any(existing["title"] == title for existing in topics):
                continue
            topics.append(
                {
                    "id": len(topics) + 1,
                    "title": title,
                    "angle": _build_fallback_angle(item),
                    "key_points": _pick_key_points(item),
                    "sources": [url] if url else [],
                }
            )
            if len(topics) >= limit:
                break

    return topics[:limit]


async def get_trending_topics(
    client: OpenRouterClient,
    recent_titles: list[str] | None = None,
) -> list[dict]:
    """Main entry: fetch all sources → LLM picks top 5."""
    if recent_titles is None:
        recent_titles = await get_recent_titles(config.db.recent_articles_keep)

    logger.info("Bắt đầu thu thập dữ liệu trending từ các RSS miễn phí và Coin68.")
    (rss_items,) = await asyncio.gather(
        rss_feeds.fetch_rss_items(
            config.trending.rss_feeds,
            config.trending.lookback_hours,
        ),
    )

    raw_items = _dedupe_items(rss_items)
    if not raw_items:
        raise RuntimeError("Không lấy được dữ liệu trending từ các nguồn miễn phí, hãy kiểm tra network hoặc feed RSS.")

    logger.info(
        "Đã gom được {} item thô từ {} RSS feed.",
        len(raw_items),
        len(config.trending.rss_feeds),
    )

    prompt = _render_prompt(_load_prompt_template(), recent_titles, raw_items, config.trending.num_topics)

    try:
        response_text = await client.chat(
            model=settings.model_trending,
            messages=[
                {
                    "role": "system",
                    "content": "Bạn là chuyên gia research crypto cho quỹ VC. Luôn trả JSON hợp lệ.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            max_tokens=2500,
            response_format={"type": "json_object"},
        )

        payload = clean_and_parse_json(response_text)
        topics = payload.get("topics")
        if not isinstance(topics, list):
            raise ValueError("LLM trả về sai format: thiếu key 'topics' dạng list.")
        if len(topics) != config.trending.num_topics:
            raise ValueError(
                f"LLM trả về {len(topics)} topics, nhưng cần đúng {config.trending.num_topics}."
            )

        validated_topics = [_validate_topic(topic, index + 1) for index, topic in enumerate(topics)]
        logger.info("LLM đã chọn xong {} topic nổi bật.", len(validated_topics))
        return validated_topics
    except (json.JSONDecodeError, ValueError, httpx.HTTPError) as exc:
        logger.warning("Không dùng được bước chọn topic bằng LLM ({}). Chuyển sang heuristic miễn phí.", exc)
        fallback_topics = _build_fallback_topics(raw_items, recent_titles, config.trending.num_topics)
        if len(fallback_topics) != config.trending.num_topics:
            raise RuntimeError(
                f"Fallback heuristic chỉ chọn được {len(fallback_topics)} topic, chưa đủ {config.trending.num_topics}."
            ) from exc
        logger.info("Fallback heuristic đã chọn xong {} topic.", len(fallback_topics))
        return fallback_topics


async def main_cli() -> None:
    """For standalone run: python -m src.trending.aggregator"""
    try:
        settings.require(["openrouter_api_key", "model_trending"])
    except ValueError as exc:
        raise SystemExit(f"Lỗi cấu hình: {exc}") from exc

    client = OpenRouterClient(api_key=settings.openrouter_api_key or "")
    try:
        topics = await get_trending_topics(client)
    finally:
        await client.aclose()

    print(
        json.dumps(
            {"topics": topics},
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    asyncio.run(main_cli())
