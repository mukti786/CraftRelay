import secrets
from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url

DEMO_DATABASE_URL = "sqlite+aiosqlite:////var/data/craftrelay.db"
DEMO_EVIDENCE_DIR = "/var/data/evidence"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")
    app_env: str
    database_url: str = "sqlite+aiosqlite:///./craftrelay.db"
    secret_key: str = ""
    cors_origins: str = "http://localhost:5173"
    evidence_dir: str = "./data/evidence"
    max_upload_bytes: int = Field(default=20 * 1024 * 1024, gt=0)
    access_token_minutes: int = Field(default=60, gt=0, le=60 * 24 * 30)
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    bootstrap_admin_email: str = ""
    bootstrap_admin_password: str = ""
    bootstrap_admin_name: str = "CraftRelay Administrator"
    ai_assistance_provider: str = "none"

    @property
    def cors_origin_list(self) -> list[str]:
        return [x.strip() for x in self.cors_origins.split(",") if x.strip()]


@lru_cache
def get_settings() -> Settings:
    return validate_settings(Settings())


def validate_settings(cfg: Settings) -> Settings:
    if cfg.app_env not in {"development", "test", "demo", "production"}:
        raise RuntimeError("APP_ENV must be development, test, demo, or production")
    if not cfg.secret_key:
        if cfg.app_env in {"demo", "production"}:
            raise RuntimeError("SECRET_KEY must be configured in demo and production")
        cfg.secret_key = secrets.token_urlsafe(48)
    if cfg.app_env in {"demo", "production"}:
        if len(cfg.secret_key.encode("utf-8")) < 32 or len(set(cfg.secret_key)) < 16:
            raise RuntimeError("SECRET_KEY must be a high-entropy value of at least 32 bytes")
        if not cfg.cors_origin_list or "*" in cfg.cors_origin_list:
            raise RuntimeError("CORS_ORIGINS must list explicit trusted HTTPS origins")
        if any(
            urlsplit(origin).scheme != "https"
            or not urlsplit(origin).hostname
            or urlsplit(origin).path not in {"", "/"}
            or urlsplit(origin).query
            or urlsplit(origin).fragment
            or urlsplit(origin).username
            or urlsplit(origin).password
            for origin in cfg.cors_origin_list
        ):
            raise RuntimeError("CORS_ORIGINS must use HTTPS origins")

        if cfg.app_env == "production":
            try:
                database_url = make_url(cfg.database_url)
            except Exception as exc:
                raise RuntimeError(
                    "Production DATABASE_URL must be a valid PostgreSQL URL"
                ) from exc
            if (
                database_url.drivername != "postgresql+asyncpg"
                or not database_url.host
                or not database_url.database
            ):
                raise RuntimeError("Production DATABASE_URL must target PostgreSQL via asyncpg")

            if not Path(cfg.evidence_dir).is_absolute():
                raise RuntimeError(
                    "Production EVIDENCE_DIR must be an absolute persistent mount path"
                )
        else:
            try:
                database_url = make_url(cfg.database_url)
            except Exception as exc:
                raise RuntimeError(
                    "Demo DATABASE_URL must target the isolated SQLite demo file"
                ) from exc
            if (
                database_url.render_as_string(hide_password=False) != DEMO_DATABASE_URL
                or cfg.evidence_dir != DEMO_EVIDENCE_DIR
                or cfg.cookie_samesite != "none"
            ):
                raise RuntimeError(
                    "Demo mode requires SQLite at /var/data/craftrelay.db, evidence at "
                    "/var/data/evidence, and COOKIE_SAMESITE=none"
                )
    return cfg
