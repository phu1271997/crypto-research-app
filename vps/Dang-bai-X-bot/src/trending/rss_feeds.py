from __future__ import annotations

import asyncio
import time
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlparse

import feedparser
from bs4 import BeautifulSoup
from loguru import logger

MAX_ITEMS_PER_FEED = 15


def _strip_html(raw_html: str | None) -> str:
    if not raw_html:
        return ""
    return BeautifulSoup(raw_html, "html.parser").get_text(" ", strip=True)


def _normalize_entry_timestamp(entry: Any) -> datetime | None:
    parsed = getattr(entry, "published_parsed", None) or getattr(entry, "updated_parsed", None)
    if parsed is None:
        return None

    try:
        return datetime.fromtimestamp(time.mktime(parsed), tz=UTC)
    except (OverflowError, TypeError, ValueError):
        return None


def _parse_single_feed(feed_url: str, cutoff: datetime) -> list[dict]:
    parsed_feed = feedparser.parse(feed_url)
    if getattr(parsed_feed, "bozo", False) and not parsed_feed.entries:
        raise ValueError(str(getattr(parsed_feed, "bozo_exception", "RSS parse error")))

    source = urlparse(feed_url).netloc or "RSS"
    items: list[dict] = []
    for entry in parsed_feed.entries:
        published_at = _normalize_entry_timestamp(entry)
        if published_at is None or published_at < cutoff:
            continue

        title = str(getattr(entry, "title", "")).strip()
        url = str(getattr(entry, "link", "")).strip()
        summary = _strip_html(getattr(entry, "summary", None)) or title
        if not title or not url:
            continue

        items.append(
            {
                "title": title,
                "url": url,
                "source": source,
                "published_at": published_at.isoformat(),
                "summary": summary,
            }
        )

        if len(items) >= MAX_ITEMS_PER_FEED:
            break

    return items


async def fetch_rss_items(feeds: list[str], hours: int = 48) -> list[dict]:
    """Fetch and parse RSS feeds, filter to last N hours."""
    cutoff = datetime.now(UTC) - timedelta(hours=hours)

    async def load_feed(feed_url: str) -> list[dict]:
        try:
            return await asyncio.wait_for(
                asyncio.to_thread(_parse_single_feed, feed_url, cutoff),
                timeout=20.0,
            )
        except asyncio.TimeoutError:
            logger.warning("RSS feed {} bị timeout, bỏ qua.", feed_url)
            return []
        except Exception as exc:  # noqa: BLE001
            logger.warning("RSS feed {} lỗi: {}", feed_url, exc)
            return []

    batches = await asyncio.gather(*(load_feed(feed) for feed in feeds))
    items = [item for batch in batches for item in batch]
    logger.info("RSS tổng hợp lấy được {} item từ {} feed.", len(items), len(feeds))
    return items
