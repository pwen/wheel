"""add market_flash table

Revision ID: b4c8d2e3f5a6
Revises: a3b7c9d1e2f4
Create Date: 2026-03-07 03:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b4c8d2e3f5a6'
down_revision: Union[str, None] = 'a3b7c9d1e2f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'marketflash',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('flash_date', sa.Date(), nullable=False),
        sa.Column('markdown', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_marketflash_flash_date', 'marketflash', ['flash_date'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_marketflash_flash_date', table_name='marketflash')
    op.drop_table('marketflash')
