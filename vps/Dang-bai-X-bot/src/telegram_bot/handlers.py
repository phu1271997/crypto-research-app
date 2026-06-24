from __future__ import annotations

import json
from typing import Any

from loguru import logger
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.constants import ParseMode
from telegram.helpers import escape_markdown
from telegram.ext import CallbackQueryHandler, CommandHandler, ContextTypes, MessageHandler, filters

from src.db import State, clear_state, get_recent_titles, get_state, set_state
from src.pipeline import ResearchPipeline
from src.settings import settings
from src.telegram_bot.formatters import format_error, format_platform_choice, format_publish_mode_choice, format_topics_message, format_x_format_choice
from src.trending.aggregator import get_trending_topics

ALLOWED_CHAT_ID = int(settings.telegram_chat_id) if settings.telegram_chat_id else None


def _check_authorized(update: Update) -> bool:
    """Chỉ cho phép TELEGRAM_CHAT_ID, ignore mọi user khác."""
    chat_id = update.effective_chat.id if update.effective_chat else None
    return ALLOWED_CHAT_ID is not None and chat_id == ALLOWED_CHAT_ID


def _get_state_owner_id(update: Update) -> int:
    if update.effective_chat is None:
        return int(ALLOWED_CHAT_ID or 0)
    return int(update.effective_chat.id)


def _parse_payload(raw_payload: str | None) -> dict[str, Any] | None:
    if not raw_payload:
        return None

    try:
        parsed = json.loads(raw_payload)
    except json.JSONDecodeError:
        return None

    return parsed if isinstance(parsed, dict) else None


def _summarize_payload(payload: dict[str, Any] | None) -> str:
    if not payload:
        return "Không có payload."

    if "topic" in payload and isinstance(payload["topic"], dict):
        title = str(payload["topic"].get("title", "Không có tiêu đề"))
        platform = payload.get("target_platform", "chưa chọn")
        publish_mode = payload.get("publish_mode", "chưa chọn")
        x_format = payload.get("x_format", "chưa chọn")
        return f"Topic: {title} | platform: {platform} | publish: {publish_mode} | format: {x_format}"

    if "topics" in payload and isinstance(payload["topics"], list):
        return f"Đang lưu {len(payload['topics'])} topic để chọn."

    if "article_meta" in payload and isinstance(payload["article_meta"], dict):
        article_title = str(payload["article_meta"].get("title", "Không có tiêu đề"))
        word_count = payload["article_meta"].get("word_count", "?")
        thread_count = len(payload.get("thread", [])) if isinstance(payload.get("thread"), list) else 0
        platform = payload.get("target_platform", "?")
        publish_mode = payload.get("publish_mode", "?")
        x_format = payload.get("x_format", "?")
        publish_result = payload.get("publish_result")
        if "image_paths" in payload and isinstance(payload["image_paths"], dict):
            has_thumb = bool(payload["image_paths"].get("thumbnail_path"))
            has_inline = bool(payload["image_paths"].get("inline_path"))
            summary = (
                f"Bài gần nhất: {article_title} ({word_count} từ) | "
                f"platform={platform} | publish={publish_mode} | format={x_format} | "
                f"thumbnail={'có' if has_thumb else 'không'}, inline={'có' if has_inline else 'không'} | "
                f"thread/article={thread_count} post"
            )
            if isinstance(publish_result, dict):
                summary += f" | publish={', '.join(sorted(publish_result.keys()))}"
            return summary
        return f"Bài gần nhất: {article_title} ({word_count} từ) | platform={platform} | publish={publish_mode} | format={x_format}"

    keys = ", ".join(payload.keys())
    return f"Payload đang có các khóa: {keys}"


async def _get_llm_client(context: ContextTypes.DEFAULT_TYPE, update: Update):  # noqa: ANN202
    llm_client = context.bot_data.get("llm_client")
    if llm_client is not None:
        return llm_client

    chat_id = update.effective_chat.id if update.effective_chat else None
    if chat_id is not None:
        await context.bot.send_message(
            chat_id,
            "❌ Bot chưa khởi tạo xong LLM client. Anh thử lại sau vài giây hoặc restart bot.",
        )
    logger.error("Thiếu llm_client trong context.bot_data khi xử lý Telegram update.")
    return None


