import asyncio
import os
import sqlite3
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

import pytest
from pwdlib import PasswordHash
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

import app.db as dbmod
from app.demo_data import (
    DEMO_EMAILS,
    IDS,
    existing_database_state,
    seed_demo_records,
    validate_options,
)
from app.models import (
    ApprovedTask,
    AssessmentCase,
    AuditEvent,
    Competency,
    CriterionDecision,
    CustomerReview,
    Evidence,
    EvidenceAssistanceSuggestion,
    PracticalTaskAttempt,
    PracticalTaskAttemptReview,
    Qualification,
    ServiceRequest,
    User,
    WorkerProfile,
)


def test_demo_options_require_explicit_local_synthetic_database(tmp_path):
    backend_root = tmp_path / "backend"
    (backend_root / ".tmp").mkdir(parents=True)
    target = "sqlite+aiosqlite:///./.tmp/craftrelay-judge-demo.db"
    url, path = validate_options(
        app_env="development",
        confirmed=True,
        password="synthetic-demo-pass",
        database_url=target,
        backend_root=backend_root,
    )
    assert url.startswith("sqlite+aiosqlite:///")
    assert path == (backend_root / ".tmp" / "craftrelay-judge-demo.db").resolve()

    with pytest.raises(ValueError, match="confirm-demo-data"):
        validate_options(
            app_env="development",
            confirmed=False,
            password="synthetic-demo-pass",
            database_url=target,
            backend_root=backend_root,
        )
    with pytest.raises(ValueError, match="APP_ENV=development"):
        validate_options(
            app_env="production",
            confirmed=True,
            password="synthetic-demo-pass",
            database_url=target,
            backend_root=backend_root,
        )
    with pytest.raises(ValueError, match="at least 12"):
        validate_options(
            app_env="development",
            confirmed=True,
            password="short",
            database_url=target,
            backend_root=backend_root,
        )
    for unsafe_url in (
        "postgresql+asyncpg://demo:secret@localhost/demo",
        "sqlite+aiosqlite:///./craftrelay.db",
        "sqlite+aiosqlite:///./.tmp/other.db",
        "sqlite+aiosqlite:///./.tmp/../craftrelay.db",
    ):
        with pytest.raises(ValueError):
            validate_options(
                app_env="development",
                confirmed=True,
                password="synthetic-demo-pass",
                database_url=unsafe_url,
                backend_root=backend_root,
            )


def test_demo_options_reject_symlinked_demo_directory(tmp_path, monkeypatch):
    backend_root = tmp_path / "backend"
    backend_root.mkdir()
    original_is_symlink = Path.is_symlink

    def reports_demo_root_as_symlink(path):
        if path == backend_root / ".tmp":
            return True
        return original_is_symlink(path)

    monkeypatch.setattr(Path, "is_symlink", reports_demo_root_as_symlink)

    with pytest.raises(ValueError, match="symbolic link"):
        validate_options(
            app_env="development",
            confirmed=True,
            password="synthetic-demo-pass",
            database_url="sqlite+aiosqlite:///./.tmp/craftrelay-judge-demo.db",
            backend_root=backend_root,
        )


def test_demo_options_reject_application_database_alias(tmp_path, monkeypatch):
    backend_root = tmp_path / "backend"
    demo_root = backend_root / ".tmp"
    demo_root.mkdir(parents=True)
    application_database = backend_root / "craftrelay.db"
    demo_database = demo_root / "craftrelay-judge-demo.db"
    application_database.touch()
    demo_database.touch()
    original_samefile = Path.samefile

    def reports_alias(path, other):
        if {path, other} == {application_database, demo_database}:
            return True
        return original_samefile(path, other)

    monkeypatch.setattr(Path, "samefile", reports_alias)

    with pytest.raises(ValueError, match="separate from backend/craftrelay.db"):
        validate_options(
            app_env="development",
            confirmed=True,
            password="synthetic-demo-pass",
            database_url="sqlite+aiosqlite:///./.tmp/craftrelay-judge-demo.db",
            backend_root=backend_root,
        )


