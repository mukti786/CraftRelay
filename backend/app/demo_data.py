"""Opt-in synthetic seed for an isolated local judge-demo database.

This command deliberately targets a dedicated SQLite file under backend/.tmp. It never resets
an existing database and never inserts evidence, assessment outcomes, reviews, or competencies.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sqlite3
from pathlib import Path
from typing import Literal
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import func, select
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession

DEMO_EMAILS = {
    "admin": "demo.admin@example.test",
    "assessor": "demo.assessor@example.test",
    "worker": "demo.worker@example.test",
    "customer": "demo.customer@example.test",
}
DEMO_SEED_VERSION = "judge-demo-v1"
DEMO_QUALIFICATION_CODE = "DEMO-JUDGE-001"
DEMO_QUALIFICATION_VERSION = "1.0"
DEMO_DATABASE_FILENAME = "craftrelay-judge-demo.db"


def _id(name: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"https://craftrelay.example.test/{DEMO_SEED_VERSION}/{name}"))


IDS = {
    "admin": _id("user/admin"),
    "assessor": _id("user/assessor"),
    "worker": _id("user/worker"),
    "customer": _id("user/customer"),
    "profile": _id("worker-profile"),
    "skill_joinery": _id("skill/joinery"),
    "skill_measurement": _id("skill/measurement"),
    "qualification": _id("qualification"),
    "criterion_preparation": _id("criterion/preparation"),
    "criterion_work_sample": _id("criterion/work-sample"),
    "criterion_practical": _id("criterion/practical"),
    "task": _id("approved-task"),
    "case": _id("assessment-case"),
    "audit": _id("seed-audit-event"),
}


def validate_options(
    *,
    app_env: str,
    confirmed: bool,
    password: str | None,
    database_url: str,
    backend_root: Path,
) -> tuple[str, Path]:
    """Validate all gates before creating directories, files, schemas, or users."""
    if not confirmed:
        raise ValueError("Pass --confirm-demo-data to explicitly opt in to synthetic demo seeding")
    if app_env != "development":
        raise ValueError("Demo seeding is allowed only when APP_ENV=development")
    if not password or len(password) < 12:
        raise ValueError("Set DEMO_PASSWORD to a local demo password of at least 12 characters")

    try:
        url = make_url(database_url)
    except Exception as exc:
        raise ValueError("Provide a valid SQLite demo database URL") from exc
    if (
        url.drivername != "sqlite+aiosqlite"
        or not url.database
        or url.database == ":memory:"
        or url.query
        or url.username
        or url.password
        or url.host
    ):
        raise ValueError("Demo seeding requires a file-backed sqlite+aiosqlite URL with no options")

    backend_root = backend_root.resolve()
    demo_root_candidate = backend_root / ".tmp"
    if demo_root_candidate.is_symlink():
        raise ValueError("The backend/.tmp demo directory must not be a symbolic link")
    demo_root = demo_root_candidate.resolve()
    if demo_root.parent != backend_root:
        raise ValueError("The backend/.tmp demo directory must remain inside the backend directory")

    supplied_path = Path(url.database)
    candidate = supplied_path if supplied_path.is_absolute() else backend_root / supplied_path
    if candidate.is_symlink():
        raise ValueError("Demo database path must not be a symbolic link")
    target = candidate.resolve()
    valid_name = re.fullmatch(r"craftrelay-judge-demo(?:-[A-Za-z0-9_-]{1,40})?\.db", target.name)
    if target.parent != demo_root or not valid_name:
        raise ValueError(
            "Demo database must be a dedicated craftrelay-judge-demo*.db directly under backend/.tmp"
        )
    if target.is_symlink():
        raise ValueError("Demo database path must not be a symbolic link")
    application_database = backend_root / "craftrelay.db"
    if target.exists() and application_database.exists() and target.samefile(application_database):
        raise ValueError("Demo database must be separate from backend/craftrelay.db")
    normalized_url = url.set(database=str(target)).render_as_string(hide_password=False)
    return normalized_url, target


def existing_database_state(
    path: Path, expected_head: str
) -> Literal["new", "empty", "complete", "unsafe"]:
    """Recognize only a new/empty database or this seed's complete, current-schema database."""
    if not path.exists() or path.stat().st_size == 0:
        return "new"
    try:
        uri = f"file:{path.as_posix()}?mode=ro"
        connection = sqlite3.connect(uri, uri=True)
        try:
            tables = {
                row[0]
                for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
                )
            }
            if not tables:
                return "empty"
            if "alembic_version" not in tables:
                return "unsafe"
            if not {"users", "qualifications", "assessment_cases"}.issubset(tables):
                return "unsafe"
            revisions = {
                row[0] for row in connection.execute("SELECT version_num FROM alembic_version")
            }
            if revisions != {expected_head}:
                return "unsafe"
            for table in tables - {"alembic_version"}:
                count = connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
                if count:
                    break
            else:
                return "empty"

            expected = (
                ("users", "id", IDS["admin"], DEMO_EMAILS["admin"]),
                ("users", "id", IDS["assessor"], DEMO_EMAILS["assessor"]),
                ("users", "id", IDS["worker"], DEMO_EMAILS["worker"]),
                ("users", "id", IDS["customer"], DEMO_EMAILS["customer"]),
                ("worker_profiles", "id", IDS["profile"], IDS["worker"]),
                ("qualifications", "id", IDS["qualification"], DEMO_QUALIFICATION_CODE),
                ("criteria", "id", IDS["criterion_preparation"], IDS["qualification"]),
                ("criteria", "id", IDS["criterion_work_sample"], IDS["qualification"]),
                ("criteria", "id", IDS["criterion_practical"], IDS["qualification"]),
                ("approved_tasks", "id", IDS["task"], IDS["qualification"]),
                ("assessment_cases", "id", IDS["case"], IDS["profile"]),
            )
            for table, key, identifier, value in expected:
                row = connection.execute(
                    f'SELECT * FROM "{table}" WHERE "{key}" = ?', (identifier,)
                ).fetchone()
                if row is None:
                    return "unsafe"
                columns = [item[1] for item in connection.execute(f'PRAGMA table_info("{table}")')]
                identity_column = {
                    "users": "email",
                    "worker_profiles": "user_id",
                    "qualifications": "code",
                    "criteria": "qualification_id",
                    "approved_tasks": "qualification_id",
                    "assessment_cases": "worker_id",
                }[table]
                if row[columns.index(identity_column)] != value:
                    return "unsafe"
            seed_event = connection.execute(
                "SELECT action FROM audit_events WHERE id = ?", (IDS["audit"],)
            ).fetchone()
            return "complete" if seed_event == ("demo.seed.created",) else "unsafe"
        finally:
            connection.close()
    except (OSError, sqlite3.Error, KeyError, ValueError):
        return "unsafe"


