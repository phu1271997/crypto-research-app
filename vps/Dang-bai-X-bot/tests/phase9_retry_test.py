from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from types import SimpleNamespace

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.db import State, clear_state, get_state, set_state
from src.pipeline import ResearchPipeline
from src.settings import settings

TEST_CHAT_ID = 992009


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

    try:
        context = FakeContext()
        update = FakeUpdate()
        pipeline = ResearchPipeline(llm_client=object())
        topic = {
            "id": 1,
            "title": "Phase 9 retry test",
            "angle": "Kiểm tra retry flow",
            "key_points": [],
            "sources": [],
        }

        result = await pipeline.run_full_research(update, context, topic)
        assert result is not None, "run_full_research trả về None."
        await pipeline.approve(update, context)

        state_row = await get_state(TEST_CHAT_ID)
        assert state_row is not None and state_row.state == State.PUBLISHING, "Approve chưa chuyển state sang PUBLISHING."
        payload = json.loads(state_row.payload or "{}")

        publish_result = payload["publish_result"]
        publish_result["x1"]["status"] = "failed"
        publish_result["x1"]["last_error"] = "Mock forced failure"
        payload["publish_result"] = publish_result
        await set_state(TEST_CHAT_ID, State.PUBLISHING, payload)

        await pipeline.retry_failed_platforms(update, context, ["x1"])

        retried_state = await get_state(TEST_CHAT_ID)
        assert retried_state is not None, "Không tìm thấy state sau retry."
        retried_payload = json.loads(retried_state.payload or "{}")
        x1_info = retried_payload["publish_result"]["x1"]
        assert x1_info["status"] == "success", "Retry x1 chưa success."
        assert x1_info["attempt_count"] == 2, "attempt_count của x1 chưa tăng từ 1 -> 2."

        print("✅ Phase 9 retry test pass")
    finally:
        settings.mock_mode = original_mock_mode
        await clear_state(TEST_CHAT_ID)


if __name__ == "__main__":
    asyncio.run(main())
