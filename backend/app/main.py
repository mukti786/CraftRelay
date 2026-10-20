import asyncio
import hashlib
import json
import secrets
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path

import jwt
from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pwdlib import PasswordHash
from pydantic import BaseModel, EmailStr, Field, ValidationError, field_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_assistance import (
    AssistanceContext,
    AssistanceRateLimited,
    AssistanceRefused,
    AssistanceTimeout,
    AssistanceUnavailable,
    ProviderRegistry,
    ProviderResult,
    SuggestionOutput,
    validate_scope,
)
from app.db import engine, get_db
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
from app.settings import get_settings

settings = get_settings()
ai_provider = ProviderRegistry(settings.ai_assistance_provider)
AI_TEMPLATE_VERSION = "assessor-evidence-v1"
AI_REQUEST_TIMEOUT_SECONDS = 20


@asynccontextmanager
async def lifespan(_: FastAPI):
    Path(settings.evidence_dir).mkdir(parents=True, exist_ok=True)
    yield
    await engine.dispose()


app = FastAPI(
    title="CraftRelay API",
    version="0.1.0",
    description="RPL assessment and trusted-services API",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
passwords = PasswordHash.recommended()
ALGORITHM = "HS256"
COOKIE = "craftrelay_session"


@app.middleware("http")
async def check_browser_origin(request: Request, call_next):
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        origin = request.headers.get("origin")
        if origin not in settings.cors_origin_list:
            return JSONResponse({"detail": "Origin is not allowed"}, status_code=403)
    return await call_next(request)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "craftrelay-api"}


class RegisterInput(BaseModel):
    full_name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    role: str = Field(pattern="^(worker|customer)$")


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class ProfileInput(BaseModel):
    trade: str = Field(default="", max_length=100)
    experience_years: int = Field(default=0, ge=0, le=60)
    service_area: str = Field(default="", max_length=160)
    bio: str = Field(default="", max_length=2000)
    available: bool = True

    @field_validator("trade", "service_area", "bio")
    @classmethod
    def trim_profile_text(cls, value: str) -> str:
        return value.strip()


class SkillInput(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    years_experience: int = Field(default=0, ge=0, le=60)

    @field_validator("name")
    @classmethod
    def trim_skill_name(cls, value: str) -> str:
        name = value.strip()
        if not 2 <= len(name) <= 120:
            raise ValueError("Skill name must be between 2 and 120 characters")
        return name


class CaseInput(BaseModel):
    qualification_id: str


class EvidenceInput(BaseModel):
    criterion_id: str
    description: str = Field(min_length=5, max_length=2000)


class ReviewEvidenceInput(BaseModel):
    status: str = Field(pattern="^(ACCEPTED|NEEDS_MORE)$")
    notes: str = Field(min_length=3, max_length=2000)

    @field_validator("notes")
    @classmethod
    def require_review_reason(cls, value: str) -> str:
        notes = value.strip()
        if len(notes) < 3:
            raise ValueError("Please provide a clear reason of at least three characters")
        return notes


class DecisionInput(BaseModel):
    result: str = Field(pattern="^(COMPETENT|NOT_YET)$")
    notes: str = Field(min_length=3, max_length=2000)

    @field_validator("notes")
    @classmethod
    def require_decision_reason(cls, value: str) -> str:
        notes = value.strip()
        if len(notes) < 3:
            raise ValueError("Please provide a clear decision note of at least three characters")
        return notes


class ServiceInput(BaseModel):
    worker_id: str
    description: str = Field(min_length=5, max_length=2000)
    location: str = Field(min_length=2, max_length=200)

    @field_validator("description", "location")
    @classmethod
    def normalize_service_text(cls, value: str, info):
        cleaned = value.strip()
        minimum = 5 if info.field_name == "description" else 2
        if len(cleaned) < minimum:
            raise ValueError(f"{info.field_name.replace('_', ' ').capitalize()} is too short")
        return cleaned


class ServiceStatusInput(BaseModel):
    status: str = Field(pattern="^(ACCEPTED|DECLINED|COMPLETED|CANCELLED)$")


class ReviewInput(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=2000)

    @field_validator("comment")
    @classmethod
    def normalize_review_comment(cls, value: str) -> str:
        return value.strip()


class PracticalTaskReviewInput(BaseModel):
    result: str = Field(pattern="^(SATISFACTORY|NEEDS_MORE)$")
    notes: str = Field(min_length=3, max_length=2000)

    @field_validator("notes")
    @classmethod
    def normalize_task_review_notes(cls, value: str) -> str:
        notes = value.strip()
        if len(notes) < 3:
            raise ValueError("Please provide a clear task review note")
        return notes


class AssistanceRequestInput(BaseModel):
    evidence_ids: list[str] = Field(min_length=1, max_length=20)
    criterion_ids: list[str] = Field(min_length=1, max_length=30)

    @field_validator("evidence_ids", "criterion_ids")
    @classmethod
    def require_unique_ids(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)):
            raise ValueError("Duplicate evidence or criterion identifiers are not allowed")
        if any(not item or len(item) > 36 for item in value):
            raise ValueError("Invalid identifier")
        return value


class AssistanceDispositionInput(BaseModel):
    disposition: str = Field(pattern="^(ACCEPTED|EDITED|DISMISSED)$")
    edited_output: SuggestionOutput | None = None

    @field_validator("edited_output")
    @classmethod
    def edited_output_required_for_edit(cls, value, info):
        if info.data.get("disposition") == "EDITED" and value is None:
            raise ValueError("Provide the edited suggestion when recording an edit")
        if info.data.get("disposition") != "EDITED" and value is not None:
            raise ValueError("Edited content is only accepted with the EDITED disposition")
        return value


class UserStatusInput(BaseModel):
    active: bool


class UserRoleInput(BaseModel):
    role: str = Field(pattern="^(worker|assessor|customer|admin)$")


class QualificationInput(BaseModel):
    code: str = Field(min_length=2, max_length=80)
    version: str = Field(min_length=1, max_length=40)
    title: str = Field(min_length=2, max_length=200)
    source_name: str = Field(min_length=2, max_length=200)
    source_url: str = Field(default="", max_length=1000)
    official: bool = False


class CriterionInput(BaseModel):
    code: str = Field(min_length=1, max_length=80)
    description: str = Field(min_length=3, max_length=2000)
    mandatory: bool = True
    requires_practical: bool = False


class TaskInput(BaseModel):
    criterion_id: str
    title: str = Field(min_length=2, max_length=200)
    instructions: str = Field(min_length=5, max_length=3000)
    rubric: str = Field(min_length=5, max_length=3000)
    source_name: str = Field(min_length=2, max_length=200)
    source_url: str = Field(default="", max_length=1000)
    official: bool = False
    approved: bool = False


async def current_user(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, "Sign in required")
    try:
        claims = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        user_id = claims.get("sub")
        if not isinstance(user_id, str) or not user_id:
            raise HTTPException(401, "Session is invalid")
        user = await db.get(User, user_id)
    except HTTPException:
        raise
    except jwt.PyJWTError as exc:
        raise HTTPException(401, "Session expired") from exc
    session_version = claims.get("sv", 0)
    if (
        not user
        or not user.active
        or isinstance(session_version, bool)
        or not isinstance(session_version, int)
        or session_version != user.session_version
    ):
        raise HTTPException(401, "Account unavailable")
    return user


