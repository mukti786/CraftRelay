import asyncio
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi.testclient import TestClient
from pwdlib import PasswordHash
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker

import app.db as dbmod
from app import bootstrap, main
from app.db import get_db
from app.main import app
from app.models import (
    AuditEvent,
    Competency,
    Criterion,
    CriterionDecision,
    DeclaredSkill,
    Qualification,
    User,
    WorkerProfile,
)
from app.settings import Settings, validate_settings


@pytest.fixture
def client(tmp_path, monkeypatch):
    db_path = tmp_path / "integration.db"
    test_engine = dbmod.create_database_engine(f"sqlite+aiosqlite:///{db_path}")
    sessions = async_sessionmaker(test_engine, expire_on_commit=False)
    monkeypatch.setattr(main, "engine", test_engine)
    monkeypatch.setattr(dbmod, "SessionLocal", sessions)
    monkeypatch.setattr(main.settings, "evidence_dir", str(tmp_path / "evidence"))

    async def override_db():
        async with sessions() as session:
            yield session

    app.dependency_overrides[get_db] = override_db

    async def create_test_schema():
        async with test_engine.begin() as connection:
            await connection.run_sync(dbmod.Base.metadata.create_all)

    asyncio.run(create_test_schema())
    with TestClient(app, headers={"Origin": "http://localhost:5173"}) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    asyncio.run(test_engine.dispose())


def test_role_workflows_preserve_assessor_authority_and_review_separation(client):
    worker = client.post(
        "/api/auth/register",
        json={
            "full_name": "Asha Worker",
            "email": "asha@example.com",
            "password": "worker-pass-123",
            "role": "worker",
        },
    )
    assert worker.status_code == 200, worker.text
    assert client.get("/api/health").json()["status"] == "ok"
    worker.json()["id"]
    assert client.get("/api/admin/overview").status_code == 403
    assert (
        client.post(
            "/api/auth/register",
            json={
                "full_name": "Bad Role",
                "email": "bad@example.com",
                "password": "worker-pass-123",
                "role": "assessor",
            },
        ).status_code
        == 422
    )

    async def create_data():
        async with dbmod.SessionLocal() as session:
            q = Qualification(
                code="DEMO-T",
                version="1",
                title="Illustrative Trade",
                source_name="Local demo; not official",
                official=False,
            )
            session.add(q)
            await session.flush()
            criteria = [
                Criterion(
                    qualification_id=q.id,
                    code=f"C{i}",
                    description=f"Show practical evidence for criterion {i}",
                    mandatory=True,
                )
                for i in range(1, 4)
            ]
            session.add_all(criteria)
            admin = User(
                email="admin@example.com",
                full_name="CraftRelay Admin",
                password_hash=PasswordHash.recommended().hash("admin-pass-123"),
                role="admin",
            )
            session.add(admin)
            assessor = User(
                email="assessor@example.com",
                full_name="Ravi Assessor",
                password_hash=PasswordHash.recommended().hash("assessor-pass-123"),
                role="assessor",
            )
            session.add(assessor)
            await session.commit()
            return q.id, [c.id for c in criteria]

    qualification_id, criterion_ids = asyncio.run(create_data())
    assert client.get("/api/customers/workers").json() == []
    case_resp = client.post("/api/worker/cases", json={"qualification_id": qualification_id})
    assert case_resp.status_code == 200
    case_id = case_resp.json()["id"]
    assert client.post(f"/api/worker/cases/{case_id}/submit").status_code == 409

    evidence_ids = []
    for criterion_id in criterion_ids:
        response = client.post(
            f"/api/worker/cases/{case_id}/evidence",
            data={"criterion_id": criterion_id, "description": "Work sample and explanation"},
            files={"file": ("sample.pdf", b"%PDF-1.4\nprivate sample", "application/pdf")},
        )
        assert response.status_code == 200
        evidence_ids.append(response.json()["id"])
    assert client.post(f"/api/worker/cases/{case_id}/submit").json()["status"] == "SUBMITTED"

    client.post("/api/auth/logout")
    assert (
        client.post(
            "/api/auth/login",
            json={"email": "assessor@example.com", "password": "assessor-pass-123"},
        ).status_code
        == 200
    )
    queue = client.get("/api/assessor/cases")
    assert queue.status_code == 200 and len(queue.json()) == 1
    assert client.post(f"/api/assessor/cases/{case_id}/verify").status_code == 409
    assert client.get(f"/api/evidence/{evidence_ids[0]}/file").status_code == 200
    for criterion_id in criterion_ids:
        decision = client.put(
            f"/api/assessor/cases/{case_id}/criteria/{criterion_id}",
            json={"result": "COMPETENT", "notes": "Reviewed against this version's criterion."},
        )
        assert decision.status_code == 200
    assert client.post(f"/api/assessor/cases/{case_id}/verify").json()["verified"] is True

    client.post("/api/auth/logout")
    customer = client.post(
        "/api/auth/register",
        json={
            "full_name": "Mina Customer",
            "email": "mina@example.com",
            "password": "customer-pass-123",
            "role": "customer",
        },
    )
    assert customer.status_code == 200
    customer_id = customer.json()["id"]
    assert client.get(f"/api/evidence/{evidence_ids[0]}/file").status_code == 403
    discovery = client.get("/api/customers/workers")
    assert (
        discovery.status_code == 200
        and discovery.json()[0]["verified_qualifications"][0]["title"] == "Illustrative Trade"
    )
    profile_id = discovery.json()[0]["id"]
    request = client.post(
        "/api/customer/requests",
        json={"worker_id": profile_id, "description": "Repair a wooden door", "location": "Raipur"},
    )
    assert request.status_code == 200
    request_id = request.json()["id"]

    client.post("/api/auth/logout")
    client.post(
        "/api/auth/login", json={"email": "asha@example.com", "password": "worker-pass-123"}
    )
    assert (
        client.patch(f"/api/requests/{request_id}", json={"status": "ACCEPTED"}).status_code == 200
    )
    assert (
        client.patch(f"/api/requests/{request_id}", json={"status": "COMPLETED"}).status_code == 200
    )
    client.post("/api/auth/logout")
    client.post(
        "/api/auth/login", json={"email": "mina@example.com", "password": "customer-pass-123"}
    )
    assert (
        client.post(
            f"/api/customer/requests/{request_id}/review",
            json={"rating": 5, "comment": "Clear communication and good service."},
        ).status_code
        == 200
    )
    assert (
        client.post(f"/api/customer/requests/{request_id}/review", json={"rating": 1}).status_code
        == 409
    )

    async def check_review_did_not_create_competency():
        async with dbmod.SessionLocal() as session:
            from sqlalchemy import func, select

            from app.models import AuditEvent, Competency, CustomerReview

            return (
                (await session.scalar(select(func.count()).select_from(Competency))),
                (await session.scalar(select(func.count()).select_from(CustomerReview))),
                (await session.scalar(select(func.count()).select_from(AuditEvent))),
            )

    competencies, reviews, audit_count = asyncio.run(check_review_did_not_create_competency())
    assert competencies == 1 and reviews == 1 and audit_count >= 9

    client.post("/api/auth/logout")
    assert (
        client.post(
            "/api/auth/login", json={"email": "admin@example.com", "password": "admin-pass-123"}
        ).status_code
        == 200
    )
    assert client.get("/api/admin/overview").status_code == 200
    assert client.get("/api/admin/audit").status_code == 200
    role_change = client.patch(f"/api/admin/users/{customer_id}/role", json={"role": "assessor"})
    assert role_change.status_code == 200 and role_change.json()["role"] == "assessor"
    official_without_source = client.post(
        "/api/admin/qualifications",
        json={
            "code": "OFFICIAL-X",
            "version": "1",
            "title": "Unsourced",
            "source_name": "Unknown",
            "official": True,
        },
    )
    assert official_without_source.status_code == 422


