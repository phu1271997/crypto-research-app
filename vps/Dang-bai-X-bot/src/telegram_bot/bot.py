from __future__ import annotations

from telegram.ext import Application, ApplicationBuilder

from src.settings import settings
from src.telegram_bot.handlers import register_handlers


def build_application(llm_client=None) -> Application:
    app = ApplicationBuilder().token(settings.telegram_bot_token).build()
    if llm_client is not None:
        app.bot_data["llm_client"] = llm_client
    register_handlers(app)
    return app


async def send_message(app: Application, text: str, **kwargs) -> None:
    """Helper để scheduler gọi gửi message vào ALLOWED_CHAT_ID."""
    await app.bot.send_message(
        chat_id=int(settings.telegram_chat_id),
        text=text,
        **kwargs,
    )