def require(*roles: str):
    async def check(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(403, "You do not have permission for this action")
        return user

    return check


def public_user(user: User):
    return {"id": user.id, "email": user.email, "full_name": user.full_name, "role": user.role}


def public_profile(
    profile: WorkerProfile, user: User, skills: list[DeclaredSkill], verified: int = 0
):
    return {
        "id": profile.id,
        "user_id": user.id,
        "full_name": user.full_name,
        "trade": profile.trade,
        "experience_years": profile.experience_years,
        "service_area": profile.service_area,
        "bio": profile.bio,
        "available": profile.available,
        "skills": [
            {"id": s.id, "name": s.name, "years_experience": s.years_experience} for s in skills
        ],
        "verified_qualifications": verified,
    }


async def audit(
    db: AsyncSession, actor: User, action: str, entity: str, entity_id: str, details=None
):
    db.add(
        AuditEvent(
            actor_id=actor.id,
            action=action,
            entity_type=entity,
            entity_id=entity_id,
            details=json.dumps(details or {}, sort_keys=True),
        )
    )


async def worker_profile(db: AsyncSession, user_id: str):
    return await db.scalar(select(WorkerProfile).where(WorkerProfile.user_id == user_id))


async def practical_task_records(db: AsyncSession, case: AssessmentCase):
    tasks = (
        await db.scalars(
            select(ApprovedTask)
            .where(
                ApprovedTask.qualification_id == case.qualification_id,
                ApprovedTask.approved.is_(True),
            )
            .order_by(ApprovedTask.criterion_id, ApprovedTask.title)
        )
    ).all()
    records = []
    for task in tasks:
        attempts = (
            await db.scalars(
                select(PracticalTaskAttempt)
                .where(
                    PracticalTaskAttempt.case_id == case.id,
                    PracticalTaskAttempt.worker_id == case.worker_id,
                    PracticalTaskAttempt.qualification_id == case.qualification_id,
                    PracticalTaskAttempt.criterion_id == task.criterion_id,
                    PracticalTaskAttempt.task_id == task.id,
                )
                .order_by(PracticalTaskAttempt.submitted_at, PracticalTaskAttempt.id)
            )
        ).all()
        attempt_records = []
        for attempt in attempts:
            evidence = await db.scalar(
                select(Evidence).where(
                    Evidence.task_attempt_id == attempt.id,
                    Evidence.case_id == case.id,
                    Evidence.worker_id == case.worker_id,
                    Evidence.criterion_id == task.criterion_id,
                )
            )
            review = await db.scalar(
                select(PracticalTaskAttemptReview).where(
                    PracticalTaskAttemptReview.attempt_id == attempt.id
                )
            )
            attempt_records.append(
                {
                    "id": attempt.id,
                    "description": attempt.description,
                    "submitted_at": attempt.submitted_at.isoformat(),
                    "evidence": (
                        {
                            "id": evidence.id,
                            "description": evidence.description,
                            "original_name": evidence.original_name,
                            "uploaded_at": evidence.uploaded_at.isoformat(),
                        }
                        if evidence
                        else None
                    ),
                    "review": (
                        {
                            "result": review.result,
                            "notes": review.notes,
                            "reviewed_at": review.reviewed_at.isoformat(),
                        }
                        if review
                        else None
                    ),
                }
            )
        records.append(
            {
                "id": task.id,
                "criterion_id": task.criterion_id,
                "title": task.title,
                "instructions": task.instructions,
                "rubric": task.rubric,
                "source_name": task.source_name,
                "source_url": task.source_url,
                "official": task.official,
                "attempts": attempt_records,
            }
        )
    return records


@app.post("/api/auth/register")
async def register(payload: RegisterInput, response: Response, db: AsyncSession = Depends(get_db)):
    email = str(payload.email).strip().lower()
    if await db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "An account with this email already exists")
    user = User(
        email=email,
        full_name=payload.full_name.strip(),
        password_hash=passwords.hash(payload.password),
        role=payload.role,
    )
    try:
        db.add(user)
        await db.flush()
        if user.role == "worker":
            db.add(WorkerProfile(user_id=user.id))
        await audit(db, user, "account.registered", "user", user.id, {"role": user.role})
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(409, "An account with this email already exists") from exc
    set_session(response, user)
    return public_user(user)


def cookie_options() -> dict:
    return {
        "path": "/",
        "httponly": True,
        "secure": settings.app_env == "production" or settings.cookie_samesite == "none",
        "samesite": settings.cookie_samesite,
    }


def set_session(response: Response, user: User):
    exp = datetime.now(UTC) + timedelta(minutes=settings.access_token_minutes)
    token = jwt.encode(
        {
            "sub": user.id,
            "role": user.role,
            "sv": user.session_version,
            "exp": exp,
        },
        settings.secret_key,
        algorithm=ALGORITHM,
    )
    response.set_cookie(
        COOKIE, token, max_age=settings.access_token_minutes * 60, **cookie_options()
    )


@app.post("/api/auth/login")
async def login(payload: LoginInput, response: Response, db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.email == str(payload.email).strip().lower()))
    if not user or not user.active or not passwords.verify(payload.password, user.password_hash):
        raise HTTPException(401, "Email or password is incorrect")
    set_session(response, user)
    return public_user(user)


@app.post("/api/auth/logout")
async def logout(response: Response, request: Request, db: AsyncSession = Depends(get_db)):
    token = request.cookies.get(COOKIE)
    if token:
        try:
            claims = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        except jwt.PyJWTError:
            claims = {}
        user_id = claims.get("sub")
        session_version = claims.get("sv", 0)
        if (
            isinstance(user_id, str)
            and user_id
            and isinstance(session_version, int)
            and not isinstance(session_version, bool)
        ):
            user = await db.get(User, user_id)
            if user and user.active and session_version == user.session_version:
                user.session_version += 1
                await audit(db, user, "auth.sessions_revoked", "user", user.id)
                await db.commit()
    response.set_cookie(COOKIE, "", max_age=0, expires=0, **cookie_options())
    return {"ok": True}


@app.get("/api/auth/me")
async def me(user: User = Depends(current_user)):
    return public_user(user)


@app.get("/api/qualifications")
async def qualifications(db: AsyncSession = Depends(get_db)):
    rows = (
        await db.scalars(
            select(Qualification)
            .where(Qualification.active.is_(True))
            .order_by(Qualification.title)
        )
    ).all()
    out = []
    for q in rows:
        count = await db.scalar(
            select(func.count(Criterion.id)).where(Criterion.qualification_id == q.id)
        )
        out.append(
            {
                "id": q.id,
                "code": q.code,
                "version": q.version,
                "title": q.title,
                "source_name": q.source_name,
                "source_url": q.source_url,
                "official": q.official,
                "criterion_count": count or 0,
            }
        )
    return out


@app.get("/api/qualifications/{qualification_id}/criteria")
async def criteria(qualification_id: str, db: AsyncSession = Depends(get_db)):
    qualification = await db.get(Qualification, qualification_id)
    if not qualification or not qualification.active:
        raise HTTPException(404, "Qualification not found")
    rows = (
        await db.scalars(
            select(Criterion)
            .where(Criterion.qualification_id == qualification_id)
            .order_by(Criterion.code)
        )
    ).all()
    return [
        {
            "id": x.id,
            "code": x.code,
            "description": x.description,
            "mandatory": x.mandatory,
            "requires_practical": x.requires_practical,
        }
        for x in rows
    ]


@app.get("/api/qualifications/{qualification_id}")
async def qualification_detail(qualification_id: str, db: AsyncSession = Depends(get_db)):
    qualification = await db.get(Qualification, qualification_id)
    if not qualification or not qualification.active:
        raise HTTPException(404, "Qualification not found")
    rows = (
        await db.scalars(
            select(Criterion)
            .where(Criterion.qualification_id == qualification.id)
            .order_by(Criterion.code)
        )
    ).all()
    return {
        "id": qualification.id,
        "code": qualification.code,
        "version": qualification.version,
        "title": qualification.title,
        "source_name": qualification.source_name,
        "source_url": qualification.source_url,
        "official": qualification.official,
        "criteria": [
            {
                "id": criterion.id,
                "code": criterion.code,
                "description": criterion.description,
                "mandatory": criterion.mandatory,
                "requires_practical": criterion.requires_practical,
            }
            for criterion in rows
        ],
    }