def test_synthetic_demo_seed_is_complete_and_rerun_never_resets(tmp_path):
    database_path = tmp_path / "demo.sqlite3"
    test_engine = dbmod.create_database_engine(f"sqlite+aiosqlite:///{database_path}")
    sessions = async_sessionmaker(test_engine, expire_on_commit=False)

    async def create_schema():
        async with test_engine.begin() as connection:
            await connection.run_sync(dbmod.Base.metadata.create_all)

    asyncio.run(create_schema())

    async def seed_and_inspect():
        async with sessions() as session:
            async with session.begin():
                assert await seed_demo_records(session, "synthetic-demo-pass") is True
            worker = await session.get(User, IDS["worker"])
            profile = await session.get(WorkerProfile, IDS["profile"])
            qualification = await session.get(Qualification, IDS["qualification"])
            task = await session.get(ApprovedTask, IDS["task"])
            case = await session.get(AssessmentCase, IDS["case"])
            assert worker.email == DEMO_EMAILS["worker"] and worker.role == "worker"
            assert PasswordHash.recommended().verify("synthetic-demo-pass", worker.password_hash)
            assert profile.trade == "Carpentry (synthetic demo)"
            assert qualification.official is False
            assert "not an official qualification" in qualification.source_name
            assert task.approved is True and task.official is False
            assert "not official" in task.source_name
            assert case.status == "IN_PROGRESS"
            for model in (
                Evidence,
                PracticalTaskAttempt,
                PracticalTaskAttemptReview,
                CriterionDecision,
                Competency,
                EvidenceAssistanceSuggestion,
                ServiceRequest,
                CustomerReview,
            ):
                assert await session.scalar(select(func.count()).select_from(model)) == 0
            assert (
                await session.scalar(
                    select(func.count())
                    .select_from(AuditEvent)
                    .where(AuditEvent.action == "demo.seed.created")
                )
                == 1
            )
            assert (
                await session.scalar(
                    select(func.count()).select_from(User).where(User.role == "admin")
                )
                == 1
            )
            assert (
                await session.scalar(
                    select(func.count()).select_from(User).where(User.role == "assessor")
                )
                == 1
            )

            # A demo walkthrough may progress normally; a seed rerun must preserve that work.
            profile.bio = "Presenter edited this synthetic profile during the walkthrough."
            await session.commit()

        async with sessions() as session:
            async with session.begin():
                assert await seed_demo_records(session, "a-different-password") is False
            profile = await session.get(WorkerProfile, IDS["profile"])
            worker = await session.get(User, IDS["worker"])
            assert profile.bio == "Presenter edited this synthetic profile during the walkthrough."
            assert PasswordHash.recommended().verify("synthetic-demo-pass", worker.password_hash)

    asyncio.run(seed_and_inspect())

    asyncio.run(test_engine.dispose())
    # The utility's current-schema recognition is tested without touching any application DB.
    with sqlite3.connect(database_path) as connection:
        connection.execute("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)")
        connection.execute("INSERT INTO alembic_version VALUES ('demo-test-head')")
    backend_root = tmp_path / "backend"
    demo_root = backend_root / ".tmp"
    demo_root.mkdir(parents=True)
    recognized_path = demo_root / "craftrelay-judge-demo.db"
    recognized_path.write_bytes(database_path.read_bytes())
    assert existing_database_state(recognized_path, "demo-test-head") == "complete"


def test_partial_demo_seed_refuses_to_modify_existing_records(tmp_path):
    test_engine = dbmod.create_database_engine(f"sqlite+aiosqlite:///{tmp_path / 'partial.db'}")
    sessions = async_sessionmaker(test_engine, expire_on_commit=False)

    async def setup_and_check():
        async with test_engine.begin() as connection:
            await connection.run_sync(dbmod.Base.metadata.create_all)
        async with sessions() as session:
            partial_user = User(
                id=IDS["worker"],
                email="different@example.test",
                full_name="Existing synthetic record",
                password_hash="unchanged-hash",
                role="worker",
            )
            session.add(partial_user)
            await session.commit()
            with pytest.raises(ValueError, match="Partial demo seed"):
                await seed_demo_records(session, "synthetic-demo-pass")
            await session.rollback()
            saved = await session.get(User, IDS["worker"])
            assert saved.email == "different@example.test"
            assert saved.password_hash == "unchanged-hash"
        await test_engine.dispose()

    asyncio.run(setup_and_check())


def test_demo_cli_migrates_fresh_database_and_rerun_does_not_reset(tmp_path):
    backend_root = Path(__file__).resolve().parents[1]
    database_name = f"craftrelay-judge-demo-{uuid4().hex}.db"
    database_path = backend_root / ".tmp" / database_name
    assert not database_path.exists()
    database_url = f"sqlite+aiosqlite:///./.tmp/{database_name}"
    environment = os.environ.copy()
    environment.update(
        {
            "APP_ENV": "development",
            "DEMO_PASSWORD": "Synthetic-Demo-Test-2026!",
        }
    )
    command = [
        sys.executable,
        "-m",
        "app.demo_data",
        "--database-url",
        database_url,
        "--confirm-demo-data",
    ]

    try:
        first = subprocess.run(
            command,
            cwd=backend_root,
            env=environment,
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
        assert first.returncode == 0, first.stderr
        assert "demo.worker@example.test" in first.stdout
        assert "Synthetic-Demo-Test-2026!" not in first.stdout
        connection = sqlite3.connect(database_path)
        try:
            assert connection.execute("SELECT version_num FROM alembic_version").fetchone()[0]
            connection.execute(
                "UPDATE assessment_cases SET status = 'NEEDS_MORE' WHERE id = ?", (IDS["case"],)
            )
            connection.commit()
        finally:
            connection.close()

        rerun = subprocess.run(
            command,
            cwd=backend_root,
            env=environment,
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
        assert rerun.returncode == 0, rerun.stderr
        assert "already exists" in rerun.stdout
        connection = sqlite3.connect(database_path)
        try:
            assert (
                connection.execute(
                    "SELECT status FROM assessment_cases WHERE id = ?", (IDS["case"],)
                ).fetchone()[0]
                == "NEEDS_MORE"
            )
        finally:
            connection.close()
    finally:
        artifacts = (
            database_path,
            database_path.with_name(database_path.name + "-wal"),
            database_path.with_name(database_path.name + "-shm"),
        )
        for artifact in artifacts:
            if artifact.exists() and not artifact.is_symlink():
                artifact.unlink()
