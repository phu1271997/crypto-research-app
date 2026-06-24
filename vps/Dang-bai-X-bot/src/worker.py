from __future__ import annotations

import asyncio
import json
import os
import sys
import uuid
from datetime import UTC, datetime
from pathlib import Path

from loguru import logger
from sqlalchemy import select
from telegram import Bot

from src.db import SessionLocal, BotCommand, BotStatus, DraftArticle, RecentArticle, init_db
from src.llm_client import OpenRouterClient
from src.settings import settings, configure_logging

# Generation imports
from src.researcher.article_writer import write_article
from src.image_gen.generator import generate_images
from src.twitter_writer.thread_writer import write_thread, write_x_article, mock_thread

# Publishing imports
from src.publishers.wordpress import WordPressPublisher, publish_to_primus, mock_publish_to_primus
from src.publishers.azdag import publish_to_azdag, mock_publish_to_azdag
from src.publishers.twitter import publish_to_x_account, mock_publish_to_x_account

# Global state
worker_state = "idle"

async def send_telegram_notification(message: str):
    if settings.telegram_bot_token and settings.telegram_chat_id:
        try:
            bot = Bot(token=settings.telegram_bot_token)
            await bot.send_message(chat_id=int(settings.telegram_chat_id), text=message)
        except Exception as e:
            logger.error(f"Failed to send Telegram notification: {e}")

async def handle_generate(command: BotCommand, llm_client: OpenRouterClient):
    payload = command.payload
    topic_text = payload.get("topic", "").strip()
    if not topic_text:
        raise ValueError("Lệnh GENERATE thiếu chủ đề 'topic'.")

    logger.info(f"Start GENERATE for topic: {topic_text}")
    await send_telegram_notification(f"⏳ Bot bắt đầu nghiên cứu và viết bài cho chủ đề:\n*{topic_text}*")

    topic_dict = {
        "id": 0,
        "title": topic_text,
        "angle": "User-provided custom topic",
        "key_points": [],
    }

    # Step 1: Write article
    article = await write_article(llm_client, topic_dict)
    
    # Step 2: Generate images
    images = await generate_images(llm_client, article)

    # Step 3: Write Twitter thread or article
    meta = payload.get("meta", {})
    x_format = meta.get("x_format", "thread")
    if settings.mock_mode:
        thread_result = mock_thread(article, x_format=x_format)
    else:
        if x_format == "article":
            thread_result = await write_x_article(llm_client, article)
        else:
            thread_result = await write_thread(llm_client, article)

    # Step 4: Upload images to WordPress media library to get public source URLs for preview
    thumbnail_url = ""
    inline_url = ""
    
    if not settings.mock_mode:
        wp = WordPressPublisher()
        try:
            if images.get("thumbnail_path"):
                res = await wp.upload_media(Path(images["thumbnail_path"]), alt_text=article["title"])
                thumbnail_url = res["source_url"]
            if images.get("inline_path"):
                res = await wp.upload_media(Path(images["inline_path"]), alt_text=f"{article['title']} - illustration")
                inline_url = res["source_url"]
        except Exception as e:
            logger.warning(f"Failed to upload media to WordPress for preview: {e}")
        finally:
            await wp.aclose()
    else:
        thumbnail_url = "https://primusspark.com/wp-content/uploads/mock-thumb.png"
        inline_url = "https://primusspark.com/wp-content/uploads/mock-inline.png"

    # Step 5: Save draft to PostgreSQL
    async with SessionLocal() as session:
        draft = DraftArticle(
            id=uuid.uuid4(),
            topic=topic_text,
            status="draft",
            version=1,
            payload={
                "title": article["title"],
                "article_md": article["content"],
                "tweets": thread_result.get("thread", []),
                "images": [
                    {"role": "thumbnail", "url": thumbnail_url},
                    {"role": "inline", "url": inline_url}
                ],
                "meta": {
                    "article_meta": article,
                    "image_paths": images,
                    "target_platform": payload.get("meta", {}).get("target_platform", "primus"),
                    "publish_mode": payload.get("meta", {}).get("publish_mode", "both"),
                    "x_format": payload.get("meta", {}).get("x_format", "thread"),
                }
            }
        )
        session.add(draft)
        await session.commit()
        draft_id = draft.id

    logger.info(f"Draft created successfully: {draft_id}")
    await send_telegram_notification(f"✅ Đã viết nháp thành công cho chủ đề: *{topic_text}*.\nXem và duyệt tại dashboard: https://crypto-research-app.vercel.app/admin")