@app.get("/api/worker/profile")
async def get_profile(user: User = Depends(require("worker")), db: AsyncSession = Depends(get_db)):
    profile = await worker_profile(db, user.id)
    skills = (
        await db.scalars(select(DeclaredSkill).where(DeclaredSkill.worker_id == profile.id))
    ).all()
    record = public_profile(profile, user, skills)
    verified = (
        await db.execute(
            select(Competency, Qualification)
            .join(Qualification, Competency.qualification_id == Qualification.id)
            .where(Competency.worker_id == profile.id)
            .order_by(Qualification.title, Qualification.version)
        )
    ).all()
    record["verified_qualifications"] = [
        {
            "title": qualification.title,
            "code": qualification.code,
            "version": qualification.version,
            "official": qualification.official,
        }
        for _, qualification in verified
    ]
    return record


@app.put("/api/worker/profile")
async def put_profile(
    payload: ProfileInput,
    user: User = Depends(require("worker")),
    db: AsyncSession = Depends(get_db),
):
    profile = await worker_profile(db, user.id)
    for key, value in payload.model_dump().items():
        setattr(profile, key, value)
    await audit(db, user, "worker.profile.updated", "worker_profile", profile.id)
    await db.commit()
    return {"ok": True}


@app.post("/api/worker/skills")
async def add_skill(
    payload: SkillInput, user: User = Depends(require("worker")), db: AsyncSession = Depends(get_db)
):
    profile = await worker_profile(db, user.id)
    skill = DeclaredSkill(
        worker_id=profile.id, name=payload.name.strip(), years_experience=payload.years_experience
    )
    db.add(skill)
    await db.flush()
    await audit(db, user, "worker.skill.added", "declared_skill", skill.id)
    await db.commit()
    return {"id": skill.id, "name": skill.name, "years_experience": skill.years_experience}


@app.delete("/api/worker/skills/{skill_id}")
async def delete_skill(
    skill_id: str, user: User = Depends(require("worker")), db: AsyncSession = Depends(get_db)
):
    profile = await worker_profile(db, user.id)
    skill = await db.get(DeclaredSkill, skill_id)
    if not skill or skill.worker_id != profile.id:
        raise HTTPException(404, "Skill not found")
    skill_id = skill.id
    await db.delete(skill)
    await audit(db, user, "worker.skill.removed", "declared_skill", skill_id)
    await db.commit()
    return {"ok": True}


@app.get("/api/worker/cases")
async def list_cases(user: User = Depends(require("worker")), db: AsyncSession = Depends(get_db)):
    profile = await worker_profile(db, user.id)
    cases = (
        await db.scalars(
            select(AssessmentCase)
            .where(AssessmentCase.worker_id == profile.id)
            .order_by(AssessmentCase.created_at.desc())
        )
    ).all()
    out = []
    for case in cases:
        q = await db.get(Qualification, case.qualification_id)
        ev = (await db.scalars(select(Evidence).where(Evidence.case_id == case.id))).all()
        crits = (
            await db.scalars(select(Criterion).where(Criterion.qualification_id == q.id))
        ).all()
        task_records = await practical_task_records(db, case)
        out.append(
            {
                "id": case.id,
                "status": case.status,
                "qualification": {
                    "id": q.id,
                    "title": q.title,
                    "code": q.code,
                    "version": q.version,
                    "official": q.official,
                },
                "evidence": [
                    {
                        "id": e.id,
                        "criterion_id": e.criterion_id,
                        "description": e.description,
                        "original_name": e.original_name,
                        "review_status": e.review_status,
                        "reviewer_notes": e.reviewer_notes,
                    }
                    for e in ev
                    if e.task_attempt_id is None
                ],
                "practical_tasks": task_records,
                "criteria": [
                    {
                        "id": c.id,
                        "code": c.code,
                        "description": c.description,
                        "mandatory": c.mandatory,
                        "requires_practical": c.requires_practical,
                        "evidence_count": sum(1 for e in ev if e.criterion_id == c.id),
                    }
                    for c in crits
                ],
            }
        )
    return out


@app.post("/api/worker/cases")
async def create_case(
    payload: CaseInput, user: User = Depends(require("worker")), db: AsyncSession = Depends(get_db)
):
    q = await db.get(Qualification, payload.qualification_id)
    if not q or not q.active:
        raise HTTPException(404, "Qualification not found")
    mandatory_count = await db.scalar(
        select(func.count(Criterion.id)).where(
            Criterion.qualification_id == q.id, Criterion.mandatory.is_(True)
        )
    )
    if not mandatory_count:
        raise HTTPException(
            409, "This qualification has no mandatory criteria ready for assessment"
        )
    profile = await worker_profile(db, user.id)
    existing = await db.scalar(
        select(AssessmentCase).where(
            AssessmentCase.worker_id == profile.id, AssessmentCase.qualification_id == q.id
        )
    )
    if existing:
        return {"id": existing.id, "status": existing.status}
    case = AssessmentCase(worker_id=profile.id, qualification_id=q.id)
    db.add(case)
    await db.flush()
    await audit(
        db,
        user,
        "assessment.case.created",
        "assessment_case",
        case.id,
        {"qualification_version": q.version},
    )
    await db.commit()
    return {"id": case.id, "status": case.status}


@app.post("/api/worker/cases/{case_id}/submit")
async def submit_case(
    case_id: str, user: User = Depends(require("worker")), db: AsyncSession = Depends(get_db)
):
    profile = await worker_profile(db, user.id)
    case = await db.get(AssessmentCase, case_id)
    if not case or case.worker_id != profile.id:
        raise HTTPException(404, "Assessment case not found")
    if case.status not in {"IN_PROGRESS", "NEEDS_MORE"}:
        raise HTTPException(409, "This assessment is no longer open for worker submission")
    criteria = (
        await db.scalars(
            select(Criterion).where(
                Criterion.qualification_id == case.qualification_id, Criterion.mandatory.is_(True)
            )
        )
    ).all()
    if not criteria:
        raise HTTPException(409, "This qualification has no criteria ready for assessment")
    evidence = (await db.scalars(select(Evidence).where(Evidence.case_id == case.id))).all()
    missing = [
        criterion.code
        for criterion in criteria
        if not any(
            item.criterion_id == criterion.id and item.review_status != "NEEDS_MORE"
            for item in evidence
        )
    ]
    if missing:
        raise HTTPException(
            409,
            "Add evidence for each mandatory criterion before submission",
            headers={"X-Missing-Criteria": ", ".join(missing)},
        )
    tasks = (
        await db.scalars(
            select(ApprovedTask).where(
                ApprovedTask.qualification_id == case.qualification_id,
                ApprovedTask.approved.is_(True),
                ApprovedTask.criterion_id.in_([criterion.id for criterion in criteria]),
            )
        )
    ).all()
    for task in tasks:
        latest = await db.scalar(
            select(PracticalTaskAttempt)
            .where(PracticalTaskAttempt.case_id == case.id, PracticalTaskAttempt.task_id == task.id)
            .order_by(PracticalTaskAttempt.submitted_at.desc(), PracticalTaskAttempt.id.desc())
            .limit(1)
        )
        if not latest:
            raise HTTPException(409, f"Submit a practical task attempt for {task.title}")
        review = await db.scalar(
            select(PracticalTaskAttemptReview).where(
                PracticalTaskAttemptReview.attempt_id == latest.id
            )
        )
        if review and review.result == "NEEDS_MORE":
            raise HTTPException(409, f"Submit a new attempt for {task.title} after remediation")
    case.status = "SUBMITTED"
    await audit(db, user, "assessment.case.submitted", "assessment_case", case.id)
    await db.commit()
    return {"id": case.id, "status": case.status}


