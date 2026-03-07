"""add pairing table

Revision ID: c5d9e3f6a7b8
Revises: b4c8d2e3f5a6
Create Date: 2026-03-07 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c5d9e3f6a7b8'
down_revision: Union[str, None] = 'b4c8d2e3f5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'pairing',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('asset_class', sa.String(), nullable=False),
        sa.Column('group', sa.String(), nullable=True),
        sa.Column('symbol', sa.String(), nullable=False),
        sa.Column('role', sa.String(), nullable=False),
        sa.Column('note', sa.String(), nullable=True),
        sa.Column('target_pct', sa.Numeric(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_pairing_asset_class', 'pairing', ['asset_class'])
    op.create_index('ix_pairing_symbol', 'pairing', ['symbol'])


def downgrade() -> None:
    op.drop_index('ix_pairing_symbol', table_name='pairing')
    op.drop_index('ix_pairing_asset_class', table_name='pairing')
    op.drop_table('pairing')
