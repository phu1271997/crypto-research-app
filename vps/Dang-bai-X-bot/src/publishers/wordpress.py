from __future__ import annotations

import base64
import re
from datetime import UTC, datetime
from pathlib import Path

import httpx
import markdown as md_lib
from loguru import logger
from tenacity import AsyncRetrying, retry_if_exception_type, stop_after_attempt, wait_exponential

from src.settings import settings


def _is_list_line(line: str) -> bool:
    return bool(re.match(r"^\s*(?:[-*]\s+|\d+\.\s+)", line))


def _normalize_markdown_structure(markdown_content: str) -> str:
    source_lines = markdown_content.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    flattened: list[str] = []
    index = 0

    while index < len(source_lines):
        line = source_lines[index].rstrip()
        stripped = line.strip()

        heading_match = re.match(r"^\s*###\s+(.+)$", line)
        if heading_match:
            flattened.extend(["", f"**{heading_match.group(1).strip()}**", ""])
            index += 1
            continue

        ordered_match = re.match(r"^\s*\d+\.\s+(.*)$", line)
        if ordered_match:
            parts = [ordered_match.group(1).strip()]
            look_ahead = index + 1
            while look_ahead < len(source_lines):
                candidate = source_lines[look_ahead].rstrip()
                candidate_stripped = candidate.strip()
                if not candidate_stripped:
                    look_ahead += 1
                    if look_ahead < len(source_lines):
                        next_non_empty = source_lines[look_ahead].strip()
                        if re.match(r"^(?:\d+\.\s+|[-*]\s+|##\s+|###\s+)", next_non_empty):
                            break
                    continue
                if re.match(r"^(?:\d+\.\s+|[-*]\s+|##\s+|###\s+)", candidate_stripped):
                    break
                if candidate.startswith(" ") or candidate.startswith("\t"):
                    parts.append(candidate_stripped)
                    look_ahead += 1
                    continue
                break
            flattened.append(f"- {' '.join(parts)}")
            index = look_ahead
            continue

        flattened.append(line)
        index += 1

    normalized: list[str] = []
    for line in flattened:
        is_list = _is_list_line(line)
        previous = normalized[-1] if normalized else ""
        previous_is_list = _is_list_line(previous) if normalized else False

        if is_list and normalized and previous.strip() and not previous_is_list:
            normalized.append("")

        if not is_list and previous_is_list and line.strip():
            normalized.append("")

        normalized.append(line.rstrip())

    return re.sub(r"\n{3,}", "\n\n", "\n".join(normalized)).strip()


class WordPressPublisher:
    """
    Publisher cho Primus Spark WordPress.
    """

    def __init__(self):
        if not (settings.primus_wp_url and settings.primus_wp_username and settings.primus_wp_app_password):
            raise ValueError(
                "Thiếu cấu hình Primus WordPress trong .env "
                "(PRIMUS_WP_URL, PRIMUS_WP_USERNAME, PRIMUS_WP_APP_PASSWORD)"
            )

        normalized_url = settings.primus_wp_url.strip().rstrip("/")
        if normalized_url.endswith("/wp-admin"):
            logger.warning("PRIMUS_WP_URL đang chứa /wp-admin, tự động chuẩn hóa về base domain.")
            normalized_url = normalized_url[: -len("/wp-admin")]

        normalized_password = settings.primus_wp_app_password.replace(" ", "").strip()
        if normalized_password != settings.primus_wp_app_password.strip():
            logger.info("Tự động loại bỏ khoảng trắng trong PRIMUS_WP_APP_PASSWORD trước khi auth WordPress.")

        self.base_url = normalized_url + "/wp-json/wp/v2"
        token = base64.b64encode(
            f"{settings.primus_wp_username.strip()}:{normalized_password}".encode("utf-8")
        ).decode("utf-8")
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(120.0, connect=30.0),
            headers={
                "Authorization": f"Basic {token}",
                "User-Agent": "crypto-research-bot/1.0",
            },
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def upload_media(self, file_path: Path, alt_text: str = "") -> dict:
        """
        Upload 1 ảnh lên Media Library.
        """
        file_path = Path(file_path)
        if not file_path.exists():
            raise FileNotFoundError(f"Không tìm thấy file ảnh: {file_path}")

        async for attempt in AsyncRetrying(
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=2, min=2, max=8),
            retry=retry_if_exception_type(httpx.HTTPError),
            reraise=True,
        ):
            with attempt:
                with open(file_path, "rb") as image_file:
                    response = await self._client.post(
                        f"{self.base_url}/media",
                        headers={
                            "Content-Disposition": f'attachment; filename="{file_path.name}"',
                            "Content-Type": "image/png",
                        },
                        content=image_file.read(),
                    )
                response.raise_for_status()
                data = response.json()
                logger.info("✅ Upload media WP thành công: id={}, url={}", data.get("id"), data.get("source_url"))

                if alt_text and data.get("id"):
                    try:
                        await self._client.post(
                            f"{self.base_url}/media/{data['id']}",
                            json={"alt_text": alt_text},
                        )
                    except Exception as exc:  # noqa: BLE001
                        logger.warning("Không set được alt_text cho media {}: {}", data.get("id"), exc)

                return {"id": data["id"], "source_url": data["source_url"]}

        raise RuntimeError("Upload media WP thất bại sau retry.")

    async def publish_post(
        self,
        title: str,
        content_html: str,
        featured_media_id: int | None = None,
        status: str = "publish",
        excerpt: str | None = None,
    ) -> dict:
        """
        Đăng post mới lên WordPress.
        """
        payload: dict[str, object] = {
            "title": title,
            "content": content_html,
            "status": status,
        }
        if featured_media_id:
            payload["featured_media"] = featured_media_id
        if excerpt:
            payload["excerpt"] = excerpt

        async for attempt in AsyncRetrying(
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=2, min=2, max=8),
            retry=retry_if_exception_type(httpx.HTTPError),
            reraise=True,
        ):
            with attempt:
                response = await self._client.post(f"{self.base_url}/posts", json=payload)
                response.raise_for_status()
                data = response.json()
                logger.info("✅ Đăng bài WP thành công: id={}, link={}", data["id"], data["link"])
                return {"id": data["id"], "link": data["link"], "status": data["status"]}

        raise RuntimeError("Đăng bài WP thất bại sau retry.")

    async def update_post(
        self,
        post_id: int | str,
        title: str,
        content_html: str,
        featured_media_id: int | None = None,
        excerpt: str | None = None,
    ) -> dict:
        payload: dict[str, object] = {
            "title": title,
            "content": content_html,
        }
        if featured_media_id:
            payload["featured_media"] = featured_media_id
        if excerpt:
            payload["excerpt"] = excerpt

        async for attempt in AsyncRetrying(
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=2, min=2, max=8),
            retry=retry_if_exception_type(httpx.HTTPError),
            reraise=True,
        ):
            with attempt:
                response = await self._client.post(f"{self.base_url}/posts/{post_id}", json=payload)
                response.raise_for_status()
                data = response.json()
                logger.info("✅ Update bài WP thành công: id={}, link={}", data["id"], data["link"])
                return {"id": data["id"], "link": data["link"], "status": data["status"]}

        raise RuntimeError("Update bài WP thất bại sau retry.")