def test_registration_login_password_hash_duplicates_and_session_lifecycle(client, monkeypatch):
    registered = client.post(
        "/api/auth/register",
        json={
            "full_name": "Asha Worker",
            "email": "auth-check@example.com",
            "password": "secure-worker-pass",
            "role": "worker",
        },
    )
    assert registered.status_code == 200
    assert client.get("/api/auth/me").json()["id"] == registered.json()["id"]
    cookie_header = registered.headers["set-cookie"].lower()
    assert "httponly" in cookie_header and "samesite=lax" in cookie_header
    assert "path=/" in cookie_header and "max-age=3600" in cookie_header
    assert "secure" not in cookie_header  # development uses local HTTP

    async def check_hash():
        async with dbmod.SessionLocal() as session:
            user = await session.get(User, registered.json()["id"])
            assert user is not None
            assert user.password_hash != "secure-worker-pass"
            assert PasswordHash.recommended().verify("secure-worker-pass", user.password_hash)
            return user.password_hash

    assert asyncio.run(check_hash())
    duplicate = client.post(
        "/api/auth/register",
        json={
            "full_name": "Duplicate Worker",
            "email": "AUTH-CHECK@example.com",
            "password": "secure-worker-pass",
            "role": "worker",
        },
    )
    assert duplicate.status_code == 409
    assert (
        client.post(
            "/api/auth/login",
            json={"email": "auth-check@example.com", "password": "wrong-password"},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/auth/login",
            json={"email": "AUTH-CHECK@example.com", "password": "secure-worker-pass"},
        ).status_code
        == 200
    )

    logout = client.post("/api/auth/logout")
    deleted_cookie = logout.headers["set-cookie"].lower()
    assert "max-age=0" in deleted_cookie and "httponly" in deleted_cookie
    assert "path=/" in deleted_cookie and "samesite=lax" in deleted_cookie
    assert client.get("/api/auth/me").status_code == 401

    client.cookies.clear()
    client.cookies.set(main.COOKIE, "not-a-signed-session")
    assert client.get("/api/auth/me").status_code == 401
    expired = jwt.encode(
        {"sub": registered.json()["id"], "exp": datetime.now(UTC) - timedelta(minutes=1)},
        main.settings.secret_key,
        algorithm=main.ALGORITHM,
    )
    client.cookies.set(main.COOKIE, expired)
    assert client.get("/api/auth/me").status_code == 401
    missing_subject = jwt.encode(
        {"exp": datetime.now(UTC) + timedelta(minutes=2)},
        main.settings.secret_key,
        algorithm=main.ALGORITHM,
    )
    client.cookies.set(main.COOKIE, missing_subject)
    assert client.get("/api/auth/me").status_code == 401
    monkeypatch.setattr(main.settings, "app_env", "production")
    production_login = client.post(
        "/api/auth/login",
        json={"email": "auth-check@example.com", "password": "secure-worker-pass"},
    )
    assert "secure" in production_login.headers["set-cookie"].lower()


