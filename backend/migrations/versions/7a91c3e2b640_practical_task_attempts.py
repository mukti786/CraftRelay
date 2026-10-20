"""add practical task attempts and assessor reviews

Revision ID: 7a91c3e2b640
Revises: 4f2a5bd913c1
Create Date: 2026-10-20 18:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "7a91c3e2b640"
down_revision: str | None = "4f2a5bd913c1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "practical_task_attempts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("case_id", sa.String(length=36), nullable=False),
        sa.Column("worker_id", sa.String(length=36), nullable=False),
        sa.Column("qualification_id", sa.String(length=36), nullable=False),
        sa.Column("criterion_id", sa.String(length=36), nullable=False),
        sa.Column("task_id", sa.String(length=36), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("active_attempt", sa.Boolean(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["case_id"], ["assessment_cases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["worker_id"], ["worker_profiles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["qualification_id"], ["qualifications.id"]),
        sa.ForeignKeyConstraint(["criterion_id"], ["criteria.id"]),
        sa.ForeignKeyConstraint(["task_id"], ["approved_tasks.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in ("case_id", "worker_id", "qualification_id", "criterion_id", "task_id"):
        op.create_index(
            f"ix_practical_task_attempts_{column}",
            "practical_task_attempts",
            [column],
            unique=False,
        )
    op.create_index(
        "uq_active_practical_task_attempt",
        "practical_task_attempts",
        ["case_id", "task_id"],
        unique=True,
        sqlite_where=sa.text("active_attempt = 1"),
        postgresql_where=sa.text("active_attempt"),
    )

    op.create_table(
        "practical_task_attempt_reviews",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("attempt_id", sa.String(length=36), nullable=False),
        sa.Column("assessor_id", sa.String(length=36), nullable=False),
        sa.Column("result", sa.String(length=40), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["attempt_id"], ["practical_task_attempts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["assessor_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("attempt_id", name="uq_task_attempt_review"),
    )
    op.create_index(
        "ix_practical_task_attempt_reviews_attempt_id",
        "practical_task_attempt_reviews",
        ["attempt_id"],
        unique=False,
    )
    op.create_index(
        "ix_practical_task_attempt_reviews_assessor_id",
        "practical_task_attempt_reviews",
        ["assessor_id"],
        unique=False,
    )
    with op.batch_alter_table("evidence") as batch_op:
        batch_op.add_column(sa.Column("task_attempt_id", sa.String(length=36), nullable=True))
        batch_op.create_foreign_key(
            "fk_evidence_task_attempt_id_practical_task_attempts",
            "practical_task_attempts",
            ["task_attempt_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        batch_op.create_index("ix_evidence_task_attempt_id", ["task_attempt_id"], unique=False)
        batch_op.create_unique_constraint("uq_evidence_task_attempt", ["task_attempt_id"])


def downgrade() -> None:
    with op.batch_alter_table("evidence") as batch_op:
        batch_op.drop_constraint("uq_evidence_task_attempt", type_="unique")
        batch_op.drop_index("ix_evidence_task_attempt_id")
        batch_op.drop_constraint(
            "fk_evidence_task_attempt_id_practical_task_attempts", type_="foreignkey"
        )
        batch_op.drop_column("task_attempt_id")
    op.drop_index(
        "ix_practical_task_attempt_reviews_assessor_id", table_name="practical_task_attempt_reviews"
    )
    op.drop_index(
        "ix_practical_task_attempt_reviews_attempt_id", table_name="practical_task_attempt_reviews"
    )
    op.drop_table("practical_task_attempt_reviews")
    op.drop_index("uq_active_practical_task_attempt", table_name="practical_task_attempts")
    for column in ("task_id", "criterion_id", "qualification_id", "worker_id", "case_id"):
        op.drop_index(f"ix_practical_task_attempts_{column}", table_name="practical_task_attempts")
    op.drop_table("practical_task_attempts")
