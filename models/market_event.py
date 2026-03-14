import enum
from datetime import date, datetime
from typing import Optional

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class EventType(str, enum.Enum):
    # US — per-symbol
    US_EARNINGS = "us_earnings"
    US_EX_DIVIDEND = "us_ex_dividend"
    # US — macro
    US_OPEX = "us_opex"
    US_TRIPLE_WITCHING = "us_triple_witching"
    US_FOMC = "us_fomc"
    US_CPI = "us_cpi"
    US_JOBS = "us_jobs"
    US_GDP = "us_gdp"
    US_PCE = "us_pce"
    US_PPI = "us_ppi"
    # China
    CN_LPR = "cn_lpr"
    CN_GDP = "cn_gdp"
    CN_CPI = "cn_cpi"
    CN_PPI = "cn_ppi"
    CN_PMI = "cn_pmi"
    CAIXIN_PMI = "caixin_pmi"
    TWO_SESSIONS = "two_sessions"
    CN_TRADE = "cn_trade"
    CEWC = "cewc"


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
