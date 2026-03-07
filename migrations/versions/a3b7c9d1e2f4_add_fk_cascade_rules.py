"""add fk cascade rules

Revision ID: a3b7c9d1e2f4
Revises: 6f16456426f8
Create Date: 2026-03-07 02:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a3b7c9d1e2f4'
down_revision: Union[str, None] = '6f16456426f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # TradeEvent.trade_id → CASCADE
    op.drop_constraint('tradeevent_trade_id_fkey', 'tradeevent', type_='foreignkey')
    op.create_foreign_key(
        'tradeevent_trade_id_fkey', 'tradeevent', 'trade',
        ['trade_id'], ['id'], ondelete='CASCADE',
    )

    # TradeEvent.linked_event_id → SET NULL
    op.drop_constraint('tradeevent_linked_event_id_fkey', 'tradeevent', type_='foreignkey')
    op.create_foreign_key(
        'tradeevent_linked_event_id_fkey', 'tradeevent', 'tradeevent',
        ['linked_event_id'], ['id'], ondelete='SET NULL',
    )

    # ShareLot.linked_trade_id → CASCADE
    op.drop_constraint('sharelot_linked_trade_id_fkey', 'sharelot', type_='foreignkey')
    op.create_foreign_key(
        'sharelot_linked_trade_id_fkey', 'sharelot', 'trade',
        ['linked_trade_id'], ['id'], ondelete='CASCADE',
    )


def downgrade() -> None:
    # Revert to plain FKs without ondelete
    op.drop_constraint('sharelot_linked_trade_id_fkey', 'sharelot', type_='foreignkey')
    op.create_foreign_key(
        'sharelot_linked_trade_id_fkey', 'sharelot', 'trade',
        ['linked_trade_id'], ['id'],
    )

    op.drop_constraint('tradeevent_linked_event_id_fkey', 'tradeevent', type_='foreignkey')
    op.create_foreign_key(
        'tradeevent_linked_event_id_fkey', 'tradeevent', 'tradeevent',
        ['linked_event_id'], ['id'],
    )

    op.drop_constraint('tradeevent_trade_id_fkey', 'tradeevent', type_='foreignkey')
    op.create_foreign_key(
        'tradeevent_trade_id_fkey', 'tradeevent', 'trade',
        ['trade_id'], ['id'],
    )