def test_cookie_mutations_require_a_trusted_origin(client):
    payload = {
        "full_name": "Origin Check",
        "email": "origin-check@example.com",
        "password": "secure-worker-pass",
        "role": "worker",
    }
    assert (
        client.post("/api/auth/register", json=payload, headers={"Origin": ""}).status_code == 403
    )
    no_origin_client = TestClient(app)
    assert no_origin_client.post("/api/auth/register", json=payload).status_code == 403
    assert (
        client.post(
            "/api/auth/register", json=payload, headers={"Origin": "https://untrusted.example"}
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/auth/register", json=payload, headers={"Origin": "http://localhost:5173"}
        ).status_code
        == 200
    )


def test_privileged_signup_rejection_inactive_users_and_live_role_checks(client):
    for role, email in (("assessor", "no-assessor@example.com"), ("admin", "no-admin@example.com")):
        response = client.post(
            "/api/auth/register",
            json={
                "full_name": "Not Privileged",
                "email": email,
                "password": "secure-worker-pass",
                "role": role,
            },
        )
        assert response.status_code == 422

    worker = client.post(
        "/api/auth/register",
        json={
            "full_name": "Role Change Worker",
            "email": "role-change@example.com",
            "password": "secure-worker-pass",
            "role": "worker",
        },
    )
    worker_id = worker.json()["id"]
    worker_client = TestClient(app, headers={"Origin": "http://localhost:5173"})
    worker_client.cookies.update(client.cookies)

    async def seed_admin():
        async with dbmod.SessionLocal() as session:
            admin = User(
                email="role-admin@example.com",
                full_name="Role Admin",
                password_hash=PasswordHash.recommended().hash("secure-admin-password"),
                role="admin",
            )
            session.add(admin)
            await session.commit()

    asyncio.run(seed_admin())
    admin_client = TestClient(app, headers={"Origin": "http://localhost:5173"})
    assert (
        admin_client.post(
            "/api/auth/login",
            json={"email": "role-admin@example.com", "password": "secure-admin-password"},
        ).status_code
        == 200
    )

    promoted = admin_client.patch(f"/api/admin/users/{worker_id}/role", json={"role": "assessor"})
    assert promoted.status_code == 200
    assert worker_client.get("/api/worker/profile").status_code == 403
    assert worker_client.get("/api/assessor/cases").status_code == 200

    deactivated = admin_client.patch(f"/api/admin/users/{worker_id}", json={"active": False})
    assert deactivated.status_code == 200
    assert worker_client.get("/api/assessor/cases").status_code == 401
    assert (
        worker_client.post(
            "/api/auth/login",
            json={"email": "role-change@example.com", "password": "secure-worker-pass"},
        ).status_code
        == 401
    )


def test_worker_ownership_is_enforced_for_cases_and_private_evidence(client):
    first_worker = client.post(
        "/api/auth/register",
        json={
            "full_name": "Owner Worker",
            "email": "owner@example.com",
            "password": "secure-worker-pass",
            "role": "worker",
        },
    )
    assert first_worker.status_code == 200

    async def seed_qualification():
        async with dbmod.SessionLocal() as session:
            q = Qualification(
                code="OWNERSHIP-T",
                version="1",
                title="Ownership test",
                source_name="Test fixture; not official",
                official=False,
            )
            session.add(q)
            await session.flush()
            criterion = Criterion(
                qualification_id=q.id,
                code="OWNERSHIP-1",
                description="Submit a work sample for the ownership test",
            )
            session.add(criterion)
            await session.commit()
            return q.id, criterion.id

    qualification_id, criterion_id = asyncio.run(seed_qualification())
    case = client.post("/api/worker/cases", json={"qualification_id": qualification_id})
    assert case.status_code == 200
    evidence = client.post(
        f"/api/worker/cases/{case.json()['id']}/evidence",
        data={"criterion_id": criterion_id, "description": "Private evidence owned by worker one"},
        files={"file": ("sample.pdf", b"%PDF-1.4\nprivate", "application/pdf")},
    )
    assert evidence.status_code == 200

    second_worker = TestClient(app, headers={"Origin": "http://localhost:5173"})
    registered = second_worker.post(
        "/api/auth/register",
        json={
            "full_name": "Other Worker",
            "email": "other-worker@example.com",
            "password": "secure-worker-pass",
            "role": "worker",
        },
    )
    assert registered.status_code == 200
    case_id = case.json()["id"]
    evidence_id = evidence.json()["id"]
    assert second_worker.post(f"/api/worker/cases/{case_id}/submit").status_code == 404
    assert (
        second_worker.post(
            f"/api/worker/cases/{case_id}/evidence",
            data={"criterion_id": criterion_id, "description": "Attempt to attach evidence"},
            files={"file": ("sample.pdf", b"%PDF-1.4\nattempt", "application/pdf")},
        ).status_code
        == 404
    )
    assert second_worker.get(f"/api/evidence/{evidence_id}/file").status_code == 403


