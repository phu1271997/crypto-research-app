from __future__ import annotations

import asyncio
import json
import os
import uuid
from datetime import UTC, datetime

from loguru import logger
from sqlalchemy import DateTime, String, Integer, Text, JSON, Uuid, delete, desc, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncAttrs, AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from src.settings import settings

db_url = settings.database_url
if db_url:
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql+psycopg://", 1)
    elif db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)
    DATABASE_URL = db_url
    is_postgres = True
else:
    from src.settings import ROOT_DIR
    DB_DIR = ROOT_DIR / "data"
    DB_PATH = DB_DIR / "bot.db"
    DATABASE_URL = f"sqlite+aiosqlite:///{DB_PATH}"
    is_postgres = False

class Base(AsyncAttrs, DeclarativeBase):
    pass

class RecentArticle(Base):
    __tablename__ = "recent_articles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    slug: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    primus_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    azdag_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    x1_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    x2_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)

class PipelineState(Base):
    __tablename__ = "pipeline_state"

    user_id: Mapped[int] = mapped_column(primary_key=True)
    state: Mapped[str] = mapped_column(String(50), nullable=False)
    payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

class State:
    IDLE = "IDLE"
    TOPICS_SHOWN = "TOPICS_SHOWN"
    WRITING = "WRITING"
    ARTICLE_LENGTH_CONFIRM = "ARTICLE_LENGTH_CONFIRM"
    PREVIEW = "PREVIEW"
    PUBLISHING = "PUBLISHING"

# New models for DB-as-command-queue integration
class BotCommand(Base):
    __tablename__ = "bot_commands"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))

class BotStatus(Base):
    __tablename__ = "bot_status"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    uptime: Mapped[int] = mapped_column(Integer, nullable=False)
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="idle")

class DraftArticle(Base):
    __tablename__ = "draft_articles"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    topic: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="draft")
    version: Mapped[int] = mapped_column(Integer, default=1)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


if not is_postgres:
    DB_DIR.mkdir(parents=True, exist_ok=True)

# Create engine with prepare_threshold=None to disable prepared statement caches for PgBouncer
if is_postgres:
    engine = create_async_engine(
        DATABASE_URL,
        future=True,
        pool_pre_ping=True,
        pool_recycle=300,
        connect_args={"prepare_threshold": None},
    )
else:
    engine = create_async_engine(DATABASE_URL, future=True)

SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
_db_initialized = False

async def init_db() -> None:
    global _db_initialized
    if _db_initialized:
        return

    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except OperationalError as exc:
        if "already exists" not in str(exc).lower():
            raise

    _db_initialized = True
    if is_postgres:
        logger.info("Đã khởi tạo/kết nối PostgreSQL thành công.")
    else:
        logger.info("Đã khởi tạo SQLite tại {}.", DB_PATH)

async def get_recent_titles(n: int = 3) -> list[str]:
    await init_db()
    async with SessionLocal() as session:
        result = await session.execute(
            select(RecentArticle.title)
            .order_by(desc(RecentArticle.created_at))
            .limit(n)
        )
        return [title for title in result.scalars().all() if title]

async def get_state(user_id: int) -> PipelineState | None:
    await init_db()
    async with SessionLocal() as session:
        result = await session.execute(
            select(PipelineState).where(PipelineState.user_id == user_id)
        )
        return result.scalar_one_or_none()

async def set_state(user_id: int, state: str, payload: dict | None = None) -> None:
    await init_db()
    serialized_payload = json.dumps(payload, ensure_ascii=False) if payload is not None else None

    async with SessionLocal() as session:
        existing = await session.get(PipelineState, user_id)
        if existing is None:
            session.add(
                PipelineState(
                    user_id=user_id,
                    state=state,
                    payload=serialized_payload,
                )
            )
        else:
            existing.state = state
            existing.payload = serialized_payload
            existing.updated_at = datetime.now(UTC)

        await session.commit()

async def clear_state(user_id: int) -> None:
    await init_db()
    async with SessionLocal() as session:
        await session.execute(delete(PipelineState).where(PipelineState.user_id == user_id))
        await session.commit()

async def save_published_article(
    title: str,
    slug: str | None = None,
    primus_url: str | None = None,
    azdag_url: str | None = None,
    x1_url: str | None = None,
    x2_url: str | None = None,
) -> None:
    await init_db()
    async with SessionLocal() as session:
        session.add(
            RecentArticle(
                title=title,
                slug=slug,
                primus_url=primus_url,
                azdag_url=azdag_url,
                x1_url=x1_url,
                x2_url=x2_url,
            )
        )
        await session.commit()

def _auto_init_db() -> None:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        asyncio.run(init_db())
    else:
        loop.create_task(init_db())

_auto_init_db()
