import enum
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlmodel import Field, SQLModel


class PairingRole(str, enum.Enum):
    CORE = "core"
    PROXY = "proxy"


class Pairing(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    asset_class: str = Field(index=True)          # e.g. "US Large Cap", "Gold"
    group: Optional[str] = None                    # e.g. "US Equity", "Commodities"
    symbol: str = Field(index=True)                # ticker
    role: PairingRole                              # core or proxy
    note: Optional[str] = None
    target_pct: Optional[Decimal] = None           # target allocation % for this asset class
    created_at: datetime = Field(default_factory=datetime.utcnow)
