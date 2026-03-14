import enum
from datetime import date, datetime
from typing import Optional

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class EventType(str, enum.Enum):
    EARNINGS = "earnings"
    EX_DIVIDEND = "ex_dividend"
    OPEX = "opex"
    TRIPLE_WITCHING = "triple_witching"
    FOMC = "fomc"
    CPI = "cpi"
    JOBS = "jobs"
    GDP = "gdp"


class EventSource(str, enum.Enum):
    YFINANCE = "yfinance"
    COMPUTED = "computed"
    MANUAL = "manual"


class MarketEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    event_type: EventType = Field(index=True, sa_type=sa.String)
    event_date: date = Field(index=True)
    symbol: Optional[str] = Field(default=None, index=True)
    region: str = Field(default="US", index=True)
    title: str
    notes: Optional[str] = None
    source: EventSource = Field(default=EventSource.MANUAL, sa_type=sa.String)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
