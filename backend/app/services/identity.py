from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, WorkerProfile


async def profile_for_user(db: AsyncSession, user: User):
    return await db.scalar(select(WorkerProfile).where(WorkerProfile.user_id == user.id))