async def handle_publish(command: BotCommand, llm_client: OpenRouterClient):
    payload = command.payload
    draft_id_str = payload.get("draft_id")
    web_version = payload.get("version")
    
    if not draft_id_str:
        raise ValueError("Lệnh PUBLISH thiếu 'draft_id'.")
    
    draft_uuid = uuid.UUID(draft_id_str)
    
    # 1. Optimistic Locking
    async with SessionLocal() as session:
        stmt = select(DraftArticle).where(
            DraftArticle.id == draft_uuid,
            DraftArticle.version == web_version,
            DraftArticle.status.in_(["draft", "editing", "approved"])
        )
        result = await session.execute(stmt)
        draft = result.scalar_one_or_none()
        if not draft:
            raise ValueError("Draft không khả dụng, sai version hoặc đang được đăng rồi.")
        
        draft.status = "publishing"
        draft.updated_at = datetime.now(UTC)
        await session.commit()
        
        # Read payload details
        topic = draft.topic
        draft_payload = dict(draft.payload)

    logger.info(f"Start PUBLISH for draft: {draft_uuid} (v{web_version})")
    await send_telegram_notification(f"🚀 Bắt đầu phát hành bài viết: *{draft_payload.get('title', topic)}*...")

    meta = draft_payload.get("meta", {})
    target_platform = meta.get("target_platform", "primus")
    publish_mode = meta.get("publish_mode", "both")
    x_format = meta.get("x_format", "thread")

    article_dict = {
        "title": draft_payload["title"],
        "content": draft_payload["article_md"]
    }
    image_paths = meta.get("image_paths", {})
    thumbnail_path = image_paths.get("thumbnail_path")
    inline_path = image_paths.get("inline_path")
    
    web_url = None
    web_key = "primus" if target_platform == "primus" else "azdag"
    x_key = "x1" if target_platform == "primus" else "x2"
    
    publish_result = {}

    # Publish to WordPress Web App
    if publish_mode in ("both", "web_only"):
        if target_platform == "primus":
            if settings.mock_mode:
                web_res = mock_publish_to_primus(article_dict, thumbnail_path, inline_path)
            else:
                web_res = await publish_to_primus(article_dict, thumbnail_path, inline_path)
        else:
            if settings.mock_mode:
                web_res = mock_publish_to_azdag(article_dict, thumbnail_path, inline_path)
            else:
                web_res = await publish_to_azdag(article_dict, thumbnail_path, inline_path)
        
        publish_result[web_key] = web_res
        if web_res.get("status") == "success" and web_res.get("url"):
            web_url = web_res["url"]
    else:
        publish_result[web_key] = {"status": "skipped", "url": None}

    # Replace CTA in tweet thread with WordPress link
    thread = list(draft_payload.get("tweets", []))
    skip_x_publish = False
    if publish_mode in ("both", "x_only"):
        if publish_mode == "x_only":
            # Strip CTA
            from src.pipeline import ResearchPipeline
            thread = ResearchPipeline._strip_thread_cta(thread)
        elif web_url:
            from src.pipeline import ResearchPipeline
            thread = ResearchPipeline._replace_thread_cta(thread, web_url)
        else:
            logger.warning("Web publish failed, skipping X publish to avoid posting raw placeholder URL.")
            x_res = {"status": "failed", "error": "Web publish failed, skipped X to avoid empty CTA.", "url": None}
            publish_result[x_key] = x_res
            skip_x_publish = True
        
        if not skip_x_publish:
            if settings.mock_mode:
                x_res = mock_publish_to_x_account(x_key, thread, thumbnail_path)
            else:
                x_res = await publish_to_x_account(x_key, thread, thumbnail_path)
            publish_result[x_key] = x_res
    else:
        publish_result[x_key] = {"status": "skipped", "url": None}

    # Save to history and update status
    async with SessionLocal() as session:
        # Refetch draft to write results
        result = await session.execute(select(DraftArticle).where(DraftArticle.id == draft_uuid))
        draft = result.scalar_one()
        
        primus_url = publish_result.get("primus", {}).get("url")
        azdag_url = publish_result.get("azdag", {}).get("url")
        x_url = publish_result.get(x_key, {}).get("url")
        
        # Save recent article log
        recent = RecentArticle(
            title=draft_payload["title"],
            slug=meta.get("article_meta", {}).get("slug"),
            primus_url=primus_url,
            azdag_url=azdag_url,
            x1_url=x_url if x_key == "x1" else None,
            x2_url=x_url if x_key == "x2" else None
        )
        session.add(recent)

        # Update draft status
        success = False
        errors = []
        for platform, res in publish_result.items():
            if res.get("status") == "success":
                success = True
            elif res.get("status") == "failed":
                errors.append(f"{platform}: {res.get('error')}")

        if success:
            draft.status = "published"
            draft.error = None
        else:
            draft.status = "failed"
            draft.error = "; ".join(errors)
            
        draft.updated_at = datetime.now(UTC)
        await session.commit()

    logger.info(f"Publish completed: {draft_uuid} | Success: {success}")
    if success:
        links_msg = ""
        if primus_url:
            links_msg += f"\n- Web: {primus_url}"
        if azdag_url:
            links_msg += f"\n- AZDAG: {azdag_url}"
        if x_url:
            links_msg += f"\n- X: {x_url}"
        await send_telegram_notification(f"✅ Phát hành thành công bài viết: *{draft_payload.get('title')}*{links_msg}")
    else:
        await send_telegram_notification(f"❌ Phát hành thất bại bài viết: *{draft_payload.get('title')}*\nLỗi: {'; '.join(errors)}")

