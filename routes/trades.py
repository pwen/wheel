from decimal import Decimal
from typing import Optional
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from db import get_session
from models import (
    Trade, StrategyType, TradeStatus, TradeEvent, EventType,
    Spot, ShareLot, LotSource,
)

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


class TradeAssign(BaseModel):
    assigned_at: date
    closing_spot: Optional[Decimal] = None


class TradeRoll(BaseModel):
    roll_date: date
    closing_cost: Decimal  # cost to close the old leg
    closing_spot: Optional[Decimal] = None
    # new leg fields
    new_strike: Decimal
    new_expiry_date: date
    new_total_premium: Decimal
    new_contracts: Optional[int] = None  # defaults to same qty


class TradeUpdate(BaseModel):
    symbol: Optional[str] = None
    strategy_type: Optional[StrategyType] = None
    strike: Optional[Decimal] = None
    expiry_date: Optional[date] = None
    contracts: Optional[int] = None
    total_premium: Optional[Decimal] = None
    opened_at: Optional[date] = None
    spot_price_at_open: Optional[Decimal] = None
    # Closing fields (for editing closed trades — status is immutable)
    closed_at: Optional[date] = None
    closing_cost: Optional[Decimal] = None
    closing_spot: Optional[Decimal] = None


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
        # Auto-fetch metadata in background
        from services import populate_spot_info
        try:
            populate_spot_info(spot, session)
        except Exception:
            pass

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
                   "total_premium", "opened_at", "spot_price_at_open",
                   "closed_at", "closing_cost", "closing_spot"]:
        val = getattr(body, field)
        if val is not None:
            setattr(trade, field, val)

    trade.updated_at = datetime.utcnow()

    # --- Sync side-effects ---
    _sync_open_event(trade, session)
    if trade.status != TradeStatus.OPEN:
        _sync_close_event(trade, session)
        if trade.status == TradeStatus.ASSIGNED:
            _sync_assignment_lot(trade, session)

    session.commit()
    session.refresh(trade)

    d = _trade_to_dict(trade)
    spot = session.get(Spot, trade.underlying_id)
    d["symbol"] = spot.symbol if spot else "?"
    return d


def _sync_open_event(trade: Trade, session: Session):
    """Keep the OPEN event in sync with the trade's opening fields."""
    event = session.exec(
        select(TradeEvent)
        .where(TradeEvent.trade_id == trade.id)
        .where(TradeEvent.event_type == EventType.OPEN)
    ).first()
    if not event:
        return
    event.event_date = trade.opened_at
    event.qty = trade.contracts
    event.price = trade.total_premium
    session.add(event)


def _sync_close_event(trade: Trade, session: Session):
    """Update the CLOSE / ASSIGNMENT / ROLL_CLOSE event to match edited trade fields."""
    close_event_types = [EventType.CLOSE, EventType.ASSIGNMENT, EventType.ROLL_CLOSE]
    event = session.exec(
        select(TradeEvent)
        .where(TradeEvent.trade_id == trade.id)
        .where(TradeEvent.event_type.in_(close_event_types))
        .order_by(TradeEvent.created_at.desc())
    ).first()
    if not event:
        return
    if trade.closed_at:
        event.event_date = trade.closed_at
    event.price = trade.closing_cost or Decimal("0")
    event.qty = trade.contracts
    session.add(event)


def _sync_assignment_lot(trade: Trade, session: Session):
    """Update the ShareLot cost basis and date for an assigned trade."""
    lot = session.exec(
        select(ShareLot)
        .where(ShareLot.linked_trade_id == trade.id)
        .where(ShareLot.source == LotSource.ASSIGNMENT)
    ).first()
    if not lot:
        return
    lot.cost_per_share = trade.strike - trade.premium_per_share
    if trade.closed_at:
        lot.acquired_at = trade.closed_at
    session.add(lot)


@router.post("/trades/{trade_id}/close")
def close_trade(trade_id: int, body: TradeClose, session: Session = Depends(get_session)):
    """Close a trade as Expired or BTC."""
    trade = session.get(Trade, trade_id)
    if not trade:
        raise HTTPException(404, "Trade not found")
    if trade.status != TradeStatus.OPEN:
        raise HTTPException(400, "Trade is not open")
    if body.status not in (TradeStatus.EXPIRED, TradeStatus.BTC):
        raise HTTPException(400, "Use /assign or /roll for that status")

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