@app.post("/api/worker/cases/{case_id}/tasks/{task_id}/attempts")
async def submit_practical_task_attempt(
    case_id: str,
    task_id: str,
    description: str = Form(...),
    file: UploadFile = File(...),
    user: User = Depends(require("worker")),
    db: AsyncSession = Depends(get_db),
):
    profile = await worker_profile(db, user.id)
    case = await db.get(AssessmentCase, case_id)
    if not case or case.worker_id != profile.id:
        raise HTTPException(404, "Assessment case not found")
    if case.status not in {"IN_PROGRESS", "NEEDS_MORE"}:
        raise HTTPException(409, "This assessment is no longer open for task submission")
    task = await db.get(ApprovedTask, task_id)
    if not task or not task.approved or task.qualification_id != case.qualification_id:
        raise HTTPException(404, "Approved practical task not found")
    criterion = await db.get(Criterion, task.criterion_id)
    if not criterion or criterion.qualification_id != case.qualification_id:
        raise HTTPException(404, "Practical task criterion not found")
    previous = await db.scalar(
        select(PracticalTaskAttempt)
        .where(PracticalTaskAttempt.case_id == case.id, PracticalTaskAttempt.task_id == task.id)
        .order_by(PracticalTaskAttempt.submitted_at.desc(), PracticalTaskAttempt.id.desc())
        .limit(1)
    )
    if previous:
        if previous.active_attempt:
            raise HTTPException(409, "A practical task attempt is already awaiting assessor review")
        previous_review = await db.scalar(
            select(PracticalTaskAttemptReview).where(
                PracticalTaskAttemptReview.attempt_id == previous.id
            )
        )
        if not previous_review or previous_review.result != "NEEDS_MORE":
            raise HTTPException(
                409, "A new attempt is available only after remediation is requested"
            )

    description = description.strip()
    if not 5 <= len(description) <= 2000:
        raise HTTPException(422, "Task attempt description must be between 5 and 2000 characters")
    allowed = {"application/pdf", "image/jpeg", "image/png", "image/webp"}
    if file.content_type not in allowed:
        raise HTTPException(415, "Upload a PDF, JPEG, PNG, or WebP file")
    content = await file.read(settings.max_upload_bytes + 1)
    if not content or len(content) > settings.max_upload_bytes:
        raise HTTPException(
            413,
            f"Evidence file must be non-empty and no larger than {settings.max_upload_bytes} bytes",
        )
    signatures = {
        "application/pdf": content.startswith(b"%PDF-"),
        "image/jpeg": content.startswith(b"\xff\xd8\xff"),
        "image/png": content.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/webp": content.startswith(b"RIFF") and content[8:12] == b"WEBP",
    }
    if not signatures[file.content_type]:
        raise HTTPException(415, "The uploaded file does not match its declared file type")
    suffix = {
        "application/pdf": ".pdf",
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }[file.content_type]
    stored = secrets.token_hex(24) + suffix
    path = Path(settings.evidence_dir) / stored
    path.parent.mkdir(parents=True, exist_ok=True)
    original_name = Path(file.filename or "evidence").name.replace("\r", "").replace("\n", "")
    original_name = original_name[:255] or "evidence"
    attempt = PracticalTaskAttempt(
        case_id=case.id,
        worker_id=profile.id,
        qualification_id=case.qualification_id,
        criterion_id=criterion.id,
        task_id=task.id,
        description=description,
    )
    try:
        db.add(attempt)
        await db.flush()
        evidence = Evidence(
            case_id=case.id,
            worker_id=profile.id,
            criterion_id=criterion.id,
            task_attempt_id=attempt.id,
            description=description,
            original_name=original_name,
            stored_name=stored,
            media_type=file.content_type,
            size_bytes=len(content),
            sha256=hashlib.sha256(content).hexdigest(),
        )
        with path.open("xb") as evidence_file:
            evidence_file.write(content)
        db.add(evidence)
        await db.flush()
        await audit(
            db,
            user,
            "practical_task.attempt_submitted",
            "practical_task_attempt",
            attempt.id,
            {"task_id": task.id, "criterion_id": criterion.id},
        )
        await db.commit()
    except Exception as exc:
        await db.rollback()
        path.unlink(missing_ok=True)
        if isinstance(exc, IntegrityError):
            raise HTTPException(409, "A practical task attempt is already awaiting assessor review")
        raise
    return {"id": attempt.id, "status": "SUBMITTED", "evidence_id": evidence.id}


@app.post("/api/worker/cases/{case_id}/evidence")
async def upload_evidence(
    case_id: str,
    criterion_id: str = Form(...),
    description: str = Form(...),
    file: UploadFile = File(...),
    user: User = Depends(require("worker")),
    db: AsyncSession = Depends(get_db),
):
    profile = await worker_profile(db, user.id)
    case = await db.get(AssessmentCase, case_id)
    if not case or case.worker_id != profile.id:
        raise HTTPException(404, "Assessment case not found")
    if case.status not in {"IN_PROGRESS", "NEEDS_MORE"}:
        raise HTTPException(409, "Evidence is locked after submission to the assessor")
    criterion = await db.get(Criterion, criterion_id)
    if not criterion or criterion.qualification_id != case.qualification_id:
        raise HTTPException(422, "Criterion does not belong to this qualification")
    allowed = {"application/pdf", "image/jpeg", "image/png", "image/webp"}
    if file.content_type not in allowed:
        raise HTTPException(415, "Upload a PDF, JPEG, PNG, or WebP file")
    content = await file.read(settings.max_upload_bytes + 1)
    if not content or len(content) > settings.max_upload_bytes:
        raise HTTPException(
            413,
            f"Evidence file must be non-empty and no larger than {settings.max_upload_bytes} bytes",
        )
    signatures = {
        "application/pdf": content.startswith(b"%PDF-"),
        "image/jpeg": content.startswith(b"\xff\xd8\xff"),
        "image/png": content.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/webp": content.startswith(b"RIFF") and content[8:12] == b"WEBP",
    }
    if not signatures[file.content_type]:
        raise HTTPException(415, "The uploaded file does not match its declared file type")
    suffix = {
        "application/pdf": ".pdf",
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }[file.content_type]
    description = description.strip()
    if not 5 <= len(description) <= 2000:
        raise HTTPException(422, "Evidence description must be between 5 and 2000 characters")
    stored = secrets.token_hex(24) + suffix
    path = Path(settings.evidence_dir) / stored
    path.parent.mkdir(parents=True, exist_ok=True)
    original_name = Path(file.filename or "evidence").name.replace("\r", "").replace("\n", "")
    original_name = original_name[:255] or "evidence"
    item = Evidence(
        case_id=case.id,
        worker_id=profile.id,
        criterion_id=criterion.id,
        description=description,
        original_name=original_name,
        stored_name=stored,
        media_type=file.content_type,
        size_bytes=len(content),
        sha256=hashlib.sha256(content).hexdigest(),
    )
    try:
        with path.open("xb") as evidence_file:
            evidence_file.write(content)
        db.add(item)
        await db.flush()
        await audit(
            db,
            user,
            "evidence.uploaded",
            "evidence",
            item.id,
            {"sha256": item.sha256, "size_bytes": item.size_bytes},
        )
        await db.commit()
    except Exception:
        await db.rollback()
        path.unlink(missing_ok=True)
        raise
    return {"id": item.id, "review_status": item.review_status, "size_bytes": item.size_bytes}


def decision_needs_reconfirmation(
    decision: CriterionDecision | None, evidence: list[Evidence]
) -> bool:
    if decision is None:
        return True
    latest_upload = max((item.uploaded_at for item in evidence), default=None)
    if latest_upload is None:
        return False
    decision_at = decision.updated_at
    if decision_at.tzinfo is not None:
        decision_at = decision_at.replace(tzinfo=None)
    if latest_upload.tzinfo is not None:
        latest_upload = latest_upload.replace(tzinfo=None)
    return decision_at < latest_upload


