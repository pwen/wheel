"""add compound index on market_event (event_type, event_date, symbol)

Revision ID: e7f1a2b3c4d5
Revises: d6e0f4a7b8c9
Create Date: 2026-03-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e7f1a2b3c4d5"
down_revision: Union[str, None] = "d6e0f4a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_marketevent_type_date_symbol",
        "marketevent",
        ["event_type", "event_date", "symbol"],
    )


def downgrade() -> None:
    op.drop_index("ix_marketevent_type_date_symbol", table_name="marketevent")