def test_worker_profile_and_skill_declarations_are_owned_and_not_verified(client):
    worker = client.post(
        "/api/auth/register",
        json={
            "full_name": "Profile Owner",
            "email": "profile-owner@example.com",
            "password": "secure-worker-pass",
            "role": "worker",
        },
    )
    assert worker.status_code == 200
    updated = client.put(
        "/api/worker/profile",
        json={
            "trade": "  Carpentry  ",
            "experience_years": 7,
            "service_area": "  Raipur  ",
            "bio": "  Furniture repair and fitting.  ",
            "available": True,
        },
    )
    assert updated.status_code == 200
    skill = client.post("/api/worker/skills", json={"name": "  Joinery  ", "years_experience": 5})
    assert skill.status_code == 200
    assert skill.json()["name"] == "Joinery"
    assert client.post("/api/worker/skills", json={"name": "   "}).status_code == 422

    profile = client.get("/api/worker/profile").json()
    assert profile["trade"] == "Carpentry"
    assert profile["service_area"] == "Raipur"
    assert profile["bio"] == "Furniture repair and fitting."
    assert profile["skills"] == [
        {"id": skill.json()["id"], "name": "Joinery", "years_experience": 5}
    ]
    assert profile["verified_qualifications"] == []

    other_worker = TestClient(app, headers={"Origin": "http://localhost:5173"})
    assert (
        other_worker.post(
            "/api/auth/register",
            json={
                "full_name": "Another Worker",
                "email": "another-profile@example.com",
                "password": "secure-worker-pass",
                "role": "worker",
            },
        ).status_code
        == 200
    )
    assert other_worker.get("/api/worker/profile").json()["skills"] == []
    assert other_worker.delete(f"/api/worker/skills/{skill.json()['id']}").status_code == 404
    assert client.get("/api/worker/profile").json()["skills"][0]["id"] == skill.json()["id"]

    client.post("/api/auth/logout")
    customer = client.post(
        "/api/auth/register",
        json={
            "full_name": "Profile Customer",
            "email": "profile-customer@example.com",
            "password": "secure-customer-pass",
            "role": "customer",
        },
    )
    assert customer.status_code == 200
    assert client.get("/api/worker/profile").status_code == 403
    assert client.put("/api/worker/profile", json={"trade": "Changed"}).status_code == 403


def test_evidence_upload_validates_size_type_signature_and_persists_privately(
    client, tmp_path, monkeypatch
):
    worker = client.post(
        "/api/auth/register",
        json={
            "full_name": "Evidence Worker",
            "email": "evidence-worker@example.com",
            "password": "secure-worker-pass",
            "role": "worker",
        },
    )
    assert worker.status_code == 200

    async def seed_qualification():
        async with dbmod.SessionLocal() as session:
            qualification = Qualification(
                code="UPLOAD-T",
                version="1",
                title="Upload fixture",
                source_name="Test fixture; not official",
                official=False,
            )
            session.add(qualification)
            await session.flush()
            criterion = Criterion(
                qualification_id=qualification.id,
                code="UPLOAD-1",
                description="Provide a safe sample file",
            )
            session.add(criterion)
            await session.commit()
            return qualification.id, criterion.id

    qualification_id, criterion_id = asyncio.run(seed_qualification())
    case = client.post("/api/worker/cases", json={"qualification_id": qualification_id})
    assert case.status_code == 200
    case_id = case.json()["id"]
    monkeypatch.setattr(main.settings, "max_upload_bytes", 16)

    def upload(filename, content, content_type):
        return client.post(
            f"/api/worker/cases/{case_id}/evidence",
            data={"criterion_id": criterion_id, "description": "A private work sample"},
            files={"file": (filename, content, content_type)},
        )

    assert upload("note.txt", b"plain text", "text/plain").status_code == 415
    assert upload("fake.pdf", b"not a PDF", "application/pdf").status_code == 415
    assert upload("empty.pdf", b"", "application/pdf").status_code == 413
    assert upload("large.pdf", b"%PDF-1.4\n0123456789", "application/pdf").status_code == 413

    valid_content = b"%PDF-1.4\n12345"
    saved = upload("folder\\private.pdf", valid_content, "application/pdf")
    assert saved.status_code == 200, saved.text
    assert saved.json()["review_status"] == "PENDING"
    evidence_id = saved.json()["id"]
    evidence_path = next((tmp_path / "evidence").glob("*.pdf"))
    assert evidence_path.read_bytes() == valid_content
    assert evidence_path.name != "private.pdf"
    retrieved = client.get(f"/api/evidence/{evidence_id}/file")
    assert retrieved.status_code == 200
    assert retrieved.content == valid_content

    async def stored_metadata():
        async with dbmod.SessionLocal() as session:
            from sqlalchemy import select

            from app.models import Evidence

            item = await session.scalar(select(Evidence).where(Evidence.id == evidence_id))
            return item.worker_id, item.sha256, item.size_bytes, item.review_status

    from hashlib import sha256

    worker_profile = client.get("/api/worker/profile").json()
    metadata = asyncio.run(stored_metadata())
    assert metadata == (
        worker_profile["id"],
        sha256(valid_content).hexdigest(),
        len(valid_content),
        "PENDING",
    )