async def seed_demo_records(db: AsyncSession, password: str) -> bool:
    """Insert a synthetic starting state once. Returns False on a recognized rerun."""
    from pwdlib import PasswordHash

    from app.models import (
        ApprovedTask,
        AssessmentCase,
        AuditEvent,
        Competency,
        Criterion,
        CriterionDecision,
        CustomerReview,
        DeclaredSkill,
        Evidence,
        EvidenceAssistanceSuggestion,
        PracticalTaskAttempt,
        PracticalTaskAttemptReview,
        Qualification,
        ServiceRequest,
        User,
        WorkerProfile,
    )

    expected_user_ids = [IDS[role] for role in ("admin", "assessor", "worker", "customer")]
    existing_demo_users = (
        await db.scalars(select(User).where(User.id.in_(expected_user_ids)))
    ).all()
    seed_marker = await db.get(AuditEvent, IDS["audit"])
    fixture_records = [
        await db.get(WorkerProfile, IDS["profile"]),
        await db.get(Qualification, IDS["qualification"]),
        await db.get(AssessmentCase, IDS["case"]),
        seed_marker,
    ]
    existing_fixture = bool(existing_demo_users) or any(fixture_records)

    if existing_fixture:
        if len(existing_demo_users) != len(expected_user_ids) or not seed_marker:
            raise ValueError("Partial demo seed found; use a new isolated demo database path")
        for role, user_id in zip(("admin", "assessor", "worker", "customer"), expected_user_ids):
            user = await db.get(User, user_id)
            if not user or user.email != DEMO_EMAILS[role]:
                raise ValueError("Demo identity mismatch; no existing record was changed")
        return False

    model_types = (
        User,
        WorkerProfile,
        DeclaredSkill,
        Qualification,
        Criterion,
        ApprovedTask,
        AssessmentCase,
        Evidence,
        PracticalTaskAttempt,
        PracticalTaskAttemptReview,
        CriterionDecision,
        EvidenceAssistanceSuggestion,
        Competency,
        ServiceRequest,
        CustomerReview,
        AuditEvent,
    )
    for model in model_types:
        if await db.scalar(select(func.count()).select_from(model)):
            raise ValueError("Demo target contains records; no existing record was changed")

    if len(password) < 12:
        raise ValueError("Demo password must contain at least 12 characters")
    hashed_password = PasswordHash.recommended().hash(password)
    roles = (
        ("admin", "Synthetic Demo Administrator", "admin"),
        ("assessor", "Synthetic Demo Assessor", "assessor"),
        ("worker", "Synthetic Demo Worker", "worker"),
        ("customer", "Synthetic Demo Customer", "customer"),
    )
    accounts = [
        User(
            id=IDS[key],
            email=DEMO_EMAILS[key],
            full_name=name,
            password_hash=hashed_password,
            role=role,
            active=True,
        )
        for key, name, role in roles
    ]
    admin = accounts[0]
    worker = accounts[2]
    qualification = Qualification(
        id=IDS["qualification"],
        code=DEMO_QUALIFICATION_CODE,
        version=DEMO_QUALIFICATION_VERSION,
        title="Synthetic Carpentry Skills Demonstration",
        source_name="CraftRelay synthetic judge demo; not an official qualification",
        source_url="",
        official=False,
        active=True,
    )
    criteria = [
        Criterion(
            id=IDS["criterion_preparation"],
            qualification_id=qualification.id,
            code="DEMO-01",
            description="Explain safe preparation, material selection, and accurate measurement for a small joinery job.",
            mandatory=True,
            requires_practical=False,
        ),
        Criterion(
            id=IDS["criterion_work_sample"],
            qualification_id=qualification.id,
            code="DEMO-02",
            description="Provide a work sample showing a neat, square timber joint and describe the steps taken.",
            mandatory=True,
            requires_practical=False,
        ),
        Criterion(
            id=IDS["criterion_practical"],
            qualification_id=qualification.id,
            code="DEMO-03",
            description="Demonstrate safe hand-tool handling and explain how the finished joint was checked.",
            mandatory=True,
            requires_practical=True,
        ),
    ]
    task = ApprovedTask(
        id=IDS["task"],
        qualification_id=qualification.id,
        criterion_id=criteria[2].id,
        title="Synthetic hand-tool and joint-check demonstration",
        instructions="For the local judge walkthrough only. Submit a synthetic description and sample file demonstrating safe tool handling and a finished-joint check.",
        rubric="Satisfactory when the worker explains safe tool handling, describes a plausible sequence, and identifies a check of the finished joint. This synthetic rubric is not an official standard.",
        source_name="Synthetic local demo rubric; approved only in this demo dataset, not official",
        source_url="",
        official=False,
        approved=True,
    )
    db.add_all(accounts)
    await db.flush()
    db.add(
        WorkerProfile(
            id=IDS["profile"],
            user_id=worker.id,
            trade="Carpentry (synthetic demo)",
            experience_years=6,
            service_area="Raipur (demo area)",
            bio="Synthetic local demonstration profile; no real worker information.",
            available=True,
        )
    )
    await db.flush()
    db.add_all(
        [
            DeclaredSkill(
                id=IDS["skill_joinery"],
                worker_id=IDS["profile"],
                name="Joinery (self-declared demo)",
                years_experience=5,
            ),
            DeclaredSkill(
                id=IDS["skill_measurement"],
                worker_id=IDS["profile"],
                name="Timber measurement (self-declared demo)",
                years_experience=4,
            ),
        ]
    )
    db.add(qualification)
    await db.flush()
    db.add_all(criteria)
    await db.flush()
    db.add_all(
        [
            task,
            AssessmentCase(
                id=IDS["case"],
                worker_id=IDS["profile"],
                qualification_id=qualification.id,
                status="IN_PROGRESS",
            ),
            AuditEvent(
                id=IDS["audit"],
                actor_id=admin.id,
                action="demo.seed.created",
                entity_type="demo_seed",
                entity_id=IDS["audit"],
                details=json.dumps(
                    {"classification": "synthetic local demo", "seed_version": DEMO_SEED_VERSION}
                ),
            ),
        ]
    )
    await db.flush()
    return True


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Seed an isolated local CraftRelay judge demo")
    parser.add_argument(
        "--database-url", required=True, help="Dedicated SQLite URL under backend/.tmp"
    )
    parser.add_argument(
        "--confirm-demo-data",
        action="store_true",
        help="Explicitly authorize insertion of synthetic demo identities and catalogue data",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    backend_root = Path(__file__).resolve().parents[1]
    os.chdir(backend_root)

    from app.settings import Settings

    settings = Settings()
    password = os.environ.get("DEMO_PASSWORD")
    try:
        database_url, database_path = validate_options(
            app_env=settings.app_env,
            confirmed=args.confirm_demo_data,
            password=password,
            database_url=args.database_url,
            backend_root=backend_root,
        )
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc

    from alembic import command
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    config = Config(str(backend_root / "alembic.ini"))
    head = ScriptDirectory.from_config(config).get_current_head()
    state = existing_database_state(database_path, head)
    if state == "complete":
        print(f"Synthetic judge demo already exists at {database_path}; no records were changed.")
        return 0
    if state == "unsafe":
        raise SystemExit(
            "Demo target contains unrecognized or partial data. Nothing was changed; choose a new "
            "dedicated demo database filename under backend/.tmp."
        )

    database_path.parent.mkdir(parents=True, exist_ok=True)
    os.environ["DATABASE_URL"] = database_url
    from app.settings import get_settings

    get_settings.cache_clear()
    command.upgrade(config, "head")

    async def seed() -> bool:
        from app.db import SessionLocal, engine

        try:
            async with SessionLocal() as session, session.begin():
                return await seed_demo_records(session, password)
        finally:
            await engine.dispose()

    inserted = asyncio.run(seed())
    if inserted:
        print(
            "Synthetic demo created. Sign-in emails: "
            + ", ".join(DEMO_EMAILS.values())
            + f". Password was read from DEMO_PASSWORD and was not printed. Database: {database_path}"
        )
    else:
        print(f"Synthetic judge demo already exists at {database_path}; no records were changed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
