"""remove temporary defaults from task provenance fields

Revision ID: 4f2a5bd913c1
Revises: 17d9056f7e55
Create Date: 2026-10-20 15:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "4f2a5bd913c1"
down_revision: str | None = "17d9056f7e55"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _alter_provenance_defaults(*, restore: bool) -> None:
    defaults = {
        "source_name": sa.text("'Not recorded (legacy task)'"),
        "source_url": sa.text("''"),
        "official": sa.false(),
    }
    column_types = {
        "source_name": sa.String(length=200),
        "source_url": sa.String(length=1000),
        "official": sa.Boolean(),
    }

    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("approved_tasks") as batch_op:
            for name, default in defaults.items():
                batch_op.alter_column(
                    name,
                    existing_type=column_types[name],
                    existing_nullable=False,
                    server_default=default if restore else None,
                )
    else:
        for name, default in defaults.items():
            op.alter_column(
                "approved_tasks",
                name,
                existing_type=column_types[name],
                existing_nullable=False,
                server_default=default if restore else None,
            )


def upgrade() -> None:
    # Revision 17 used these defaults only to make the required columns safe
    # to add on populated databases. Existing databases already at revision 17
    # have no defaults; batch alter handles both SQLite schema shapes.
    _alter_provenance_defaults(restore=False)


def downgrade() -> None:
    _alter_provenance_defaults(restore=True)