def test_qualification_catalogue_is_versioned_and_case_keeps_selected_version(client):
    worker = client.post(
        "/api/auth/register",
        json={
            "full_name": "Catalogue Worker",
            "email": "catalogue-worker@example.com",
            "password": "secure-worker-pass",
            "role": "worker",
        },
    )
    assert worker.status_code == 200

    async def seed_catalogue():
        async with dbmod.SessionLocal() as session:
            first = Qualification(
                code="CATALOGUE-T",
                version="1.0",
                title="Illustrative Joinery Skills",
                source_name="CraftRelay test fixture; not official",
                official=False,
            )
            session.add(first)
            await session.flush()
            old_criterion = Criterion(
                qualification_id=first.id,
                code="J-01",
                description="Measure and mark material accurately",
                mandatory=True,
            )
            optional_criterion = Criterion(
                qualification_id=first.id,
                code="J-02",
                description="Describe optional finishing methods",
                mandatory=False,
            )
            session.add_all([old_criterion, optional_criterion])
            second = Qualification(
                code="CATALOGUE-T",
                version="2.0",
                title="Illustrative Joinery Skills",
                source_name="CraftRelay test fixture; not official",
                official=False,
            )
            session.add(second)
            session.add(
                User(
                    email="catalogue-admin@example.com",
                    full_name="Catalogue Administrator",
                    password_hash=PasswordHash.recommended().hash("secure-admin-pass"),
                    role="admin",
                )
            )
            await session.commit()
            return first.id, second.id, old_criterion.id

    first_id, second_id, criterion_id = asyncio.run(seed_catalogue())
    catalogue = client.get("/api/qualifications")
    assert catalogue.status_code == 200
    versions = [row for row in catalogue.json() if row["code"] == "CATALOGUE-T"]
    assert {(row["id"], row["version"]) for row in versions} == {
        (first_id, "1.0"),
        (second_id, "2.0"),
    }
    first = client.get(f"/api/qualifications/{first_id}")
    assert first.status_code == 200
    assert first.json()["source_name"] == "CraftRelay test fixture; not official"
    assert first.json()["official"] is False
    assert [
        (criterion["id"], criterion["mandatory"]) for criterion in first.json()["criteria"]
    ] == [
        (criterion_id, True),
        (first.json()["criteria"][1]["id"], False),
    ]
    assert client.get("/api/qualifications/not-a-version").status_code == 404

    case = client.post("/api/worker/cases", json={"qualification_id": first_id})
    assert case.status_code == 200
    persisted = client.get("/api/worker/cases").json()[0]
    assert persisted["qualification"]["id"] == first_id
    assert persisted["qualification"]["version"] == "1.0"
    assert persisted["criteria"][0]["mandatory"] is True
    assert persisted["criteria"][1]["mandatory"] is False

    admin_client = TestClient(app, headers={"Origin": "http://localhost:5173"})
    assert (
        admin_client.post(
            "/api/auth/login",
            json={"email": "catalogue-admin@example.com", "password": "secure-admin-pass"},
        ).status_code
        == 200
    )
    duplicate_version = admin_client.post(
        "/api/admin/qualifications",
        json={
            "code": "CATALOGUE-T",
            "version": "1.0",
            "title": "Duplicate version",
            "source_name": "Test fixture; not official",
            "official": False,
        },
    )
    assert duplicate_version.status_code == 409
    duplicate_criterion = admin_client.post(
        f"/api/admin/qualifications/{first_id}/criteria",
        json={"code": "J-01", "description": "Duplicate criterion", "mandatory": True},
    )
    assert duplicate_criterion.status_code == 409


def test_worker_cannot_change_evidence_or_resubmit_after_submission(client):
    client.post(
        "/api/auth/register",
        json={
            "full_name": "Transition Worker",
            "email": "transition-worker@example.com",
            "password": "secure-worker-pass",
            "role": "worker",
        },
    )

    async def seed_qualification():
        async with dbmod.SessionLocal() as session:
            qualification = Qualification(
                code="TRANSITION-T",
                version="1",
                title="Transition fixture",
                source_name="Test fixture; not official",
                official=False,
            )
            session.add(qualification)
            await session.flush()
            criterion = Criterion(
                qualification_id=qualification.id,
                code="T-1",
                description="Provide a sample before submitting",
                mandatory=True,
            )
            session.add(criterion)
            await session.commit()
            return qualification.id, criterion.id

    qualification_id, criterion_id = asyncio.run(seed_qualification())
    case = client.post("/api/worker/cases", json={"qualification_id": qualification_id})
    case_id = case.json()["id"]
    file_data = {"file": ("sample.pdf", b"%PDF-1.4\nsample", "application/pdf")}
    evidence = client.post(
        f"/api/worker/cases/{case_id}/evidence",
        data={"criterion_id": criterion_id, "description": "A work sample"},
        files=file_data,
    )
    assert evidence.status_code == 200
    submission = client.post(f"/api/worker/cases/{case_id}/submit")
    assert submission.status_code == 200 and submission.json()["status"] == "SUBMITTED"
    assert client.post(f"/api/worker/cases/{case_id}/submit").status_code == 409
    blocked_upload = client.post(
        f"/api/worker/cases/{case_id}/evidence",
        data={"criterion_id": criterion_id, "description": "A second work sample"},
        files={"file": ("sample.pdf", b"%PDF-1.4\nsecond", "application/pdf")},
    )
    assert blocked_upload.status_code == 409
    case_row = client.get("/api/worker/cases").json()[0]
    assert case_row["status"] == "SUBMITTED"
    assert len(case_row["evidence"]) == 1
    assert case_row["evidence"][0]["review_status"] == "PENDING"


