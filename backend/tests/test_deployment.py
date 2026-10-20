from pathlib import Path

import pytest

from app import serve
from app.settings import DEMO_DATABASE_URL, Settings


def _demo_settings() -> Settings:
    return Settings(
        app_env="demo",
        secret_key="aB3dE5gH7jK9mN2pQ4sT6vX8zA0cD1fG",
        cors_origins="https://craftrelay-demo.vercel.app",
        database_url=DEMO_DATABASE_URL,
        evidence_dir="/var/data/evidence",
        cookie_samesite="none",
    )


def test_demo_startup_migrates_before_serving_on_one_worker(monkeypatch):
    events = []
    monkeypatch.setattr(serve, "get_settings", _demo_settings)
    monkeypatch.setattr(Path, "is_mount", lambda _path: True)
    monkeypatch.setattr(Path, "mkdir", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        serve.subprocess, "run", lambda args, **kwargs: events.append((args, kwargs))
    )
    monkeypatch.setenv("PORT", "10000")

    import uvicorn

    monkeypatch.setattr(uvicorn, "run", lambda *args, **kwargs: events.append((args, kwargs)))
    serve.main()

    migration_args, migration_kwargs = events[0]
    assert migration_args[1:] == ["-m", "alembic", "upgrade", "head"]
    assert migration_kwargs["check"] is True
    assert migration_kwargs["cwd"] == Path(serve.__file__).resolve().parents[1]
    server_args, server_kwargs = events[1]
    assert server_args == ("app.main:app",)
    assert server_kwargs == {"host": "0.0.0.0", "port": 10000, "workers": 1}


def test_demo_startup_fails_closed_without_the_persistent_mount(monkeypatch):
    monkeypatch.setattr(serve, "get_settings", _demo_settings)
    monkeypatch.setattr(Path, "is_mount", lambda _path: False)
    monkeypatch.setattr(
        serve.subprocess, "run", lambda *_args, **_kwargs: pytest.fail("migration ran")
    )

    with pytest.raises(RuntimeError, match="persistent disk mounted"):
        serve.main()
