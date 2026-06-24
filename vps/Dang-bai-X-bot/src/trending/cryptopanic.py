from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlparse

import httpx
from loguru import logger

CRYPTOPANIC_URL = "https://cryptopanic.com/api/v1/posts/"
MAX_ITEMS = 30


def _parse_published_at(value: str | None) -> datetime | None:
    if not value:
        return None

    normalized = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _extract_source(item: dict[str, Any]) -> str:
    source = item.get("source")
    if isinstance(source, dict):
        title = source.get("title")
        if isinstance(title, str) and title.strip():
            return title.strip()

        domain = source.get("domain")
        if isinstance(domain, str) and domain.strip():
            return domain.strip()

    url = item.get("url")
    if isinstance(url, str) and url.strip():
        return urlparse(url).netloc or "CryptoPanic"

    return "CryptoPanic"


async def fetch_hot_news(api_key: str, hours: int = 48) -> list[dict]:
    """Fetch hot crypto news from CryptoPanic API."""
    if not api_key.strip():
        logger.warning("Bỏ qua CryptoPanic vì chưa cấu hình CRYPTOPANIC_API_KEY.")
        return []

    cutoff = datetime.now(UTC) - timedelta(hours=hours)
    params = {
        "auth_token": api_key,
        "filter": "hot",
        "kind": "news",
        "public": "true",
    }

    async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=10.0)) as client:
        try:
            response = await client.get(CRYPTOPANIC_URL, params=params)
        except httpx.HTTPError as exc:
            logger.warning("Không lấy được dữ liệu CryptoPanic: {}", exc)
            return []

    if response.status_code == 429:
        logger.warning("CryptoPanic đang rate limit (429), tạm bỏ qua nguồn này.")
        return []

    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.warning("CryptoPanic trả về lỗi HTTP {}.", exc.response.status_code)
        return []

    payload = response.json()
    results = payload.get("results", [])
    if not isinstance(results, list):
        logger.warning("Dữ liệu CryptoPanic không đúng định dạng mong đợi.")
        return []

    items: list[dict] = []
    for raw_item in results:
        if not isinstance(raw_item, dict):
            continue

        published_at = _parse_published_at(raw_item.get("published_at"))
        if published_at is None or published_at < cutoff:
            continue

        title = str(raw_item.get("title", "")).strip()
        url = str(raw_item.get("url", "")).strip()
        if not title or not url:
            continue

        summary = str(raw_item.get("metadata", {}).get("description", "")).strip() or title
        items.append(
            {
                "title": title,
                "url": url,
                "source": _extract_source(raw_item),
                "published_at": published_at.isoformat(),
                "summary": summary,
            }
        )

        if len(items) >= MAX_ITEMS:
            break

    logger.info("CryptoPanic lấy được {} tin hot trong {} giờ gần nhất.", len(items), hours)
    return items
