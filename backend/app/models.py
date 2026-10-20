from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def uid() -> str:
    return str(uuid4())


def now_utc() -> datetime:
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(160))
    password_hash: Mapped[str] = mapped_column(String(512))
    role: Mapped[str] = mapped_column(String(24), index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    session_version: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class WorkerProfile(Base):
    __tablename__ = "worker_profiles"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    trade: Mapped[str] = mapped_column(String(100), default="")
    experience_years: Mapped[int] = mapped_column(Integer, default=0)
    service_area: Mapped[str] = mapped_column(String(160), default="")
    bio: Mapped[str] = mapped_column(Text, default="")
    available: Mapped[bool] = mapped_column(Boolean, default=True)


class DeclaredSkill(Base):
    __tablename__ = "declared_skills"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    worker_id: Mapped[str] = mapped_column(
        ForeignKey("worker_profiles.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    years_experience: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class Qualification(Base):
    __tablename__ = "qualifications"
    __table_args__ = (UniqueConstraint("code", "version", name="uq_qualification_code_version"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    code: Mapped[str] = mapped_column(String(80), index=True)
    version: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(200))
    source_name: Mapped[str] = mapped_column(String(200), default="Illustrative demo; not official")
    source_url: Mapped[str] = mapped_column(String(1000), default="")
    official: Mapped[bool] = mapped_column(Boolean, default=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class Criterion(Base):
    __tablename__ = "criteria"
    __table_args__ = (
        UniqueConstraint("qualification_id", "code", name="uq_criterion_code_version"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    qualification_id: Mapped[str] = mapped_column(
        ForeignKey("qualifications.id", ondelete="CASCADE"), index=True
    )
    code: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(Text)
    mandatory: Mapped[bool] = mapped_column(Boolean, default=True)
    requires_practical: Mapped[bool] = mapped_column(Boolean, default=False)


class ApprovedTask(Base):
    __tablename__ = "approved_tasks"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    qualification_id: Mapped[str] = mapped_column(
        ForeignKey("qualifications.id", ondelete="CASCADE"), index=True
    )
    criterion_id: Mapped[str] = mapped_column(
        ForeignKey("criteria.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    instructions: Mapped[str] = mapped_column(Text)
    rubric: Mapped[str] = mapped_column(Text)
    source_name: Mapped[str] = mapped_column(
        String(200), default="Illustrative local task; not official"
    )
    source_url: Mapped[str] = mapped_column(String(1000), default="")
    official: Mapped[bool] = mapped_column(Boolean, default=False)
    approved: Mapped[bool] = mapped_column(Boolean, default=False)


class AssessmentCase(Base):
    __tablename__ = "assessment_cases"
    __table_args__ = (
        UniqueConstraint("worker_id", "qualification_id", name="uq_worker_qualification_case"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    worker_id: Mapped[str] = mapped_column(
        ForeignKey("worker_profiles.id", ondelete="CASCADE"), index=True
    )
    qualification_id: Mapped[str] = mapped_column(ForeignKey("qualifications.id"), index=True)
    status: Mapped[str] = mapped_column(String(40), default="IN_PROGRESS")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class Evidence(Base):
    __tablename__ = "evidence"
    __table_args__ = (UniqueConstraint("task_attempt_id", name="uq_evidence_task_attempt"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    case_id: Mapped[str] = mapped_column(
        ForeignKey("assessment_cases.id", ondelete="CASCADE"), index=True
    )
    worker_id: Mapped[str] = mapped_column(
        ForeignKey("worker_profiles.id", ondelete="CASCADE"), index=True
    )
    criterion_id: Mapped[str] = mapped_column(ForeignKey("criteria.id"), index=True)
    task_attempt_id: Mapped[str | None] = mapped_column(
        ForeignKey("practical_task_attempts.id", ondelete="RESTRICT"), index=True, nullable=True
    )
    description: Mapped[str] = mapped_column(Text)
    original_name: Mapped[str] = mapped_column(String(255))
    stored_name: Mapped[str] = mapped_column(String(255), unique=True)
    media_type: Mapped[str] = mapped_column(String(120))
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    review_status: Mapped[str] = mapped_column(String(40), default="PENDING")
    reviewer_notes: Mapped[str] = mapped_column(Text, default="")
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class PracticalTaskAttempt(Base):
    __tablename__ = "practical_task_attempts"
    __table_args__ = (
        Index(
            "uq_active_practical_task_attempt",
            "case_id",
            "task_id",
            unique=True,
            sqlite_where=text("active_attempt = 1"),
            postgresql_where=text("active_attempt"),
        ),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    case_id: Mapped[str] = mapped_column(
        ForeignKey("assessment_cases.id", ondelete="CASCADE"), index=True
    )
    worker_id: Mapped[str] = mapped_column(
        ForeignKey("worker_profiles.id", ondelete="CASCADE"), index=True
    )
    qualification_id: Mapped[str] = mapped_column(ForeignKey("qualifications.id"), index=True)
    criterion_id: Mapped[str] = mapped_column(ForeignKey("criteria.id"), index=True)
    task_id: Mapped[str] = mapped_column(ForeignKey("approved_tasks.id"), index=True)
    description: Mapped[str] = mapped_column(Text)
    active_attempt: Mapped[bool] = mapped_column(Boolean, default=True)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class PracticalTaskAttemptReview(Base):
    __tablename__ = "practical_task_attempt_reviews"
    __table_args__ = (UniqueConstraint("attempt_id", name="uq_task_attempt_review"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    attempt_id: Mapped[str] = mapped_column(
        ForeignKey("practical_task_attempts.id", ondelete="CASCADE"), index=True
    )
    assessor_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    result: Mapped[str] = mapped_column(String(40))
    notes: Mapped[str] = mapped_column(Text)
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class CriterionDecision(Base):
    __tablename__ = "criterion_decisions"
    __table_args__ = (
        UniqueConstraint("case_id", "criterion_id", name="uq_case_criterion_decision"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    case_id: Mapped[str] = mapped_column(
        ForeignKey("assessment_cases.id", ondelete="CASCADE"), index=True
    )
    criterion_id: Mapped[str] = mapped_column(ForeignKey("criteria.id"), index=True)
    assessor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    result: Mapped[str] = mapped_column(String(40))
    notes: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, onupdate=now_utc
    )


class EvidenceAssistanceSuggestion(Base):
    __tablename__ = "evidence_assistance_suggestions"
    __table_args__ = (Index("ix_ai_suggestion_case_requested", "case_id", "request_at"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    case_id: Mapped[str] = mapped_column(
        ForeignKey("assessment_cases.id", ondelete="CASCADE"), index=True
    )
    assessor_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    qualification_id: Mapped[str] = mapped_column(ForeignKey("qualifications.id"))
    qualification_version: Mapped[str] = mapped_column(String(40))
    provider_id: Mapped[str] = mapped_column(String(100))
    model_id: Mapped[str | None] = mapped_column(String(160), nullable=True)
    template_version: Mapped[str] = mapped_column(String(40))
    evidence_ids: Mapped[str] = mapped_column(Text)
    criterion_ids: Mapped[str] = mapped_column(Text)
    original_output: Mapped[str] = mapped_column(Text)
    edited_output: Mapped[str | None] = mapped_column(Text, nullable=True)
    disposition: Mapped[str] = mapped_column(String(20), default="PENDING")
    disposition_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    request_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    response_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Competency(Base):
    __tablename__ = "competencies"
    __table_args__ = (
        UniqueConstraint("worker_id", "qualification_id", name="uq_verified_competency"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    worker_id: Mapped[str] = mapped_column(
        ForeignKey("worker_profiles.id", ondelete="CASCADE"), index=True
    )
    qualification_id: Mapped[str] = mapped_column(ForeignKey("qualifications.id"))
    case_id: Mapped[str] = mapped_column(ForeignKey("assessment_cases.id"), unique=True)
    verified_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    verified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class ServiceRequest(Base):
    __tablename__ = "service_requests"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    customer_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    worker_id: Mapped[str] = mapped_column(ForeignKey("worker_profiles.id"), index=True)
    description: Mapped[str] = mapped_column(Text)
    location: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(40), default="REQUESTED")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, onupdate=now_utc
    )


class CustomerReview(Base):
    __tablename__ = "customer_reviews"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    request_id: Mapped[str] = mapped_column(ForeignKey("service_requests.id"), unique=True)
    customer_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    worker_id: Mapped[str] = mapped_column(ForeignKey("worker_profiles.id"), index=True)
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(100), index=True)
    entity_type: Mapped[str] = mapped_column(String(100))
    entity_id: Mapped[str] = mapped_column(String(36), index=True)
    details: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