def test_worker_can_resubmit_only_after_assessor_requests_more_evidence(client):
    client.post(
        "/api/auth/register",
        json={
            "full_name": "Resubmission Worker",
            "email": "resubmission-worker@example.com",
            "password": "secure-worker-pass",
            "role": "worker",
        },
    )

    async def seed_qualification():
        async with dbmod.SessionLocal() as session:
            qualification = Qualification(
                code="RESUBMIT-T",
                version="1",
                title="Resubmission fixture",
                source_name="Test fixture; not official",
                official=False,
            )
            session.add(qualification)
            await session.flush()
            criterion = Criterion(
                qualification_id=qualification.id,
                code="R-1",
                description="Show a clear example of this required skill",
                mandatory=True,
            )
            session.add(criterion)
            assessor = User(
                email="resubmission-assessor@example.com",
                full_name="Authorized Assessor",
                password_hash=PasswordHash.recommended().hash("secure-assessor-pass"),
                role="assessor",
            )
            session.add(assessor)
            await session.commit()
            return qualification.id, criterion.id

    qualification_id, criterion_id = asyncio.run(seed_qualification())
    case = client.post("/api/worker/cases", json={"qualification_id": qualification_id})
    case_id = case.json()["id"]

    def upload_evidence(name: str, content: bytes):
        return client.post(
            f"/api/worker/cases/{case_id}/evidence",
            data={"criterion_id": criterion_id, "description": name},
            files={"file": (f"{name}.pdf", content, "application/pdf")},
        )

    first = upload_evidence("First sample", b"%PDF-1.4\nfirst")
    assert first.status_code == 200
    assert client.post(f"/api/worker/cases/{case_id}/submit").status_code == 200

    client.post("/api/auth/logout")
    assessor_login = client.post(
        "/api/auth/login",
        json={"email": "resubmission-assessor@example.com", "password": "secure-assessor-pass"},
    )
    assert assessor_login.status_code == 200
    reviewed = client.patch(
        f"/api/assessor/evidence/{first.json()['id']}",
        json={"status": "NEEDS_MORE", "notes": "Please provide a clearer example."},
    )
    assert reviewed.status_code == 200
    assert client.get("/api/assessor/cases").json() == []
    assert (
        client.patch(
            f"/api/assessor/evidence/{first.json()['id']}",
            json={"status": "ACCEPTED", "notes": "Too late for this submission."},
        ).status_code
        == 409
    )
    assert (
        client.put(
            f"/api/assessor/cases/{case_id}/criteria/{criterion_id}",
            json={"result": "COMPETENT", "notes": "This submission has not been reviewed."},
        ).status_code
        == 409
    )

    client.post("/api/auth/logout")
    client.post(
        "/api/auth/login",
        json={"email": "resubmission-worker@example.com", "password": "secure-worker-pass"},
    )
    case_row = client.get("/api/worker/cases").json()[0]
    assert case_row["status"] == "NEEDS_MORE"
    second = upload_evidence("Replacement sample", b"%PDF-1.4\nreplacement")
    assert second.status_code == 200
    resubmission = client.post(f"/api/worker/cases/{case_id}/submit")
    assert resubmission.status_code == 200
    assert resubmission.json()["status"] == "SUBMITTED"
    case_row = client.get("/api/worker/cases").json()[0]
    assert {item["review_status"] for item in case_row["evidence"]} == {"NEEDS_MORE", "PENDING"}

    client.post("/api/auth/logout")
    client.post(
        "/api/auth/login",
        json={"email": "resubmission-assessor@example.com", "password": "secure-assessor-pass"},
    )
    assert len(client.get("/api/assessor/cases").json()) == 1


def test_sqlite_enables_foreign_keys_and_rejects_orphan_rows(client):
    async def verify_integrity():
        async with dbmod.SessionLocal() as session:
            enabled = await session.scalar(text("PRAGMA foreign_keys"))
            assert enabled == 1
            with pytest.raises(IntegrityError):
                await session.execute(
                    text(
                        "INSERT INTO declared_skills "
                        "(id, worker_id, name, years_experience, created_at) "
                        "VALUES ('orphan', 'missing-profile', 'Sample skill', 0, CURRENT_TIMESTAMP)"
                    )
                )
                await session.commit()
            await session.rollback()

    asyncio.run(verify_integrity())


def test_production_configuration_rejects_missing_weak_secrets_and_wildcard_cors():
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        validate_settings(Settings(app_env="production", secret_key=""))
    with pytest.raises(RuntimeError, match="high-entropy"):
        validate_settings(
            Settings(app_env="production", secret_key="x" * 48, cors_origins="https://app.example")
        )
    with pytest.raises(RuntimeError, match="explicit trusted origins"):
        validate_settings(
            Settings(
                app_env="production",
                secret_key="aB3dE5gH7jK9mN2pQ4sT6vX8zA0cD1fG",
                cors_origins="*",
            )
        )
    assert (
        validate_settings(
            Settings(
                app_env="production",
                secret_key="aB3dE5gH7jK9mN2pQ4sT6vX8zA0cD1fG",
                cors_origins="https://app.example",
            )
        ).app_env
        == "production"
    )


def test_bootstrap_refuses_to_promote_an_existing_non_admin(client, monkeypatch):
    user = client.post(
        "/api/auth/register",
        json={
            "full_name": "Existing Worker",
            "email": "existing-worker@example.com",
            "password": "secure-worker-pass",
            "role": "worker",
        },
    )
    assert user.status_code == 200
    monkeypatch.setattr(bootstrap, "engine", main.engine)
    monkeypatch.setattr(bootstrap, "SessionLocal", dbmod.SessionLocal)
    monkeypatch.setattr(
        bootstrap,
        "get_settings",
        lambda: Settings(
            app_env="development",
            secret_key="test-only-secret",
            bootstrap_admin_email="existing-worker@example.com",
            bootstrap_admin_password="long-test-only-password",
        ),
    )
    with pytest.raises(SystemExit, match="distinct BOOTSTRAP_ADMIN_EMAIL"):
        asyncio.run(bootstrap.main())


