import logging
import os
from decimal import Decimal
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from db import get_session
from models import Spot, Trade, TradeStatus, ShareLot
from services import populate_spot_info

log = logging.getLogger(__name__)
router = APIRouter(tags=["spots"])


def verify_cron_token(authorization: str = Header(...)):
    """Verify Bearer token matches CRON_SECRET for scheduled jobs."""
    expected = os.environ.get("CRON_SECRET", "")
    if not expected:
        raise HTTPException(403, "CRON_SECRET not configured")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or token != expected:
        raise HTTPException(401, "Invalid cron token")


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
        "spot": {
            "name": spot.name,
            "asset_type": spot.asset_type,
            "sector": spot.sector,
            "industry": spot.industry,
            "region": spot.region,
            "beta": float(spot.beta) if spot.beta else None,
            "pe_ratio": float(spot.pe_ratio) if spot.pe_ratio else None,
            "market_cap": float(spot.market_cap) if spot.market_cap else None,
            "avg_daily_volume": spot.avg_daily_volume,
            "aum": float(spot.aum) if spot.aum else None,
            "expense_ratio": float(spot.expense_ratio) if spot.expense_ratio else None,
            "option_volume": spot.option_volume,
            "open_interest": spot.open_interest,
            "implied_volatility": float(spot.implied_volatility) if spot.implied_volatility else None,
            "bid_ask_spread": float(spot.bid_ask_spread) if spot.bid_ask_spread else None,
            "updated_at": spot.updated_at.isoformat() if spot.updated_at else None,
        },
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


@router.post("/spots/{symbol}/refresh")
def refresh_spot(symbol: str, session: Session = Depends(get_session)):
    """Re-fetch spot metadata from yfinance."""
    symbol = symbol.upper()
    spot = session.exec(select(Spot).where(Spot.symbol == symbol)).first()
    if not spot:
        raise HTTPException(404, f"Symbol {symbol} not found")
    populate_spot_info(spot, session)
    return {"ok": True}


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


@router.post("/spots/refresh-all")
def refresh_all_spots(
    tier: str = "weekly",
    session: Session = Depends(get_session),
    _auth: None = Depends(verify_cron_token),
):
    """Bulk refresh spot data. tier=weekly (market data) or monthly (fundamentals)."""
    from services.refresh import refresh_fundamentals, refresh_market_data

    spots = session.exec(select(Spot).order_by(Spot.symbol)).all()
    results = {"total": len(spots), "updated": 0, "failed": []}

    for spot in spots:
        try:
            if tier == "monthly":
                ok = refresh_fundamentals(spot, session)
            else:
                ok = refresh_market_data(spot, session)
            if ok:
                results["updated"] += 1
        except Exception as e:
            log.warning("refresh failed for %s: %s", spot.symbol, e)
            results["failed"].append(spot.symbol)

    session.commit()
    return results