async def handle_regenerate_thread(command: BotCommand, llm_client: OpenRouterClient):
    payload = command.payload
    draft_id_str = payload.get("draft_id")
    if not draft_id_str:
        raise ValueError("Lệnh REGENERATE_THREAD thiếu 'draft_id'.")
    
    draft_uuid = uuid.UUID(draft_id_str)
    
    async with SessionLocal() as session:
        result = await session.execute(select(DraftArticle).where(DraftArticle.id == draft_uuid))
        draft = result.scalar_one_or_none()
        if not draft:
            raise ValueError(f"Draft không tồn tại: {draft_uuid}")
        
        draft_payload = dict(draft.payload)
        article_meta = draft_payload["meta"]["article_meta"]
        x_format = draft_payload["meta"].get("x_format", "thread")
    
    logger.info(f"Regenerating thread for draft: {draft_uuid} with format: {x_format}")
    
    # Write thread
    if settings.mock_mode:
        thread_result = mock_thread(article_meta, x_format=x_format)
    else:
        if x_format == "article":
            thread_result = await write_x_article(llm_client, article_meta)
        else:
            thread_result = await write_thread(llm_client, article_meta)
    
    async with SessionLocal() as session:
        result = await session.execute(select(DraftArticle).where(DraftArticle.id == draft_uuid))
        draft = result.scalar_one()
        
        updated_payload = dict(draft.payload)
        updated_payload["tweets"] = thread_result.get("thread", [])
        
        draft.payload = updated_payload
        draft.version += 1
        draft.updated_at = datetime.now(UTC)
        await session.commit()
        
    post_type_label = "X Article" if x_format == "article" else "Twitter thread"
    await send_telegram_notification(f"🔄 Đã viết lại {post_type_label} cho draft: *{draft_payload.get('title')}*.")

