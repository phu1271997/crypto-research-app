from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from types import SimpleNamespace

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.db import State, clear_state, get_state
from src.pipeline import ResearchPipeline
from src.settings import ROOT_DIR as APP_ROOT, settings

TEST_CHAT_ID = 992008


class FakeBot:
    def __init__(self) -> None:
        self.messages: list[tuple[str, str | None, dict]] = []

    async def send_message(self, chat_id: int, text: str, **kwargs) -> None:
        self.messages.append(("message", text, kwargs))

    async def send_document(self, chat_id: int, document, filename=None, caption=None, **kwargs) -> None:  # noqa: ANN001
        self.messages.append(("document", caption or filename, kwargs))

    async def send_photo(self, chat_id: int, photo, caption=None, **kwargs) -> None:  # noqa: ANN001
        self.messages.append(("photo", caption, kwargs))


class FakeContext:
    def __init__(self) -> None:
        self.bot = FakeBot()
        self.bot_data = {"llm_client": object()}


class FakeUpdate:
    def __init__(self) -> None:
        self.effective_chat = SimpleNamespace(id=TEST_CHAT_ID)


async def main() -> None:
    original_mock_mode = settings.mock_mode
    settings.mock_mode = True
    await clear_state(TEST_CHAT_ID)

    thread_artifact: Path | None = None
    try:
        context = FakeContext()
        update = FakeUpdate()
        pipeline = ResearchPipeline(llm_client=object())
        topic = {
            "id": 1,
            "title": "Phase 8 mock publish test",
            "angle": "Kiểm tra approve flow",
            "key_points": [],
            "sources": [],
        }

        result = await pipeline.run_full_research(update, context, topic)
        assert result is not None, "run_full_research trả về None."

        await pipeline.approve(update, context)
        state_row = await get_state(TEST_CHAT_ID)
        assert state_row is not None, "Không tìm thấy state sau approve."
        assert state_row.state == State.PUBLISHING, "Approve chưa chuyển state sang PUBLISHING."

        payload = json.loads(state_row.payload or "{}")
        publish_result = payload.get("publish_result", {})
        assert publish_result.get("primus", {}).get("status") == "success", "Primus mock publish chưa success."
        assert publish_result.get("azdag", {}).get("status") == "success", "AZDAG mock publish chưa success."
        assert publish_result.get("x1", {}).get("status") == "success", "X1 mock publish chưa success."
        assert publish_result.get("x2", {}).get("status") == "success", "X2 mock publish chưa success."
        assert publish_result.get("azdag", {}).get("attempt_count") == 1, "AZDAG attempt_count không đúng."
        assert publish_result.get("x1", {}).get("attempt_count") == 1, "X1 attempt_count không đúng."
        assert publish_result.get("x2", {}).get("attempt_count") == 1, "X2 attempt_count không đúng."

        thread = payload.get("thread", [])
        assert thread, "Payload không có thread sau approve."
        assert "<PLACEHOLDER_URL>" not in thread[-1], "CTA thread chưa được thay bằng URL Primus."
        assert "primusspark.com" in thread[-1], "CTA thread chưa chứa URL Primus."

        article_id = payload["article_meta"]["article_id"]
        thread_artifact = APP_ROOT / "storage" / "threads" / f"{article_id}.json"
        assert thread_artifact.exists(), "Chưa tạo file thread artifact."

        kinds = [kind for kind, _, _ in context.bot.messages]
        assert kinds.count("message") >= 6, "Approve flow chưa gửi đủ status messages."

        print("✅ Phase 8 mock publish test pass")
    finally:
        settings.mock_mode = original_mock_mode
        await clear_state(TEST_CHAT_ID)
        if thread_artifact and thread_artifact.exists():
            thread_artifact.unlink()


if __name__ == "__main__":
    asyncio.run(main())
