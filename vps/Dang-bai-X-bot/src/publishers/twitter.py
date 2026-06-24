from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path

import httpx
import tweepy
from loguru import logger

from src.settings import ROOT_DIR, settings


def _is_placeholder(value: str | None) -> bool:
    normalized = (value or "").strip()
    return not normalized or normalized.startswith("YOUR_")


# ---------------------------------------------------------------------------
# OAuth 2.0 Token Manager (for X2 AZDAG)
# ---------------------------------------------------------------------------

TOKEN_FILE = ROOT_DIR / "storage" / "x2_oauth2_tokens.json"


class OAuth2TokenManager:
    """Manages OAuth 2.0 PKCE tokens with auto-refresh for X2 (AZDAG)."""

    def __init__(self):
        self.client_id = settings.x2_client_id or ""
        self.client_secret = settings.x2_client_secret or ""
        self._access_token: str | None = None
        self._refresh_token: str | None = None
        self._load_tokens()

    def _load_tokens(self) -> None:
        """Load tokens from file, fallback to .env values."""
        if TOKEN_FILE.exists():
            try:
                data = json.loads(TOKEN_FILE.read_text(encoding="utf-8"))
                self._access_token = data.get("access_token")
                self._refresh_token = data.get("refresh_token")
                logger.info("✅ Loaded X2 OAuth2 tokens from file.")
                return
            except Exception:
                pass
        # Fallback to .env
        self._access_token = settings.x2_oauth2_access_token
        self._refresh_token = settings.x2_oauth2_refresh_token

    def _save_tokens(self) -> None:
        """Persist tokens to file."""
        TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
        TOKEN_FILE.write_text(
            json.dumps({
                "access_token": self._access_token,
                "refresh_token": self._refresh_token,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        logger.info("✅ Saved refreshed X2 OAuth2 tokens.")

    @property
    def access_token(self) -> str:
        return self._access_token or ""

    async def refresh(self) -> str:
        """Refresh the access token using the refresh token."""
        if not self._refresh_token:
            raise RuntimeError("Không có refresh_token để làm mới X2 OAuth2 token.")

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.x.com/2/oauth2/token",
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": self._refresh_token,
                    "client_id": self.client_id,
                },
                auth=(self.client_id, self.client_secret),
            )
            if resp.status_code != 200:
                raise RuntimeError(f"X2 OAuth2 refresh failed: {resp.status_code} {resp.text}")

            data = resp.json()
            self._access_token = data["access_token"]
            self._refresh_token = data.get("refresh_token", self._refresh_token)
            self._save_tokens()
            logger.info("✅ X2 OAuth2 token refreshed successfully.")
            return self._access_token


# Singleton
_x2_token_manager: OAuth2TokenManager | None = None


def _get_x2_token_manager() -> OAuth2TokenManager:
    global _x2_token_manager
    if _x2_token_manager is None:
        _x2_token_manager = OAuth2TokenManager()
    return _x2_token_manager


# ---------------------------------------------------------------------------
# X1 Publisher (OAuth 1.0a — Primus Spark)
# ---------------------------------------------------------------------------

class XAccountPublisher:
    """Publisher cho 1 X account dùng OAuth 1.0a."""

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

    async def post_thread(self, thread: list[str], thumbnail_path: Path | None) -> dict:
        if not thread:
            raise ValueError("Thread rỗng")

        media_id = None
        if thumbnail_path and Path(thumbnail_path).exists():
            try:
                media_id = await self.upload_media(Path(thumbnail_path))
                logger.info("[{}] ✅ Upload media: {}", self.label, media_id)
            except Exception as exc:
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
            except Exception as exc:
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


# ---------------------------------------------------------------------------
# X2 Publisher (OAuth 2.0 PKCE — AZDAG)
# ---------------------------------------------------------------------------

class X2OAuth2Publisher:
    """Publisher cho X2 AZDAG dùng OAuth 2.0 PKCE + auto-refresh."""

    def __init__(self):
        self.label = "x2"
        self.token_manager = _get_x2_token_manager()

    async def upload_media(self, file_path: Path) -> str:
        """Upload 1 ảnh lên Twitter qua OAuth 2.0 User-Context (Bearer token)."""
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"Không tìm thấy file: {path}")

        for attempt in range(2):
            headers = {
                "Authorization": f"Bearer {self.token_manager.access_token}",
            }
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    with open(path, "rb") as f:
                        files = {"media": f}
                        resp = await client.post(
                            "https://upload.twitter.com/1.1/media/upload.json",
                            files=files,
                            headers=headers,
                        )
                
                if resp.status_code == 200:
                    data = resp.json()
                    return str(data["media_id_string"])
                
                if resp.status_code == 401 and attempt == 0:
                    logger.warning("[x2] Token expired during media upload, refreshing...")
                    await self.token_manager.refresh()
                    continue

                raise RuntimeError(f"[x2] Media upload failed: {resp.status_code} {resp.text}")
            except Exception as e:
                if attempt == 1:
                    raise e

        raise RuntimeError("[x2] Media upload failed after refresh retry.")

    async def _post_tweet(self, text: str, reply_to: str | None = None, media_ids: list[str] | None = None) -> str:
        """Post 1 tweet, tự refresh token nếu cần."""
        payload: dict = {"text": text}
        if reply_to:
            payload["reply"] = {"in_reply_to_tweet_id": reply_to}
        if media_ids:
            payload["media"] = {"media_ids": media_ids}

        for attempt in range(2):  # 1st try + 1 retry after refresh
            headers = {
                "Authorization": f"Bearer {self.token_manager.access_token}",
                "Content-Type": "application/json",
            }
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    "https://api.x.com/2/tweets",
                    json=payload,
                    headers=headers,
                )

            if resp.status_code == 201:
                data = resp.json()
                return str(data["data"]["id"])

            if resp.status_code == 401 and attempt == 0:
                logger.warning("[x2] Token expired, refreshing...")
                await self.token_manager.refresh()
                continue

            raise RuntimeError(f"[x2] POST tweet failed: {resp.status_code} {resp.text}")

        raise RuntimeError("[x2] POST tweet failed after refresh retry.")

    async def post_thread(self, thread: list[str], thumbnail_path: Path | None) -> dict:
        """Post toàn bộ thread. Đính kèm thumbnail vào tweet đầu tiên."""
        if not thread:
            raise ValueError("Thread rỗng")

        media_id = None
        if thumbnail_path and Path(thumbnail_path).exists():
            try:
                media_id = await self.upload_media(Path(thumbnail_path))
                logger.info("[x2] ✅ Upload media: {}", media_id)
            except Exception as exc:
                logger.warning("[x2] ⚠️ Upload media fail (vẫn post text): {}", exc)

        tweet_ids: list[str] = []
        last_error: str | None = None

        for index, tweet_text in enumerate(thread):
            try:
                reply_to = tweet_ids[-1] if tweet_ids else None
                media_ids = [media_id] if (index == 0 and media_id) else None
                tweet_id = await self._post_tweet(tweet_text, reply_to, media_ids=media_ids)
                tweet_ids.append(tweet_id)
                logger.info("[x2] ✅ Posted tweet {}/{}: id={}", index + 1, len(thread), tweet_id)
                if index < len(thread) - 1:
                    await asyncio.sleep(2)
            except Exception as exc:
                last_error = f"Tweet {index + 1}/{len(thread)} fail: {exc}"
                logger.error("[x2] ❌ {}", last_error)
                break

        if not tweet_ids:
            raise RuntimeError(f"[x2] Không post được tweet nào. Error: {last_error}")

        first_id = tweet_ids[0]
        return {
            "url": f"https://x.com/i/status/{first_id}",
            "tweet_ids": tweet_ids,
            "first_tweet_id": first_id,
            "posted_count": len(tweet_ids),
            "total_count": len(thread),
            "last_error": last_error,
        }


# ---------------------------------------------------------------------------
# Credential helpers
# ---------------------------------------------------------------------------

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
    if account_label == "x2" and settings.x2_auth_type == "oauth2":
        return bool(settings.x2_oauth2_access_token or TOKEN_FILE.exists())
    credentials = _get_credentials(account_label)
    return all(not _is_placeholder(value) for value in credentials.values())


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def publish_to_x_account(
    account_label: str,
    thread: list[str],
    thumbnail_path: str | None,
) -> dict:
    """Main entry cho 1 account. Không raise, luôn return dict."""
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        if account_label == "x2" and settings.x2_auth_type == "oauth2":
            publisher = X2OAuth2Publisher()
        else:
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
    except Exception as exc:
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
