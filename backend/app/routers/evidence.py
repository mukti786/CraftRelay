"""
Evidence router

POST /evidence/submit  — worker submits evidence (X-Worker-Id header)
GET  /evidence/        — worker views own evidence items (X-Worker-Id header)

TODO (Part 3): Replace X-Worker-Id header with JWT claim extraction.
"""

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.schemas import EvidenceItemCreate, EvidenceItemOut
from app.models.models import AuditEvent, EvidenceItem, QualificationCriterion, WorkerProfile

router = APIRouter(prefix="/evidence", tags=["evidence"])


@router.post("/submit", response_model=EvidenceItemOut, status_code=status.HTTP_201_CREATED)
async def submit_evidence(
    body: EvidenceItemCreate,
    x_worker_id: str = Header(..., alias="X-Worker-Id"),
    db: AsyncSession = Depends(get_db),
) -> EvidenceItemOut:
    """Worker submits a new evidence item, optionally linked to a criterion."""
    # Validate worker profile exists
    wp_result = await db.execute(
        select(WorkerProfile).where(WorkerProfile.id == x_worker_id)
    )
    wp: WorkerProfile | None = wp_result.scalar_one_or_none()
    if wp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Worker profile not found")

    # Validate criterion if provided
    if body.criterion_id is not None:
        cr_result = await db.execute(
            select(QualificationCriterion).where(QualificationCriterion.id == body.criterion_id)
        )
        if cr_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Criterion not found")

    item = EvidenceItem(
        worker_id=x_worker_id,
        skill_name=body.skill_name,
        description=body.description,
        file_type=body.file_type,
        criterion_id=body.criterion_id,
    )
    db.add(item)

    audit = AuditEvent(
        actor_id=wp.user_id,
        event_type="evidence_submitted",
        entity_type="EvidenceItem",
        entity_id=item.id,
        detail=f"Skill: {body.skill_name}",
    )
    db.add(audit)

    await db.commit()
    await db.refresh(item)

    return EvidenceItemOut(
        id=item.id,
        skill_name=item.skill_name,
        description=item.description,
        file_type=item.file_type,
        submitted_at=item.submitted_at,
        review_status=item.review_status,
        reviewer_notes=item.reviewer_notes,
    )


@router.get("/", response_model=list[EvidenceItemOut])
async def list_evidence(
    x_worker_id: str = Header(..., alias="X-Worker-Id"),
    db: AsyncSession = Depends(get_db),
) -> list[EvidenceItemOut]:
    """Worker retrieves all their own evidence items."""
    result = await db.execute(
        select(EvidenceItem).where(EvidenceItem.worker_id == x_worker_id)
    )
    items = result.scalars().all()
    return [
        EvidenceItemOut(
            id=i.id,
            skill_name=i.skill_name,
            description=i.description,
            file_type=i.file_type,
            submitted_at=i.submitted_at,
            review_status=i.review_status,
            reviewer_notes=i.reviewer_notes,
        )
        for i in items
    ]
