from collections.abc import AsyncIterator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.settings import get_settings


class Base(DeclarativeBase):
    pass


def enable_sqlite_foreign_keys(db_engine) -> None:
    if db_engine.url.get_backend_name() != "sqlite":
        return

    @event.listens_for(db_engine.sync_engine, "connect")
    def _enable_sqlite_foreign_keys(connection, _record):
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def create_database_engine(url: str, **kwargs):
    db_engine = create_async_engine(url, pool_pre_ping=True, **kwargs)
    enable_sqlite_foreign_keys(db_engine)
    return db_engine


engine = create_database_engine(get_settings().database_url)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
