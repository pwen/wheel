from decimal import Decimal
from typing import Optional
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from db import get_session
from models import Trade, StrategyType, TradeStatus, TradeEvent, EventType, Spot

router = APIRouter(tags=["trades"])


class TradeCreate(BaseModel):
    symbol: str  # will resolve to underlying_id
    strategy_type: StrategyType
    strike: Decimal
    expiry_date: date
    contracts: int
    total_premium: Decimal
    opened_at: date
    spot_price_at_open: Optional[Decimal] = None


class TradeClose(BaseModel):
    closed_at: date
    closing_cost: Decimal = Decimal("0")
    closing_spot: Optional[Decimal] = None
    status: TradeStatus = TradeStatus.EXPIRED


class TradeUpdate(BaseModel):
    symbol: Optional[str] = None
    strategy_type: Optional[StrategyType] = None
    strike: Optional[Decimal] = None
    expiry_date: Optional[date] = None
    contracts: Optional[int] = None
    total_premium: Optional[Decimal] = None
    opened_at: Optional[date] = None
    spot_price_at_open: Optional[Decimal] = None


def _trade_to_dict(t: Trade) -> dict:
    d = t.model_dump()
    d["premium_per_share"] = float(t.premium_per_share)
    d["break_even"] = float(t.break_even)
    d["dte"] = t.dte
    d["days_in_trade"] = t.days_in_trade
    d["realized_pl"] = float(t.realized_pl) if t.realized_pl is not None else None
    d["realized_pl_pct"] = float(t.realized_pl_pct) if t.realized_pl_pct is not None else None
    return d


@router.get("/trades")
def list_trades(session: Session = Depends(get_session)):
    trades = session.exec(
        select(Trade).order_by(Trade.opened_at.desc())
    ).all()
    results = []
    for t in trades:
        d = _trade_to_dict(t)
        spot = session.get(Spot, t.underlying_id)
        d["symbol"] = spot.symbol if spot else "?"
        results.append(d)
    return results


@router.post("/trades", status_code=201)
def create_trade(body: TradeCreate, session: Session = Depends(get_session)):
    # Resolve or create Spot
    symbol = body.symbol.upper()
    spot = session.exec(select(Spot).where(Spot.symbol == symbol)).first()
    if not spot:
        spot = Spot(symbol=symbol)
        session.add(spot)
        session.commit()
        session.refresh(spot)

    trade = Trade(
        underlying_id=spot.id,
        strategy_type=body.strategy_type,
        strike=body.strike,
        expiry_date=body.expiry_date,
        contracts=body.contracts,
        total_premium=body.total_premium,
        opened_at=body.opened_at,
        spot_price_at_open=body.spot_price_at_open,
    )
    session.add(trade)
    session.commit()
    session.refresh(trade)

    # Create OPEN event
    event = TradeEvent(
        trade_id=trade.id,
        event_type=EventType.OPEN,
        event_date=body.opened_at,
        qty=body.contracts,
        price=body.total_premium,
    )
    session.add(event)
    session.commit()

    d = _trade_to_dict(trade)
    d["symbol"] = symbol
    return d


@router.patch("/trades/{trade_id}")
def update_trade(trade_id: int, body: TradeUpdate, session: Session = Depends(get_session)):
    trade = session.get(Trade, trade_id)
    if not trade:
        raise HTTPException(404, "Trade not found")

    if body.symbol is not None:
        symbol = body.symbol.upper()
        spot = session.exec(select(Spot).where(Spot.symbol == symbol)).first()
        if not spot:
            spot = Spot(symbol=symbol)
            session.add(spot)
            session.commit()
            session.refresh(spot)
        trade.underlying_id = spot.id

    for field in ["strategy_type", "strike", "expiry_date", "contracts",
                   "total_premium", "opened_at", "spot_price_at_open"]:
        val = getattr(body, field)
        if val is not None:
            setattr(trade, field, val)

    session.commit()
    session.refresh(trade)

    d = _trade_to_dict(trade)
    spot = session.get(Spot, trade.underlying_id)
    d["symbol"] = spot.symbol if spot else "?"
    return d


@router.post("/trades/{trade_id}/close")
def close_trade(trade_id: int, body: TradeClose, session: Session = Depends(get_session)):
    trade = session.get(Trade, trade_id)
    if not trade:
        raise HTTPException(404, "Trade not found")
    if trade.status != TradeStatus.OPEN:
        raise HTTPException(400, "Trade is not open")

    trade.closed_at = body.closed_at
    trade.closing_cost = body.closing_cost
    trade.closing_spot = body.closing_spot
    trade.status = body.status

    event = TradeEvent(
        trade_id=trade.id,
        event_type=EventType.CLOSE,
        event_date=body.closed_at,
        qty=trade.contracts,
        price=body.closing_cost,
    )
    session.add(event)
    session.commit()
    session.refresh(trade)

    d = _trade_to_dict(trade)
    spot = session.get(Spot, trade.underlying_id)
    d["symbol"] = spot.symbol if spot else "?"
    return d


@router.get("/trades/{trade_id}")
def get_trade(trade_id: int, session: Session = Depends(get_session)):
    trade = session.get(Trade, trade_id)
    if not trade:
        raise HTTPException(404, "Trade not found")
    d = _trade_to_dict(trade)
    spot = session.get(Spot, trade.underlying_id)
    d["symbol"] = spot.symbol if spot else "?"
    return d
