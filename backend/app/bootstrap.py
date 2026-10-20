import asyncio

from pwdlib import PasswordHash
from sqlalchemy import select

from app.db import Base, SessionLocal, engine
from app.models import ApprovedTask, Criterion, Qualification, User
from app.settings import get_settings


async def main():
    settings = get_settings()
    if settings.app_env != "development":
        raise SystemExit(
            "app.bootstrap is for local development only; use Alembic and an approved "
            "production administrator-provisioning procedure."
        )
    if engine.url.drivername != "sqlite+aiosqlite":
        raise SystemExit("app.bootstrap may only use a local SQLite database")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    email = settings.bootstrap_admin_email.strip().lower()
    password = settings.bootstrap_admin_password
    if not email or not password:
        raise SystemExit(
            "Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD before running bootstrap."
        )
    if len(password) < 12:
        raise SystemExit("Bootstrap password must be at least 12 characters.")
    async with SessionLocal() as db:
        admin = await db.scalar(select(User).where(User.email == email))
        if admin and (admin.role != "admin" or not admin.active):
            raise SystemExit(
                "The bootstrap email already belongs to a non-admin or inactive account; "
                "choose a distinct BOOTSTRAP_ADMIN_EMAIL."
            )
        if not admin:
            db.add(
                User(
                    email=email,
                    full_name=settings.bootstrap_admin_name,
                    password_hash=PasswordHash.recommended().hash(password),
                    role="admin",
                )
            )
        q = await db.scalar(
            select(Qualification).where(
                Qualification.code == "DEMO-CRAFT-001", Qualification.version == "1.0"
            )
        )
        if not q:
            q = Qualification(
                code="DEMO-CRAFT-001",
                version="1.0",
                title="Illustrative Craft Trade Demonstration",
                source_name="CraftRelay local demonstration; not an official qualification",
                source_url="",
                official=False,
            )
            db.add(q)
            await db.flush()
            criteria = [
                Criterion(
                    qualification_id=q.id,
                    code="DEMO-01",
                    description="Describe the work process and safe preparation for a typical craft task",
                    mandatory=True,
                ),
                Criterion(
                    qualification_id=q.id,
                    code="DEMO-02",
                    description="Show a completed work sample or customer reference that demonstrates workmanship",
                    mandatory=True,
                ),
                Criterion(
                    qualification_id=q.id,
                    code="DEMO-03",
                    description="Demonstrate use and care of relevant hand tools",
                    mandatory=True,
                    requires_practical=True,
                ),
            ]
            db.add_all(criteria)
            await db.flush()
            db.add(
                ApprovedTask(
                    qualification_id=q.id,
                    criterion_id=criteria[2].id,
                    title="Illustrative hand-tool demonstration",
                    instructions="For local product demonstration only. An assessor must use an approved, sourced task before official assessment.",
                    rubric="No official rubric. Configure only after authoritative task and rubric source review.",
                    approved=False,
                )
            )
        await db.commit()
        print(
            f"Admin account ready: {email}; illustrative qualification available: {q.code} v{q.version} (official={q.official})."
        )
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
