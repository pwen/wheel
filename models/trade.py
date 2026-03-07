import enum
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlmodel import Field, SQLModel


class StrategyType(str, enum.Enum):
    CSP = "CSP"
    CC = "CC"


class TradeStatus(str, enum.Enum):
    OPEN = "open"
    EXPIRED = "expired"
    BTC = "btc"
    ASSIGNED = "assigned"
    ROLLED = "rolled"


class Trade(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    underlying_id: int = Field(foreign_key="spot.id", index=True)
    strategy_type: StrategyType
    strike: Decimal
    expiry_date: date
    contracts: int
    multiplier: int = 100
    total_premium: Decimal
    status: TradeStatus = TradeStatus.OPEN
    opened_at: date = Field(index=True)
    closed_at: Optional[date] = None
    closing_cost: Optional[Decimal] = None
    closing_spot: Optional[Decimal] = None
    spot_price_at_open: Optional[Decimal] = None
    iv_at_open: Optional[Decimal] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_column_kwargs={"onupdate": datetime.utcnow},
    )

    # --- computed properties (not persisted) ---

    @property
    def premium_per_share(self) -> Decimal:
        return self.total_premium / (self.contracts * self.multiplier)

    @property
    def break_even(self) -> Decimal:
        pps = self.premium_per_share
        if self.strategy_type == StrategyType.CSP:
            return self.strike - pps
        # CC: strike + premium (max profit price)
        return self.strike + pps

    @property
    def dte(self) -> int:
        return (self.expiry_date - self.opened_at).days

    @property
    def days_in_trade(self) -> int:
        end = self.closed_at or date.today()
        return (end - self.opened_at).days

    @property
    def realized_pl(self) -> Optional[Decimal]:
        if self.closed_at is None:
            return None
        closing = self.closing_cost or Decimal("0")
        return self.total_premium - closing

    @property
    def realized_pl_pct(self) -> Optional[Decimal]:
        pl = self.realized_pl
        if pl is None:
            return None
        cash_at_risk = self.strike * self.contracts * self.multiplier
        if cash_at_risk == 0:
            return Decimal("0")
        return (pl / cash_at_risk) * 100
