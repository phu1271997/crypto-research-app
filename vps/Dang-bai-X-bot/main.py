from __future__ import annotations

import asyncio
import sys

from loguru import logger

from src.db import init_db
from src.llm_client import OpenRouterClient
from src.scheduler import build_scheduler
from src.settings import settings, configure_logging
from src.worker import worker_loop, heartbeat_loop

async def main() -> None:
    configure_logging()
    
    try:
        settings.require(["openrouter_api_key"])
    except ValueError as exc:
        logger.error(f"Lỗi cấu hình: {exc}")
        sys.exit(1)

    logger.info("🚀 Khởi động Crypto Research Bot (DB-as-command-queue)...")
    if settings.mock_mode:
        logger.warning("⚠️ MOCK_MODE đang BẬT — bot sẽ không gọi LLM/image thật cho flow research.")
    
    await init_db()

    llm_client = OpenRouterClient(api_key=settings.openrouter_api_key)

    # Initialize and start scheduler
    scheduler = build_scheduler(llm_client)
    scheduler.start()
    logger.info("⏰ Scheduler đã start.")

    # Start loops concurrently
    try:
        await asyncio.gather(
            worker_loop(llm_client),
            heartbeat_loop()
        )
    except (KeyboardInterrupt, asyncio.CancelledError):
        logger.info("⏹️ Đang shutdown bot...")
    finally:
        scheduler.shutdown()
        await llm_client.aclose()

if __name__ == "__main__":
    asyncio.run(main())
