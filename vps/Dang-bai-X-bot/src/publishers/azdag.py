from __future__ import annotations

import base64
from datetime import datetime, timezone
import json
from pathlib import Path
import markdown as md_lib
from loguru import logger
import httpx

from src.settings import ROOT_DIR, settings


class AZDAGPublisher:
    def __init__(self, telegram_notifier=None):
        if not settings.azdag_api_key:
            raise ValueError("Thiếu AZDAG_API_KEY trong .env")
        
        self.notify = telegram_notifier
        self.api_key = settings.azdag_api_key
        self.base_url = "https://app.cntresearch.com/api/azdag"

    async def _notify(self, message: str) -> None:
        if self.notify:
            try:
                await self.notify(message)
            except Exception as exc:
                logger.warning("Notify Telegram fail: {}", exc)
        logger.info(message)

    @staticmethod
    def _markdown_to_html(markdown_content: str, inline_image_url: str | None) -> str:
        lines = markdown_content.splitlines()
        cleaned_lines: list[str] = []
        h1_skipped = False
        for line in lines:
            if not h1_skipped and line.startswith("# "):
                h1_skipped = True
                continue
            cleaned_lines.append(line)

        html = md_lib.markdown("\n".join(cleaned_lines).strip(), extensions=["extra", "smarty", "sane_lists"])
        if not inline_image_url:
            return html

        image_html = (
            f'<figure style="margin: 24px 0;"><img src="{inline_image_url}" '
            'alt="Inline illustration" style="width: 100%; height: auto; border-radius: 8px;"/></figure>'
        )

        import re
        pattern = re.compile(r"(<h2[^>]*>\\s*Phân tích\\s*</h2>)", re.IGNORECASE)
        # Note: double escape backslashes in raw strings or compile arguments if needed.
        # But we can also use normal raw string format in python.
        pattern = re.compile(r"(<h2[^>]*>\s*Phân tích\s*</h2>)", re.IGNORECASE)
        if pattern.search(html):
            return pattern.sub(image_html + r"\1", html, count=1)

        midpoint = len(html) // 2
        close_paragraph = html.find("</p>", midpoint)
        if close_paragraph > 0:
            return html[: close_paragraph + 4] + image_html + html[close_paragraph + 4 :]
        return html + image_html

    async def publish(
        self,
        article: dict,
        thumbnail_path: str | None,
        inline_path: str | None,
    ) -> dict:
        now_iso = datetime.now(timezone.utc).isoformat()
        
        # Instead of base64, we upload the inline image to WordPress to get a public URL
        # this avoids the "Field value too long" (400 Bad Request) error on AZDAG API
        inline_url = None
        if inline_path and Path(inline_path).exists():
            try:
                from src.publishers.wordpress import WordPressPublisher
                wp = WordPressPublisher()
                try:
                    logger.info("Uploading inline image to WordPress for AZDAG hosting...")
                    res = await wp.upload_media(Path(inline_path), alt_text=f"{article.get('title', 'No Title')} - inline")
                    inline_url = res["source_url"]
                    logger.info("✅ Inline image uploaded successfully to WordPress: {}", inline_url)
                except Exception as e:
                    logger.warning(f"Failed to upload inline image to WordPress: {e}")
                finally:
                    await wp.aclose()
            except Exception as e:
                logger.warning(f"Failed to initialize WordPressPublisher for inline image: {e}")

        # Publish the full approved article so the live site matches the word count shown in Telegram.
        content_markdown = article.get("content", "")

        content_html = self._markdown_to_html(content_markdown, inline_url)
        title = article.get("title", "No Title")
        
        raw_excerpt = article.get("excerpt", "Crypto news updates")
        import html
        import re
        # Strip HTML tags
        clean_excerpt = re.sub(r'<[^>]+>', '', raw_excerpt)
        # Unescape HTML entities like &#8230;
        clean_excerpt = html.unescape(clean_excerpt).strip()

        # Build payload data
        data_payload = {
            "title": json.dumps({"vi": title, "en": title}, ensure_ascii=False),
            "content": json.dumps({"vi": content_html, "en": content_html}, ensure_ascii=False),
            "excerpt": json.dumps({"vi": clean_excerpt, "en": clean_excerpt}, ensure_ascii=False),
            "category": "news",
            "status": "1"
        }

        # Build files dictionary for multipart/form-data
        files = {}
        if thumbnail_path and Path(thumbnail_path).exists():
            try:
                ext = Path(thumbnail_path).suffix.lower().lstrip(".")
                if ext == "jpg": ext = "jpeg"
                mimetype = f"image/{ext}"
                filename = Path(thumbnail_path).name
                with open(thumbnail_path, "rb") as f:
                    file_bytes = f.read()
                files["image"] = (filename, file_bytes, mimetype)
            except Exception as e:
                logger.warning(f"Failed to read thumbnail {thumbnail_path}: {e}")
                raise
        else:
            raise ValueError(f"Thumbnail is required for AZDAG publication, but was not found or doesn't exist: {thumbnail_path}")

        headers = {
            "x-license-key": self.api_key
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.base_url}/blogs/create",
                    data=data_payload,
                    files=files,
                    headers=headers
                )
                response.raise_for_status()
                data = response.json()
                
                if data.get("status") == True:
                    post_id = data.get("idBlog", "unknown")
                    # Dùng slug không bị giới hạn độ dài dựa trên title để khớp với AZDAG platform
                    import unicodedata
                    import re
                    normalized_input = title.replace("đ", "d").replace("Đ", "D")
                    normalized = unicodedata.normalize("NFKD", normalized_input)
                    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
                    slug = re.sub(r"[^a-zA-Z0-9\s-]", "", ascii_text).strip().lower()
                    slug = re.sub(r"[\s_-]+", "-", slug).strip("-")
                    if not slug:
                        slug = post_id
                    post_url = f"https://azdag.com/blog/view?id={slug}"
                    logger.info("✅ AZDAG publish thành công: {}", post_url)
                    return {
                        "status": "success",
                        "url": post_url,
                        "post_id": post_id,
                        "tweet_ids": [],
                        "last_error": None,
                        "attempt_count": 1,
                        "first_attempted_at": now_iso,
                        "last_attempted_at": now_iso,
                    }
                else:
                    raise Exception(f"API Error: {data.get('msg')}")

        except Exception as exc:
            logger.exception("❌ AZDAG publish thất bại")
            return {
                "status": "failed",
                "url": None,
                "post_id": None,
                "tweet_ids": [],
                "last_error": str(exc),
                "attempt_count": 1,
                "first_attempted_at": now_iso,
                "last_attempted_at": now_iso,
            }

    async def retry(
        self,
        previous_result: dict,
        article: dict,
        thumbnail_path: str | None,
        inline_path: str | None,
    ) -> dict:
        previous_url = previous_result.get("url")
        if previous_result.get("status") == "success" and previous_url:
            logger.info("AZDAG đã success trước đó, skip retry để tránh duplicate.")
            preserved = dict(previous_result)
            preserved["status"] = "success"
            return preserved

        result = await self.publish(article, thumbnail_path, inline_path)
        result["attempt_count"] = int(previous_result.get("attempt_count", 0) or 0) + 1
        result["first_attempted_at"] = previous_result.get("first_attempted_at") or result["first_attempted_at"]
        return result


async def publish_to_azdag(
    article: dict,
    thumbnail_path: str | None,
    inline_path: str | None,
    telegram_notifier=None,
) -> dict:
    publisher = AZDAGPublisher(telegram_notifier=telegram_notifier)
    return await publisher.publish(article, thumbnail_path, inline_path)


async def retry_azdag(
    previous_result: dict,
    article: dict,
    thumbnail_path: str | None,
    inline_path: str | None,
    telegram_notifier=None,
) -> dict:
    publisher = AZDAGPublisher(telegram_notifier=telegram_notifier)
    return await publisher.retry(previous_result, article, thumbnail_path, inline_path)


def mock_publish_to_azdag(article: dict, thumbnail_path: str | None, inline_path: str | None) -> dict:
    now_iso = datetime.now(timezone.utc).isoformat()
    return {
        "status": "success",
        "url": "https://azdag.com/posts/MOCK_AZDAG_PUBLISHED",
        "post_id": None,
        "tweet_ids": [],
        "last_error": None,
        "attempt_count": 1,
        "first_attempted_at": now_iso,
        "last_attempted_at": now_iso,
    }
