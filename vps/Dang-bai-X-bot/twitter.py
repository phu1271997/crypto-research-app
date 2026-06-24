from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path

import tweepy
from loguru import logger

from src.settings import settings


def _is_placeholder(value: str | None) -> bool:
    normalized = (value or "").strip()
    return not normalized or normalized.startswith("YOUR_")


class XAccountPublisher:
    """Publisher cho 1 X account."""

    def __init__(self, account_label: str, credentials: dict):
        self.label = account_label
        missing = [key for key, value in credentials.items() if not value]
        if missing:
            raise ValueError(f"Thiếu credentials cho {account_label}: {missing}")

        self.client_v2 = tweepy.Client(
            bearer_token=credentials["bearer_token"],
            consumer_key=credentials["api_key"],
            consumer_secret=credentials["api_secret"],
            access_token=credentials["access_token"],
            access_token_secret=credentials["access_secret"],
        )

        auth = tweepy.OAuth1UserHandler(
            credentials["api_key"],
            credentials["api_secret"],
            credentials["access_token"],
            credentials["access_secret"],
        )
        self.api_v1 = tweepy.API(auth)

    def _upload_media_sync(self, file_path: Path) -> str:
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"Không tìm thấy file: {path}")
        media = self.api_v1.media_upload(filename=str(path))
        return str(media.media_id_string)

    async def upload_media(self, file_path: Path) -> str:
        return await asyncio.to_thread(self._upload_media_sync, file_path)

    def _post_tweet_sync(
        self,
        text: str,
        media_ids: list[str] | None = None,
        in_reply_to_id: str | None = None,
    ) -> str:
        kwargs: dict[str, object] = {"text": text}
        if media_ids:
            kwargs["media_ids"] = media_ids
        if in_reply_to_id:
            kwargs["in_reply_to_tweet_id"] = in_reply_to_id

        response = self.client_v2.create_tweet(**kwargs)
        if not response.data or "id" not in response.data:
            raise RuntimeError(f"X create_tweet response không có id: {response}")
        return str(response.data["id"])

    async def post_tweet(
        self,
        text: str,
        media_ids: list[str] | None = None,
        in_reply_to_id: str | None = None,
    ) -> str:
        return await asyncio.to_thread(self._post_tweet_sync, text, media_ids, in_reply_to_id)

    def _delete_tweet_sync(self, tweet_id: str) -> bool:
        response = self.client_v2.delete_tweet(tweet_id)
        data = getattr(response, "data", None)
        if isinstance(data, dict) and "deleted" in data:
            return bool(data["deleted"])
        return True

    async def delete_tweet(self, tweet_id: str) -> bool:
        return await asyncio.to_thread(self._delete_tweet_sync, tweet_id)

    async def post_thread(self, thread: list[str], thumbnail_path: Path | None) -> dict:
        """
        Post toàn bộ thread theo reply chain.
        """
        if not thread:
            raise ValueError("Thread rỗng")

        media_id = None
        if thumbnail_path and Path(thumbnail_path).exists():
            try:
                media_id = await self.upload_media(Path(thumbnail_path))
                logger.info("[{}] ✅ Upload media: {}", self.label, media_id)
            except Exception as exc:  # noqa: BLE001
                logger.warning("[{}] ⚠️ Upload media fail (vẫn post text): {}", self.label, exc)

        tweet_ids: list[str] = []
        last_error: str | None = None

        for index, tweet_text in enumerate(thread):
            try:
                if index == 0:
                    tweet_id = await self.post_tweet(
                        text=tweet_text,
                        media_ids=[media_id] if media_id else None,
                    )
                else:
                    tweet_id = await self.post_tweet(
                        text=tweet_text,
                        in_reply_to_id=tweet_ids[-1],
                    )
                tweet_ids.append(tweet_id)
                logger.info("[{}] ✅ Posted tweet {}/{}: id={}", self.label, index + 1, len(thread), tweet_id)
                if index < len(thread) - 1:
                    await asyncio.sleep(2)
            except Exception as exc:  # noqa: BLE001
                last_error = f"Tweet {index + 1}/{len(thread)} fail: {exc}"
                logger.error("[{}] ❌ {}", self.label, last_error)
                break

        if not tweet_ids:
            raise RuntimeError(f"[{self.label}] Không post được tweet nào. Error: {last_error}")

        first_id = tweet_ids[0]
        return {
            "url": f"https://x.com/i/status/{first_id}",
            "tweet_ids": tweet_ids,
            "first_tweet_id": first_id,
            "posted_count": len(tweet_ids),
            "total_count": len(thread),
            "last_error": last_error,
        }

    async def delete_thread(self, tweet_ids: list[str], url: str | None = None) -> dict:
        """
        Xóa toàn bộ reply chain theo thứ tự ngược lại để tránh orphan replies.
        """
        if not tweet_ids:
            raise ValueError("Không có tweet_ids để xóa.")

        deleted_ids: list[str] = []
        last_error: str | None = None

        for index, tweet_id in enumerate(reversed(tweet_ids), start=1):
            try:
                deleted = await self.delete_tweet(tweet_id)
                if not deleted:
                    raise RuntimeError("X API không xác nhận deleted=true.")
                deleted_ids.append(tweet_id)
                logger.info("[{}] ✅ Đã xóa tweet {}/{}: id={}", self.label, index, len(tweet_ids), tweet_id)
                if index < len(tweet_ids):
                    await asyncio.sleep(1)
            except Exception as exc:  # noqa: BLE001
                last_error = f"Xóa tweet {tweet_id} thất bại: {exc}"
                logger.error("[{}] ❌ {}", self.label, last_error)
                break

        status = "success" if len(deleted_ids) == len(tweet_ids) else "partial" if deleted_ids else "failed"
        return {
            "status": status,
            "url": url or f"https://x.com/i/status/{tweet_ids[0]}",
            "post_id": tweet_ids[0],
            "tweet_ids": list(tweet_ids),
            "deleted_count": len(deleted_ids),
            "last_error": last_error,
        }


