from decimal import Decimal
from typing import Optional
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from db import get_session
from models import Spot

router = APIRouter(tags=["spots"])


class SpotCreate(BaseModel):
    symbol: str
    name: Optional[str] = None
    asset_type: Optional[str] = None
    is_etf: bool = False
    notes: Optional[str] = None


from decimal import Decimal
from typing import Optional
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from db import get_session
from models import Spot, Trade, TradeStatus, ShareLot

router = APIRouter(tags=["spots"])


class SpotCreate(BaseModel):
    symbol: str
    name: Optional[str] = None
    asset_type: Optional[str] = None
    is_etf: bool = False
    notes: Optional[str] = None


@router.get("/spots/{symbol}/detail")
def spot_detail(symbol: str, session: Session = Depends(get_session)):
    """Full symbol view: open options, share lots, trade history."""
    symbol = symbol.upper()
    spot = session.exec(select(Spot).where(Spot.symbol == symbol)).first()
    if not spot:
        raise HTTPException(404, f"Symbol {symbol} not found")

    trades = session.exec(
        select(Trade).where(Trade.underlying_id == spot.id).order_by(Trade.opened_at.desc())
    ).all()

    open_trades = []
    closed_trades = []
    for t in trades:
        d = t.model_dump()
        d["premium_per_share"] = float(t.premium_per_share)
        d["break_even"] = float(t.break_even)
        d["dte"] = t.dte
        d["days_in_trade"] = t.days_in_trade
        d["realized_pl"] = float(t.realized_pl) if t.realized_pl is not None else None
        d["realized_pl_pct"] = float(t.realized_pl_pct) if t.realized_pl_pct is not None else None
        d["symbol"] = symbol
        if t.status == TradeStatus.OPEN:
            open_trades.append(d)
        else:
            closed_trades.append(d)

    lots = session.exec(
        select(ShareLot).where(ShareLot.underlying_id == spot.id).order_by(ShareLot.acquired_at.desc())
    ).all()
    lot_dicts = [
        {**lot.model_dump(), "symbol": symbol}
        for lot in lots
    ]

    # Totals
    total_premium_collected = sum(float(t.total_premium) for t in trades)
    total_closing_cost = sum(float(t.closing_cost) for t in trades if t.closing_cost)
    total_realized_pl = sum(float(t.realized_pl) for t in trades if t.realized_pl is not None)
    total_shares = sum(lot.remaining_qty for lot in lots)
    total_share_cost = sum(float(lot.cost_per_share) * lot.remaining_qty for lot in lots)

    return {
        "symbol": symbol,
        "open_trades": open_trades,
        "closed_trades": closed_trades,
        "lots": lot_dicts,
        "totals": {
            "total_premium_collected": round(total_premium_collected, 2),
            "total_closing_cost": round(total_closing_cost, 2),
            "total_realized_pl": round(total_realized_pl, 2),
            "total_shares": total_shares,
            "total_share_cost": round(total_share_cost, 2),
            "open_trade_count": len(open_trades),
            "closed_trade_count": len(closed_trades),
            "lot_count": len(lot_dicts),
        },
    }


@router.get("/spots")
def list_spots(session: Session = Depends(get_session)):
    return session.exec(select(Spot).order_by(Spot.symbol)).all()


@router.post("/spots", status_code=201)
def create_spot(body: SpotCreate, session: Session = Depends(get_session)):
    spot = Spot(**body.model_dump())
    spot.symbol = spot.symbol.upper()
    session.add(spot)
    session.commit()
    session.refresh(spot)
    return spot


@router.get("/spots/{spot_id}")
def get_spot(spot_id: int, session: Session = Depends(get_session)):
    spot = session.get(Spot, spot_id)
    if not spot:
        raise HTTPException(404, "Spot not found")
    return spot
