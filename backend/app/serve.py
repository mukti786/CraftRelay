"""Run the API only after applying migrations to its configured database."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from sqlalchemy.engine import make_url

from app.settings import get_settings


def main() -> None:
    settings = get_settings()
    if settings.app_env == "demo" and not Path("/var/data").is_mount():
        raise RuntimeError("The Render demo requires its persistent disk mounted at /var/data")

    if settings.app_env == "demo":
        database_path = Path(make_url(settings.database_url).database)
        database_path.parent.mkdir(parents=True, exist_ok=True)
    Path(settings.evidence_dir).mkdir(parents=True, exist_ok=True)

    backend_root = Path(__file__).resolve().parents[1]
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=backend_root,
        check=True,
    )

    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "8000")),
        workers=1,
    )


if __name__ == "__main__":
    main()
