"""add ai_summary column to marketevent

Revision ID: f8a2b3c4d5e6
Revises: e7f1a2b3c4d5
Create Date: 2026-03-14 00:00:01.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "f8a2b3c4d5e6"
down_revision: Union[str, None] = "e7f1a2b3c4d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("marketevent", sa.Column("ai_summary", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("marketevent", "ai_summary")
