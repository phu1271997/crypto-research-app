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
from src.settings import settings

TEST_CHAT_ID = 992005


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


class FakeUpdate:
    def __init__(self) -> None:
        self.effective_chat = SimpleNamespace(id=TEST_CHAT_ID)


async def main() -> None:
    original_mock_mode = settings.mock_mode
    settings.mock_mode = True

    await clear_state(TEST_CHAT_ID)
    try:
        pipeline = ResearchPipeline(llm_client=object())
        context = FakeContext()
        update = FakeUpdate()
        topic = {
            "id": 1,
            "title": "Mock pipeline test",
            "angle": "Kiểm tra mock flow",
            "key_points": [],
            "sources": [],
        }
        result = await pipeline.run_full_research(update, context, topic)
        assert result is not None, "Pipeline mock trả về None."

        state_row = await get_state(TEST_CHAT_ID)
        assert state_row is not None, "State chưa được lưu."
        assert state_row.state == State.PREVIEW, "State cuối không phải PREVIEW."

        payload = json.loads(state_row.payload or "{}")
        assert "article_meta" in payload, "Thiếu article_meta trong state."
        assert "content" not in payload.get("article_meta", {}), "State đang lưu thừa full content."
        assert "image_paths" in payload, "Thiếu image_paths trong state."
        assert "thread" in payload, "Thiếu thread trong state."
        assert isinstance(payload["thread"], list) and payload["thread"], "Thread lưu trong state không hợp lệ."
        assert payload["image_paths"].get("thumbnail_path"), "Thiếu thumbnail path."
        assert payload["image_paths"].get("inline_path"), "Thiếu inline path."

        kinds = [kind for kind, _, _ in context.bot.messages]
        assert "document" in kinds, "Mock pipeline chưa gửi document."
        assert kinds.count("photo") >= 2, "Mock pipeline chưa gửi đủ 2 ảnh."
        assert kinds.count("message") >= 4, "Mock pipeline chưa gửi đủ progress/preview messages."

        print("✅ Mock pipeline test pass")
    finally:
        settings.mock_mode = original_mock_mode
        await clear_state(TEST_CHAT_ID)


if __name__ == "__main__":
    asyncio.run(main())
