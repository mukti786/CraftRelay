"""
Workers router

GET /workers/         — public list, optional ?trade= and ?location= filters
GET /workers/me       — worker's own full profile (X-User-Id header)
GET /workers/{id}     — single worker public profile (verified competencies only)

TODO (Part 3): Replace X-User-Id header dependency with JWT Bearer auth.
"""

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.schemas import WorkerProfileOut, DeclaredSkillOut, VerifiedCompetencyOut
from app.models.models import EvidenceItem, User, WorkerProfile

router = APIRouter(prefix="/workers", tags=["workers"])


async def _build_worker_out(wp: WorkerProfile, db: AsyncSession, include_skills: bool = True) -> WorkerProfileOut:
    """Assemble WorkerProfileOut, computing evidence_count for each declared skill."""
    declared_out: list[DeclaredSkillOut] = []
    if include_skills:
        for ds in wp.declared_skills:
            # Count evidence items for this skill
            result = await db.execute(
                select(EvidenceItem).where(
                    EvidenceItem.worker_id == wp.id,
                    EvidenceItem.skill_name == ds.skill_name,
                )
            )
            count = len(result.scalars().all())
            declared_out.append(
                DeclaredSkillOut(
                    id=ds.id,
                    skill_name=ds.skill_name,
                    declared_at=ds.declared_at,
                    assessment_status=ds.assessment_status,
                    evidence_count=count,
                )
            )

    verified_out: list[VerifiedCompetencyOut] = [
        VerifiedCompetencyOut(
            id=vc.id,
            skill_name=vc.skill_name,
            qualification_id=vc.qualification_id,
            criterion_id=vc.criterion_id,
            verified_at=vc.verified_at,
            note=vc.note,
        )
        for vc in wp.verified_competencies
    ]

    return WorkerProfileOut(
        id=wp.id,
        user_id=wp.user_id,
        full_name=wp.user.full_name,
        trade=wp.trade,
        experience_years=wp.experience_years,
        service_area=wp.service_area,
        bio=wp.bio,
        is_available=wp.is_available,
        average_rating=wp.average_rating,
        review_count=wp.review_count,
        declared_skills=declared_out,
        verified_competencies=verified_out,
    )


@router.get("/me", response_model=WorkerProfileOut)
async def get_my_profile(
    x_user_id: str = Header(..., alias="X-User-Id"),
    db: AsyncSession = Depends(get_db),
) -> WorkerProfileOut:
    """Worker's own full profile including declared skills."""
    result = await db.execute(
        select(WorkerProfile)
        .where(WorkerProfile.user_id == x_user_id)
        .options(
            selectinload(WorkerProfile.user),
            selectinload(WorkerProfile.declared_skills),
            selectinload(WorkerProfile.verified_competencies),
        )
    )
    wp: WorkerProfile | None = result.scalar_one_or_none()
    if wp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Worker profile not found")
    return await _build_worker_out(wp, db, include_skills=True)


@router.get("/", response_model=list[WorkerProfileOut])
async def list_workers(
    trade: str | None = Query(default=None),
    location: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> list[WorkerProfileOut]:
    """Public list of all worker profiles with optional filters."""
    stmt = select(WorkerProfile).options(
        selectinload(WorkerProfile.user),
        selectinload(WorkerProfile.declared_skills),
        selectinload(WorkerProfile.verified_competencies),
    )
    if trade:
        stmt = stmt.where(WorkerProfile.trade.ilike(f"%{trade}%"))
    if location:
        stmt = stmt.where(WorkerProfile.service_area.ilike(f"%{location}%"))

    result = await db.execute(stmt)
    workers = result.scalars().all()
    return [await _build_worker_out(wp, db, include_skills=True) for wp in workers]


@router.get("/{worker_id}", response_model=WorkerProfileOut)
async def get_worker(
    worker_id: str,
    db: AsyncSession = Depends(get_db),
) -> WorkerProfileOut:
    """Public single worker profile — verified competencies only (no raw declared skills)."""
    result = await db.execute(
        select(WorkerProfile)
        .where(WorkerProfile.id == worker_id)
        .options(
            selectinload(WorkerProfile.user),
            selectinload(WorkerProfile.declared_skills),
            selectinload(WorkerProfile.verified_competencies),
        )
    )
    wp: WorkerProfile | None = result.scalar_one_or_none()
    if wp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Worker not found")
    return await _build_worker_out(wp, db, include_skills=False)