@router.post("/trades/{trade_id}/assign")
def assign_trade(trade_id: int, body: TradeAssign, session: Session = Depends(get_session)):
    """Handle option assignment. CSP → creates a ShareLot. CC → consumes ShareLots (FIFO)."""
    trade = session.get(Trade, trade_id)
    if not trade:
        raise HTTPException(404, "Trade not found")
    if trade.status != TradeStatus.OPEN:
        raise HTTPException(400, "Trade is not open")

    # Update trade
    trade.closed_at = body.assigned_at
    trade.closing_cost = Decimal("0")
    trade.closing_spot = body.closing_spot
    trade.status = TradeStatus.ASSIGNED

    # Create ASSIGNMENT event
    event = TradeEvent(
        trade_id=trade.id,
        event_type=EventType.ASSIGNMENT,
        event_date=body.assigned_at,
        qty=trade.contracts,
        price=Decimal("0"),
    )
    session.add(event)

    total_shares = trade.contracts * trade.multiplier

    if trade.strategy_type == StrategyType.CSP:
        # CSP assignment: you buy shares at strike. True cost basis = strike - premium/share
        cost_basis = trade.strike - trade.premium_per_share
        lot = ShareLot(
            underlying_id=trade.underlying_id,
            qty=total_shares,
            remaining_qty=total_shares,
            cost_per_share=cost_basis,
            acquired_at=body.assigned_at,
            source=LotSource.ASSIGNMENT,
            linked_trade_id=trade.id,
        )
        session.add(lot)
    else:
        # CC assignment: you sell shares at strike. Consume lots FIFO.
        lots = session.exec(
            select(ShareLot)
            .where(ShareLot.underlying_id == trade.underlying_id)
            .where(ShareLot.remaining_qty > 0)
            .order_by(ShareLot.acquired_at)
        ).all()
        remaining_to_sell = total_shares
        for lot in lots:
            if remaining_to_sell <= 0:
                break
            consumed = min(lot.remaining_qty, remaining_to_sell)
            lot.remaining_qty -= consumed
            remaining_to_sell -= consumed
            session.add(lot)
        if remaining_to_sell > 0:
            # Not enough shares — still proceed but note the shortfall
            pass

    session.commit()
    session.refresh(trade)

    d = _trade_to_dict(trade)
    spot = session.get(Spot, trade.underlying_id)
    d["symbol"] = spot.symbol if spot else "?"
    return d


@router.post("/trades/{trade_id}/roll")
def roll_trade(trade_id: int, body: TradeRoll, session: Session = Depends(get_session)):
    """Roll a trade: close the old leg and open a new one, linked via TradeEvents."""
    trade = session.get(Trade, trade_id)
    if not trade:
        raise HTTPException(404, "Trade not found")
    if trade.status != TradeStatus.OPEN:
        raise HTTPException(400, "Trade is not open")

    # --- Close old trade ---
    trade.closed_at = body.roll_date
    trade.closing_cost = body.closing_cost
    trade.closing_spot = body.closing_spot
    trade.status = TradeStatus.ROLLED

    roll_close_event = TradeEvent(
        trade_id=trade.id,
        event_type=EventType.ROLL_CLOSE,
        event_date=body.roll_date,
        qty=trade.contracts,
        price=body.closing_cost,
    )
    session.add(roll_close_event)
    session.commit()
    session.refresh(roll_close_event)

    # --- Create new trade ---
    new_contracts = body.new_contracts if body.new_contracts else trade.contracts
    new_trade = Trade(
        underlying_id=trade.underlying_id,
        strategy_type=trade.strategy_type,
        strike=body.new_strike,
        expiry_date=body.new_expiry_date,
        contracts=new_contracts,
        total_premium=body.new_total_premium,
        opened_at=body.roll_date,
        spot_price_at_open=body.closing_spot,
    )
    session.add(new_trade)
    session.commit()
    session.refresh(new_trade)

    roll_open_event = TradeEvent(
        trade_id=new_trade.id,
        event_type=EventType.ROLL_OPEN,
        event_date=body.roll_date,
        qty=new_contracts,
        price=body.new_total_premium,
        linked_event_id=roll_close_event.id,
    )
    session.add(roll_open_event)
    session.commit()
    session.refresh(new_trade)

    spot = session.get(Spot, trade.underlying_id)
    symbol = spot.symbol if spot else "?"

    old_d = _trade_to_dict(trade)
    old_d["symbol"] = symbol
    new_d = _trade_to_dict(new_trade)
    new_d["symbol"] = symbol
    return {"closed_trade": old_d, "new_trade": new_d}


@router.get("/trades/{trade_id}")
def get_trade(trade_id: int, session: Session = Depends(get_session)):
    trade = session.get(Trade, trade_id)
    if not trade:
        raise HTTPException(404, "Trade not found")
    d = _trade_to_dict(trade)
    spot = session.get(Spot, trade.underlying_id)
    d["symbol"] = spot.symbol if spot else "?"
    return d
