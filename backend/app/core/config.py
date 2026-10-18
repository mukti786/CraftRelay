"""
CraftRelay backend — application settings.
All configuration is read from environment variables or a .env file.
Never hard-code secrets here.
"""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App ──────────────────────────────────────────────
    app_name: str = "CraftRelay API"
    app_version: str = "0.1.0"
    environment: str = "development"

    # ── Database ─────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://craftrelay:changeme@localhost:5432/craftrelay"
    database_sync_url: str = "postgresql+psycopg2://craftrelay:changeme@localhost:5432/craftrelay"

    # ── Security ─────────────────────────────────────────
    secret_key: str = "CHANGE_ME_BEFORE_PRODUCTION"
    access_token_expire_minutes: int = 60
    algorithm: str = "HS256"

    # ── CORS ─────────────────────────────────────────────
    cors_origins: list[str] = ["http://localhost:8081", "http://localhost:3000"]

    # ── File uploads ─────────────────────────────────────
    upload_dir: str = "./uploads"
    max_upload_bytes: int = 10 * 1024 * 1024  # 10 MB

    # ── AI provider (optional) ───────────────────────────
    ai_provider: str | None = None
    google_api_key: str | None = None


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings singleton."""
    return Settings()
