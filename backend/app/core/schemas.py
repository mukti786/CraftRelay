"""
Shared Pydantic response schemas used across API endpoints.

Part 1 schemas (ApiResponse, HealthResponse) are preserved.
All domain schemas are added here for Part 2 onwards.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field

# ── Generic envelope (Part 1) ─────────────────────────────────────────────────

DataT = TypeVar("DataT")


class ApiResponse(BaseModel, Generic[DataT]):
    """Standard success envelope returned by all CraftRelay endpoints."""

    data: DataT
    message: str | None = None


class HealthResponse(BaseModel):
    status: str
    version: str
    environment: str


# ── Auth ──────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: str


# ── Users ─────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: str
    full_name: str
    password: str
    role: str = "worker"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    full_name: str
    role: str
    created_at: datetime


# ── Evidence ──────────────────────────────────────────────────────────────────

class EvidenceItemCreate(BaseModel):
    skill_name: str
    description: str
    file_type: str  # image | document | video
    criterion_id: str | None = None


class EvidenceItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    skill_name: str
    description: str
    file_type: str
    submitted_at: datetime
    review_status: str
    reviewer_notes: str | None = None


# ── Gap engine criterion status (mirrors gap_engine.CriterionGapStatus) ───────

class CriterionStatus(str, Enum):
    GAP = "GAP"
    PENDING_REVIEW = "PENDING_REVIEW"
    ADDITIONAL_EVIDENCE_REQUIRED = "ADDITIONAL_EVIDENCE_REQUIRED"
    PRACTICAL_VERIFICATION_REQUIRED = "PRACTICAL_VERIFICATION_REQUIRED"
    READY_FOR_ASSESSOR_DECISION = "READY_FOR_ASSESSOR_DECISION"
    VERIFIED = "VERIFIED"


# ── Qualifications ────────────────────────────────────────────────────────────

class CriterionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    text: str
    mandatory: bool
    display_order: int
    # Gap engine fields — not ORM columns; populated in router
    status: CriterionStatus = CriterionStatus.GAP
    gap_reason: str = "No evidence submitted for this criterion"
    linked_evidence: list[EvidenceItemOut] = Field(default_factory=list)


class QualificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    code: str
    title: str
    version: str
    note: str | None = None
    effective_date: str
    criteria: list[CriterionOut] = Field(default_factory=list)


# ── Workers ───────────────────────────────────────────────────────────────────

class DeclaredSkillOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    skill_name: str
    declared_at: datetime
    assessment_status: str
    evidence_count: int = 0


class VerifiedCompetencyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    skill_name: str
    qualification_id: str
    criterion_id: str | None = None
    verified_at: datetime
    note: str


class WorkerProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    full_name: str
    trade: str
    experience_years: int
    service_area: str
    bio: str | None = None
    is_available: bool
    average_rating: float
    review_count: int
    declared_skills: list[DeclaredSkillOut] = Field(default_factory=list)
    verified_competencies: list[VerifiedCompetencyOut] = Field(default_factory=list)


# ── Assessment ────────────────────────────────────────────────────────────────

class GapSummary(BaseModel):
    total: int
    gap: int
    pending: int
    verified: int
    needs_action: int


class AssessmentCaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    worker_id: str
    qualification: QualificationOut
    status: str
    submitted_at: datetime
    updated_at: datetime
    gap_summary: GapSummary


class AssessorDecisionCreate(BaseModel):
    criterion_id: str
    decision: Literal["APPROVED", "REJECTED", "MORE_EVIDENCE_REQUIRED"]
    notes: str


# ── Service Requests ──────────────────────────────────────────────────────────

class ServiceRequestCreate(BaseModel):
    worker_id: str
    skill_requested: str
    description: str
    location: str
    preferred_date: str


class ServiceRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    customer_id: str
    worker_id: str
    skill_requested: str
    description: str
    location: str
    preferred_date: str
    status: str
    created_at: datetime
    updated_at: datetime


class ServiceRequestStatusUpdate(BaseModel):
    status: str  # ServiceRequestStatus value


# ── Reviews ───────────────────────────────────────────────────────────────────

class CustomerReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str