async def _start_pipeline(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    topic: dict,
    target_platform: str = "primus",
    x_format: str = "thread",
    publish_mode: str = "both",
) -> None:
    llm_client = await _get_llm_client(context, update)
    if llm_client is None:
        return
    pipeline = ResearchPipeline(llm_client)
    await pipeline.run_full_research(
        update,
        context,
        topic,
        target_platform=target_platform,
        x_format=x_format,
        publish_mode=publish_mode,
    )


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _check_authorized(update) or update.message is None:
        return

    text = (
        "👋 Chào anh, em là Crypto Research Bot.\n\n"
        "Các lệnh hiện có:\n"
        "/trending - Lấy 10 chủ đề hot ngay\n"
        "/write <topic> - Tự nhập chủ đề\n"
        "/status - Xem trạng thái pipeline\n"
        "/retry - Retry các platform publish đang fail/pending\n"
        "/delete - Xóa bài đã đăng trên Primus/X\n"
        "/cancel - Huỷ pipeline đang chạy\n\n"
        "📢 Flow mới: Chọn topic → Chọn định dạng X (Thread hoặc Article) → Chọn platform (Primus hoặc AZDAG) → Chọn cách publish (cả web + X / chỉ web / chỉ X)."
    )
    await update.message.reply_text(text)