async def handle_regenerate_images(command: BotCommand, llm_client: OpenRouterClient):
    payload = command.payload
    draft_id_str = payload.get("draft_id")
    if not draft_id_str:
        raise ValueError("Lệnh REGENERATE_IMAGES thiếu 'draft_id'.")
    
    draft_uuid = uuid.UUID(draft_id_str)
    
    async with SessionLocal() as session:
        result = await session.execute(select(DraftArticle).where(DraftArticle.id == draft_uuid))
        draft = result.scalar_one_or_none()
        if not draft:
            raise ValueError(f"Draft không tồn tại: {draft_uuid}")
        
        draft_payload = dict(draft.payload)
        article_meta = draft_payload["meta"]["article_meta"]
        
    logger.info(f"Regenerating images for draft: {draft_uuid}")
    
    # Generate images
    images = await generate_images(llm_client, article_meta)

    # Upload to WP
    thumbnail_url = ""
    inline_url = ""
    if not settings.mock_mode:
        wp = WordPressPublisher()
        try:
            if images.get("thumbnail_path"):
                res = await wp.upload_media(Path(images["thumbnail_path"]), alt_text=article_meta["title"])
                thumbnail_url = res["source_url"]
            if images.get("inline_path"):
                res = await wp.upload_media(Path(images["inline_path"]), alt_text=f"{article_meta['title']} - illustration")
                inline_url = res["source_url"]
        finally:
            await wp.aclose()
    else:
        thumbnail_url = "https://primusspark.com/wp-content/uploads/mock-thumb.png"
        inline_url = "https://primusspark.com/wp-content/uploads/mock-inline.png"

    async with SessionLocal() as session:
        result = await session.execute(select(DraftArticle).where(DraftArticle.id == draft_uuid))
        draft = result.scalar_one()
        
        updated_payload = dict(draft.payload)
        updated_payload["images"] = [
            {"role": "thumbnail", "url": thumbnail_url},
            {"role": "inline", "url": inline_url}
        ]
        updated_payload["meta"]["image_paths"] = images
        
        draft.payload = updated_payload
        draft.version += 1
        draft.updated_at = datetime.now(UTC)
        await session.commit()
        
    await send_telegram_notification(f"🖼 Đã tạo lại hình ảnh cho draft: *{draft_payload.get('title')}*.")

async def handle_regenerate_all(command: BotCommand, llm_client: OpenRouterClient):
    payload = command.payload
    draft_id_str = payload.get("draft_id")
    if not draft_id_str:
        raise ValueError("Lệnh REGENERATE_ALL thiếu 'draft_id'.")
    
    draft_uuid = uuid.UUID(draft_id_str)
    
    async with SessionLocal() as session:
        result = await session.execute(select(DraftArticle).where(DraftArticle.id == draft_uuid))
        draft = result.scalar_one_or_none()
        if not draft:
            raise ValueError(f"Draft không tồn tại: {draft_uuid}")
        
        topic_text = draft.topic
        draft_payload = dict(draft.payload)
        x_format = draft_payload.get("meta", {}).get("x_format", "thread")
        
    logger.info(f"Regenerating all content for draft: {draft_uuid} with format: {x_format}")
    
    topic_dict = {
        "id": 0,
        "title": topic_text,
        "angle": "User-provided custom topic",
        "key_points": [],
    }

    # Step 1: Write article
    article = await write_article(llm_client, topic_dict)
    
    # Step 2: Generate images
    images = await generate_images(llm_client, article)

    # Step 3: Write Twitter thread or article
    if settings.mock_mode:
        thread_result = mock_thread(article, x_format=x_format)
    else:
        if x_format == "article":
            thread_result = await write_x_article(llm_client, article)
        else:
            thread_result = await write_thread(llm_client, article)

    # Step 4: Upload images to WordPress
    thumbnail_url = ""
    inline_url = ""
    if not settings.mock_mode:
        wp = WordPressPublisher()
        try:
            if images.get("thumbnail_path"):
                res = await wp.upload_media(Path(images["thumbnail_path"]), alt_text=article["title"])
                thumbnail_url = res["source_url"]
            if images.get("inline_path"):
                res = await wp.upload_media(Path(images["inline_path"]), alt_text=f"{article['title']} - illustration")
                inline_url = res["source_url"]
        finally:
            await wp.aclose()
    else:
        thumbnail_url = "https://primusspark.com/wp-content/uploads/mock-thumb.png"
        inline_url = "https://primusspark.com/wp-content/uploads/mock-inline.png"

    async with SessionLocal() as session:
        result = await session.execute(select(DraftArticle).where(DraftArticle.id == draft_uuid))
        draft = result.scalar_one()
        
        draft.payload = {
            "title": article["title"],
            "article_md": article["content"],
            "tweets": thread_result.get("thread", []),
            "images": [
                {"role": "thumbnail", "url": thumbnail_url},
                {"role": "inline", "url": inline_url}
            ],
            "meta": {
                **draft_payload.get("meta", {}),
                "article_meta": article,
                "image_paths": images
            }
        }
        draft.version += 1
        draft.updated_at = datetime.now(UTC)
        await session.commit()
        
    await send_telegram_notification(f"🔄 Đã tạo mới hoàn toàn nội dung cho draft: *{draft_payload.get('title')}*.")