def _prepare_assessor_case(client, code: str):
    worker = client.post(
        "/api/auth/register",
        json={
            "full_name": "Assessor Test Worker",
            "email": f"worker-{code.lower()}@example.com",
            "password": "secure-worker-pass",
            "role": "worker",
        },
    )
    assert worker.status_code == 200, worker.text
    worker_id = worker.json()["id"]

    async def seed():
        async with dbmod.SessionLocal() as session:
            profile = await session.scalar(
                select(WorkerProfile).where(WorkerProfile.user_id == worker_id)
            )
            profile.trade = "Carpentry"
            profile.experience_years = 8
            profile.service_area = "Raipur"
            profile.bio = "Eight years of declared field experience."
            session.add(DeclaredSkill(worker_id=profile.id, name="Joinery", years_experience=6))
            qualification = Qualification(
                code=code,
                version="2026.1",
                title="Illustrative assessor test qualification",
                source_name="Test fixture; not official",
                source_url="",
                official=False,
            )
            session.add(qualification)
            await session.flush()
            criterion = Criterion(
                qualification_id=qualification.id,
                code="C-01",
                description="Demonstrate a safe, accurate woodworking joint",
                mandatory=True,
            )
            unrelated_qualification = Qualification(
                code=f"OTHER-{code}",
                version="1",
                title="Unrelated qualification",
                source_name="Test fixture; not official",
                official=False,
            )
            session.add(unrelated_qualification)
            await session.flush()
            unrelated_criterion = Criterion(
                qualification_id=unrelated_qualification.id,
                code="X-01",
                description="Unrelated criterion",
                mandatory=True,
            )
            assessor = User(
                email=f"assessor-{code.lower()}@example.com",
                full_name="Authorized Assessor",
                password_hash=PasswordHash.recommended().hash("secure-assessor-pass"),
                role="assessor",
            )
            session.add_all([criterion, unrelated_criterion, assessor])
            await session.commit()
            return qualification.id, criterion.id, unrelated_criterion.id, assessor.email

    qualification_id, criterion_id, unrelated_criterion_id, assessor_email = asyncio.run(seed())
    case = client.post("/api/worker/cases", json={"qualification_id": qualification_id})
    assert case.status_code == 200, case.text
    return worker_id, case.json()["id"], criterion_id, unrelated_criterion_id, assessor_email


def _login(client, email: str, password: str):
    client.post("/api/auth/logout")
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response


def _upload_case_evidence(client, case_id: str, criterion_id: str, label: str):
    response = client.post(
        f"/api/worker/cases/{case_id}/evidence",
        data={"criterion_id": criterion_id, "description": f"{label} evidence description"},
        files={"file": (f"{label}.pdf", f"%PDF-1.4\\n{label}".encode(), "application/pdf")},
    )
    assert response.status_code == 200, response.text
    return response.json()["id"]


def test_assessor_queue_scopes_private_evidence_and_requires_explanations(client):
    _worker_id, case_id, criterion_id, unrelated_criterion_id, assessor_email = (
        _prepare_assessor_case(client, "ASSESSOR-SCOPE")
    )
    evidence_id = _upload_case_evidence(client, case_id, criterion_id, "first")
    assert (
        client.patch(
            f"/api/assessor/evidence/{evidence_id}",
            json={"status": "ACCEPTED", "notes": "Unauthorized worker."},
        ).status_code
        == 403
    )
    assert (
        client.put(
            f"/api/assessor/cases/{case_id}/criteria/{criterion_id}",
            json={"result": "COMPETENT", "notes": "Unauthorized worker."},
        ).status_code
        == 403
    )
    assert client.post(f"/api/assessor/cases/{case_id}/verify").status_code == 403

    _login(client, assessor_email, "secure-assessor-pass")
    assert client.get(f"/api/evidence/{evidence_id}/file").status_code == 403

    _login(client, "worker-assessor-scope@example.com", "secure-worker-pass")
    submitted = client.post(f"/api/worker/cases/{case_id}/submit")
    assert submitted.status_code == 200
    _login(client, assessor_email, "secure-assessor-pass")

    queue = client.get("/api/assessor/cases")
    assert queue.status_code == 200
    row = next(item for item in queue.json() if item["id"] == case_id)
    assert row["submitted_criteria"] == row["mandatory_criteria"] == 1
    assert row["worker"]["experience_years"] == 8
    assert row["worker"]["skills"] == [{"name": "Joinery", "years_experience": 6}]
    assert row["criteria"][0]["evidence"][0]["id"] == evidence_id
    assert "stored_name" not in row["criteria"][0]["evidence"][0]
    private_file = client.get(f"/api/evidence/{evidence_id}/file")
    assert private_file.status_code == 200
    assert private_file.headers["cache-control"] == "private, no-store"
    assert private_file.headers["x-content-type-options"] == "nosniff"

    assert (
        client.patch(
            f"/api/assessor/evidence/{evidence_id}", json={"status": "NEEDS_MORE", "notes": "  "}
        ).status_code
        == 422
    )
    assert (
        client.put(
            f"/api/assessor/cases/{case_id}/criteria/{criterion_id}",
            json={"result": "COMPETENT", "notes": "   "},
        ).status_code
        == 422
    )
    assert (
        client.patch(
            f"/api/assessor/evidence/{evidence_id}", json={"status": "ACCEPTED", "notes": "  "}
        ).status_code
        == 422
    )
    assert (
        client.patch(
            f"/api/assessor/evidence/{evidence_id}",
            json={"status": "NEEDS_MORE", "notes": "Please show the joint measurement."},
        ).status_code
        == 200
    )
    assert (
        client.put(
            f"/api/assessor/cases/{case_id}/criteria/{unrelated_criterion_id}",
            json={"result": "COMPETENT", "notes": "This criterion belongs elsewhere."},
        ).status_code
        == 404
    )

    customer = client.post(
        "/api/auth/register",
        json={
            "full_name": "Customer",
            "email": "customer-assessor-scope@example.com",
            "password": "secure-customer-pass",
            "role": "customer",
        },
    )
    assert customer.status_code == 200
    assert client.get(f"/api/evidence/{evidence_id}/file").status_code == 403
    assert client.get("/api/assessor/cases").status_code == 403
    assert (
        client.patch(
            f"/api/assessor/evidence/{evidence_id}",
            json={"status": "ACCEPTED", "notes": "Customer is not authorized."},
        ).status_code
        == 403
    )


