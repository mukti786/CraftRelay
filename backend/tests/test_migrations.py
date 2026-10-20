from pathlib import Path
from uuid import uuid4

from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import Boolean, String, create_engine, inspect, text
from sqlalchemy.engine import URL

from app.settings import get_settings


def _migration_database(monkeypatch):
    backend_root = Path(__file__).resolve().parents[1]
    temp_dir = backend_root / ".tmp"
    temp_dir.mkdir(exist_ok=True)
    database_path = temp_dir / f"migration-{uuid4().hex}.db"
    database_url = URL.create(
        "sqlite+aiosqlite", database=str(database_path.resolve())
    ).render_as_string(hide_password=False)

    monkeypatch.chdir(backend_root)
    monkeypatch.setenv("DATABASE_URL", database_url)
    get_settings.cache_clear()
    return backend_root, database_path, Config("alembic.ini")


def _seed_legacy_approved_task(database_path):
    engine = create_engine(URL.create("sqlite", database=str(database_path.resolve())))
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO qualifications "
                "(id, code, version, title, source_name, source_url, official, active, created_at) "
                "VALUES ('qual-1', 'LEGACY', '1', 'Legacy qualification', 'unknown', '', 0, 1, "
                "'2026-01-01T00:00:00')"
            )
        )
        connection.execute(
            text(
                "INSERT INTO criteria "
                "(id, qualification_id, code, description, mandatory, requires_practical) "
                "VALUES ('criterion-1', 'qual-1', 'C1', 'Legacy criterion', 1, 1)"
            )
        )
        connection.execute(
            text(
                "INSERT INTO approved_tasks "
                "(id, qualification_id, criterion_id, title, instructions, rubric, approved) "
                "VALUES ('task-1', 'qual-1', 'criterion-1', 'Existing approved task', "
                "'Existing instructions', 'Existing rubric', 1)"
            )
        )
    engine.dispose()


def _assert_legacy_record_survived(database_path):
    engine = create_engine(URL.create("sqlite", database=str(database_path.resolve())))
    with engine.connect() as connection:
        task = connection.execute(
            text(
                "SELECT id, qualification_id, criterion_id, title, instructions, rubric, approved, "
                "source_name, source_url, official FROM approved_tasks WHERE id = 'task-1'"
            )
        ).one()
        assert tuple(task) == (
            "task-1",
            "qual-1",
            "criterion-1",
            "Existing approved task",
            "Existing instructions",
            "Existing rubric",
            1,
            "Not recorded (legacy task)",
            "",
            0,
        )
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
    columns = {column["name"]: column for column in inspect(engine).get_columns("approved_tasks")}
    assert all(
        columns[name]["default"] is None for name in ("source_name", "source_url", "official")
    )
    engine.dispose()


def test_alembic_empty_sqlite_upgrade_reaches_head_without_model_drift(monkeypatch):
    _, _, config = _migration_database(monkeypatch)
    try:
        command.upgrade(config, "head")
        command.check(config)
    finally:
        get_settings.cache_clear()


def test_revision_9_approved_task_is_backfilled_and_preserved(monkeypatch):
    _, database_path, config = _migration_database(monkeypatch)
    try:
        command.upgrade(config, "9c4100cee95e")
        _seed_legacy_approved_task(database_path)
        command.upgrade(config, "head")
        command.check(config)
        _assert_legacy_record_survived(database_path)
    finally:
        get_settings.cache_clear()


def test_existing_revision_17_without_defaults_upgrades_safely(monkeypatch):
    _, database_path, config = _migration_database(monkeypatch)
    try:
        command.upgrade(config, "9c4100cee95e")
        _seed_legacy_approved_task(database_path)
        command.upgrade(config, "17d9056f7e55")

        # Model a database that applied the old revision 17 implementation,
        # which had the new columns but no server defaults.
        engine = create_engine(URL.create("sqlite", database=str(database_path.resolve())))
        with engine.begin() as connection:
            operations = Operations(MigrationContext.configure(connection))
            with operations.batch_alter_table("approved_tasks") as batch:
                for name, column_type in (
                    ("source_name", String(200)),
                    ("source_url", String(1000)),
                    ("official", Boolean()),
                ):
                    batch.alter_column(
                        name,
                        existing_type=column_type,
                        existing_nullable=False,
                        server_default=None,
                    )
        engine.dispose()

        command.upgrade(config, "head")
        _assert_legacy_record_survived(database_path)
    finally:
        get_settings.cache_clear()
