import enum
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlmodel import Field, SQLModel


class LotSource(str, enum.Enum):
    ASSIGNMENT = "assignment"
    MANUAL_BUY = "manual_buy"
    TRANSFER = "transfer"


class ShareLot(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    underlying_id: int = Field(foreign_key="spot.id", index=True)
    qty: int
    remaining_qty: int
    cost_per_share: Decimal
    acquired_at: date
    source: LotSource
    linked_trade_id: Optional[int] = Field(default=None, foreign_key="trade.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
