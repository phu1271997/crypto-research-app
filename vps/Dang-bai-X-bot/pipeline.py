from __future__ import annotations

import json
import struct
import zlib
from datetime import UTC, datetime
from pathlib import Path

from loguru import logger
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.constants import ParseMode
from telegram.error import BadRequest
from telegram.helpers import escape_markdown
from telegram.ext import ContextTypes

from src.db import State, clear_state, get_state, set_state
from src.image_gen.generator import IMAGES_DIR, generate_images
from src.llm_client import OpenRouterClient
from src.publishers.azdag import mock_publish_to_azdag, publish_to_azdag, retry_azdag
from src.publishers.twitter import (
    delete_from_x_account,
    has_real_credentials,
    mock_delete_from_x_account,
    mock_publish_to_x_account,
    publish_to_both_x_accounts,
    publish_to_x_account,
)
from src.publishers.wordpress import delete_from_primus, mock_delete_from_primus, mock_publish_to_primus, publish_to_primus
from src.researcher.article_writer import ARTICLES_DIR, _slugify, load_article_from_meta, write_article
from src.settings import ROOT_DIR, settings
from src.telegram_bot.formatters import format_error, format_writing_progress
from src.twitter_writer.thread_writer import mock_thread, write_thread

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
    ) -> dict:
        """
        Step 3: Viết Twitter thread + gửi preview.
        """
        chat_id = self._get_chat_id(update)
        await context.bot.send_message(chat_id, format_writing_progress("thread"))

        if settings.mock_mode:
            thread_result = mock_thread(article)
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
                "⚠️ Thread warnings:\n" + "\n".join(f"- {warning}" for warning in thread_result["warnings"]),
            )

        return thread_result

    async def run_full_research(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
        topic: dict,
    ) -> dict | None:
        """
        Chạy đủ article -> images -> thread -> preview UI.
        """
        chat_id = self._get_chat_id(update)
        try:
            await set_state(chat_id, State.WRITING, {"topic": topic})
            article = await self.run_article_step(update, context, topic)
            images = await self.run_image_step(update, context, article)
            thread_result = await self.run_thread_step(update, context, article)

            await set_state(
                user_id=chat_id,
                state=State.PREVIEW,
                payload=self._build_preview_payload(topic, article, images, thread_result),
            )

            await self._send_preview_ui(update, context, article, images, thread_result)
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

        await set_state(chat_id, State.WRITING, {"topic": payload["topic"], "regen": "thread"})
        try:
            article = load_article_from_meta(payload["article_meta"])
            thread_result = await self.run_thread_step(update, context, article)
            payload["thread"] = thread_result["thread"]
            payload["thread_warnings"] = thread_result.get("warnings", [])
            await set_state(chat_id, State.PREVIEW, payload)
            await self._send_preview_ui(
                update,
                context,
                article,
                payload.get("image_paths", {}),
                thread_result,
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

        await set_state(chat_id, State.WRITING, {"topic": payload["topic"], "regen": "images"})
        try:
            article = load_article_from_meta(payload["article_meta"])
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
            await self._send_preview_ui(update, context, article, images, thread_result)
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

        await set_state(chat_id, State.WRITING, {"topic": payload["topic"], "regen": "all"})
        await self._cleanup_files(payload)
        await self.run_full_research(update, context, payload["topic"])

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

        publish_result = self._make_empty_publish_result()
        payload["publish_result"] = publish_result
        await set_state(chat_id, State.PUBLISHING, payload)
        await context.bot.send_message(
            chat_id,
            "🚀 Đã ghi nhận Approve. Bắt đầu publish...",
        )

        article_meta = payload["article_meta"]
        image_paths = payload.get("image_paths", {})
        try:
            article = load_article_from_meta(article_meta)
        except Exception as exc:  # noqa: BLE001
            logger.exception("❌ Không load được article từ metadata để publish")
            publish_result["primus"] = self._finalize_attempt_result(
                self._make_result_entry(status="failed", last_error=str(exc))
            )
            payload["publish_result"] = publish_result
            await set_state(chat_id, State.PUBLISHING, payload)
            await context.bot.send_message(
                chat_id,
                f"❌ Primus Spark FAIL:\n```\n{escape_markdown(str(exc), version=1)}\n```",
                parse_mode=ParseMode.MARKDOWN,
            )
            return

        primus_res = await self._publish_primus(article, image_paths, chat_id, context)
        publish_result["primus"] = primus_res
        payload["publish_result"] = publish_result

        thread = payload.get("thread", [])
        if primus_res["status"] == "success" and primus_res.get("url"):
            thread = self._replace_thread_cta(thread, primus_res["url"])
            payload["thread"] = thread
            await set_state(chat_id, State.PUBLISHING, payload)
            self._save_thread_artifact(article_meta["article_id"], thread)
            await context.bot.send_message(chat_id, "🔗 Đã update CTA thread với URL Primus.")
        else:
            await context.bot.send_message(chat_id, "⚠️ Primus fail. Em sẽ không cập nhật CTA thread ở lần publish này.")

        if self._x_publish_enabled():
            x1_enabled = settings.mock_mode or has_real_credentials("x1")
            x2_enabled = settings.mock_mode or has_real_credentials("x2")
            labels = [label for label, enabled in [("X1", x1_enabled), ("X2", x2_enabled)] if enabled]

            if labels:
                await context.bot.send_message(
                    chat_id,
                    f"🐦 Đang post thread lên *{' và '.join(labels)}*...",
                    parse_mode=ParseMode.MARKDOWN,
                )

            if settings.mock_mode:
                publish_result["x1"] = self._finalize_attempt_result(
                    mock_publish_to_x_account("x1", thread, image_paths.get("thumbnail_path"))
                )
                publish_result["x2"] = self._finalize_attempt_result(
                    mock_publish_to_x_account("x2", thread, image_paths.get("thumbnail_path"))
                )
            else:
                if x1_enabled and x2_enabled:
                    x_results = await publish_to_both_x_accounts(thread, image_paths.get("thumbnail_path"))
                    publish_result["x1"] = self._finalize_attempt_result(x_results["x1"])
                    publish_result["x2"] = self._finalize_attempt_result(x_results["x2"])
                elif x1_enabled:
                    publish_result["x1"] = self._finalize_attempt_result(
                        await publish_to_x_account("x1", thread, image_paths.get("thumbnail_path"))
                    )
                    publish_result["x2"] = self._make_skipped_result("Chưa cấu hình X2 hoặc credentials chưa hợp lệ.")
                elif x2_enabled:
                    publish_result["x1"] = self._make_skipped_result("Chưa cấu hình X1 hoặc credentials chưa hợp lệ.")
                    publish_result["x2"] = self._finalize_attempt_result(
                        await publish_to_x_account("x2", thread, image_paths.get("thumbnail_path"))
                    )
                else:
                    publish_result["x1"] = self._make_skipped_result("Chưa cấu hình X1 hoặc credentials chưa hợp lệ.")
                    publish_result["x2"] = self._make_skipped_result("Chưa cấu hình X2 hoặc credentials chưa hợp lệ.")
                    await context.bot.send_message(chat_id, "⏭ Không có account X nào đang được cấu hình hợp lệ, bỏ qua bước post X.")
        else:
            publish_result["x1"] = self._make_skipped_result("Tạm tắt publish X trong cấu hình.")
            publish_result["x2"] = self._make_skipped_result("Tạm tắt publish X trong cấu hình.")
            await context.bot.send_message(chat_id, "⏭ Đang bỏ qua X1 và X2 theo cấu hình hiện tại.")

        payload["publish_result"] = publish_result
        await set_state(chat_id, State.PUBLISHING, payload)

        if self._x_publish_enabled():
            for label, result in [("X1", publish_result["x1"]), ("X2", publish_result["x2"])]:
                if result["status"] == "success":
                    await context.bot.send_message(chat_id, f"✅ {label}: {result['url']}")
                elif result["status"] == "partial":
                    escaped_error = escape_markdown(str(result.get("last_error", "Unknown error")), version=1)
                    await context.bot.send_message(
                        chat_id,
                        (
                            f"⚠️ {label} PARTIAL: post được {len(result.get('tweet_ids', []))}/{len(thread)} tweets.\n"
                            f"URL: {escape_markdown(str(result.get('url')), version=1)}\n"
                            f"Last error: ```\n{escaped_error}\n```"
                        ),
                        parse_mode=ParseMode.MARKDOWN,
                    )
                else:
                    escaped_error = escape_markdown(str(result.get("last_error", "Unknown error")), version=1)
                    await context.bot.send_message(
                        chat_id,
                        f"❌ {label} FAIL:\n```\n{escaped_error}\n```",
                        parse_mode=ParseMode.MARKDOWN,
                    )

        if self._azdag_publish_enabled():
            await context.bot.send_message(
                chat_id,
                "🤖 Đang đăng lên *AZDAG* \\(qua Playwright\\)...\n_Có thể mất 1-3 phút._",
                parse_mode=ParseMode.MARKDOWN,
            )
            azdag_res = await self._publish_azdag(article, image_paths, chat_id, context)
            publish_result["azdag"] = azdag_res
        else:
            publish_result["azdag"] = self._make_skipped_result("Tạm tắt publish AZDAG trong cấu hình.")
            await context.bot.send_message(chat_id, "⏭ Đang bỏ qua AZDAG theo cấu hình hiện tại.")

        payload["publish_result"] = publish_result
        await set_state(chat_id, State.PUBLISHING, payload)

        azdag_res = publish_result["azdag"]
        if self._azdag_publish_enabled():
            if azdag_res["status"] == "success":
                await context.bot.send_message(chat_id, f"✅ AZDAG: {azdag_res['url']}")
            else:
                escaped_error = escape_markdown(str(azdag_res.get("last_error", "Unknown error")), version=1)
                await context.bot.send_message(
                    chat_id,
                    f"❌ AZDAG FAIL:\n```\n{escaped_error}\n```\n_Anh có thể `/retry` để thử lại._",
                    parse_mode=ParseMode.MARKDOWN,
                )

        success_count = sum(1 for result in publish_result.values() if result.get("status") == "success")
        skipped_count = sum(1 for result in publish_result.values() if result.get("status") == "skipped")
        await context.bot.send_message(
            chat_id,
            (
                f"🏁 *Đã hoàn tất publish.* {success_count}/4 platforms thành công"
                f"{f', {skipped_count} skipped' if skipped_count else ''}.\n\n"
                "`/status` — xem chi tiết\n"
                "`/retry` — retry các platform fail\n"
                "`/delete` — xóa bài đã đăng nếu cần"
            ),
            parse_mode=ParseMode.MARKDOWN,
        )
        await self._send_delete_ui(chat_id, context, publish_result)

    async def prompt_delete_published_content(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        chat_id = self._get_chat_id(update)
        state = await get_state(chat_id)
        if state is None or state.state != State.PUBLISHING or not state.payload:
            await context.bot.send_message(chat_id, "❌ Không có bài publish nào đang lưu để xóa.")
            return

        payload = json.loads(state.payload)
        publish_result = payload.get("publish_result")
        if not isinstance(publish_result, dict) or not self._has_live_published_content(publish_result):
            await context.bot.send_message(chat_id, "ℹ️ Hiện không có nội dung nào còn đang live để xóa.")
            return

        targets = self._delete_targets_text(publish_result)
        keyboard = InlineKeyboardMarkup(
            [
                [InlineKeyboardButton("⚠️ Xác nhận xoá", callback_data="publish:delete_confirm")],
                [InlineKeyboardButton("Giữ lại bài", callback_data="publish:delete_cancel")],
            ]
        )
        await context.bot.send_message(
            chat_id,
            (
                "🗑 *Xác nhận xoá bài đã đăng*\n\n"
                f"Bot sẽ thử xoá nội dung đang live trên: *{escape_markdown(targets, version=1)}*.\n"
                "Thao tác này không thể hoàn tác bằng bot."
            ),
            parse_mode=ParseMode.MARKDOWN,
            reply_markup=keyboard,
        )

    async def delete_published_content(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        chat_id = self._get_chat_id(update)
        state = await get_state(chat_id)
        if state is None or state.state != State.PUBLISHING or not state.payload:
            await context.bot.send_message(chat_id, "❌ Không có bài publish nào đang lưu để xóa.")
            return

        payload = json.loads(state.payload)
        publish_result = payload.get("publish_result")
        if not isinstance(publish_result, dict) or not self._has_live_published_content(publish_result):
            await context.bot.send_message(chat_id, "ℹ️ Hiện không có nội dung nào còn đang live để xóa.")
            return

        await context.bot.send_message(chat_id, "🗑 Đang bắt đầu xóa nội dung đã đăng...")

        delete_summaries: list[str] = []

        for platform in ("x1", "x2", "primus", "azdag"):
            platform_info = publish_result.get(platform)
            if not isinstance(platform_info, dict) or not self._is_live_result(platform_info):
                continue

            if platform == "primus":
                if settings.mock_mode:
                    delete_result = mock_delete_from_primus(platform_info.get("post_id"), platform_info.get("url"))
                else:
                    delete_result = await delete_from_primus(platform_info.get("post_id"), platform_info.get("url"))
            elif platform in {"x1", "x2"}:
                if settings.mock_mode:
                    delete_result = mock_delete_from_x_account(platform, platform_info.get("tweet_ids", []), platform_info.get("url"))
                elif has_real_credentials(platform):
                    delete_result = await delete_from_x_account(platform, platform_info.get("tweet_ids", []), platform_info.get("url"))
                else:
                    delete_result = {
                        "status": "failed",
                        "url": platform_info.get("url"),
                        "post_id": platform_info.get("post_id"),
                        "tweet_ids": platform_info.get("tweet_ids", []),
                        "last_error": f"{platform.upper()} chưa có credentials hợp lệ để xóa.",
                        "deleted_count": 0,
                        "attempted_at": self._utc_now(),
                    }
            else:
                delete_result = {
                    "status": "failed",
                    "url": platform_info.get("url"),
                    "post_id": platform_info.get("post_id"),
                    "tweet_ids": [],
                    "last_error": "Chưa hỗ trợ xóa AZDAG tự động.",
                    "attempted_at": self._utc_now(),
                }

            publish_result[platform] = self._apply_delete_result(platform_info, delete_result)
            payload["publish_result"] = publish_result
            await set_state(chat_id, State.PUBLISHING, payload)

            label = platform.upper() if platform.startswith("x") else platform.capitalize()
            delete_status = delete_result.get("status")
            if delete_status == "success":
                delete_summaries.append(f"✅ {label}: đã xóa thành công")
            elif delete_status == "partial":
                delete_summaries.append(
                    f"⚠️ {label}: xóa chưa hết ({delete_result.get('deleted_count', 0)} mục), lỗi cuối: {delete_result.get('last_error')}"
                )
            else:
                delete_summaries.append(f"❌ {label}: {delete_result.get('last_error')}")

        live_remaining = self._has_live_published_content(publish_result)
        await context.bot.send_message(chat_id, "\n".join(delete_summaries) if delete_summaries else "ℹ️ Không có gì để xóa.")

        if live_remaining:
            await context.bot.send_message(
                chat_id,
                "⚠️ Vẫn còn một số nội dung chưa xóa được. Anh có thể bấm lại nút xóa hoặc xử lý thủ công.",
            )
            await self._send_delete_ui(chat_id, context, publish_result)
            return

        await clear_state(chat_id)
        await context.bot.send_message(chat_id, "✅ Đã xóa xong toàn bộ nội dung đã đăng và clear trạng thái hiện tại.")

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

        article_meta = payload["article_meta"]
        image_paths = payload.get("image_paths", {})
        thread = payload.get("thread", [])
        article = load_article_from_meta(article_meta)

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
            elif platform in ("x1", "x2"):
                if not self._x_publish_enabled():
                    await context.bot.send_message(chat_id, f"⏭ {platform.upper()} đang bị tắt trong cấu hình, bỏ qua retry.")
                    publish_result[platform] = self._make_skipped_result("Tạm tắt publish X trong cấu hình.")
                    payload["publish_result"] = publish_result
                    await set_state(chat_id, State.PUBLISHING, payload)
                    continue
                if not settings.mock_mode and not has_real_credentials(platform):
                    await context.bot.send_message(
                        chat_id,
                        f"⏭ {platform.upper()} chưa có credentials hợp lệ, bỏ qua retry.",
                    )
                    publish_result[platform] = self._make_skipped_result(
                        f"{platform.upper()} chưa có credentials hợp lệ."
                    )
                    payload["publish_result"] = publish_result
                    await set_state(chat_id, State.PUBLISHING, payload)
                    continue
                await context.bot.send_message(chat_id, f"🐦 Đang retry {platform.upper()}...")
                if settings.mock_mode:
                    new_result = mock_publish_to_x_account(platform, thread, image_paths.get("thumbnail_path"))
                else:
                    new_result = await publish_to_x_account(platform, thread, image_paths.get("thumbnail_path"))
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

    async def _send_preview_ui(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
        article: dict,
        images: dict,
        thread_result: dict,
    ) -> None:
        chat_id = self._get_chat_id(update)
        image_count = sum(1 for key in ["thumbnail_path", "inline_path"] if images.get(key))
        text = (
            f"📋 *PREVIEW BÀI VIẾT*\n\n"
            f"📝 Title: *{escape_markdown(article['title'], version=1)}*\n"
            f"📊 Article: {article['word_count']} từ\n"
            f"🖼 Images: {image_count}/2\n"
            f"🐦 Thread: {thread_result['tweet_count']} tweets\n\n"
            f"Bấm Approve để đăng lên {escape_markdown(self._publish_targets_text(), version=1)}."
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
            "delete_status": None,
            "delete_last_error": None,
            "delete_attempt_count": 0,
            "deleted_at": None,
        }
        return {
            "primus": dict(template),
            "azdag": dict(template),
            "x1": dict(template),
            "x2": dict(template),
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
            "delete_status": None,
            "delete_last_error": None,
            "delete_attempt_count": 0,
            "deleted_at": None,
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
            "delete_status": None,
            "delete_last_error": None,
            "delete_attempt_count": 0,
            "deleted_at": None,
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
        normalized.setdefault("delete_status", None)
        normalized.setdefault("delete_last_error", None)
        normalized.setdefault("delete_attempt_count", 0)
        normalized.setdefault("deleted_at", None)
        return normalized

    def _apply_delete_result(self, existing_result: dict, delete_result: dict) -> dict:
        merged = dict(existing_result)
        merged["delete_status"] = delete_result.get("status", "failed")
        merged["delete_last_error"] = delete_result.get("last_error")
        merged["delete_attempt_count"] = int(existing_result.get("delete_attempt_count", 0) or 0) + 1
        if delete_result.get("status") == "success":
            merged["deleted_at"] = delete_result.get("attempted_at") or self._utc_now()
        return merged

    @staticmethod
    def _is_live_result(result: dict) -> bool:
        return result.get("status") in {"success", "partial"} and result.get("delete_status") != "success"

    def _has_live_published_content(self, publish_result: dict) -> bool:
        return any(isinstance(info, dict) and self._is_live_result(info) for info in publish_result.values())

    def _delete_targets_text(self, publish_result: dict) -> str:
        labels: list[str] = []
        for platform in ("primus", "x1", "x2", "azdag"):
            info = publish_result.get(platform)
            if isinstance(info, dict) and self._is_live_result(info):
                labels.append(platform.upper() if platform.startswith("x") else platform.capitalize())
        return ", ".join(labels) if labels else "không có platform nào"

    async def _send_delete_ui(self, chat_id: int, context: ContextTypes.DEFAULT_TYPE, publish_result: dict) -> None:
        if not self._has_live_published_content(publish_result):
            return

        keyboard = InlineKeyboardMarkup(
            [[InlineKeyboardButton("🗑 Xóa bài đã đăng", callback_data="publish:delete")]]
        )
        await context.bot.send_message(
            chat_id,
            "Nếu anh thấy bài chưa ổn, bấm nút dưới đây để yêu cầu bot gỡ bài đã đăng trên Primus và X.",
            reply_markup=keyboard,
        )

    @staticmethod
    def _replace_thread_cta(thread: list[str], real_url: str) -> list[str]:
        if not thread:
            return thread
        updated = list(thread)
        updated[-1] = updated[-1].replace("<PLACEHOLDER_URL>", real_url)
        return updated

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