def _markdown_to_html_with_inline_image(markdown_content: str, inline_image_url: str | None) -> str:
    """
    Convert markdown -> HTML và chèn inline image vào trước section Phân tích.
    """
    lines = _normalize_markdown_structure(markdown_content).splitlines()
    cleaned_lines: list[str] = []
    h1_skipped = False
    for line in lines:
        if not h1_skipped and line.startswith("# "):
            h1_skipped = True
            continue
        cleaned_lines.append(line)
    cleaned_md = "\n".join(cleaned_lines).strip()

    html = md_lib.markdown(cleaned_md, extensions=["extra", "smarty", "sane_lists"])
    if not inline_image_url:
        return html

    image_html = (
        '<figure style="margin: 32px auto; width: 100%; text-align: center;">'
        f'<img src="{inline_image_url}" alt="Inline illustration" '
        'style="display: block; width: 100%; max-width: 1024px; height: auto; margin: 0 auto; border-radius: 8px; object-fit: cover;"/>'
        "</figure>"
    )
    pattern = re.compile(r"(<h2[^>]*>\s*Phân tích\s*</h2>)", re.IGNORECASE)
    if pattern.search(html):
        return pattern.sub(image_html + r"\1", html, count=1)

    midpoint = len(html) // 2
    close_paragraph = html.find("</p>", midpoint)
    if close_paragraph > 0:
        return html[: close_paragraph + 4] + image_html + html[close_paragraph + 4 :]
    return html + image_html


def _make_excerpt(content: str, max_chars: int = 240) -> str:
    match = re.search(r"##\s*Tóm tắt\s*\n+(.+?)(?=\n##|\Z)", content, re.DOTALL)
    if not match:
        return ""
    text = re.sub(r"[*_`#]", "", match.group(1)).strip()
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rstrip() + "..."


async def publish_to_primus(
    article: dict,
    thumbnail_path: str | None,
    inline_path: str | None,
) -> dict:
    """
    Main entry: đăng article lên Primus Spark.
    """
    publisher = WordPressPublisher()
    try:
        thumb_media = None
        if thumbnail_path:
            try:
                thumb_media = await publisher.upload_media(Path(thumbnail_path), alt_text=article["title"])
            except Exception as exc:  # noqa: BLE001
                logger.warning("Upload thumbnail fail (vẫn đăng bài): {}", exc)

        inline_url = None
        if inline_path:
            try:
                inline_media = await publisher.upload_media(
                    Path(inline_path),
                    alt_text=f"{article['title']} — illustration",
                )
                inline_url = inline_media["source_url"]
            except Exception as exc:  # noqa: BLE001
                logger.warning("Upload inline image fail (vẫn đăng bài): {}", exc)

        # Publish the full approved article so the live site matches the word count shown in Telegram.
        content_markdown = article.get("content", "")

        html_content = _markdown_to_html_with_inline_image(content_markdown, inline_url)
        excerpt = _make_excerpt(content_markdown)
        post = await publisher.publish_post(
            title=article["title"],
            content_html=html_content,
            featured_media_id=thumb_media["id"] if thumb_media else None,
            excerpt=excerpt,
            status="publish",
        )
        return {
            "status": "success",
            "url": post["link"],
            "post_id": post["id"],
            "error": None,
            "published_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "attempted_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("❌ Đăng bài Primus thất bại")
        timestamp = datetime.now(UTC).isoformat().replace("+00:00", "Z")
        return {
            "status": "failed",
            "url": None,
            "post_id": None,
            "error": str(exc),
            "published_at": timestamp,
            "attempted_at": timestamp,
        }
    finally:
        await publisher.aclose()


def mock_publish_to_primus(article: dict, thumbnail_path: str | None, inline_path: str | None) -> dict:  # noqa: ARG001
    timestamp = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    return {
        "status": "success",
        "url": "https://primusspark.com/2026/05/MOCK-published-post/",
        "post_id": 99999,
        "error": None,
        "published_at": timestamp,
        "attempted_at": timestamp,
    }