@app.get("/api/assessor/cases")
async def assessor_cases(
    user: User = Depends(require("assessor")), db: AsyncSession = Depends(get_db)
):
    # No assignment entity exists yet: active assessors may review the shared submitted queue.
    cases = (
        await db.scalars(
            select(AssessmentCase)
            .where(AssessmentCase.status.in_(["SUBMITTED", "IN_REVIEW", "VERIFIED"]))
            .order_by(AssessmentCase.created_at)
        )
    ).all()
    out = []
    for case in cases:
        profile = await db.get(WorkerProfile, case.worker_id)
        worker = await db.get(User, profile.user_id)
        q = await db.get(Qualification, case.qualification_id)
        criteria = (
            await db.scalars(select(Criterion).where(Criterion.qualification_id == q.id))
        ).all()
        evidence = (await db.scalars(select(Evidence).where(Evidence.case_id == case.id))).all()
        task_records = await practical_task_records(db, case)
        decisions = (
            await db.scalars(select(CriterionDecision).where(CriterionDecision.case_id == case.id))
        ).all()
        skills = (
            await db.scalars(select(DeclaredSkill).where(DeclaredSkill.worker_id == profile.id))
        ).all()
        decision_by_criterion = {item.criterion_id: item for item in decisions}
        decision_assessor_names = {}
        for decision in decisions:
            assessor = await db.get(User, decision.assessor_id)
            decision_assessor_names[decision.criterion_id] = (
                assessor.full_name if assessor else "Unavailable"
            )
        evidence_by_criterion: dict[str, list[Evidence]] = {}
        for item in evidence:
            if item.task_attempt_id is None:
                evidence_by_criterion.setdefault(item.criterion_id, []).append(item)
        mandatory = [item for item in criteria if item.mandatory]
        ready_count = sum(
            1
            for criterion in mandatory
            if any(
                item.criterion_id == criterion.id and item.review_status != "NEEDS_MORE"
                for item in evidence
            )
        )
        out.append(
            {
                "id": case.id,
                "status": case.status,
                "submitted_criteria": ready_count,
                "mandatory_criteria": len(mandatory),
                "worker": {
                    "id": profile.id,
                    "name": worker.full_name,
                    "trade": profile.trade,
                    "experience_years": profile.experience_years,
                    "service_area": profile.service_area,
                    "bio": profile.bio,
                    "skills": [
                        {"name": skill.name, "years_experience": skill.years_experience}
                        for skill in skills
                    ],
                },
                "qualification": {
                    "id": q.id,
                    "title": q.title,
                    "code": q.code,
                    "version": q.version,
                    "source_name": q.source_name,
                    "source_url": q.source_url,
                    "official": q.official,
                },
                "criteria": [
                    {
                        "id": criterion.id,
                        "code": criterion.code,
                        "description": criterion.description,
                        "mandatory": criterion.mandatory,
                        "requires_practical": criterion.requires_practical,
                        "evidence": [
                            {
                                "id": item.id,
                                "description": item.description,
                                "original_name": item.original_name,
                                "review_status": item.review_status,
                                "reviewer_notes": item.reviewer_notes,
                                "uploaded_at": item.uploaded_at.isoformat(),
                            }
                            for item in evidence_by_criterion.get(criterion.id, [])
                        ],
                        "decision": (
                            {
                                "result": decision_by_criterion[criterion.id].result,
                                "notes": decision_by_criterion[criterion.id].notes,
                                "assessor_name": decision_assessor_names[criterion.id],
                                "updated_at": decision_by_criterion[
                                    criterion.id
                                ].updated_at.isoformat(),
                                "needs_reconfirmation": decision_needs_reconfirmation(
                                    decision_by_criterion[criterion.id],
                                    evidence_by_criterion.get(criterion.id, []),
                                ),
                            }
                            if criterion.id in decision_by_criterion
                            else None
                        ),
                    }
                    for criterion in criteria
                ],
                "practical_tasks": task_records,
            }
        )
    return out


def assistance_record(item: EvidenceAssistanceSuggestion):
    return {
        "id": item.id,
        "case_id": item.case_id,
        "qualification_id": item.qualification_id,
        "qualification_version": item.qualification_version,
        "provider_id": item.provider_id,
        "model_id": item.model_id,
        "template_version": item.template_version,
        "evidence_ids": json.loads(item.evidence_ids),
        "criterion_ids": json.loads(item.criterion_ids),
        "original_output": json.loads(item.original_output),
        "edited_output": json.loads(item.edited_output) if item.edited_output else None,
        "disposition": item.disposition,
        "disposition_at": item.disposition_at.isoformat() if item.disposition_at else None,
        "request_at": item.request_at.isoformat(),
        "response_at": item.response_at.isoformat(),
        "label": "Unverified AI suggestion — not a competency decision",
    }


@app.get("/api/assessor/ai-assistance")
async def assessor_ai_assistance_status(user: User = Depends(require("assessor"))):
    return {
        "available": ai_provider.available,
        "provider": settings.ai_assistance_provider if ai_provider.available else None,
        "reason": None if ai_provider.available else ai_provider.unavailable_reason,
        "manual_review_available": True,
    }


async def authorized_assessor_case(case_id: str, db: AsyncSession) -> AssessmentCase:
    case = await db.get(AssessmentCase, case_id)
    if not case or case.status not in {"SUBMITTED", "IN_REVIEW", "VERIFIED"}:
        raise HTTPException(404, "Assessment case not found")
    return case


@app.get("/api/assessor/cases/{case_id}/ai-suggestions")
async def list_ai_suggestions(
    case_id: str,
    user: User = Depends(require("assessor")),
    db: AsyncSession = Depends(get_db),
):
    await authorized_assessor_case(case_id, db)
    suggestions = (
        await db.scalars(
            select(EvidenceAssistanceSuggestion)
            .where(EvidenceAssistanceSuggestion.case_id == case_id)
            .order_by(EvidenceAssistanceSuggestion.request_at)
        )
    ).all()
    return [assistance_record(item) for item in suggestions]


@app.post("/api/assessor/cases/{case_id}/ai-suggestions")
async def request_ai_suggestion(
    case_id: str,
    payload: AssistanceRequestInput,
    user: User = Depends(require("assessor")),
    db: AsyncSession = Depends(get_db),
):
    case = await authorized_assessor_case(case_id, db)
    if case.status == "VERIFIED":
        raise HTTPException(409, "A finalized case cannot request new assistance")
    qualification = await db.get(Qualification, case.qualification_id)
    criteria = (
        await db.scalars(
            select(Criterion).where(
                Criterion.qualification_id == case.qualification_id,
                Criterion.id.in_(payload.criterion_ids),
            )
        )
    ).all()
    evidence = (
        await db.scalars(
            select(Evidence).where(
                Evidence.case_id == case.id,
                Evidence.id.in_(payload.evidence_ids),
            )
        )
    ).all()
    if len(criteria) != len(payload.criterion_ids):
        raise HTTPException(422, "A selected criterion is outside this qualification version")
    if len(evidence) != len(payload.evidence_ids):
        raise HTTPException(422, "A selected evidence item is outside this case")
    if any(item.criterion_id not in set(payload.criterion_ids) for item in evidence):
        raise HTTPException(422, "Selected evidence must belong to a selected criterion")
    context = AssistanceContext(
        case_id=case.id,
        qualification_id=qualification.id,
        qualification_code=qualification.code,
        qualification_version=qualification.version,
        qualification_title=qualification.title,
        criteria=[
            {
                "id": item.id,
                "code": item.code,
                "description": item.description,
                "mandatory": item.mandatory,
                "requires_practical": item.requires_practical,
            }
            for item in criteria
        ],
        evidence=[
            {"id": item.id, "criterion_id": item.criterion_id, "description": item.description}
            for item in evidence
        ],
    )
    if len(context.model_dump_json()) > 50_000:
        raise HTTPException(413, "Selected review context exceeds the assistance request limit")
    if not ai_provider.available:
        raise HTTPException(503, ai_provider.unavailable_reason)
    requested_at = datetime.now(UTC)
    try:
        raw_result = await asyncio.wait_for(
            ai_provider.generate(context), timeout=AI_REQUEST_TIMEOUT_SECONDS
        )
        result = ProviderResult.model_validate(raw_result)
        if len(result.model_dump_json()) > 50_000:
            raise ValueError("Provider response exceeds the configured response limit")
        validate_scope(result.output, payload.evidence_ids, payload.criterion_ids)
    except AssistanceUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    except (TimeoutError, AssistanceTimeout) as exc:
        raise HTTPException(
            504, "AI assistance timed out. Continue the manual assessment."
        ) from exc
    except AssistanceRateLimited as exc:
        raise HTTPException(
            429, "AI assistance is temporarily rate limited. Continue manually."
        ) from exc
    except AssistanceRefused as exc:
        raise HTTPException(
            422, "The provider declined this request. Continue the manual assessment."
        ) from exc
    except (ValidationError, ValueError, TypeError) as exc:
        raise HTTPException(
            502, "AI assistance returned an invalid or out-of-scope response."
        ) from exc
    except Exception as exc:
        raise HTTPException(502, "AI assistance failed. Continue the manual assessment.") from exc

    response_at = datetime.now(UTC)
    record = EvidenceAssistanceSuggestion(
        case_id=case.id,
        assessor_id=user.id,
        qualification_id=qualification.id,
        qualification_version=qualification.version,
        provider_id=result.provider_id,
        model_id=result.model_id,
        template_version=result.template_version,
        evidence_ids=json.dumps(payload.evidence_ids),
        criterion_ids=json.dumps(payload.criterion_ids),
        original_output=result.output.model_dump_json(),
        request_at=requested_at,
        response_at=response_at,
    )
    db.add(record)
    await db.flush()
    await audit(
        db,
        user,
        "assessor.ai_suggestion.created",
        "evidence_assistance_suggestion",
        record.id,
        {"case_id": case.id, "evidence_ids": payload.evidence_ids},
    )
    await db.commit()
    return assistance_record(record)


