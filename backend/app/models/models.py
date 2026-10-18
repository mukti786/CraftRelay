"""
CraftRelay ORM models.

All primary keys are string UUIDs.
Enums are Python str-Enum classes so they serialise cleanly as strings.
"""

import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import (
    Boolean,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


# ── Helpers ───────────────────────────────────────────────────────────────────

def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Enums ─────────────────────────────────────────────────────────────────────

class UserRole(str, Enum):
    worker = "worker"
    assessor = "assessor"
    customer = "customer"
    admin = "admin"


class AssessmentStatus(str, Enum):
    NOT_STARTED = "NOT_STARTED"
    IN_PROGRESS = "IN_PROGRESS"
    AWAITING_ASSESSOR = "AWAITING_ASSESSOR"
    NEEDS_REVISION = "NEEDS_REVISION"
    COMPLETED = "COMPLETED"


class FileType(str, Enum):
    image = "image"
    document = "document"
    video = "video"


class ReviewStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class ServiceRequestStatus(str, Enum):
    REQUESTED = "REQUESTED"
    ACCEPTED = "ACCEPTED"
    DECLINED = "DECLINED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETION_PENDING = "COMPLETION_PENDING"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


# ── Models ────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False, default=UserRole.worker)
    created_at: Mapped[datetime] = mapped_column(default=_now)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # relationships
    worker_profile: Mapped["WorkerProfile"] = relationship(
        back_populates="user", uselist=False, lazy="selectin"
    )
    audit_events: Mapped[list["AuditEvent"]] = relationship(
        back_populates="actor", foreign_keys="AuditEvent.actor_id", lazy="select"
    )


class WorkerProfile(Base):
    __tablename__ = "worker_profiles"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), unique=True, nullable=False
    )
    trade: Mapped[str] = mapped_column(String, nullable=False)
    experience_years: Mapped[int] = mapped_column(Integer, default=0)
    service_area: Mapped[str] = mapped_column(String, nullable=False)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)
    average_rating: Mapped[float] = mapped_column(Float, default=0.0)
    review_count: Mapped[int] = mapped_column(Integer, default=0)

    # relationships
    user: Mapped["User"] = relationship(back_populates="worker_profile", lazy="selectin")
    declared_skills: Mapped[list["DeclaredSkill"]] = relationship(
        back_populates="worker", lazy="selectin", cascade="all, delete-orphan"
    )
    verified_competencies: Mapped[list["VerifiedCompetency"]] = relationship(
        back_populates="worker", lazy="selectin", cascade="all, delete-orphan"
    )
    assessment_cases: Mapped[list["AssessmentCase"]] = relationship(
        back_populates="worker", lazy="select"
    )
    evidence_items: Mapped[list["EvidenceItem"]] = relationship(
        back_populates="worker", lazy="select"
    )
    service_requests: Mapped[list["ServiceRequest"]] = relationship(
        back_populates="worker", lazy="select"
    )


class DeclaredSkill(Base):
    __tablename__ = "declared_skills"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    worker_id: Mapped[str] = mapped_column(
        String, ForeignKey("worker_profiles.id"), nullable=False
    )
    skill_name: Mapped[str] = mapped_column(String, nullable=False)
    declared_at: Mapped[datetime] = mapped_column(default=_now)
    assessment_status: Mapped[str] = mapped_column(
        String, default=AssessmentStatus.NOT_STARTED
    )

    worker: Mapped["WorkerProfile"] = relationship(
        back_populates="declared_skills", lazy="select"
    )


