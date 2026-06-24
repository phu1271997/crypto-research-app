from __future__ import annotations

import json
import re
import struct
import zlib
from datetime import UTC, datetime
from pathlib import Path

from loguru import logger
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.constants import ParseMode
from telegram.error import BadRequest, TimedOut
from telegram.helpers import escape_markdown
from telegram.ext import ContextTypes

from src.db import State, clear_state, get_state, set_state
from src.image_gen.generator import IMAGES_DIR, generate_images
from src.llm_client import OpenRouterClient
from src.publishers.azdag import mock_publish_to_azdag, publish_to_azdag, retry_azdag
from src.publishers.twitter import has_real_credentials, mock_publish_to_x_account, publish_to_both_x_accounts, publish_to_x_account
from src.publishers.wordpress import mock_publish_to_primus, publish_to_primus
from src.researcher.article_writer import ARTICLES_DIR, _slugify, load_article_from_meta, write_article
from src.settings import ROOT_DIR, settings
from src.telegram_bot.formatters import format_error, format_writing_progress
from src.twitter_writer.thread_writer import mock_thread, write_thread, write_x_article

TELEGRAM_PHOTO_LIMIT_BYTES = 10 * 1024 * 1024


def _build_mock_png(width: int = 64, height: int = 64, rgba: tuple[int, int, int, int] = (34, 197, 94, 255)) -> bytes:
    """
    Tạo PNG mock hợp lệ bằng stdlib để Telegram dễ xử lý hơn ảnh 1x1 tối giản.
    """

    def chunk(chunk_type: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + chunk_type
            + data
            + struct.pack(">I", zlib.crc32(chunk_type + data) & 0xFFFFFFFF)
        )

    signature = b"\x89PNG\r\n\x1a\n"
    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    row = bytes(rgba) * width
    raw = b"".join(b"\x00" + row for _ in range(height))
    idat = chunk(b"IDAT", zlib.compress(raw, level=9))
    iend = chunk(b"IEND", b"")
    return signature + ihdr + idat + iend


DUMMY_PNG = _build_mock_png()


