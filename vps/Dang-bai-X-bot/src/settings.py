from __future__ import annotations

from functools import lru_cache
from pathlib import Path
import sys
from typing import Any, Iterable

import yaml
from loguru import logger
from pydantic import BaseModel, Field, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parent.parent
LOG_DIR = ROOT_DIR / "logs"
LOG_FILE = LOG_DIR / "bot.log"
CONFIG_PATH = ROOT_DIR / "config.yaml"
ENV_PATH = ROOT_DIR / ".env"


def configure_logging() -> None:
    """Configure the shared file logger once for the whole app."""
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    logger.remove()
    logger.add(
        LOG_FILE,
        level="INFO",
        rotation="10 MB",
        retention="14 days",
        enqueue=True,
        backtrace=True,
        diagnose=False,
    )
    logger.add(sys.stderr, level="INFO")


class ScheduleConfig(BaseModel):
    trending_cron: str
    timezone: str


class ArticleConfig(BaseModel):
    language: str
    target_words: int
    tone: str
    sections: list[str]


class TwitterConfig(BaseModel):
    language: str
    thread_min_tweets: int
    thread_max_tweets: int
    tweet_max_chars: int


class ImageConfig(BaseModel):
    thumbnail_size: str
    inline_size: str
    style_keywords: str


class TrendingConfig(BaseModel):
    num_topics: int
    lookback_hours: int
    rss_feeds: list[str]


class DatabaseConfig(BaseModel):
    recent_articles_keep: int


class AppConfig(BaseModel):
    schedule: ScheduleConfig
    article: ArticleConfig
    twitter: TwitterConfig
    image: ImageConfig
    trending: TrendingConfig
    db: DatabaseConfig


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_PATH),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
        protected_namespaces=(),
    )

    database_url: str | None = Field(default=None, alias="DATABASE_URL")
    openrouter_api_key: str | None = Field(default=None, alias="OPENROUTER_API_KEY")
    model_article: str = Field(default="google/gemini-3-flash-preview", alias="MODEL_ARTICLE")
    model_image: str = Field(default="google/gemini-2.5-flash-image", alias="MODEL_IMAGE")
    model_trending: str = Field(default="openai/gpt-5.4", alias="MODEL_TRENDING")

    telegram_bot_token: str | None = Field(default=None, alias="TELEGRAM_BOT_TOKEN")
    telegram_chat_id: str | None = Field(default=None, alias="TELEGRAM_CHAT_ID")

    cryptopanic_api_key: str | None = Field(default=None, alias="CRYPTOPANIC_API_KEY")
    coingecko_api_key: str | None = Field(default=None, alias="COINGECKO_API_KEY")

    primus_wp_url: str | None = Field(default=None, alias="PRIMUS_WP_URL")
    primus_wp_username: str | None = Field(default=None, alias="PRIMUS_WP_USERNAME")
    primus_wp_app_password: str | None = Field(default=None, alias="PRIMUS_WP_APP_PASSWORD")

    azdag_api_key: str | None = Field(default=None, alias="AZDAG_API_KEY")
    azdag_url: str | None = Field(default=None, alias="AZDAG_URL")
    azdag_login_url: str | None = Field(default=None, alias="AZDAG_LOGIN_URL")
    azdag_email: str | None = Field(default=None, alias="AZDAG_EMAIL")
    azdag_password: str | None = Field(default=None, alias="AZDAG_PASSWORD")
    azdag_session_ttl_days: int = Field(default=14, alias="AZDAG_SESSION_TTL_DAYS")
    debug_playwright: bool = Field(default=False, alias="DEBUG_PLAYWRIGHT")
    mock_mode: bool = Field(default=False, alias="MOCK_MODE")
    enable_x_publish: bool = Field(default=False, alias="ENABLE_X_PUBLISH")
    enable_azdag_publish: bool = Field(default=False, alias="ENABLE_AZDAG_PUBLISH")

    # --- X Account 1 (Primus Spark — OAuth 1.0a) ---
    x1_api_key: str | None = Field(default=None, alias="X1_API_KEY")
    x1_api_secret: str | None = Field(default=None, alias="X1_API_SECRET")
    x1_access_token: str | None = Field(default=None, alias="X1_ACCESS_TOKEN")
    x1_access_secret: str | None = Field(default=None, alias="X1_ACCESS_SECRET")
    x1_bearer_token: str | None = Field(default=None, alias="X1_BEARER_TOKEN")

    # --- X Account 2 (AZDAG — OAuth 2.0 PKCE) ---
    x2_auth_type: str = Field(default="oauth1", alias="X2_AUTH_TYPE")
    x2_client_id: str | None = Field(default=None, alias="X2_CLIENT_ID")
    x2_client_secret: str | None = Field(default=None, alias="X2_CLIENT_SECRET")
    x2_consumer_key: str | None = Field(default=None, alias="X2_CONSUMER_KEY")
    x2_consumer_secret: str | None = Field(default=None, alias="X2_CONSUMER_SECRET")
    x2_bearer_token: str | None = Field(default=None, alias="X2_BEARER_TOKEN")
    x2_oauth2_access_token: str | None = Field(default=None, alias="X2_OAUTH2_ACCESS_TOKEN")
    x2_oauth2_refresh_token: str | None = Field(default=None, alias="X2_OAUTH2_REFRESH_TOKEN")

    # Legacy X2 OAuth 1.0a (kept for backward compat)
    x2_api_key: str | None = Field(default=None, alias="X2_API_KEY")
    x2_api_secret: str | None = Field(default=None, alias="X2_API_SECRET")
    x2_access_token: str | None = Field(default=None, alias="X2_ACCESS_TOKEN")
    x2_access_secret: str | None = Field(default=None, alias="X2_ACCESS_SECRET")

    def require(self, field_names: Iterable[str]) -> None:
        """Raise a clear error if any required settings are empty."""
        missing: list[str] = []
        for field_name in field_names:
            value = getattr(self, field_name)
            if value is None or (isinstance(value, str) and not value.strip()):
                env_name = self.model_fields[field_name].alias or field_name.upper()
                missing.append(env_name)

        if missing:
            joined = ", ".join(sorted(missing))
            raise ValueError(
                f"Missing required environment variables in {ENV_PATH}: {joined}. "
                "Copy .env.example to .env and fill in the missing values."
            )

    def validate_startup(self) -> None:
        """Validate all env vars needed for the full bot runtime."""
        self.require(
            [
                "openrouter_api_key",
                "telegram_bot_token",
                "telegram_chat_id",
                "primus_wp_url",
                "primus_wp_username",
                "primus_wp_app_password",
                "azdag_api_key",
                "x1_api_key",
                "x1_api_secret",
                "x1_access_token",
                "x1_access_secret",
                "x1_bearer_token",
            ]
        )

    def validate_phase1(self) -> None:
        """Validate only the secrets needed for the Phase 1 smoke test."""
        self.require(["openrouter_api_key", "model_article", "model_image"])


@lru_cache(maxsize=1)
def load_settings() -> Settings:
    return Settings()


@lru_cache(maxsize=1)
def load_config(path: Path = CONFIG_PATH) -> AppConfig:
    if not path.exists():
        raise FileNotFoundError(f"Missing config file: {path}")

    raw_data: Any = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(raw_data, dict):
        raise ValueError(f"Invalid config format in {path}: expected a YAML object at the top level.")

    try:
        return AppConfig.model_validate(raw_data)
    except ValidationError as exc:
        raise ValueError(f"Invalid config in {path}: {exc}") from exc


configure_logging()
settings = load_settings()
config = load_config()