async def cmd_trending(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _check_authorized(update) or update.message is None:
        return

    user_id = _get_state_owner_id(update)
    await set_state(user_id, State.TOPICS_SHOWN)
    await update.message.reply_text("🔍 Đang lấy 10 chủ đề hot 48h qua...")

    try:
        llm_client = await _get_llm_client(context, update)
        if llm_client is None:
            await clear_state(user_id)
            return
        topics = await get_trending_topics(
            llm_client,
            recent_titles=await get_recent_titles(),
        )
        await set_state(user_id, State.TOPICS_SHOWN, {"topics": topics})

        text, keyboard = format_topics_message(topics)
        await update.message.reply_text(
            text,
            reply_markup=keyboard,
            parse_mode=ParseMode.MARKDOWN,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Lỗi khi xử lý /trending")
        await clear_state(user_id)
        await update.message.reply_text(
            format_error(str(exc)),
            parse_mode=ParseMode.MARKDOWN_V2,
        )


async def cmd_write(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _check_authorized(update) or update.message is None:
        return

    topic_text = " ".join(context.args).strip()
    if not topic_text:
        await update.message.reply_text(
            "❌ Vui lòng nhập chủ đề. Ví dụ:\n/write Phân tích Pendle V3"
        )
        return

    topic = {
        "id": 0,
        "title": topic_text,
        "angle": "User-provided custom topic",
        "key_points": [],
        "sources": [],
    }

    user_id = _get_state_owner_id(update)
    await set_state(user_id, State.TOPICS_SHOWN, {"topics": [topic], "selected_topic": topic})
    text, keyboard = format_x_format_choice(topic_text)
    await update.message.reply_text(text, reply_markup=keyboard, parse_mode=ParseMode.MARKDOWN)


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _check_authorized(update) or update.message is None:
        return

    user_id = _get_state_owner_id(update)
    state_row = await get_state(user_id)
    if state_row is None:
        await update.message.reply_text("ℹ️ Hiện chưa có pipeline nào đang lưu. Trạng thái: IDLE")
        return

    payload = _parse_payload(state_row.payload)
    lines = [
        f"📊 *Trạng thái pipeline:* `{escape_markdown(state_row.state, version=1)}`",
        "",
        f"🕒 Cập nhật lúc: `{escape_markdown(state_row.updated_at.isoformat(), version=1)}`",
    ]

    if payload and isinstance(payload.get("article_meta"), dict):
        article_meta = payload["article_meta"]
        platform = payload.get("target_platform", "?")
        publish_mode = payload.get("publish_mode", "?")
        x_format = payload.get("x_format", "?")
        lines.extend(
            [
                "",
                f"📝 Title: {escape_markdown(str(article_meta.get('title', 'Không có tiêu đề')), version=1)}",
                f"📊 Words: {escape_markdown(str(article_meta.get('word_count', '?')), version=1)}",
                f"🎯 Platform: {escape_markdown(platform, version=1)}",
                f"🚀 Publish mode: {escape_markdown(publish_mode, version=1)}",
                f"📝 X Format: {escape_markdown(x_format, version=1)}",
            ]
        )
    else:
        lines.extend(["", f"🧾 {_summarize_payload(payload)}"])

    publish_result = payload.get("publish_result") if payload else None
    if isinstance(publish_result, dict):
        lines.extend(["", "*Publish status:*"])
        for platform, info in publish_result.items():
            if not isinstance(info, dict):
                continue
            status = str(info.get("status", "unknown"))
            emoji = {"success": "✅", "partial": "⚠️", "failed": "❌", "pending": "⏳", "skipped": "⏭", "deleted": "🗑"}.get(status, "❓")
            line = f"{emoji} {escape_markdown(platform, version=1)}: {escape_markdown(status, version=1)}"
            if info.get("url"):
                line += f" — {escape_markdown(str(info['url']), version=1)}"
            attempt_count = int(info.get("attempt_count", 0) or 0)
            if attempt_count > 1:
                line += f" \\(×{attempt_count}\\)"
            lines.append(line)
            if status in ("failed", "partial") and info.get("last_error"):
                err_short = escape_markdown(str(info["last_error"])[:120], version=1)
                lines.append(f"_Lỗi: {err_short}_")
            delete_status = info.get("delete_status")
            if delete_status:
                delete_emoji = {"success": "🗑", "partial": "⚠️", "failed": "❌"}.get(str(delete_status), "❓")
                delete_line = f"{delete_emoji} delete: {escape_markdown(str(delete_status), version=1)}"
                delete_attempt_count = int(info.get("delete_attempt_count", 0) or 0)
                if delete_attempt_count > 1:
                    delete_line += f" \\(×{delete_attempt_count}\\)"
                lines.append(delete_line)
                if info.get("delete_last_error"):
                    delete_err = escape_markdown(str(info["delete_last_error"])[:120], version=1)
                    lines.append(f"_Delete lỗi: {delete_err}_")

    await update.message.reply_text("\n".join(lines), parse_mode=ParseMode.MARKDOWN)


async def cmd_retry(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    /retry — retry platforms có status != success/skipped.
    """
    if not _check_authorized(update) or update.message is None:
        return

    chat_id = _get_state_owner_id(update)
    state_row = await get_state(chat_id)
    if state_row is None or state_row.state != State.PUBLISHING:
        state_name = state_row.state if state_row else "IDLE"
        await update.message.reply_text(
            f"❌ Không có publish job nào để retry. State hiện tại: {state_name}"
        )
        return

    payload = _parse_payload(state_row.payload)
    publish_result = payload.get("publish_result", {}) if payload else {}
    if not isinstance(publish_result, dict):
        await update.message.reply_text("❌ Không tìm thấy publish_result để retry.")
        return

    failed_platforms = [
        name for name, info in publish_result.items()
        if isinstance(info, dict) and info.get("status") not in ("success", "skipped")
    ]
    if not failed_platforms:
        await update.message.reply_text("✅ Tất cả platforms đã publish thành công, không cần retry.")
        return

    await update.message.reply_text(f"🔄 Đang retry: {', '.join(failed_platforms)}...")
    llm_client = await _get_llm_client(context, update)
    if llm_client is None:
        return
    pipeline = ResearchPipeline(llm_client)
    await pipeline.retry_failed_platforms(update, context, failed_platforms)


async def cmd_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _check_authorized(update) or update.message is None:
        return

    user_id = _get_state_owner_id(update)
    await clear_state(user_id)
    await update.message.reply_text("✅ Đã huỷ pipeline.")


async def cmd_delete(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _check_authorized(update) or update.message is None:
        return

    llm_client = await _get_llm_client(context, update)
    if llm_client is None:
        return
    pipeline = ResearchPipeline(llm_client)
    await pipeline.prompt_delete_published_content(update, context)


# ---------------------------------------------------------------------------
# Callback 1: Topic Selection → Ask X Format (Thread vs Article)
# ---------------------------------------------------------------------------

async def callback_topic_select(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _check_authorized(update) or update.callback_query is None:
        return

    query = update.callback_query
    user_id = _get_state_owner_id(update)
    state_row = await get_state(user_id)
    if state_row is None or state_row.state != State.TOPICS_SHOWN:
        await query.answer("❌ Topic đã hết hạn, gõ /trending để lấy lại", show_alert=True)
        return

    payload = _parse_payload(state_row.payload)
    topics = payload.get("topics", []) if payload else []
    if not isinstance(topics, list):
        await query.answer("❌ Topic đã hết hạn, gõ /trending để lấy lại", show_alert=True)
        return

    try:
        topic_id = int(query.data.split(":", 1)[1])
    except (IndexError, ValueError):
        await query.answer("❌ Dữ liệu topic không hợp lệ.", show_alert=True)
        return

    selected_topic = next(
        (topic for topic in topics if isinstance(topic, dict) and int(topic.get("id", -1)) == topic_id),
        None,
    )
    if selected_topic is None:
        await query.answer("❌ Không tìm thấy topic, gõ /trending để lấy lại.", show_alert=True)
        return

    await query.answer("✅ Đã ghi nhận topic.")

    payload["selected_topic"] = selected_topic
    await set_state(user_id, State.TOPICS_SHOWN, payload)

    title = str(selected_topic.get("title", "Không có tiêu đề"))
    text, keyboard = format_x_format_choice(title)

    if query.message is not None:
        try:
            await query.edit_message_text(text, parse_mode=ParseMode.MARKDOWN, reply_markup=keyboard)
        except Exception:
            await context.bot.send_message(user_id, text, parse_mode=ParseMode.MARKDOWN, reply_markup=keyboard)


# ---------------------------------------------------------------------------
# Callback 2: X Format Selection → Ask Platform (Primus vs AZDAG)
# ---------------------------------------------------------------------------

async def callback_x_format_select(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _check_authorized(update) or update.callback_query is None:
        return

    query = update.callback_query
    user_id = _get_state_owner_id(update)
    state_row = await get_state(user_id)
    if state_row is None or state_row.state != State.TOPICS_SHOWN:
        await query.answer("❌ Session đã hết hạn, gõ /trending để bắt đầu lại.", show_alert=True)
        return

    payload = _parse_payload(state_row.payload)
    selected_topic = payload.get("selected_topic") if payload else None
    if not selected_topic:
        await query.answer("❌ Chưa chọn topic, gõ /trending để bắt đầu lại.", show_alert=True)
        return

    x_format = query.data.split(":", 1)[1]  # "thread" or "article"
    await query.answer(f"✅ Định dạng X: {x_format.upper()}.")

    payload["x_format"] = x_format
    await set_state(user_id, State.TOPICS_SHOWN, payload)

    title = str(selected_topic.get("title", "Không có tiêu đề"))
    text, keyboard = format_platform_choice(title, x_format)

    if query.message is not None:
        try:
            await query.edit_message_text(text, parse_mode=ParseMode.MARKDOWN, reply_markup=keyboard)
        except Exception:
            await context.bot.send_message(user_id, text, parse_mode=ParseMode.MARKDOWN, reply_markup=keyboard)


# ---------------------------------------------------------------------------
# Callback 3: Platform Selection → Start Pipeline
# ---------------------------------------------------------------------------

async def callback_platform_select(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _check_authorized(update) or update.callback_query is None:
        return

    query = update.callback_query
    user_id = _get_state_owner_id(update)
    state_row = await get_state(user_id)
    if state_row is None or state_row.state != State.TOPICS_SHOWN:
        await query.answer("❌ Session đã hết hạn, gõ /trending để bắt đầu lại.", show_alert=True)
        return

    payload = _parse_payload(state_row.payload)
    selected_topic = payload.get("selected_topic") if payload else None
    if not selected_topic:
        await query.answer("❌ Chưa chọn topic, gõ /trending để bắt đầu lại.", show_alert=True)
        return

    x_format = payload.get("x_format", "thread")
    target_platform = query.data.split(":", 1)[1]
    payload["target_platform"] = target_platform
    await set_state(user_id, State.TOPICS_SHOWN, payload)
    await query.answer(f"✅ Platform: {target_platform.upper()}.")

    title = str(selected_topic.get("title", "Không có tiêu đề"))
    text_out, keyboard = format_publish_mode_choice(title, x_format, target_platform)

    if query.message is not None:
        try:
            await query.edit_message_text(text_out, parse_mode=ParseMode.MARKDOWN, reply_markup=keyboard)
        except Exception:
            await context.bot.send_message(user_id, text_out, parse_mode=ParseMode.MARKDOWN, reply_markup=keyboard)


async def callback_publish_mode_select(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _check_authorized(update) or update.callback_query is None:
        return

    query = update.callback_query
    user_id = _get_state_owner_id(update)
    state_row = await get_state(user_id)
    if state_row is None or state_row.state != State.TOPICS_SHOWN:
        await query.answer("❌ Session đã hết hạn, gõ /trending để bắt đầu lại.", show_alert=True)
        return

    payload = _parse_payload(state_row.payload)
    selected_topic = payload.get("selected_topic") if payload else None
    target_platform = payload.get("target_platform") if payload else None
    x_format = payload.get("x_format", "thread") if payload else "thread"
    if not selected_topic or not target_platform:
        await query.answer("❌ Thiếu thông tin topic/platform, gõ /trending để bắt đầu lại.", show_alert=True)
        return

    publish_mode = query.data.split(":", 1)[1]
    payload["publish_mode"] = publish_mode
    await set_state(user_id, State.TOPICS_SHOWN, payload)
    await query.answer("✅ Đã ghi nhận cách publish.")

    platform_label = "🔵 Primus Spark" if target_platform == "primus" else "🟠 AZDAG"
    x_label = "Thread" if x_format == "thread" else "Article"
    mode_label = {"both": "Cả web và X", "web_only": "Chỉ web", "x_only": "Chỉ X"}.get(publish_mode, publish_mode)
    title = escape_markdown(str(selected_topic.get("title", "?")), version=1)

    if query.message is not None:
        try:
            await query.edit_message_text(
                f"✅ Topic: *{title}*\n🎯 Platform: *{platform_label}*\n📝 Định dạng X: *{x_label}*\n🚀 Publish mode: *{escape_markdown(mode_label, version=1)}*\n\n⏳ Bắt đầu pipeline...",
                parse_mode=ParseMode.MARKDOWN,
            )
        except Exception:
            pass

    await _start_pipeline(
        update,
        context,
        selected_topic,
        target_platform=target_platform,
        x_format=x_format,
        publish_mode=publish_mode,
    )


async def callback_article_length_action(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _check_authorized(update) or update.callback_query is None:
        return

    query = update.callback_query
    await query.answer()

    user_id = _get_state_owner_id(update)
    state_row = await get_state(user_id)
    if state_row is None or state_row.state != State.ARTICLE_LENGTH_CONFIRM:
        if query.message is not None:
            await query.edit_message_text("❌ Xác nhận bài dài đã hết hạn. Gõ /trending để bắt đầu lại.")
        return

    action = query.data.split(":", 1)[1]
    llm_client = await _get_llm_client(context, update)
    if llm_client is None:
        return
    pipeline = ResearchPipeline(llm_client)

    if action == "approve":
        await pipeline.continue_after_article_length_approval(update, context)
        return

    await pipeline.reject_article_length_approval(update, context)


async def callback_preview_action(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Callback data: preview:approve | preview:reject | preview:regenerate
    """
    if not _check_authorized(update) or update.callback_query is None:
        return

    query = update.callback_query
    await query.answer()

    user_id = _get_state_owner_id(update)
    state_row = await get_state(user_id)
    if state_row is None or state_row.state != State.PREVIEW:
        if query.message is not None:
            await query.edit_message_text("❌ Preview đã hết hạn. Gõ /trending để bắt đầu lại.")
        return

    action = query.data.split(":", 1)[1]
    llm_client = await _get_llm_client(context, update)
    if llm_client is None:
        return
    pipeline = ResearchPipeline(llm_client)

    if action == "approve":
        await pipeline.approve(update, context)
        return

    if action == "reject":
        await pipeline.reject(update, context)
        return

    keyboard = InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("🔄 Regen tất cả", callback_data="regen:all")],
            [
                InlineKeyboardButton("📝 Chỉ article", callback_data="regen:article"),
                InlineKeyboardButton("🖼 Chỉ images", callback_data="regen:images"),
                InlineKeyboardButton("🐦 Chỉ X (thread/article)", callback_data="regen:thread"),
            ],
            [InlineKeyboardButton("« Quay lại", callback_data="regen:cancel")],
        ]
    )
    await context.bot.send_message(
        user_id,
        "🔄 Bạn muốn regenerate phần nào?",
        reply_markup=keyboard,
    )


async def callback_regen_action(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Callback data: regen:all | regen:article | regen:images | regen:thread | regen:cancel
    """
    if not _check_authorized(update) or update.callback_query is None:
        return

    query = update.callback_query
    await query.answer()

    action = query.data.split(":", 1)[1]
    if action == "cancel":
        if query.message is not None:
            await query.edit_message_text("✅ Đã hủy regenerate.")
        return

    user_id = _get_state_owner_id(update)
    state_row = await get_state(user_id)
    if state_row is None or state_row.state != State.PREVIEW:
        if query.message is not None:
            await query.edit_message_text("❌ Preview đã hết hạn. Gõ /trending để bắt đầu lại.")
        return

    llm_client = await _get_llm_client(context, update)
    if llm_client is None:
        return
    pipeline = ResearchPipeline(llm_client)

    if action == "all":
        await pipeline.regenerate_all(update, context)
        return

    if action == "article":
        await context.bot.send_message(
            user_id,
            "ℹ️ Regen article sẽ tự động regen lại images + thread/article theo bài mới.",
        )
        await pipeline.regenerate_all(update, context)
        return

    if action == "images":
        await pipeline.regenerate_images_only(update, context)
        return

    if action == "thread":
        await pipeline.regenerate_thread_only(update, context)
        return


async def callback_publish_action(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _check_authorized(update) or update.callback_query is None:
        return

    query = update.callback_query
    await query.answer()

    action = query.data.split(":", 1)[1]
    if action == "delete_cancel":
        if query.message is not None:
            await query.edit_message_text("✅ Đã hủy thao tác xóa bài đã đăng.")
        return

    llm_client = await _get_llm_client(context, update)
    if llm_client is None:
        return
    pipeline = ResearchPipeline(llm_client)

    if action == "delete":
        await pipeline.prompt_delete_published_content(update, context)
        return

    if action == "delete_confirm":
        await pipeline.delete_published_content(update, context)
        return


async def handle_unknown(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _check_authorized(update) or update.message is None:
        return

    await update.message.reply_text("Em không hiểu. Dùng /start để xem các lệnh.")


def register_handlers(application) -> None:
    application.add_handler(CommandHandler("start", cmd_start))
    application.add_handler(CommandHandler("trending", cmd_trending))
    application.add_handler(CommandHandler("write", cmd_write))
    application.add_handler(CommandHandler("status", cmd_status))
    application.add_handler(CommandHandler("retry", cmd_retry))
    application.add_handler(CommandHandler("delete", cmd_delete))
    application.add_handler(CommandHandler("cancel", cmd_cancel))
    application.add_handler(CallbackQueryHandler(callback_topic_select, pattern=r"^topic_select:\d+$"))
    application.add_handler(CallbackQueryHandler(callback_x_format_select, pattern=r"^x_format:(thread|article)$"))
    application.add_handler(CallbackQueryHandler(callback_platform_select, pattern=r"^platform:(primus|azdag)$"))
    application.add_handler(CallbackQueryHandler(callback_publish_mode_select, pattern=r"^publish_mode:(both|web_only|x_only)$"))
    application.add_handler(CallbackQueryHandler(callback_article_length_action, pattern=r"^article_length:(approve|reject)$"))
    application.add_handler(CallbackQueryHandler(callback_preview_action, pattern=r"^preview:(approve|reject|regenerate)$"))
    application.add_handler(CallbackQueryHandler(callback_regen_action, pattern=r"^regen:(all|article|images|thread|cancel)$"))
    application.add_handler(CallbackQueryHandler(callback_publish_action, pattern=r"^publish:(delete|delete_confirm|delete_cancel)$"))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_unknown))