@app.patch("/api/assessor/cases/{case_id}/ai-suggestions/{suggestion_id}")
async def record_ai_suggestion_disposition(
    case_id: str,
    suggestion_id: str,
    payload: AssistanceDispositionInput,
    user: User = Depends(require("assessor")),
    db: AsyncSession = Depends(get_db),
):
    case = await authorized_assessor_case(case_id, db)
    if case.status == "VERIFIED":
        raise HTTPException(409, "A finalized case does not accept suggestion dispositions")
    suggestion = await db.get(EvidenceAssistanceSuggestion, suggestion_id)
    if not suggestion or suggestion.case_id != case.id:
        raise HTTPException(404, "AI suggestion not found")
    if suggestion.disposition != "PENDING":
        raise HTTPException(409, "This suggestion already has a recorded disposition")
    allowed_evidence = json.loads(suggestion.evidence_ids)
    SuggestionOutput.model_validate_json(suggestion.original_output)
    allowed_criteria = json.loads(suggestion.criterion_ids)
    if payload.disposition == "EDITED":
        try:
            validate_scope(payload.edited_output, allowed_evidence, list(allowed_criteria))
        except (ValueError, TypeError) as exc:
            raise HTTPException(
                422, "Edited suggestion references evidence or criteria outside its scope"
            ) from exc
        suggestion.edited_output = payload.edited_output.model_dump_json()
    suggestion.disposition = payload.disposition
    suggestion.disposition_at = datetime.now(UTC)
    await audit(
        db,
        user,
        "assessor.ai_suggestion.disposition_recorded",
        "evidence_assistance_suggestion",
        suggestion.id,
        {"case_id": case.id, "disposition": payload.disposition},
    )
    await db.commit()
    return assistance_record(suggestion)


@app.patch("/api/assessor/evidence/{evidence_id}")
async def assess_evidence(
    evidence_id: str,
    payload: ReviewEvidenceInput,
    user: User = Depends(require("assessor")),
    db: AsyncSession = Depends(get_db),
):
    item = await db.get(Evidence, evidence_id)
    if not item:
        raise HTTPException(404, "Evidence not found")
    if item.task_attempt_id is not None:
        raise HTTPException(409, "Review practical-task evidence through its task attempt")
    case = await db.get(AssessmentCase, item.case_id)
    if not case or case.status not in {"SUBMITTED", "IN_REVIEW"}:
        raise HTTPException(409, "This case is not open for assessor review")
    item.review_status = payload.status
    item.reviewer_notes = payload.notes.strip()
    if payload.status == "NEEDS_MORE":
        case.status = "NEEDS_MORE"
    elif case.status == "SUBMITTED":
        case.status = "IN_REVIEW"
    await audit(
        db,
        user,
        "evidence.reviewed",
        "evidence",
        item.id,
        {"status": item.review_status, "notes": item.reviewer_notes},
    )
    await db.commit()
    return {"id": item.id, "review_status": item.review_status}


@app.put("/api/assessor/task-attempts/{attempt_id}/review")
async def review_practical_task_attempt(
    attempt_id: str,
    payload: PracticalTaskReviewInput,
    user: User = Depends(require("assessor")),
    db: AsyncSession = Depends(get_db),
):
    attempt = await db.get(PracticalTaskAttempt, attempt_id)
    if not attempt:
        raise HTTPException(404, "Practical task attempt not found")
    case = await db.get(AssessmentCase, attempt.case_id)
    task = await db.get(ApprovedTask, attempt.task_id)
    evidence = await db.scalar(select(Evidence).where(Evidence.task_attempt_id == attempt.id))
    if (
        not case
        or not task
        or not evidence
        or case.worker_id != attempt.worker_id
        or case.qualification_id != attempt.qualification_id
        or task.qualification_id != attempt.qualification_id
        or task.criterion_id != attempt.criterion_id
        or evidence.case_id != case.id
        or evidence.worker_id != attempt.worker_id
        or evidence.criterion_id != attempt.criterion_id
    ):
        raise HTTPException(404, "Practical task attempt not found")
    if case.status not in {"SUBMITTED", "IN_REVIEW"}:
        raise HTTPException(409, "This case is not open for practical-task review")
    existing = await db.scalar(
        select(PracticalTaskAttemptReview).where(
            PracticalTaskAttemptReview.attempt_id == attempt.id
        )
    )
    if existing:
        raise HTTPException(409, "This practical task attempt has already been reviewed")
    review = PracticalTaskAttemptReview(
        attempt_id=attempt.id,
        assessor_id=user.id,
        result=payload.result,
        notes=payload.notes,
    )
    attempt.active_attempt = False
    db.add(review)
    if payload.result == "NEEDS_MORE":
        case.status = "NEEDS_MORE"
    elif case.status == "SUBMITTED":
        case.status = "IN_REVIEW"
    await db.flush()
    await audit(
        db,
        user,
        "practical_task.attempt_reviewed",
        "practical_task_attempt",
        attempt.id,
        {"result": review.result, "notes": review.notes, "criterion_id": attempt.criterion_id},
    )
    await db.commit()
    return {"id": review.id, "result": review.result}


@app.put("/api/assessor/cases/{case_id}/criteria/{criterion_id}")
async def decide_criterion(
    case_id: str,
    criterion_id: str,
    payload: DecisionInput,
    user: User = Depends(require("assessor")),
    db: AsyncSession = Depends(get_db),
):
    case = await db.get(AssessmentCase, case_id)
    criterion = await db.get(Criterion, criterion_id)
    if not case or not criterion or criterion.qualification_id != case.qualification_id:
        raise HTTPException(404, "Case or criterion not found")
    if case.status not in {"SUBMITTED", "IN_REVIEW"}:
        raise HTTPException(409, "This case is not open for assessor decisions")
    decision = await db.scalar(
        select(CriterionDecision).where(
            CriterionDecision.case_id == case_id, CriterionDecision.criterion_id == criterion_id
        )
    )
    previous = None if decision is None else {"result": decision.result, "notes": decision.notes}
    if decision is None:
        decision = CriterionDecision(
            case_id=case_id,
            criterion_id=criterion_id,
            assessor_id=user.id,
            result=payload.result,
            notes=payload.notes.strip(),
        )
        db.add(decision)
        await db.flush()
    else:
        decision.assessor_id = user.id
        decision.result = payload.result
        decision.notes = payload.notes.strip()
    if case.status == "SUBMITTED":
        case.status = "IN_REVIEW"
    await audit(
        db,
        user,
        "assessment.criterion_decided",
        "criterion_decision",
        decision.id,
        {
            "previous": previous,
            "result": payload.result,
            "notes": decision.notes,
            "criterion_id": criterion_id,
        },
    )
    await db.commit()
    return {"result": decision.result}


