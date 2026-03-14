"""add market_event table

Revision ID: d6e0f4a7b8c9
Revises: c5d9e3f6a7b8
Create Date: 2026-03-14 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd6e0f4a7b8c9'
down_revision: Union[str, None] = 'c5d9e3f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'marketevent',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('event_type', sa.String(), nullable=False),
        sa.Column('event_date', sa.Date(), nullable=False),
        sa.Column('symbol', sa.String(), nullable=True),
        sa.Column('region', sa.String(), nullable=False, server_default='US'),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('notes', sa.String(), nullable=True),
        sa.Column('source', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_marketevent_event_type', 'marketevent', ['event_type'])
    op.create_index('ix_marketevent_event_date', 'marketevent', ['event_date'])
    op.create_index('ix_marketevent_symbol', 'marketevent', ['symbol'])
    op.create_index('ix_marketevent_region', 'marketevent', ['region'])
    op.create_index(
        'uq_marketevent_type_date_symbol_region',
        'marketevent',
        ['event_type', 'event_date', 'symbol', 'region'],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index('uq_marketevent_type_date_symbol_region', table_name='marketevent')
    op.drop_index('ix_marketevent_region', table_name='marketevent')
    op.drop_index('ix_marketevent_symbol', table_name='marketevent')
    op.drop_index('ix_marketevent_event_date', table_name='marketevent')
    op.drop_index('ix_marketevent_event_type', table_name='marketevent')
    op.drop_table('marketevent')
