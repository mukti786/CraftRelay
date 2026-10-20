import secrets
from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")
    app_env: str = "development"
    database_url: str = "sqlite+aiosqlite:///./craftrelay.db"
    secret_key: str = ""
    cors_origins: str = "http://localhost:5173"
    evidence_dir: str = "./data/evidence"
    max_upload_bytes: int = 20 * 1024 * 1024
    access_token_minutes: int = Field(default=60, gt=0, le=60 * 24 * 30)
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    bootstrap_admin_email: str = ""
    bootstrap_admin_password: str = ""
    bootstrap_admin_name: str = "CraftRelay Administrator"

    @property
    def cors_origin_list(self) -> list[str]:
        return [x.strip() for x in self.cors_origins.split(",") if x.strip()]


@lru_cache
def get_settings() -> Settings:
    return validate_settings(Settings())


def validate_settings(cfg: Settings) -> Settings:
    if not cfg.secret_key:
        if cfg.app_env == "production":
            raise RuntimeError("SECRET_KEY must be configured in production")
        cfg.secret_key = secrets.token_urlsafe(48)
    if cfg.app_env == "production":
        if len(cfg.secret_key.encode("utf-8")) < 32 or len(set(cfg.secret_key)) < 16:
            raise RuntimeError(
                "SECRET_KEY must be a high-entropy value of at least 32 bytes in production"
            )
        if not cfg.cors_origin_list or "*" in cfg.cors_origin_list:
            raise RuntimeError("Production CORS_ORIGINS must list explicit trusted origins")
    return cfg
