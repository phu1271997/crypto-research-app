from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.db import State, clear_state, get_state
from src.settings import settings
from src.telegram_bot.handlers import ALLOWED_CHAT_ID
import src.scheduler as scheduler_module


class FakeBot:
    def __init__(self) -> None:
        self.messages: list[dict] = []

    async def send_message(self, chat_id: int, text: str, **kwargs) -> None:
        self.messages.append(
            {
                "chat_id": chat_id,
                "text": text,
                "kwargs": kwargs,
            }
        )


class FakeApp:
    def __init__(self) -> None:
        self.bot = FakeBot()


class FakeClient:
    pass


async def fake_get_trending_topics(client, recent_titles=None):  # noqa: ANN001
    return [
        {
            "id": 1,
            "title": "Bitcoin ETF flows recover",
            "angle": "Dòng vốn quay lại có thể mở lại narrative risk-on.",
            "key_points": ["ETF inflow", "BTC dominance", "macro sentiment"],
            "sources": ["https://example.com/btc-etf"],
        },
        {
            "id": 2,
            "title": "EigenLayer restaking cools",
            "angle": "Restaking chậm lại có thể ảnh hưởng đến định giá hạ tầng.",
            "key_points": ["TVL", "yield compression", "competition"],
            "sources": ["https://example.com/eigenlayer"],
        },
        {
            "id": 3,
            "title": "Solana memecoin cycle rotates",
            "angle": "Dòng tiền đầu cơ đang phân hóa mạnh hơn.",
            "key_points": ["volume", "DEX", "rotation"],
            "sources": ["https://example.com/sol"],
        },
        {
            "id": 4,
            "title": "Stablecoin bill gains traction",
            "angle": "Khung pháp lý mới có thể mở rộng use case cho fintech crypto.",
            "key_points": ["regulation", "issuers", "payments"],
            "sources": ["https://example.com/stablecoin"],
        },
        {
            "id": 5,
            "title": "L2 fee compression continues",
            "angle": "Biên lợi nhuận của hạ tầng rollup đang chịu áp lực.",
            "key_points": ["fees", "sequencers", "DA costs"],
            "sources": ["https://example.com/l2"],
        },
    ]


async def main() -> None:
    original_chat_id = settings.telegram_chat_id
    original_func = scheduler_module.get_trending_topics
    test_chat_id = int(ALLOWED_CHAT_ID or 990004)
    settings.telegram_chat_id = str(test_chat_id)

    await clear_state(test_chat_id)
    scheduler_module.get_trending_topics = fake_get_trending_topics

    app = FakeApp()
    scheduler = AsyncIOScheduler(timezone="Asia/Ho_Chi_Minh")
    scheduler.add_job(
        scheduler_module.trending_job,
        IntervalTrigger(seconds=1),
        args=[app, FakeClient()],
        id="phase3_scheduler_test",
    )

    scheduler.start()
    try:
        await asyncio.sleep(1.6)
    finally:
        scheduler.shutdown(wait=False)
        scheduler_module.get_trending_topics = original_func
        settings.telegram_chat_id = original_chat_id

    assert app.bot.messages, "Scheduler không gửi message nào."
    assert "5 chủ đề hot" in app.bot.messages[0]["text"], "Nội dung message không đúng kỳ vọng."

    state_row = await get_state(test_chat_id)
    assert state_row is not None, "Scheduler chưa lưu state."
    assert state_row.state == State.TOPICS_SHOWN, "Scheduler lưu sai state."

    await clear_state(test_chat_id)
    print("✅ Phase 3 scheduler test pass")


if __name__ == "__main__":
    asyncio.run(main())
