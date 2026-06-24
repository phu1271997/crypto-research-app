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
from src.telegram_bot import handlers as telegram_handlers
from src.telegram_bot.handlers import callback_preview_action, callback_regen_action

TEST_CHAT_ID = 992007


def _extract_callback_data(reply_markup) -> list[str]:  # noqa: ANN001
    if reply_markup is None:
        return []
    callback_data: list[str] = []
    for row in reply_markup.inline_keyboard:
        for button in row:
            callback_data.append(button.callback_data)
    return callback_data


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


class FakeCallbackQuery:
    def __init__(self, data: str) -> None:
        self.data = data
        self.message = SimpleNamespace(text="preview")
        self.answered: list[tuple[str | None, bool]] = []
        self.edits: list[str] = []

    async def answer(self, text: str | None = None, show_alert: bool = False) -> None:
        self.answered.append((text, show_alert))

    async def edit_message_text(self, text: str, **kwargs) -> None:  # noqa: ARG002
        self.edits.append(text)


class FakeUpdate:
    def __init__(self, callback_data: str | None = None) -> None:
        self.effective_chat = SimpleNamespace(id=TEST_CHAT_ID)
        self.callback_query = FakeCallbackQuery(callback_data) if callback_data else None


async def _prepare_preview(context: FakeContext, title: str) -> dict:
    pipeline = ResearchPipeline(llm_client=object())
    update = FakeUpdate()
    topic = {
        "id": 1,
        "title": title,
        "angle": "Kiểm tra preview flow",
        "key_points": [],
        "sources": [],
    }
    result = await pipeline.run_full_research(update, context, topic)
    assert result is not None, "Pipeline mock không tạo được preview."
    state_row = await get_state(TEST_CHAT_ID)
    assert state_row is not None and state_row.state == State.PREVIEW, "State chưa ở PREVIEW."
    return json.loads(state_row.payload or "{}")


async def main() -> None:
    original_mock_mode = settings.mock_mode
    original_allowed_chat_id = telegram_handlers.ALLOWED_CHAT_ID
    settings.mock_mode = True
    telegram_handlers.ALLOWED_CHAT_ID = TEST_CHAT_ID
    await clear_state(TEST_CHAT_ID)

    try:
        context = FakeContext()

        payload = await _prepare_preview(context, "Phase 7 preview test")
        preview_message = next(
            (
                item
                for item in reversed(context.bot.messages)
                if item[0] == "message" and item[2].get("reply_markup") is not None
            ),
            None,
        )
        assert preview_message is not None, "Chưa gửi preview UI."
        preview_callback_data = _extract_callback_data(preview_message[2]["reply_markup"])
        assert preview_callback_data == [
            "preview:approve",
            "preview:reject",
            "preview:regenerate",
        ], "Buttons preview không đúng callback_data."

        old_thread = payload["thread"]
        regen_menu_update = FakeUpdate("preview:regenerate")
        await callback_preview_action(regen_menu_update, context)
        regen_menu_message = context.bot.messages[-1]
        regen_callback_data = _extract_callback_data(regen_menu_message[2]["reply_markup"])
        assert regen_callback_data == [
            "regen:all",
            "regen:article",
            "regen:images",
            "regen:thread",
            "regen:cancel",
        ], "Sub-menu regenerate không đúng."

        regen_thread_update = FakeUpdate("regen:thread")
        await callback_regen_action(regen_thread_update, context)
        state_after_regen = await get_state(TEST_CHAT_ID)
        assert state_after_regen is not None and state_after_regen.state == State.PREVIEW, "Regen thread không quay lại PREVIEW."
        payload_after_regen = json.loads(state_after_regen.payload or "{}")
        assert payload_after_regen["thread"] != old_thread, "Regen thread chưa tạo thread mới."

        approve_update = FakeUpdate("preview:approve")
        await callback_preview_action(approve_update, context)
        state_after_approve = await get_state(TEST_CHAT_ID)
        assert state_after_approve is not None and state_after_approve.state == State.PUBLISHING, "Approve chưa chuyển state sang PUBLISHING."

        payload_reject = await _prepare_preview(context, "Phase 7 reject test")
        article_path = Path(payload_reject["article_meta"]["file_path"])
        thumb_path = Path(payload_reject["image_paths"]["thumbnail_path"])
        inline_path = Path(payload_reject["image_paths"]["inline_path"])
        assert article_path.exists(), "File article chưa tồn tại trước khi reject."
        assert thumb_path.exists(), "File thumbnail chưa tồn tại trước khi reject."
        assert inline_path.exists(), "File inline chưa tồn tại trước khi reject."

        reject_update = FakeUpdate("preview:reject")
        await callback_preview_action(reject_update, context)
        state_after_reject = await get_state(TEST_CHAT_ID)
        assert state_after_reject is None, "Reject chưa clear state."
        assert not article_path.exists(), "Reject chưa xóa file article."
        assert not thumb_path.exists(), "Reject chưa xóa file thumbnail."
        assert not inline_path.exists(), "Reject chưa xóa file inline."

        print("✅ Phase 7 preview test pass")
    finally:
        settings.mock_mode = original_mock_mode
        telegram_handlers.ALLOWED_CHAT_ID = original_allowed_chat_id
        await clear_state(TEST_CHAT_ID)


if __name__ == "__main__":
    asyncio.run(main())
