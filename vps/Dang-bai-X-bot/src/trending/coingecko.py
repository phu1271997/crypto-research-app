from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any

import httpx
from loguru import logger
from tenacity import AsyncRetrying, retry_if_exception_type, stop_after_attempt, wait_exponential

from src.settings import settings

COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3"
MIN_MARKET_CAP_USD = 50_000_000


def _build_headers() -> dict[str, str]:
    headers = {"Accept": "application/json"}
    if settings.coingecko_api_key and settings.coingecko_api_key.strip():
        headers["x-cg-demo-api-key"] = settings.coingecko_api_key.strip()
    return headers


async def _request_json(path: str, params: dict[str, Any] | None = None) -> Any:
    async for attempt in AsyncRetrying(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        retry=retry_if_exception_type((httpx.HTTPError, ValueError)),
        reraise=True,
    ):
        with attempt:
            async with httpx.AsyncClient(
                base_url=COINGECKO_BASE_URL,
                headers=_build_headers(),
                timeout=httpx.Timeout(20.0, connect=10.0),
            ) as client:
                response = await client.get(path, params=params)

            if response.status_code == 429:
                raise ValueError("CoinGecko rate limit 429")

            response.raise_for_status()
            return response.json()

    raise RuntimeError("CoinGecko retry loop exhausted unexpectedly.")


async def fetch_trending() -> list[dict]:
    """Fetch trending coins from CoinGecko."""
    try:
        payload = await _request_json("/search/trending")
    except ValueError as exc:
        if "429" in str(exc):
            logger.warning("CoinGecko trending bị rate limit (429), tạm bỏ qua.")
            return []
        logger.warning("CoinGecko trending trả dữ liệu không hợp lệ: {}", exc)
        return []
    except httpx.HTTPError as exc:
        logger.warning("Không lấy được CoinGecko trending: {}", exc)
        return []

    coins = payload.get("coins", [])
    items: list[dict] = []
    now_iso = datetime.now(UTC).isoformat()
    for entry in coins:
        item = entry.get("item", {}) if isinstance(entry, dict) else {}
        if not isinstance(item, dict):
            continue

        name = str(item.get("name", "")).strip()
        symbol = str(item.get("symbol", "")).strip().upper()
        score = item.get("score")
        if not name or not symbol:
            continue

        rank = score + 1 if isinstance(score, int) else item.get("market_cap_rank", "?")
        data = item.get("data") or {}
        price_change = data.get("price_change_percentage_24h", {}).get("usd")
        summary = f"{name} đang nằm trong nhóm coin được tìm kiếm nhiều nhất trên CoinGecko."
        if isinstance(price_change, (int, float)):
            summary = f"{name} đang trend mạnh trên CoinGecko, biến động 24h khoảng {price_change:.2f}%."

        items.append(
            {
                "title": f"{name} ({symbol}) trending #{rank}",
                "symbol": symbol,
                "url": f"https://www.coingecko.com/en/coins/{item.get('slug', item.get('id', ''))}",
                "source": "CoinGecko Trending",
                "published_at": now_iso,
                "summary": summary,
                "market_cap_rank": item.get("market_cap_rank"),
            }
        )

    logger.info("CoinGecko trending lấy được {} coin.", len(items))
    return items


async def fetch_top_gainers(limit: int = 10) -> list[dict]:
    """Fetch top 24h gainers from CoinGecko markets."""
    params = {
        "vs_currency": "usd",
        "order": "price_change_percentage_24h_desc",
        "per_page": 50,
        "page": 1,
        "price_change_percentage": "24h",
        "sparkline": "false",
    }

    try:
        payload = await _request_json("/coins/markets", params=params)
    except ValueError as exc:
        if "429" in str(exc):
            logger.warning("CoinGecko markets bị rate limit (429), tạm bỏ qua.")
            return []
        logger.warning("CoinGecko markets trả dữ liệu không hợp lệ: {}", exc)
        return []
    except httpx.HTTPError as exc:
        logger.warning("Không lấy được CoinGecko markets: {}", exc)
        return []

    items: list[dict] = []
    for coin in payload:
        if not isinstance(coin, dict):
            continue

        market_cap = coin.get("market_cap")
        price_change_24h = coin.get("price_change_percentage_24h")
        if not isinstance(market_cap, (int, float)) or market_cap < MIN_MARKET_CAP_USD:
            continue
        if not isinstance(price_change_24h, (int, float)):
            continue
        if price_change_24h <= 0:
            continue

        name = str(coin.get("name", "")).strip()
        symbol = str(coin.get("symbol", "")).strip().upper()
        coin_id = str(coin.get("id", "")).strip()
        if not name or not symbol or not coin_id:
            continue

        items.append(
            {
                "title": f"{name} pumped +{price_change_24h:.2f}% in 24h",
                "symbol": symbol,
                "url": f"https://www.coingecko.com/en/coins/{coin_id}",
                "source": "CoinGecko Markets",
                "published_at": coin.get("last_updated") or datetime.now(UTC).isoformat(),
                "summary": (
                    f"{name} tăng {price_change_24h:.2f}% trong 24h, "
                    f"vốn hóa khoảng ${market_cap:,.0f}."
                ),
                "price_change_24h": round(price_change_24h, 4),
                "market_cap": market_cap,
            }
        )

        if len(items) >= limit:
            break

    logger.info("CoinGecko markets lấy được {} coin tăng mạnh.", len(items))
    return items


async def fetch_all() -> list[dict]:
    """Combine trending + gainers, deduplicated by symbol."""
    trending_items, gainer_items = await asyncio.gather(
        fetch_trending(),
        fetch_top_gainers(),
    )

    deduped: list[dict] = []
    seen_symbols: set[str] = set()
    for item in [*trending_items, *gainer_items]:
        symbol = str(item.get("symbol", "")).upper()
        if not symbol or symbol in seen_symbols:
            continue
        seen_symbols.add(symbol)
        deduped.append(item)

    logger.info("CoinGecko gộp còn {} item sau khi loại trùng symbol.", len(deduped))
    return deduped