def _get_credentials(account_label: str) -> dict:
    if account_label == "x1":
        return {
            "api_key": settings.x1_api_key,
            "api_secret": settings.x1_api_secret,
            "access_token": settings.x1_access_token,
            "access_secret": settings.x1_access_secret,
            "bearer_token": settings.x1_bearer_token,
        }
    if account_label == "x2":
        return {
            "api_key": settings.x2_api_key,
            "api_secret": settings.x2_api_secret,
            "access_token": settings.x2_access_token,
            "access_secret": settings.x2_access_secret,
            "bearer_token": settings.x2_bearer_token,
        }
    raise ValueError(f"Unknown account_label: {account_label}")


def has_real_credentials(account_label: str) -> bool:
    credentials = _get_credentials(account_label)
    return all(not _is_placeholder(value) for value in credentials.values())


async def publish_to_x_account(
    account_label: str,
    thread: list[str],
    thumbnail_path: str | None,
) -> dict:
    """
    Main entry cho 1 account. Không raise, luôn return dict.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        credentials = _get_credentials(account_label)
        publisher = XAccountPublisher(account_label, credentials)
        result = await publisher.post_thread(thread, Path(thumbnail_path) if thumbnail_path else None)
        status = "success" if result["posted_count"] == result["total_count"] else "partial"
        return {
            "status": status,
            "url": result["url"],
            "post_id": result["first_tweet_id"],
            "tweet_ids": result["tweet_ids"],
            "last_error": result.get("last_error"),
            "attempt_count": 1,
            "first_attempted_at": now_iso,
            "last_attempted_at": now_iso,
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("[{}] ❌ publish_to_x_account FAIL", account_label)
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


async def publish_to_both_x_accounts(
    thread: list[str],
    thumbnail_path: str | None,
) -> dict:
    x1_task = publish_to_x_account("x1", thread, thumbnail_path)
    x2_task = publish_to_x_account("x2", thread, thumbnail_path)
    x1_result, x2_result = await asyncio.gather(x1_task, x2_task)
    return {"x1": x1_result, "x2": x2_result}


def mock_publish_to_x_account(account_label: str, thread: list[str], thumbnail_path: str | None) -> dict:  # noqa: ARG001
    now_iso = datetime.now(timezone.utc).isoformat()
    fake_first_id = f"MOCK_{account_label}_{int(datetime.now().timestamp())}"
    return {
        "status": "success",
        "url": f"https://x.com/i/status/{fake_first_id}",
        "post_id": fake_first_id,
        "tweet_ids": [f"{fake_first_id}_{index}" for index in range(len(thread))],
        "last_error": None,
        "attempt_count": 1,
        "first_attempted_at": now_iso,
        "last_attempted_at": now_iso,
    }


async def delete_from_x_account(
    account_label: str,
    tweet_ids: list[str],
    url: str | None = None,
) -> dict:
    """
    Main entry: xóa thread đã đăng trên 1 X account. Không raise, luôn return dict.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        credentials = _get_credentials(account_label)
        publisher = XAccountPublisher(account_label, credentials)
        result = await publisher.delete_thread(tweet_ids, url=url)
        return {
            "status": result["status"],
            "url": result["url"],
            "post_id": result["post_id"],
            "tweet_ids": result["tweet_ids"],
            "last_error": result.get("last_error"),
            "deleted_count": result.get("deleted_count", 0),
            "attempted_at": now_iso,
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("[{}] ❌ delete_from_x_account FAIL", account_label)
        return {
            "status": "failed",
            "url": url,
            "post_id": tweet_ids[0] if tweet_ids else None,
            "tweet_ids": list(tweet_ids),
            "last_error": str(exc),
            "deleted_count": 0,
            "attempted_at": now_iso,
        }


def mock_delete_from_x_account(
    account_label: str,
    tweet_ids: list[str],
    url: str | None = None,
) -> dict:
    now_iso = datetime.now(timezone.utc).isoformat()
    first_tweet_id = tweet_ids[0] if tweet_ids else f"MOCK_{account_label}_{int(datetime.now().timestamp())}"
    return {
        "status": "success",
        "url": url or f"https://x.com/i/status/{first_tweet_id}",
        "post_id": first_tweet_id,
        "tweet_ids": list(tweet_ids),
        "last_error": None,
        "deleted_count": len(tweet_ids),
        "attempted_at": now_iso,
    }
