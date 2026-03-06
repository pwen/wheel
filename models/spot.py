import enum
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlmodel import Field, SQLModel


class AssetType(str, enum.Enum):
    STOCK = "stock"
    ETF = "etf"


class Spot(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    symbol: str = Field(index=True, unique=True)
    name: Optional[str] = None
    asset_type: Optional[AssetType] = None
    sector: Optional[str] = None
    industry: Optional[str] = None
    region: Optional[str] = None
    expense_ratio: Optional[Decimal] = None
    pe_ratio: Optional[Decimal] = None
    beta: Optional[Decimal] = None
    market_cap: Optional[Decimal] = None
    # Liquidity — underlying
    aum: Optional[Decimal] = None
    avg_daily_volume: Optional[int] = None
    # Liquidity — options market
    option_volume: Optional[int] = None
    open_interest: Optional[int] = None
    implied_volatility: Optional[Decimal] = None
    bid_ask_spread: Optional[Decimal] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