async def handle_cancel(command: BotCommand):
    payload = command.payload
    target_cmd_id = payload.get("command_id")
    if not target_cmd_id:
        raise ValueError("Lệnh CANCEL thiếu 'command_id'.")
    
    async with SessionLocal() as session:
        result = await session.execute(select(BotCommand).where(BotCommand.id == target_cmd_id))
        target_cmd = result.scalar_one_or_none()
        if target_cmd:
            if target_cmd.status in ("pending", "processing"):
                target_cmd.status = "failed"
                target_cmd.error = "Cancelled by admin request."
                target_cmd.updated_at = datetime.now(UTC)
                await session.commit()
                logger.info(f"Cancelled command #{target_cmd_id}")
                await send_telegram_notification(f"⏹ Đã hủy lệnh #{target_cmd_id}.")

async def handle_trending(command: BotCommand, llm_client: OpenRouterClient):
    logger.info("Manual TRENDING command received, running trending job...")
    await send_telegram_notification("⏳ Bắt đầu quét tin tức hot (trending topics) từ RSS/CryptoPanic/CoinGecko...")
    try:
        from src.scheduler import trending_job
        await trending_job(llm_client)
    except Exception as e:
        logger.error(f"Failed to execute trending job: {e}")
        raise


async def handle_update_config(command: BotCommand):
    """Handle UPDATE_CONFIG: update runtime model settings from Web Dashboard."""
    payload = command.payload
    new_model_article = payload.get("model_article")
    new_model_image = payload.get("model_image")

    if new_model_article:
        settings.model_article = new_model_article
        logger.info(f"Updated model_article to: {new_model_article}")

    if new_model_image:
        settings.model_image = new_model_image
        logger.info(f"Updated model_image to: {new_model_image}")

    await send_telegram_notification(
        f"⚙️ Đã cập nhật cấu hình model:\n"
        f"- Viết bài: {new_model_article or '(không đổi)'}\n"
        f"- Tạo ảnh: {new_model_image or '(không đổi)'}"
    )

async def process_command(command: BotCommand, llm_client: OpenRouterClient):
    global worker_state
    worker_state = "working"
    try:
        if command.type == "GENERATE":
            await handle_generate(command, llm_client)
        elif command.type == "PUBLISH":
            await handle_publish(command, llm_client)
        elif command.type == "REGENERATE_THREAD":
            await handle_regenerate_thread(command, llm_client)
        elif command.type == "REGENERATE_IMAGES":
            await handle_regenerate_images(command, llm_client)
        elif command.type == "REGENERATE_ALL":
            await handle_regenerate_all(command, llm_client)
        elif command.type == "CANCEL":
            await handle_cancel(command)
        elif command.type == "TRENDING":
            await handle_trending(command, llm_client)
        elif command.type == "UPDATE_CONFIG":
            await handle_update_config(command)
        else:
            raise ValueError(f"Không hỗ trợ loại lệnh: {command.type}")

        # Mark done
        async with SessionLocal() as session:
            result = await session.execute(select(BotCommand).where(BotCommand.id == command.id))
            cmd = result.scalar_one()
            cmd.status = "done"
            cmd.updated_at = datetime.now(UTC)
            await session.commit()

    except Exception as exc:
        logger.exception(f"Lỗi khi xử lý lệnh #{command.id}")
        error_msg = str(exc)
        async with SessionLocal() as session:
            result = await session.execute(select(BotCommand).where(BotCommand.id == command.id))
            cmd = result.scalar_one()
            cmd.status = "failed"
            cmd.error = error_msg
            cmd.updated_at = datetime.now(UTC)
            await session.commit()
        await send_telegram_notification(f"❌ Lỗi xử lý lệnh {command.type} #{command.id}:\n`{error_msg[:300]}`")
    finally:
        worker_state = "idle"

