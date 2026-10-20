"""persist bounded assessor evidence-assistance suggestions and dispositions

Revision ID: b2180a7e3f11
Revises: 7a91c3e2b640
Create Date: 2026-10-20 19:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b2180a7e3f11"
down_revision: str | None = "7a91c3e2b640"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "evidence_assistance_suggestions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("case_id", sa.String(length=36), nullable=False),
        sa.Column("assessor_id", sa.String(length=36), nullable=False),
        sa.Column("qualification_id", sa.String(length=36), nullable=False),
        sa.Column("qualification_version", sa.String(length=40), nullable=False),
        sa.Column("provider_id", sa.String(length=100), nullable=False),
        sa.Column("model_id", sa.String(length=160), nullable=True),
        sa.Column("template_version", sa.String(length=40), nullable=False),
        sa.Column("evidence_ids", sa.Text(), nullable=False),
        sa.Column("criterion_ids", sa.Text(), nullable=False),
        sa.Column("original_output", sa.Text(), nullable=False),
        sa.Column("edited_output", sa.Text(), nullable=True),
        sa.Column("disposition", sa.String(length=20), nullable=False),
        sa.Column("disposition_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("request_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("response_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["assessor_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["case_id"], ["assessment_cases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["qualification_id"], ["qualifications.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in ("case_id", "assessor_id"):
        op.create_index(
            f"ix_evidence_assistance_suggestions_{column}",
            "evidence_assistance_suggestions",
            [column],
        )
    op.create_index(
        "ix_ai_suggestion_case_requested",
        "evidence_assistance_suggestions",
        ["case_id", "request_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_ai_suggestion_case_requested", table_name="evidence_assistance_suggestions")
    op.drop_index(
        "ix_evidence_assistance_suggestions_assessor_id",
        table_name="evidence_assistance_suggestions",
    )
    op.drop_index(
        "ix_evidence_assistance_suggestions_case_id",
        table_name="evidence_assistance_suggestions",
    )
    op.drop_table("evidence_assistance_suggestions")
