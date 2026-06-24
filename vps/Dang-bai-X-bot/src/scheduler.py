from __future__ import annotations

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from loguru import logger
from sqlalchemy import select

from src.db import SessionLocal, BotStatus, get_recent_titles
from src.llm_client import OpenRouterClient
from src.settings import config
from src.trending.aggregator import get_trending_topics

# Outbound notifier helper (re-declared for standalone ease)
from src.worker import send_telegram_notification

async def trending_job(llm_client: OpenRouterClient) -> None:
    """
    Job chạy 9h sáng mỗi 2 ngày:
    1. Fetch 5 topics mới từ RSS/CryptoPanic/CoinGecko
    2. Lưu các topics đó vào config của bot_status table
    3. Gửi thông báo thông qua Telegram channel
    """
    try:
        logger.info("Scheduler bắt đầu chạy job lấy trending topics.")
        topics = await get_trending_topics(
            llm_client,
            recent_titles=await get_recent_titles(),
        )
        
        async with SessionLocal() as session:
            stmt = select(BotStatus).where(BotStatus.id == 1)
            res = await session.execute(stmt)
            status = res.scalar_one_or_none()
            if not status:
                status = BotStatus(id=1)
                session.add(status)
            
            cfg = dict(status.config or {})
            cfg["trending_topics"] = topics
            status.config = cfg
            await session.commit()
            
        logger.info("Scheduler đã lưu {} topic vào bot_status config.", len(topics))
        
        # Notify developer via Telegram outbound
        topics_str = "\n".join(f"- *{t.get('title')}*" for t in topics)
        await send_telegram_notification(
            f"🔥 *Phát hiện {len(topics)} chủ đề hot mới!* Hãy kiểm tra Web Dashboard để viết bài:\n{topics_str}"
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Scheduler job lấy trending bị lỗi")
        await send_telegram_notification(f"❌ Lỗi scheduler trending job: {exc}")


def build_scheduler(llm_client: OpenRouterClient) -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone=config.schedule.timezone)
    # Cron job disabled at user's request (will run manually via "Quét Tin Hot" button)
    # scheduler.add_job(
    #     trending_job,
    #     CronTrigger.from_crontab(
    #         config.schedule.trending_cron,
    #         timezone=config.schedule.timezone,
    #     ),
    #     args=[llm_client],
    #     id="trending_job",
    #     misfire_grace_time=3600,
    # )
    return scheduler
