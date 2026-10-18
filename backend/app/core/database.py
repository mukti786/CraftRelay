"""
CraftRelay — async SQLAlchemy engine + session factory.

Supports two modes via DATABASE_URL environment variable:
  • postgresql+asyncpg://...          → real PostgreSQL
  • sqlite+aiosqlite:///./demo.db    → demo / test mode (default)
"""

import os

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import StaticPool

# ── URL resolution ────────────────────────────────────────────────────────────
_DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "sqlite+aiosqlite:///./demo.db",
)

# ── Engine ────────────────────────────────────────────────────────────────────
if _DATABASE_URL.startswith("sqlite"):
    # StaticPool prevents "created in a different thread" errors in tests.
    engine = create_async_engine(
        _DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False,
    )
else:
    engine = create_async_engine(_DATABASE_URL, echo=False)

# ── Session factory ───────────────────────────────────────────────────────────
AsyncSessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


# ── Declarative base ─────────────────────────────────────────────────────────
class Base(DeclarativeBase):
    """Shared metadata for all ORM models."""


# ── FastAPI dependency ────────────────────────────────────────────────────────
async def get_db() -> AsyncSession:  # type: ignore[misc]
    """Yield an async database session and close it after the request."""
    async with AsyncSessionLocal() as session:
        yield session