@app.post("/api/assessor/cases/{case_id}/verify")
async def verify_case(
    case_id: str, user: User = Depends(require("assessor")), db: AsyncSession = Depends(get_db)
):
    case = await db.get(AssessmentCase, case_id)
    if not case:
        raise HTTPException(404, "Case not found")
    criteria = (
        await db.scalars(
            select(Criterion).where(
                Criterion.qualification_id == case.qualification_id, Criterion.mandatory.is_(True)
            )
        )
    ).all()
    decisions = (
        await db.scalars(select(CriterionDecision).where(CriterionDecision.case_id == case.id))
    ).all()
    mapped = {d.criterion_id: d for d in decisions}
    evidence = (await db.scalars(select(Evidence).where(Evidence.case_id == case.id))).all()
    evidence_by_criterion: dict[str, list[Evidence]] = {}
    for item in evidence:
        evidence_by_criterion.setdefault(item.criterion_id, []).append(item)
    if case.status not in {"SUBMITTED", "IN_REVIEW"}:
        raise HTTPException(409, "The worker must submit this case before competency verification")
    if not criteria:
        raise HTTPException(409, "This qualification has no mandatory criteria to verify")
    missing = [
        c.code
        for c in criteria
        if c.id not in mapped
        or mapped[c.id].result != "COMPETENT"
        or decision_needs_reconfirmation(mapped[c.id], evidence_by_criterion.get(c.id, []))
    ]
    if missing:
        raise HTTPException(
            409,
            "All mandatory criteria need a current COMPETENT assessor decision; reconfirm decisions after new evidence",
            headers={"X-Missing-Criteria": ", ".join(missing)},
        )
    practical_tasks = (
        await db.scalars(
            select(ApprovedTask).where(
                ApprovedTask.qualification_id == case.qualification_id,
                ApprovedTask.approved.is_(True),
                ApprovedTask.criterion_id.in_([criterion.id for criterion in criteria]),
            )
        )
    ).all()
    for task in practical_tasks:
        latest = await db.scalar(
            select(PracticalTaskAttempt)
            .where(PracticalTaskAttempt.case_id == case.id, PracticalTaskAttempt.task_id == task.id)
            .order_by(PracticalTaskAttempt.submitted_at.desc(), PracticalTaskAttempt.id.desc())
            .limit(1)
        )
        latest_review = (
            await db.scalar(
                select(PracticalTaskAttemptReview).where(
                    PracticalTaskAttemptReview.attempt_id == latest.id
                )
            )
            if latest
            else None
        )
        if not latest_review or latest_review.result != "SATISFACTORY":
            raise HTTPException(
                409,
                f"An authorized assessor must record a satisfactory review for {task.title}",
            )
    prior = await db.scalar(select(Competency).where(Competency.case_id == case.id))
    if prior:
        return {"verified": True, "competency_id": prior.id}
    record = Competency(
        worker_id=case.worker_id,
        qualification_id=case.qualification_id,
        case_id=case.id,
        verified_by=user.id,
    )
    case.status = "VERIFIED"
    db.add(record)
    await db.flush()
    await audit(
        db,
        user,
        "assessment.competency.verified",
        "competency",
        record.id,
        {"qualification_id": case.qualification_id},
    )
    await db.commit()
    return {"verified": True, "competency_id": record.id}


@app.get("/api/evidence/{evidence_id}/file")
async def get_evidence_file(
    evidence_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
):
    from fastapi.responses import FileResponse

    item = await db.get(Evidence, evidence_id)
    if not item:
        raise HTTPException(404, "Evidence not found")
    case = await db.get(AssessmentCase, item.case_id)
    if not case or case.worker_id != item.worker_id:
        raise HTTPException(404, "Evidence not found")
    if user.role == "worker":
        profile = await worker_profile(db, user.id)
        if item.worker_id != profile.id:
            raise HTTPException(403, "Not authorized")
    elif user.role == "assessor":
        if case.status == "IN_PROGRESS":
            raise HTTPException(403, "Evidence is not available until the worker submits the case")
    else:
        raise HTTPException(403, "Not authorized")
    path = Path(settings.evidence_dir) / item.stored_name
    if not path.is_file():
        raise HTTPException(404, "Evidence file is unavailable")
    return FileResponse(
        path,
        media_type=item.media_type,
        filename=item.original_name,
        content_disposition_type="attachment",
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )


@app.get("/api/customers/workers")
async def discover_workers(
    q: str = Query(default="", max_length=120),
    area: str = Query(default="", max_length=160),
    db: AsyncSession = Depends(get_db),
):
    profiles = (
        await db.scalars(
            select(WorkerProfile)
            .where(WorkerProfile.available.is_(True))
            .order_by(WorkerProfile.id)
        )
    ).all()
    out = []
    for profile in profiles:
        account = await db.get(User, profile.user_id)
        if not account or not account.active:
            continue
        quals = (
            await db.execute(
                select(Competency, Qualification)
                .join(Qualification, Competency.qualification_id == Qualification.id)
                .where(Competency.worker_id == profile.id)
            )
        ).all()
        skills = (
            await db.scalars(select(DeclaredSkill).where(DeclaredSkill.worker_id == profile.id))
        ).all()
        record = public_profile(profile, account, skills, len(quals))
        record.pop("user_id", None)
        record["verified_qualifications"] = [
            {
                "title": qual.title,
                "code": qual.code,
                "version": qual.version,
                "source_name": qual.source_name,
                "source_url": qual.source_url,
                "official": qual.official,
            }
            for _, qual in quals
        ]
        hay = " ".join(
            [account.full_name, profile.trade, profile.service_area, profile.bio]
            + [s.name for s in skills]
            + [qual.title for _, qual in quals]
        ).lower()
        if q.strip() and q.strip().lower() not in hay:
            continue
        if area.strip() and area.strip().lower() not in profile.service_area.lower():
            continue
        out.append(record)
    return out


@app.post("/api/customer/requests")
async def create_request(
    payload: ServiceInput,
    user: User = Depends(require("customer")),
    db: AsyncSession = Depends(get_db),
):
    profile = await db.get(WorkerProfile, payload.worker_id)
    if not profile or not profile.available:
        raise HTTPException(404, "Worker is unavailable")
    worker = await db.get(User, profile.user_id)
    if not worker or not worker.active or worker.role != "worker":
        raise HTTPException(404, "Worker is unavailable")
    duplicate = await db.scalar(
        select(ServiceRequest).where(
            ServiceRequest.customer_id == user.id,
            ServiceRequest.worker_id == profile.id,
            ServiceRequest.description == payload.description,
            ServiceRequest.location == payload.location,
            ServiceRequest.status.in_(("REQUESTED", "ACCEPTED")),
        )
    )
    if duplicate:
        raise HTTPException(409, "You already have an open request with this worker")
    request = ServiceRequest(
        customer_id=user.id,
        worker_id=profile.id,
        description=payload.description.strip(),
        location=payload.location.strip(),
    )
    db.add(request)
    await db.flush()
    await audit(db, user, "service.request.created", "service_request", request.id)
    await db.commit()
    return {"id": request.id, "status": request.status}


@app.get("/api/customer/requests")
async def customer_requests(
    user: User = Depends(require("customer")), db: AsyncSession = Depends(get_db)
):
    rows = (
        await db.scalars(
            select(ServiceRequest)
            .where(ServiceRequest.customer_id == user.id)
            .order_by(ServiceRequest.created_at.desc())
        )
    ).all()
    out = []
    for row in rows:
        p = await db.get(WorkerProfile, row.worker_id)
        w = await db.get(User, p.user_id)
        review = await db.scalar(select(CustomerReview).where(CustomerReview.request_id == row.id))
        out.append(
            {
                "id": row.id,
                "worker_id": p.id,
                "worker_name": w.full_name,
                "worker_trade": p.trade,
                "worker_service_area": p.service_area,
                "description": row.description,
                "location": row.location,
                "status": row.status,
                "review": (
                    {"rating": review.rating, "comment": review.comment} if review else None
                ),
            }
        )
    return out