def test_assessor_reconfirms_decisions_after_worker_resubmits_evidence(client):
    _worker_id, case_id, criterion_id, _, assessor_email = _prepare_assessor_case(
        client, "ASSESSOR-RECONFIRM"
    )
    first_evidence_id = _upload_case_evidence(client, case_id, criterion_id, "original")
    assert client.post(f"/api/worker/cases/{case_id}/submit").status_code == 200

    _login(client, assessor_email, "secure-assessor-pass")
    decision = client.put(
        f"/api/assessor/cases/{case_id}/criteria/{criterion_id}",
        json={"result": "COMPETENT", "notes": "The first sample meets the stated measure."},
    )
    assert decision.status_code == 200, decision.text
    assessor_case = next(
        item for item in client.get("/api/assessor/cases").json() if item["id"] == case_id
    )
    assert assessor_case["criteria"][0]["decision"]["assessor_name"] == "Authorized Assessor"
    assert not assessor_case["criteria"][0]["decision"]["needs_reconfirmation"]
    assert (
        client.patch(
            f"/api/assessor/evidence/{first_evidence_id}",
            json={"status": "NEEDS_MORE", "notes": "Please provide a clearer close-up."},
        ).status_code
        == 200
    )

    _login(client, "worker-assessor-reconfirm@example.com", "secure-worker-pass")
    case = client.get("/api/worker/cases").json()[0]
    assert case["status"] == "NEEDS_MORE"
    second_evidence_id = _upload_case_evidence(client, case_id, criterion_id, "replacement")
    assert second_evidence_id != first_evidence_id
    assert client.post(f"/api/worker/cases/{case_id}/submit").json()["status"] == "SUBMITTED"

    _login(client, assessor_email, "secure-assessor-pass")
    queue_row = next(
        item for item in client.get("/api/assessor/cases").json() if item["id"] == case_id
    )
    assert queue_row["criteria"][0]["decision"]["needs_reconfirmation"] is True
    assert client.post(f"/api/assessor/cases/{case_id}/verify").status_code == 409

    reconfirmed = client.put(
        f"/api/assessor/cases/{case_id}/criteria/{criterion_id}",
        json={"result": "COMPETENT", "notes": "Reviewed the replacement sample; criterion met."},
    )
    assert reconfirmed.status_code == 200
    verified = client.post(f"/api/assessor/cases/{case_id}/verify")
    assert verified.status_code == 200 and verified.json()["verified"] is True
    assert client.post(f"/api/assessor/cases/{case_id}/verify").status_code == 409
    assert (
        client.put(
            f"/api/assessor/cases/{case_id}/criteria/{criterion_id}",
            json={"result": "NOT_YET", "notes": "Cannot change a finalized decision."},
        ).status_code
        == 409
    )
    assert (
        client.patch(
            f"/api/assessor/evidence/{second_evidence_id}",
            json={"status": "NEEDS_MORE", "notes": "Cannot change finalized evidence."},
        ).status_code
        == 409
    )

    async def persisted():
        async with dbmod.SessionLocal() as session:
            competency = await session.scalar(
                select(Competency).where(Competency.case_id == case_id)
            )
            decision = await session.scalar(
                select(CriterionDecision).where(
                    CriterionDecision.case_id == case_id,
                    CriterionDecision.criterion_id == criterion_id,
                )
            )
            event_count = await session.scalar(
                select(func.count())
                .select_from(AuditEvent)
                .where(AuditEvent.entity_id.in_([first_evidence_id, case_id]))
            )
            decision_event_count = await session.scalar(
                select(func.count())
                .select_from(AuditEvent)
                .where(AuditEvent.action == "assessment.criterion_decided")
            )
            return competency, decision, event_count, decision_event_count

    competency, saved_decision, event_count, decision_event_count = asyncio.run(persisted())
    assert competency is not None and competency.verified_by
    assert saved_decision is not None and saved_decision.result == "COMPETENT"
    assert saved_decision.notes == "Reviewed the replacement sample; criterion met."
    assert event_count >= 1
    assert decision_event_count == 2