async def worker_loop(llm_client: OpenRouterClient):
    logger.info("Bot Worker loop started polling database...")
    # Clean up any commands left in 'processing' status from a previous run
    try:
        async with SessionLocal() as session:
            stmt = select(BotCommand).where(BotCommand.status == "processing")
            res = await session.execute(stmt)
            stuck_commands = res.scalars().all()
            for cmd in stuck_commands:
                cmd.status = "failed"
                cmd.error = "Bị gián đoạn do tiến trình bot khởi động lại (Interrupted by process restart)."
                cmd.updated_at = datetime.now(UTC)
            if stuck_commands:
                await session.commit()
                logger.info(f"Đã dọn dẹp {len(stuck_commands)} lệnh bị kẹt ở trạng thái processing.")
    except Exception as e:
        logger.error(f"Lỗi khi dọn dẹp lệnh bị kẹt lúc khởi động: {e}")

    while True:
        try:
            # Poll oldest pending command
            command = None
            async with SessionLocal() as session:
                stmt = select(BotCommand).where(BotCommand.status == "pending", BotCommand.type.notin_(["RESEARCH", "SOCIAL_SCAN"])).order_by(BotCommand.id.asc()).limit(1)
                result = await session.execute(stmt)
                command = result.scalar_one_or_none()
                if command:
                    command.status = "processing"
                    command.updated_at = datetime.now(UTC)
                    await session.commit()
                    # Refetch to detach or read values safely
                    cmd_id = command.id
                    cmd_type = command.type
                    cmd_payload = dict(command.payload)

            if command:
                logger.info(f"Processing command #{cmd_id} ({cmd_type})")
                # Reload model objects inside process
                async with SessionLocal() as session:
                    res = await session.execute(select(BotCommand).where(BotCommand.id == cmd_id))
                    active_command = res.scalar_one()
                    await process_command(active_command, llm_client)

        except Exception as e:
            logger.error(f"Error in worker loop: {e}")
        await asyncio.sleep(2)

async def heartbeat_loop():
    logger.info("Bot Heartbeat loop started...")
    start_time = datetime.now(UTC)
    while True:
        try:
            uptime = int((datetime.now(UTC) - start_time).total_seconds())
            logger.info("Heartbeat loop: starting DB session")
            async with SessionLocal() as session:
                stmt = select(BotStatus).where(BotStatus.id == 1)
                res = await session.execute(stmt)
                status = res.scalar_one_or_none()
                if not status:
                    status = BotStatus(id=1)
                    session.add(status)
                status.last_seen = datetime.now(UTC)
                status.uptime = uptime
                status.status = worker_state
                cfg = dict(status.config or {})
                cfg.update({
                    "model_article": settings.model_article,
                    "model_image": settings.model_image,
                    "mock_mode": settings.mock_mode
                })
                status.config = cfg
                logger.info("Heartbeat loop: committing changes")
                await session.commit()
            logger.info(f"Heartbeat updated successfully. Uptime: {uptime}s")
        except Exception as e:
            logger.error(f"Error in heartbeat loop: {e}")
        await asyncio.sleep(10)

async def main():
    configure_logging()
    
    try:
        settings.require(["openrouter_api_key"])
    except ValueError as exc:
        logger.error(f"Lỗi cấu hình: {exc}")
        sys.exit(1)

    logger.info("🚀 Khởi động VPS Worker process...")
    await init_db()

    llm_client = OpenRouterClient(api_key=settings.openrouter_api_key)

    # Start loops concurrently
    try:
        await asyncio.gather(
            worker_loop(llm_client),
            heartbeat_loop()
        )
    except (KeyboardInterrupt, asyncio.CancelledError):
        logger.info("⏹️ Đang shutdown worker...")
    finally:
        await llm_client.aclose()

if __name__ == "__main__":
    asyncio.run(main())