@app.get("/api/worker/requests")
async def worker_requests(
    user: User = Depends(require("worker")), db: AsyncSession = Depends(get_db)
):
    profile = await worker_profile(db, user.id)
    rows = (
        await db.scalars(
            select(ServiceRequest)
            .where(ServiceRequest.worker_id == profile.id)
            .order_by(ServiceRequest.created_at.desc())
        )
    ).all()
    out = []
    for row in rows:
        customer = await db.get(User, row.customer_id)
        out.append(
            {
                "id": row.id,
                "customer_name": customer.full_name,
                "description": row.description,
                "location": row.location,
                "status": row.status,
            }
        )
    return out


@app.patch("/api/requests/{request_id}")
async def update_request(
    request_id: str,
    payload: ServiceStatusInput,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await db.get(ServiceRequest, request_id)
    if not row:
        raise HTTPException(404, "Request not found")
    profile = await worker_profile(db, user.id) if user.role == "worker" else None
    if (
        user.role == "worker"
        and row.worker_id == profile.id
        and payload.status in {"ACCEPTED", "DECLINED", "COMPLETED"}
    ):
        allowed = {"REQUESTED": {"ACCEPTED", "DECLINED"}, "ACCEPTED": {"COMPLETED"}}
    elif user.role == "customer" and row.customer_id == user.id and payload.status == "CANCELLED":
        allowed = {"REQUESTED": {"CANCELLED"}, "ACCEPTED": {"CANCELLED"}}
    else:
        raise HTTPException(403, "Not authorized to update this request")
    if payload.status not in allowed.get(row.status, set()):
        raise HTTPException(409, "That status change is not allowed")
    row.status = payload.status
    await audit(
        db,
        user,
        "service.request.status_changed",
        "service_request",
        row.id,
        {"status": row.status},
    )
    await db.commit()
    return {"id": row.id, "status": row.status}


@app.post("/api/customer/requests/{request_id}/review")
async def review_request(
    request_id: str,
    payload: ReviewInput,
    user: User = Depends(require("customer")),
    db: AsyncSession = Depends(get_db),
):
    row = await db.get(ServiceRequest, request_id)
    if not row or row.customer_id != user.id:
        raise HTTPException(404, "Request not found")
    if row.status != "COMPLETED":
        raise HTTPException(409, "Reviews are available after the service is completed")
    if await db.scalar(select(CustomerReview).where(CustomerReview.request_id == row.id)):
        raise HTTPException(409, "This request has already been reviewed")
    review = CustomerReview(
        request_id=row.id,
        customer_id=user.id,
        worker_id=row.worker_id,
        rating=payload.rating,
        comment=payload.comment,
    )
    db.add(review)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(409, "This request has already been reviewed") from exc
    await audit(db, user, "customer.review.created", "customer_review", review.id)
    await db.commit()
    return {"id": review.id, "rating": review.rating}


@app.get("/api/admin/overview")
async def admin_overview(
    user: User = Depends(require("admin")), db: AsyncSession = Depends(get_db)
):
    counts = {}
    for key, model in [
        ("users", User),
        ("workers", WorkerProfile),
        ("cases", AssessmentCase),
        ("evidence", Evidence),
        ("verified", Competency),
        ("requests", ServiceRequest),
    ]:
        counts[key] = await db.scalar(select(func.count()).select_from(model)) or 0
    return counts


@app.get("/api/admin/users")
async def admin_users(user: User = Depends(require("admin")), db: AsyncSession = Depends(get_db)):
    rows = (await db.scalars(select(User).order_by(User.created_at.desc()))).all()
    return [
        {**public_user(x), "active": x.active, "created_at": x.created_at.isoformat()} for x in rows
    ]


@app.patch("/api/admin/users/{user_id}")
async def admin_user_status(
    user_id: str,
    payload: UserStatusInput,
    user: User = Depends(require("admin")),
    db: AsyncSession = Depends(get_db),
):
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    if target.id == user.id and not payload.active:
        raise HTTPException(409, "You cannot deactivate your own account")
    if target.active != payload.active:
        target.session_version += 1
    target.active = payload.active
    await audit(db, user, "admin.user.status_changed", "user", target.id, {"active": target.active})
    await db.commit()
    return {"id": target.id, "active": target.active}


@app.patch("/api/admin/users/{user_id}/role")
async def admin_user_role(
    user_id: str,
    payload: UserRoleInput,
    user: User = Depends(require("admin")),
    db: AsyncSession = Depends(get_db),
):
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    if target.id == user.id and payload.role != "admin":
        raise HTTPException(409, "You cannot remove your own administrator role")
    previous = target.role
    if previous != payload.role:
        target.session_version += 1
    target.role = payload.role
    if target.role == "worker" and not await worker_profile(db, target.id):
        db.add(WorkerProfile(user_id=target.id))
    await audit(
        db,
        user,
        "admin.user.role_changed",
        "user",
        target.id,
        {"from": previous, "to": target.role},
    )
    await db.commit()
    return {"id": target.id, "role": target.role}


@app.post("/api/admin/qualifications")
async def admin_create_qualification(
    payload: QualificationInput,
    user: User = Depends(require("admin")),
    db: AsyncSession = Depends(get_db),
):
    if payload.official and not payload.source_url:
        raise HTTPException(422, "Official qualifications need an authoritative source URL")
    q = Qualification(**payload.model_dump(), active=True)
    db.add(q)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(409, "This qualification code and version already exist") from exc
    await audit(
        db,
        user,
        "admin.qualification.created",
        "qualification",
        q.id,
        {"code": q.code, "version": q.version},
    )
    await db.commit()
    return {
        "id": q.id,
        "code": q.code,
        "version": q.version,
        "title": q.title,
        "official": q.official,
    }


@app.post("/api/admin/qualifications/{qualification_id}/criteria")
async def admin_create_criterion(
    qualification_id: str,
    payload: CriterionInput,
    user: User = Depends(require("admin")),
    db: AsyncSession = Depends(get_db),
):
    q = await db.get(Qualification, qualification_id)
    if not q:
        raise HTTPException(404, "Qualification not found")
    item = Criterion(qualification_id=q.id, **payload.model_dump())
    db.add(item)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(409, "This criterion code already exists for this version") from exc
    await audit(
        db,
        user,
        "admin.criterion.created",
        "criterion",
        item.id,
        {"qualification_version": q.version},
    )
    await db.commit()
    return {"id": item.id, "code": item.code}


@app.post("/api/admin/qualifications/{qualification_id}/tasks")
async def admin_create_task(
    qualification_id: str,
    payload: TaskInput,
    user: User = Depends(require("admin")),
    db: AsyncSession = Depends(get_db),
):
    criterion = await db.get(Criterion, payload.criterion_id)
    if not criterion or criterion.qualification_id != qualification_id:
        raise HTTPException(422, "Criterion must belong to this qualification")
    if payload.official and not payload.source_url:
        raise HTTPException(422, "Official practical tasks need an authoritative source URL")
    if payload.approved and not payload.source_url:
        raise HTTPException(422, "Approved practical tasks need a source URL")
    task = ApprovedTask(qualification_id=qualification_id, **payload.model_dump())
    db.add(task)
    await db.flush()
    await audit(
        db,
        user,
        "admin.practical_task.created",
        "approved_task",
        task.id,
        {"approved": task.approved},
    )
    await db.commit()
    return {"id": task.id, "approved": task.approved}


@app.get("/api/admin/audit")
async def admin_audit(user: User = Depends(require("admin")), db: AsyncSession = Depends(get_db)):
    rows = (
        await db.scalars(select(AuditEvent).order_by(AuditEvent.created_at.desc()).limit(200))
    ).all()
    return [
        {
            "id": x.id,
            "actor_id": x.actor_id,
            "action": x.action,
            "entity_type": x.entity_type,
            "entity_id": x.entity_id,
            "details": x.details,
            "created_at": x.created_at.isoformat(),
        }
        for x in rows
    ]
