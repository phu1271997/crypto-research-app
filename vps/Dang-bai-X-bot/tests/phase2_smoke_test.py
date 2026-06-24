from __future__ import annotations

import asyncio
import json
import sys
from collections import Counter
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.llm_client import OpenRouterClient
from src.settings import config, settings
from src.trending.aggregator import get_trending_topics
from src.trending.rss_feeds import fetch_rss_items


def print_section(title: str) -> None:
    print(f"\n=== {title} ===")


async def main() -> None:
    print_section("RSS miễn phí")
    rss_items = await fetch_rss_items(
        config.trending.rss_feeds,
        config.trending.lookback_hours,
    )
    distribution = Counter(item["source"] for item in rss_items)
    print(f"Số lượng item: {len(rss_items)}")
    print("Phân bổ theo nguồn:")
    for source, count in distribution.items():
        print(f"- {source}: {count}")

    print_section("Full Aggregator")
    try:
        settings.require(["openrouter_api_key", "model_trending"])
    except ValueError as exc:
        print(f"Bỏ qua full aggregator: {exc}")
        return

    client = OpenRouterClient(api_key=settings.openrouter_api_key or "")
    try:
        topics = await get_trending_topics(client)
    finally:
        await client.aclose()

    print(json.dumps({"topics": topics}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
