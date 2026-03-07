import enum
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Column, Integer, ForeignKey
from sqlmodel import Field, SQLModel


class EventType(str, enum.Enum):
    OPEN = "open"
    CLOSE = "close"
    ASSIGNMENT = "assignment"
    EXERCISE = "exercise"
    ROLL_OPEN = "roll_open"
    ROLL_CLOSE = "roll_close"
    ADJUSTMENT = "adjustment"


class TradeEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    trade_id: int = Field(
        sa_column=Column(Integer, ForeignKey("trade.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    event_type: EventType
    event_date: date
    qty: int
    price: Decimal
    linked_event_id: Optional[int] = Field(
        sa_column=Column(Integer, ForeignKey("tradeevent.id", ondelete="SET NULL"), nullable=True)
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)
