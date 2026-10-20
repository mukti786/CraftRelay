"""add per-user session revocation version

Revision ID: c93f6d0a12be
Revises: b2180a7e3f11
Create Date: 2026-10-20 23:59:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c93f6d0a12be"
down_revision: str | None = "b2180a7e3f11"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("session_version", sa.Integer(), server_default=sa.text("0"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("users", "session_version")