class ResearchPipeline:
    """
    Orchestrator cho flow research -> write -> image -> thread -> preview.
    """

    def __init__(self, llm_client: OpenRouterClient):
        self.llm = llm_client

    async def run_article_step(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
        topic: dict,
    ) -> dict:
        """
        Step 1: Viết article + gửi file .md.
        """
        chat_id = self._get_chat_id(update)
        await context.bot.send_message(chat_id, format_writing_progress("researching"))
        await context.bot.send_message(chat_id, format_writing_progress("writing"))

        if settings.mock_mode:
            article = self._mock_article(topic)
        else:
            article = await write_article(self.llm, topic)

        with open(article["file_path"], "rb") as article_file:
            await context.bot.send_document(
                chat_id=chat_id,
                document=article_file,
                filename=Path(article["file_path"]).name,
                caption=f"📝 *{escape_markdown(article['title'], version=1)}* ({article['word_count']} từ)",
                parse_mode=ParseMode.MARKDOWN,
            )

        if article.get("warnings"):
            await context.bot.send_message(
                chat_id,
                "⚠️ Validation warnings:\n" + "\n".join(f"- {warning}" for warning in article["warnings"]),
            )

        return article

    async def run_image_step(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
        article: dict,
    ) -> dict:
        """
        Step 2: Tạo 2 ảnh + gửi vào Telegram.
        """
        chat_id = self._get_chat_id(update)
        await context.bot.send_message(chat_id, format_writing_progress("images"))

        if settings.mock_mode:
            images = self._mock_images(article)
        else:
            images = await generate_images(self.llm, article)

        for label, path_key in [
            ("🖼 Thumbnail (1200x630)", "thumbnail_path"),
            ("🖼 Inline image (1024x576)", "inline_path"),
        ]:
            if images.get(path_key):
                await self._send_image(chat_id, context, images[path_key], label)

        success_count = sum(1 for key in ["thumbnail_path", "inline_path"] if images.get(key))
        if success_count == 0:
            await context.bot.send_message(
                chat_id,
                "⚠️ Không tạo được ảnh nào, nhưng em vẫn tiếp tục để anh review bài và thread trước.",
            )
        elif success_count == 1:
            await context.bot.send_message(
                chat_id,
                "⚠️ Chỉ tạo được 1/2 ảnh. Em vẫn tiếp tục để anh review flow trước.",
            )

        return images

    async def run_thread_step(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
        article: dict,
        x_format: str = "thread",
    ) -> dict:
        """
        Step 3: Viết Twitter thread hoặc article + gửi preview.
        """
        chat_id = self._get_chat_id(update)
        progress_msg = "thread" if x_format == "thread" else "x_article"
        await context.bot.send_message(chat_id, format_writing_progress(progress_msg))

        if settings.mock_mode:
            thread_result = mock_thread(article, x_format=x_format)
        else:
            if x_format == "article":
                thread_result = await write_x_article(self.llm, article)
            else:
                thread_result = await write_thread(self.llm, article)

        thread_text = self._format_thread_for_telegram(thread_result)
        for message in self._split_message(thread_text, 4000):
            await context.bot.send_message(
                chat_id,
                message,
                parse_mode=ParseMode.MARKDOWN,
                disable_web_page_preview=True,
            )

        if thread_result.get("warnings"):
            await context.bot.send_message(
                chat_id,
                "⚠️ Warnings:\n" + "\n".join(f"- {warning}" for warning in thread_result["warnings"]),
            )

        return thread_result

    async def run_full_research(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
        topic: dict,
        target_platform: str = "primus",
        x_format: str = "thread",
        publish_mode: str = "both",
    ) -> dict | None:
        """
        Chạy đủ article -> images -> thread/article -> preview UI.
        target_platform: 'primus' hoặc 'azdag'
        """
        chat_id = self._get_chat_id(update)
        try:
            await set_state(
                chat_id,
                State.WRITING,
                {"topic": topic, "target_platform": target_platform, "x_format": x_format, "publish_mode": publish_mode},
            )
            article = await self.run_article_step(update, context, topic)
            if article.get("needs_length_approval"):
                pending_payload = self._build_article_length_payload(
                    topic,
                    article,
                    target_platform=target_platform,
                    x_format=x_format,
                    publish_mode=publish_mode,
                )
                await set_state(chat_id, State.ARTICLE_LENGTH_CONFIRM, pending_payload)
                await self._send_article_length_approval_ui(
                    update,
                    context,
                    article,
                    target_platform=target_platform,
                    x_format=x_format,
                    publish_mode=publish_mode,
                )
                return {"article": article, "awaiting_length_approval": True}

            images = await self.run_image_step(update, context, article)
            thread_result = (
                self._build_empty_thread_result()
                if publish_mode == "web_only"
                else await self.run_thread_step(update, context, article, x_format=x_format)
            )

            preview_payload = self._build_preview_payload(topic, article, images, thread_result)
            preview_payload["target_platform"] = target_platform
            preview_payload["x_format"] = x_format
            preview_payload["publish_mode"] = publish_mode
            await set_state(
                user_id=chat_id,
                state=State.PREVIEW,
                payload=preview_payload,
            )

            await self._send_preview_ui(
                update,
                context,
                article,
                images,
                thread_result,
                target_platform=target_platform,
                x_format=x_format,
                publish_mode=publish_mode,
            )
            return {"article": article, "images": images, "thread": thread_result}
        except Exception as exc:  # noqa: BLE001
            logger.exception("❌ Lỗi trong run_full_research")
            await context.bot.send_message(
                chat_id,
                format_error(str(exc)),
                parse_mode=ParseMode.MARKDOWN_V2,
            )
            await clear_state(chat_id)
            return None

    async def regenerate_thread_only(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        chat_id = self._get_chat_id(update)
        state, payload = await self._load_preview_payload(chat_id)
        if state is None or payload is None:
            await context.bot.send_message(chat_id, "❌ Preview đã hết hạn. Gõ /trending để bắt đầu lại.")
            return

        x_format = payload.get("x_format", "thread")
        await set_state(
            chat_id,
            State.WRITING,
            {"topic": payload["topic"], "regen": "thread", "x_format": x_format, "publish_mode": payload.get("publish_mode", "both")},
        )
        try:
            article = await load_article_from_meta(payload["article_meta"], self.llm)
            thread_result = await self.run_thread_step(update, context, article, x_format=x_format)
            payload["thread"] = thread_result["thread"]
            payload["thread_warnings"] = thread_result.get("warnings", [])
            await set_state(chat_id, State.PREVIEW, payload)
            await self._send_preview_ui(
                update,
                context,
                article,
                payload.get("image_paths", {}),
                thread_result,
                target_platform=payload.get("target_platform", "primus"),
                x_format=x_format,
                publish_mode=payload.get("publish_mode", "both"),
            )
        except FileNotFoundError as exc:
            logger.warning("Không thể regenerate thread vì thiếu file gốc: {}", exc)
            await context.bot.send_message(
                chat_id,
                "❌ Không tìm thấy file bài viết gốc để regenerate thread.\nVui lòng gõ /trending để bắt đầu lại.",
            )
            await clear_state(chat_id)
        except Exception as exc:  # noqa: BLE001
            logger.exception("❌ Lỗi khi regenerate thread")
            await context.bot.send_message(
                chat_id,
                format_error(str(exc)),
                parse_mode=ParseMode.MARKDOWN_V2,
            )
            await clear_state(chat_id)

    async def regenerate_images_only(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        chat_id = self._get_chat_id(update)
        state, payload = await self._load_preview_payload(chat_id)
        if state is None or payload is None:
            await context.bot.send_message(chat_id, "❌ Preview đã hết hạn. Gõ /trending để bắt đầu lại.")
            return

        await set_state(chat_id, State.WRITING, {"topic": payload["topic"], "regen": "images", "publish_mode": payload.get("publish_mode", "both")})
        try:
            article = await load_article_from_meta(payload["article_meta"], self.llm)
            await self._cleanup_files(
                {
                    "image_paths": {
                        "thumbnail_path": payload.get("image_paths", {}).get("thumbnail_path"),
                        "inline_path": payload.get("image_paths", {}).get("inline_path"),
                    }
                }
            )
            images = await self.run_image_step(update, context, article)
            payload["image_paths"] = images
            await set_state(chat_id, State.PREVIEW, payload)
            thread_result = {
                "thread": payload.get("thread", []),
                "warnings": payload.get("thread_warnings", []),
                "tweet_count": len(payload.get("thread", [])),
            }
            await self._send_preview_ui(
                update,
                context,
                article,
                images,
                thread_result,
                target_platform=payload.get("target_platform", "primus"),
                x_format=payload.get("x_format", "thread"),
                publish_mode=payload.get("publish_mode", "both"),
            )
        except FileNotFoundError as exc:
            logger.warning("Không thể regenerate images vì thiếu file gốc: {}", exc)
            await context.bot.send_message(
                chat_id,
                "❌ Không tìm thấy file bài viết gốc để tạo lại ảnh.\nVui lòng gõ /trending để bắt đầu lại.",
            )
            await clear_state(chat_id)
        except Exception as exc:  # noqa: BLE001
            logger.exception("❌ Lỗi khi regenerate images")
            await context.bot.send_message(
                chat_id,
                format_error(str(exc)),
                parse_mode=ParseMode.MARKDOWN_V2,
            )
            await clear_state(chat_id)

    async def regenerate_all(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        chat_id = self._get_chat_id(update)
        state, payload = await self._load_preview_payload(chat_id)
        if state is None or payload is None:
            await context.bot.send_message(chat_id, "❌ Preview đã hết hạn. Gõ /trending để bắt đầu lại.")
            return

        target_platform = payload.get("target_platform", "primus")
        x_format = payload.get("x_format", "thread")
        await set_state(
            chat_id,
            State.WRITING,
            {"topic": payload["topic"], "regen": "all", "target_platform": target_platform, "x_format": x_format, "publish_mode": payload.get("publish_mode", "both")},
        )
        await self._cleanup_files(payload)
        await self.run_full_research(
            update, context, payload["topic"], target_platform=target_platform, x_format=x_format, publish_mode=payload.get("publish_mode", "both")
        )

    async def continue_after_article_length_approval(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        chat_id = self._get_chat_id(update)
        state = await get_state(chat_id)
        payload = self._parse_payload(state.payload) if state and state.payload else None
        if state is None or state.state != State.ARTICLE_LENGTH_CONFIRM or payload is None:
            await context.bot.send_message(chat_id, "❌ Xác nhận dùng bài dài đã hết hạn. Gõ /trending để bắt đầu lại.")
            return

        try:
            article = await load_article_from_meta(payload["article_meta"], self.llm)
            publish_mode = payload.get("publish_mode", "both")
            next_step_text = "✅ Đã chấp nhận dùng bài dài. Em tiếp tục tạo ảnh..." if publish_mode == "web_only" else "✅ Đã chấp nhận dùng bài dài. Em tiếp tục tạo ảnh và viết nội dung X..."
            await context.bot.send_message(chat_id, next_step_text)
            images = await self.run_image_step(update, context, article)
            thread_result = (
                self._build_empty_thread_result()
                if publish_mode == "web_only"
                else await self.run_thread_step(update, context, article, x_format=payload.get("x_format", "thread"))
            )

            preview_payload = self._build_preview_payload(payload["topic"], article, images, thread_result)
            preview_payload["target_platform"] = payload.get("target_platform", "primus")
            preview_payload["x_format"] = payload.get("x_format", "thread")
            preview_payload["publish_mode"] = payload.get("publish_mode", "both")
            await set_state(chat_id, State.PREVIEW, preview_payload)
            await self._send_preview_ui(
                update,
                context,
                article,
                images,
                thread_result,
                target_platform=payload.get("target_platform", "primus"),
                x_format=payload.get("x_format", "thread"),
                publish_mode=payload.get("publish_mode", "both"),
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("❌ Lỗi khi tiếp tục với bài quá dài")
            await context.bot.send_message(chat_id, format_error(str(exc)), parse_mode=ParseMode.MARKDOWN_V2)
            await clear_state(chat_id)

    async def reject_article_length_approval(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        chat_id = self._get_chat_id(update)
        state = await get_state(chat_id)
        payload = self._parse_payload(state.payload) if state and state.payload else None
        if payload:
            await self._cleanup_files(payload)
        await clear_state(chat_id)
        await context.bot.send_message(chat_id, "❌ Đã hủy bài viết vì vượt quá giới hạn số từ.")

    async def reject(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        chat_id = self._get_chat_id(update)
        state = await get_state(chat_id)
        payload = self._parse_payload(state.payload) if state and state.payload else None
        if payload:
            await self._cleanup_files(payload)
        await clear_state(chat_id)
        await context.bot.send_message(chat_id, "❌ Đã hủy bài viết và xóa toàn bộ file liên quan.")

    async def approve(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        chat_id = self._get_chat_id(update)
        state, payload = await self._load_preview_payload(chat_id)
        if state is None or payload is None:
            await context.bot.send_message(chat_id, "❌ Preview đã hết hạn. Gõ /trending để bắt đầu lại.")
            return

        target_platform = payload.get("target_platform", "primus")
        publish_mode = payload.get("publish_mode", "both")
        publish_result = self._make_platform_publish_result(target_platform, publish_mode)
        payload["publish_result"] = publish_result
        await set_state(chat_id, State.PUBLISHING, payload)

        platform_label = "🔵 Primus Spark" if target_platform == "primus" else "🟠 AZDAG"
        publish_mode_label = self._publish_mode_label(publish_mode)
        await context.bot.send_message(
            chat_id,
            f"🚀 Approve! Bắt đầu publish cho *{platform_label}* theo mode *{escape_markdown(publish_mode_label, version=1)}*...",
            parse_mode=ParseMode.MARKDOWN,
        )

        article_meta = payload["article_meta"]
        image_paths = payload.get("image_paths", {})
        try:
            article = await load_article_from_meta(article_meta, self.llm)
        except Exception as exc:
            logger.exception("❌ Không load được article từ metadata để publish")
            await context.bot.send_message(chat_id, f"❌ Load article FAIL: {exc}")
            return

        thread = payload.get("thread", [])
        web_key = "primus" if target_platform == "primus" else "azdag"
        x_key = "x1" if target_platform == "primus" else "x2"
        publish_web = publish_mode in ("both", "web_only")
        publish_x = publish_mode in ("both", "x_only")
        web_url: str | None = None

        if publish_web:
            if target_platform == "primus":
                web_result = await self._publish_primus(article, image_paths, chat_id, context)
            else:
                await context.bot.send_message(chat_id, "🤖 Đang đăng lên *AZDAG Web*...", parse_mode=ParseMode.MARKDOWN)
                web_result = await self._publish_azdag(article, image_paths, chat_id, context)
            publish_result[web_key] = web_result

            if web_result["status"] == "success" and web_result.get("url"):
                web_url = web_result["url"]
                thread = self._replace_thread_cta(thread, web_url)
                payload["thread"] = thread
                self._save_thread_artifact(article_meta["article_id"], thread)
                await context.bot.send_message(chat_id, f"🔗 Đã update CTA X với URL {web_key.upper()}.")
        else:
            publish_result[web_key] = self._make_skipped_result("Anh chọn chỉ đăng X.")

        if publish_x:
            if publish_mode == "x_only":
                stripped_thread = self._strip_thread_cta(thread)
                if stripped_thread != thread:
                    thread = stripped_thread
                    payload["thread"] = thread
                    self._save_thread_artifact(article_meta["article_id"], thread)
                    await context.bot.send_message(chat_id, "🧹 Đã bỏ CTA web khỏi nội dung X vì anh chọn Chỉ X.")
            elif not web_url:
                publish_result[x_key] = self._make_skipped_result("Web publish chưa thành công, tạm chưa đăng X để tránh CTA rỗng.")
                await context.bot.send_message(chat_id, "⏭ Web chưa lên thành công nên em tạm skip X để tránh post CTA rỗng.")
                payload["publish_result"] = publish_result
                await set_state(chat_id, State.PUBLISHING, payload)
                publish_x = False

        if publish_x:
            if self._x_publish_enabled() and (settings.mock_mode or has_real_credentials(x_key)):
                await context.bot.send_message(
                    chat_id,
                    f"🐦 Đang post nội dung lên *{x_key.upper()}*...",
                    parse_mode=ParseMode.MARKDOWN,
                )
                if settings.mock_mode:
                    publish_result[x_key] = self._finalize_attempt_result(
                        mock_publish_to_x_account(x_key, thread, image_paths.get("thumbnail_path"))
                    )
                else:
                    publish_result[x_key] = self._finalize_attempt_result(
                        await publish_to_x_account(x_key, thread, image_paths.get("thumbnail_path"))
                    )
            else:
                publish_result[x_key] = self._make_skipped_result(f"{x_key.upper()} không khả dụng hoặc đang tắt.")
        elif publish_mode == "web_only":
            publish_result[x_key] = self._make_skipped_result("Anh chọn chỉ đăng web.")

        payload["publish_result"] = publish_result
        await set_state(chat_id, State.PUBLISHING, payload)

        for label, res in publish_result.items():
            if not isinstance(res, dict) or res.get("status") == "skipped":
                continue
            if res["status"] == "success":
                await context.bot.send_message(chat_id, f"✅ {label}: {res['url']}")
            elif res["status"] in ("failed", "partial"):
                escaped_error = escape_markdown(str(res.get("last_error", "Unknown"))[:200], version=1)
                await context.bot.send_message(chat_id, f"❌ {label} FAIL:\n```\n{escaped_error}\n```", parse_mode=ParseMode.MARKDOWN)

        success_count = sum(1 for r in publish_result.values() if isinstance(r, dict) and r.get("status") == "success")
        total = sum(1 for r in publish_result.values() if isinstance(r, dict) and r.get("status") != "skipped")
        await context.bot.send_message(
            chat_id,
            f"🏁 *Hoàn tất publish {platform_label}.* {success_count}/{total} thành công.\n\n"
            f"`/status` — xem chi tiết\n`/retry` — retry fail\n`/trending` — tạo bài mới",
            parse_mode=ParseMode.MARKDOWN,
        )

    async def retry_failed_platforms(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
        platforms: list[str],
    ) -> None:
        chat_id = self._get_chat_id(update)
        state = await get_state(chat_id)
        if state is None or not state.payload:
            await context.bot.send_message(chat_id, "❌ Không tìm thấy publish job để retry.")
            return

        payload = json.loads(state.payload)
        publish_result = payload.get("publish_result")
        if not isinstance(publish_result, dict):
            await context.bot.send_message(chat_id, "❌ Không tìm thấy publish_result để retry.")
            return

        publish_mode = payload.get("publish_mode", "both")
        article_meta = payload["article_meta"]
        image_paths = payload.get("image_paths", {})
        thread = payload.get("thread", [])
        article = await load_article_from_meta(article_meta, self.llm)

        for platform in platforms:
            info = publish_result.get(platform)
            if not isinstance(info, dict):
                continue

            old_attempt = int(info.get("attempt_count", 0) or 0)
            first_attempted_at = info.get("first_attempted_at")

            if platform == "primus":
                new_result = await self._publish_primus(article, image_paths, chat_id, context)
                if new_result["status"] == "success" and new_result.get("url"):
                    thread = self._replace_thread_cta(thread, new_result["url"])
                    payload["thread"] = thread
                    self._save_thread_artifact(article_meta["article_id"], thread)
            elif platform == "azdag":
                if not self._azdag_publish_enabled():
                    await context.bot.send_message(chat_id, "⏭ AZDAG đang bị tắt trong cấu hình, bỏ qua retry.")
                    publish_result[platform] = self._make_skipped_result("Tạm tắt publish AZDAG trong cấu hình.")
                    payload["publish_result"] = publish_result
                    await set_state(chat_id, State.PUBLISHING, payload)
                    continue
                await context.bot.send_message(chat_id, "🤖 Đang retry AZDAG...")
                if settings.mock_mode:
                    new_result = mock_publish_to_azdag(article, image_paths.get("thumbnail_path"), image_paths.get("inline_path"))
                else:
                    async def notify(message: str) -> None:
                        await context.bot.send_message(chat_id, message, parse_mode=ParseMode.MARKDOWN)

                    new_result = await retry_azdag(
                        previous_result=publish_result["azdag"],
                        article=article,
                        thumbnail_path=image_paths.get("thumbnail_path"),
                        inline_path=image_paths.get("inline_path"),
                        telegram_notifier=notify,
                    )
                if new_result["status"] == "success" and new_result.get("url"):
                    thread = self._replace_thread_cta(thread, new_result["url"])
                    payload["thread"] = thread
                    self._save_thread_artifact(article_meta["article_id"], thread)
            elif platform in ("x1", "x2"):
                if not self._x_publish_enabled():
                    await context.bot.send_message(chat_id, f"⏭ {platform.upper()} đang bị tắt trong cấu hình, bỏ qua retry.")
                    publish_result[platform] = self._make_skipped_result("Tạm tắt publish X trong cấu hình.")
                    payload["publish_result"] = publish_result
                    await set_state(chat_id, State.PUBLISHING, payload)
                    continue
                if not settings.mock_mode and not has_real_credentials(platform):
                    await context.bot.send_message(chat_id, f"⏭ {platform.upper()} chưa có credentials hợp lệ, bỏ qua retry.")
                    publish_result[platform] = self._make_skipped_result(f"{platform.upper()} chưa có credentials hợp lệ.")
                    payload["publish_result"] = publish_result
                    await set_state(chat_id, State.PUBLISHING, payload)
                    continue

                thread_to_publish = thread
                if publish_mode == "both":
                    web_platform = "primus" if platform == "x1" else "azdag"
                    web_info = publish_result.get(web_platform, {})
                    web_url = web_info.get("url") if isinstance(web_info, dict) else None
                    if not web_url or web_info.get("status") != "success":
                        await context.bot.send_message(chat_id, f"⏭ {platform.upper()} chưa thể retry vì web chưa publish thành công để gắn CTA.")
                        publish_result[platform] = self._make_skipped_result("Web publish chưa thành công, chưa thể retry X.")
                        payload["publish_result"] = publish_result
                        await set_state(chat_id, State.PUBLISHING, payload)
                        continue
                    thread_to_publish = self._replace_thread_cta(thread_to_publish, web_url)
                elif publish_mode == "x_only":
                    thread_to_publish = self._strip_thread_cta(thread_to_publish)

                payload["thread"] = thread_to_publish
                thread = thread_to_publish
                self._save_thread_artifact(article_meta["article_id"], thread_to_publish)

                await context.bot.send_message(chat_id, f"🐦 Đang retry {platform.upper()}...")
                if settings.mock_mode:
                    new_result = mock_publish_to_x_account(platform, thread_to_publish, image_paths.get("thumbnail_path"))
                else:
                    new_result = await publish_to_x_account(platform, thread_to_publish, image_paths.get("thumbnail_path"))
            else:
                continue

            if platform != "azdag":
                new_result["attempt_count"] = old_attempt + 1
                new_result["first_attempted_at"] = first_attempted_at or new_result.get("first_attempted_at")
                new_result["last_attempted_at"] = self._utc_now()
            publish_result[platform] = self._finalize_attempt_result(new_result)
            payload["publish_result"] = publish_result
            await set_state(chat_id, State.PUBLISHING, payload)

            if new_result["status"] == "success":
                await context.bot.send_message(chat_id, f"✅ Retry {platform}: {new_result['url']}")
            else:
                escaped_error = escape_markdown(str(new_result.get("last_error", "Unknown error")), version=1)
                await context.bot.send_message(
                    chat_id,
                    f"❌ Retry {platform} vẫn FAIL (attempt #{new_result['attempt_count']}):\n```\n{escaped_error}\n```",
                    parse_mode=ParseMode.MARKDOWN,
                )


    async def _send_article_length_approval_ui(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
        article: dict,
        target_platform: str = "primus",
        x_format: str = "thread",
        publish_mode: str = "both",
    ) -> None:
        chat_id = self._get_chat_id(update)
        platform_label = "Primus Spark" if target_platform == "primus" else "AZDAG"
        x_format_label = "Thread" if x_format == "thread" else "Article"
        publish_mode_label = self._publish_mode_label(publish_mode)
        limit_words = article.get("length_limit_words", "2100")
        text = (
            f"⚠️ *BÀI VIẾT VƯỢT GIỚI HẠN*\n\n"
            f"📝 Title: *{escape_markdown(article['title'], version=1)}*\n"
            f"📊 Số từ hiện tại: *{article['word_count']}*\n"
            f"🚫 Giới hạn khuyến nghị: *{limit_words}* từ\n"
            f"🎯 Platform: *{escape_markdown(platform_label, version=1)}*\n"
            f"📝 X Format: *{x_format_label}*\n"
            f"🚀 Publish mode: *{escape_markdown(publish_mode_label, version=1)}*\n\n"
            "LLM chưa rút bài xuống đủ ngắn sau nhiều lần thử. Anh có muốn *vẫn dùng bài này* để chạy tiếp flow không?"
        )
        keyboard = InlineKeyboardMarkup(
            [
                [InlineKeyboardButton("✅ Đồng ý dùng bài này", callback_data="article_length:approve")],
                [InlineKeyboardButton("❌ Không đồng ý", callback_data="article_length:reject")],
            ]
        )
        await context.bot.send_message(chat_id, text, parse_mode=ParseMode.MARKDOWN, reply_markup=keyboard)

    async def _send_preview_ui(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
        article: dict,
        images: dict,
        thread_result: dict,
        target_platform: str = "primus",
        x_format: str = "thread",
        publish_mode: str = "both",
    ) -> None:
        chat_id = self._get_chat_id(update)
        image_count = sum(1 for key in ["thumbnail_path", "inline_path"] if images.get(key))
        platform_label = "🔵 Primus Spark" if target_platform == "primus" else "🟠 AZDAG"
        x_format_label = "Thread" if x_format == "thread" else "Article"
        publish_mode_label = self._publish_mode_label(publish_mode)
        x_summary = (
            "🐦 X: Bỏ qua theo lựa chọn Chỉ web"
            if publish_mode == "web_only"
            else f"🐦 X Format: {x_format_label}\n🐦 Thread: {thread_result['tweet_count']} posts"
        )
        text = (
            f"📋 *PREVIEW BÀI VIẾT*\n\n"
            f"📝 Title: *{escape_markdown(article['title'], version=1)}*\n"
            f"📊 Article: {article['word_count']} từ\n"
            f"🖼 Images: {image_count}/2\n"
            f"{x_summary}\n"
            f"🎯 Platform: *{escape_markdown(platform_label, version=1)}*\n"
            f"🚀 Publish mode: *{escape_markdown(publish_mode_label, version=1)}*\n\n"
            f"Bấm Approve để đăng bài."
        )
        keyboard = InlineKeyboardMarkup(
            [
                [InlineKeyboardButton("✅ Approve & Publish", callback_data="preview:approve")],
                [
                    InlineKeyboardButton("❌ Reject", callback_data="preview:reject"),
                    InlineKeyboardButton("🔄 Regenerate", callback_data="preview:regenerate"),
                ],
            ]
        )
        await context.bot.send_message(
            chat_id,
            text,
            parse_mode=ParseMode.MARKDOWN,
            reply_markup=keyboard,
        )

    async def _cleanup_files(self, payload: dict) -> None:
        """
        Xóa file .md + ảnh trong storage/.
        """
        article_meta = payload.get("article_meta", {}) if isinstance(payload, dict) else {}
        image_paths = payload.get("image_paths", {}) if isinstance(payload, dict) else {}
        for path_str in [
            article_meta.get("file_path"),
            image_paths.get("thumbnail_path"),
            image_paths.get("inline_path"),
        ]:
            if not path_str:
                continue
            try:
                path = Path(path_str)
                if path.exists():
                    path.unlink()
                    logger.info("🗑 Đã xóa: {}", path.name)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Không xóa được {}: {}", path_str, exc)

    @staticmethod
    def _build_empty_thread_result() -> dict:
        return {
            "thread": [],
            "warnings": [],
            "tweet_count": 0,
            "skipped": True,
        }

    def _build_article_length_payload(
        self,
        topic: dict,
        article: dict,
        target_platform: str,
        x_format: str,
        publish_mode: str,
    ) -> dict:
        return {
            "topic": topic,
            "target_platform": target_platform,
            "x_format": x_format,
            "publish_mode": publish_mode,
            "article_meta": {
                "article_id": article["article_id"],
                "title": article["title"],
                "slug": article["slug"],
                "file_path": article["file_path"],
                "word_count": article["word_count"],
            },
            "article_warnings": article.get("warnings", []),
            "needs_length_approval": bool(article.get("needs_length_approval")),
            "length_limit_words": article.get("length_limit_words"),
        }

    def _build_preview_payload(self, topic: dict, article: dict, images: dict, thread_result: dict) -> dict:
        return {
            "topic": topic,
            "article_meta": {
                "article_id": article["article_id"],
                "title": article["title"],
                "slug": article["slug"],
                "file_path": article["file_path"],
                "word_count": article["word_count"],
            },
            "image_paths": {
                "thumbnail_path": images.get("thumbnail_path"),
                "inline_path": images.get("inline_path"),
            },
            "thread": thread_result["thread"],
            "thread_warnings": thread_result.get("warnings", []),
        }

    @staticmethod
    def _make_empty_publish_result() -> dict:
        template = {
            "status": "pending",
            "url": None,
            "post_id": None,
            "tweet_ids": [],
            "last_error": None,
            "attempt_count": 0,
            "first_attempted_at": None,
            "last_attempted_at": None,
        }
        return {
            "primus": dict(template),
            "azdag": dict(template),
            "x1": dict(template),
            "x2": dict(template),
        }

    @staticmethod
    def _make_platform_publish_result(target_platform: str, publish_mode: str = "both") -> dict:
        """Create publish_result with only the relevant publish targets pending."""
        skip = ResearchPipeline._make_skipped_result
        template = {"status": "pending", "url": None, "post_id": None, "tweet_ids": [], "last_error": None, "attempt_count": 0, "first_attempted_at": None, "last_attempted_at": None}
        if target_platform == "primus":
            return {
                "primus": dict(template) if publish_mode in ("both", "web_only") else skip("Anh chọn chỉ đăng X."),
                "x1": dict(template) if publish_mode in ("both", "x_only") else skip("Anh chọn chỉ đăng web."),
                "azdag": skip("Bài này cho Primus, không đăng AZDAG."),
                "x2": skip("Bài này cho Primus, không đăng X2."),
            }
        return {
            "azdag": dict(template) if publish_mode in ("both", "web_only") else skip("Anh chọn chỉ đăng X."),
            "x2": dict(template) if publish_mode in ("both", "x_only") else skip("Anh chọn chỉ đăng web."),
            "primus": skip("Bài này cho AZDAG, không đăng Primus."),
            "x1": skip("Bài này cho AZDAG, không đăng X1."),
        }

    @staticmethod
    def _make_skipped_result(reason: str) -> dict:
        now = datetime.now(UTC).isoformat().replace("+00:00", "Z")
        return {
            "status": "skipped",
            "url": None,
            "post_id": None,
            "tweet_ids": [],
            "last_error": reason,
            "attempt_count": 0,
            "first_attempted_at": None,
            "last_attempted_at": now,
        }

    @staticmethod
    def _make_result_entry(
        status: str,
        url: str | None = None,
        post_id: str | int | None = None,
        tweet_ids: list[str] | None = None,
        last_error: str | None = None,
    ) -> dict:
        now = datetime.now(UTC).isoformat().replace("+00:00", "Z")
        return {
            "status": status,
            "url": url,
            "post_id": str(post_id) if post_id is not None else None,
            "tweet_ids": tweet_ids or [],
            "last_error": last_error,
            "attempt_count": 1,
            "first_attempted_at": now,
            "last_attempted_at": now,
        }

    async def _publish_primus(self, article: dict, image_paths: dict, chat_id: int, context: ContextTypes.DEFAULT_TYPE) -> dict:
        await context.bot.send_message(chat_id, "📝 Đang đăng lên *Primus Spark*...", parse_mode=ParseMode.MARKDOWN)

        if settings.mock_mode:
            response = mock_publish_to_primus(article, image_paths.get("thumbnail_path"), image_paths.get("inline_path"))
        else:
            response = await publish_to_primus(article, image_paths.get("thumbnail_path"), image_paths.get("inline_path"))

        primus_result = self._make_result_entry(
            status=response.get("status", "failed"),
            url=response.get("url"),
            post_id=response.get("post_id"),
            last_error=response.get("error"),
        )
        primus_result["first_attempted_at"] = response.get("attempted_at") or primus_result["first_attempted_at"]
        primus_result["last_attempted_at"] = response.get("attempted_at") or primus_result["last_attempted_at"]

        if primus_result["status"] == "success":
            await context.bot.send_message(chat_id, f"✅ Primus Spark: {primus_result['url']}")
        else:
            escaped_error = escape_markdown(str(primus_result.get("last_error", "Unknown error")), version=1)
            await context.bot.send_message(
                chat_id,
                f"❌ Primus FAIL:\n```\n{escaped_error}\n```",
                parse_mode=ParseMode.MARKDOWN,
            )

        return primus_result

    async def _publish_azdag(self, article: dict, image_paths: dict, chat_id: int, context: ContextTypes.DEFAULT_TYPE) -> dict:
        if settings.mock_mode:
            result = mock_publish_to_azdag(article, image_paths.get("thumbnail_path"), image_paths.get("inline_path"))
            return self._finalize_attempt_result(result)

        async def notify(message: str) -> None:
            await context.bot.send_message(chat_id, message, parse_mode=ParseMode.MARKDOWN)

        result = await publish_to_azdag(
            article,
            image_paths.get("thumbnail_path"),
            image_paths.get("inline_path"),
            telegram_notifier=notify,
        )
        return self._finalize_attempt_result(result)

    @staticmethod
    def _finalize_attempt_result(result: dict) -> dict:
        normalized = dict(result)
        normalized.setdefault("status", "failed")
        normalized.setdefault("url", None)
        normalized.setdefault("post_id", None)
        normalized.setdefault("tweet_ids", [])
        normalized.setdefault("last_error", None)
        normalized.setdefault("attempt_count", 1 if normalized["status"] != "pending" else 0)
        normalized.setdefault("first_attempted_at", None)
        normalized.setdefault("last_attempted_at", None)
        return normalized

    @staticmethod
    def _replace_thread_cta(thread: list[str], real_url: str) -> list[str]:
        if not thread:
            return thread
        updated = list(thread)
        updated[-1] = updated[-1].replace("<PLACEHOLDER_URL>", real_url)
        return updated

    @staticmethod
    def _strip_thread_cta(thread: list[str]) -> list[str]:
        if not thread:
            return thread
        updated = list(thread)
        cleaned_last = updated[-1].replace("Read the full research: <PLACEHOLDER_URL>", "").replace("<PLACEHOLDER_URL>", "")
        cleaned_last = re.sub(r"\n{3,}", "\n\n", cleaned_last).strip()
        if cleaned_last:
            updated[-1] = cleaned_last
            return updated
        return updated[:-1]

    @staticmethod
    def _save_thread_artifact(article_id: str, thread: list[str]) -> None:
        threads_dir = ROOT_DIR / "storage" / "threads"
        threads_dir.mkdir(parents=True, exist_ok=True)
        path = threads_dir / f"{article_id}.json"
        path.write_text(
            json.dumps({"thread": thread, "tweet_count": len(thread)}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        logger.info("✅ Đã lưu thread artifact: {}", path)

    @staticmethod
    def _utc_now() -> str:
        return datetime.now(UTC).isoformat().replace("+00:00", "Z")

    @staticmethod
    def _x_publish_enabled() -> bool:
        return settings.enable_x_publish

    @staticmethod
    def _azdag_publish_enabled() -> bool:
        return settings.enable_azdag_publish

    @staticmethod
    def _publish_mode_label(publish_mode: str) -> str:
        return {"both": "Cả web và X", "web_only": "Chỉ web", "x_only": "Chỉ X"}.get(publish_mode, publish_mode)

    def _publish_targets_text(self) -> str:
        targets = ["Primus Spark"]
        if self._x_publish_enabled():
            x_targets: list[str] = []
            if settings.mock_mode or has_real_credentials("x1"):
                x_targets.append("X1")
            if settings.mock_mode or has_real_credentials("x2"):
                x_targets.append("X2")
            if x_targets:
                targets.append(" + ".join(x_targets))
        if self._azdag_publish_enabled():
            targets.append("AZDAG")
        return " + ".join(targets)

    def _format_thread_for_telegram(self, thread_result: dict) -> str:
        thread = thread_result.get("thread", [])
        if not isinstance(thread, list):
            return "🐦 *Twitter Thread (English) — 0 tweets*\n\nKhông có dữ liệu thread."

        lines = [f"🐦 *Twitter Thread (English) — {thread_result.get('tweet_count', len(thread))} tweets*"]
        for index, tweet in enumerate(thread, start=1):
            lines.append("")
            lines.append(f"*{index}.* {escape_markdown(tweet, version=1)}")
        return "\n".join(lines)

    def _split_message(self, text: str, max_length: int) -> list[str]:
        if len(text) <= max_length:
            return [text]

        chunks: list[str] = []
        current = ""
        for block in text.split("\n\n"):
            candidate = block if not current else current + "\n\n" + block
            if len(candidate) <= max_length:
                current = candidate
                continue
            if current:
                chunks.append(current)
            current = block
        if current:
            chunks.append(current)
        return chunks

    async def _send_image(
        self,
        chat_id: int,
        context: ContextTypes.DEFAULT_TYPE,
        image_path: str,
        caption: str,
    ) -> None:
        path = Path(image_path)
        if not path.exists():
            return

        if path.stat().st_size > TELEGRAM_PHOTO_LIMIT_BYTES:
            with open(path, "rb") as image_file:
                await context.bot.send_document(
                    chat_id=chat_id,
                    document=image_file,
                    filename=path.name,
                    caption=f"{caption} (gửi dưới dạng file vì ảnh lớn)",
                )
            return

        try:
            with open(path, "rb") as image_file:
                await context.bot.send_photo(chat_id=chat_id, photo=image_file, caption=caption)
        except TimedOut:
            logger.warning("Telegram send_photo bị timeout với ảnh {}, fallback sang document.", path.name)
            with open(path, "rb") as image_file:
                await context.bot.send_document(
                    chat_id=chat_id,
                    document=image_file,
                    filename=path.name,
                    caption=f"{caption} (send_photo timeout, em gửi dưới dạng file)",
                )
        except BadRequest as exc:
            if "Image_process_failed" not in str(exc):
                raise
            logger.warning("Telegram không xử lý được ảnh {} dưới dạng photo, chuyển sang document.", path.name)
            with open(path, "rb") as image_file:
                await context.bot.send_document(
                    chat_id=chat_id,
                    document=image_file,
                    filename=path.name,
                    caption=f"{caption} (Telegram không render photo, em gửi dưới dạng file)",
                )

    async def _load_preview_payload(self, chat_id: int) -> tuple[object | None, dict | None]:
        state = await get_state(chat_id)
        if state is None or state.state != State.PREVIEW or not state.payload:
            return state, None
        return state, self._parse_payload(state.payload)

    def _parse_payload(self, raw_payload: str) -> dict:
        return json.loads(raw_payload)

    def _get_chat_id(self, update: Update) -> int:
        if update.effective_chat is None:
            raise ValueError("Update không có effective_chat.")
        return update.effective_chat.id

    def _mock_article(self, topic: dict) -> dict:
        slug = _slugify(topic["title"])
        article_id = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_MOCK_{slug}"
        content = f"""# {topic['title']}

## Tóm tắt
[MOCK MODE] Đây là bài viết giả lập để test UI flow.

## Bối cảnh
Lorem ipsum...

## Phân tích
Mock content for testing.

## Tác động thị trường
Mock impact analysis.

## Rủi ro và biến số cần theo dõi
Mock risk analysis.

## Kết luận
Mock conclusion.
"""
        ARTICLES_DIR.mkdir(parents=True, exist_ok=True)
        file_path = ARTICLES_DIR / f"{article_id}.md"
        file_path.write_text(content, encoding="utf-8")
        return {
            "article_id": article_id,
            "title": topic["title"],
            "slug": slug,
            "content": content,
            "file_path": str(file_path.resolve()),
            "word_count": 50,
            "warnings": ["[MOCK MODE] Bài viết giả lập"],
            "topic": topic,
        }

    def _mock_images(self, article: dict) -> dict:
        IMAGES_DIR.mkdir(parents=True, exist_ok=True)
        thumb_path = IMAGES_DIR / f"{article['article_id']}_thumb.png"
        inline_path = IMAGES_DIR / f"{article['article_id']}_inline.png"
        thumb_path.write_bytes(DUMMY_PNG)
        inline_path.write_bytes(DUMMY_PNG)
        return {
            "thumbnail_path": str(thumb_path.resolve()),
            "inline_path": str(inline_path.resolve()),
        }