class Qualification(Base):
    __tablename__ = "qualifications"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    code: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    version: Mapped[str] = mapped_column(String, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    effective_date: Mapped[str] = mapped_column(String, nullable=False)

    criteria: Mapped[list["QualificationCriterion"]] = relationship(
        back_populates="qualification",
        lazy="selectin",
        cascade="all, delete-orphan",
        order_by="QualificationCriterion.display_order",
    )
    assessment_cases: Mapped[list["AssessmentCase"]] = relationship(
        back_populates="qualification", lazy="select"
    )


class QualificationCriterion(Base):
    __tablename__ = "qualification_criteria"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    qualification_id: Mapped[str] = mapped_column(
        String, ForeignKey("qualifications.id"), nullable=False
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    mandatory: Mapped[bool] = mapped_column(Boolean, default=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0)

    qualification: Mapped["Qualification"] = relationship(
        back_populates="criteria", lazy="select"
    )
    evidence_items: Mapped[list["EvidenceItem"]] = relationship(
        back_populates="criterion", lazy="select"
    )
    verified_competencies: Mapped[list["VerifiedCompetency"]] = relationship(
        back_populates="criterion", lazy="select"
    )


class AssessmentCase(Base):
    __tablename__ = "assessment_cases"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    worker_id: Mapped[str] = mapped_column(
        String, ForeignKey("worker_profiles.id"), nullable=False
    )
    qualification_id: Mapped[str] = mapped_column(
        String, ForeignKey("qualifications.id"), nullable=False
    )
    status: Mapped[str] = mapped_column(String, default=AssessmentStatus.NOT_STARTED)
    submitted_at: Mapped[datetime] = mapped_column(default=_now)
    updated_at: Mapped[datetime] = mapped_column(default=_now)
    assessor_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("users.id"), nullable=True
    )

    worker: Mapped["WorkerProfile"] = relationship(
        back_populates="assessment_cases", lazy="selectin"
    )
    qualification: Mapped["Qualification"] = relationship(
        back_populates="assessment_cases", lazy="selectin"
    )
    assessor: Mapped["User | None"] = relationship(
        foreign_keys=[assessor_id], lazy="select"
    )


class EvidenceItem(Base):
    __tablename__ = "evidence_items"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    worker_id: Mapped[str] = mapped_column(
        String, ForeignKey("worker_profiles.id"), nullable=False
    )
    skill_name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    file_type: Mapped[str] = mapped_column(String, nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(default=_now)
    review_status: Mapped[str] = mapped_column(String, default=ReviewStatus.PENDING)
    reviewer_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    criterion_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("qualification_criteria.id"), nullable=True
    )

    worker: Mapped["WorkerProfile"] = relationship(
        back_populates="evidence_items", lazy="select"
    )
    criterion: Mapped["QualificationCriterion | None"] = relationship(
        back_populates="evidence_items", lazy="select"
    )


class VerifiedCompetency(Base):
    __tablename__ = "verified_competencies"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    worker_id: Mapped[str] = mapped_column(
        String, ForeignKey("worker_profiles.id"), nullable=False
    )
    skill_name: Mapped[str] = mapped_column(String, nullable=False)
    qualification_id: Mapped[str] = mapped_column(
        String, ForeignKey("qualifications.id"), nullable=False
    )
    criterion_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("qualification_criteria.id"), nullable=True
    )
    verified_by_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False
    )
    verified_at: Mapped[datetime] = mapped_column(default=_now)
    note: Mapped[str] = mapped_column(Text, nullable=False, default="")

    worker: Mapped["WorkerProfile"] = relationship(
        back_populates="verified_competencies", lazy="select"
    )
    criterion: Mapped["QualificationCriterion | None"] = relationship(
        back_populates="verified_competencies", lazy="select"
    )
    verified_by: Mapped["User"] = relationship(
        foreign_keys=[verified_by_id], lazy="select"
    )


class ServiceRequest(Base):
    __tablename__ = "service_requests"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    customer_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False
    )
    worker_id: Mapped[str] = mapped_column(
        String, ForeignKey("worker_profiles.id"), nullable=False
    )
    skill_requested: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    location: Mapped[str] = mapped_column(String, nullable=False)
    preferred_date: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(
        String, default=ServiceRequestStatus.REQUESTED
    )
    created_at: Mapped[datetime] = mapped_column(default=_now)
    updated_at: Mapped[datetime] = mapped_column(default=_now)

    customer: Mapped["User"] = relationship(
        foreign_keys=[customer_id], lazy="select"
    )
    worker: Mapped["WorkerProfile"] = relationship(
        back_populates="service_requests", lazy="select"
    )
    review: Mapped["CustomerReview | None"] = relationship(
        back_populates="service_request", uselist=False, lazy="select"
    )


class CustomerReview(Base):
    __tablename__ = "customer_reviews"
    __table_args__ = (UniqueConstraint("service_request_id"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    service_request_id: Mapped[str] = mapped_column(
        String, ForeignKey("service_requests.id"), nullable=False
    )
    customer_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False
    )
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=_now)

    service_request: Mapped["ServiceRequest"] = relationship(
        back_populates="review", lazy="select"
    )
    customer: Mapped["User"] = relationship(
        foreign_keys=[customer_id], lazy="select"
    )


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    actor_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("users.id"), nullable=True
    )
    event_type: Mapped[str] = mapped_column(String, nullable=False)
    entity_type: Mapped[str] = mapped_column(String, nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String, nullable=True)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=_now)

    actor: Mapped["User | None"] = relationship(
        back_populates="audit_events",
        foreign_keys=[actor_id],
        lazy="select",
    )
