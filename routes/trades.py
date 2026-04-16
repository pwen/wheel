from decimal import Decimal, ROUND_HALF_UP
from typing import Optional
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlmodel import Session, select
import yfinance as yf

from db import get_session
from models import (
    Trade, StrategyType, TradeStatus, TradeEvent, EventType,
    Spot, ShareLot, LotSource,
)

router = APIRouter(tags=["trades"])

_TWO_PLACES = Decimal("0.01")


def _round2(v: Optional[Decimal]) -> Optional[Decimal]:
    return v.quantize(_TWO_PLACES, rounding=ROUND_HALF_UP) if v is not None else None


def _round_spots_validator(*fields: str):
    return field_validator(*fields, mode="after")(classmethod(lambda cls, v: _round2(v)))


class TradeCreate(BaseModel):
    symbol: str  # will resolve to underlying_id
    strategy_type: StrategyType
    strike: Decimal
    expiry_date: date
    contracts: int
    total_premium: Decimal
    opened_at: date
    spot_price_at_open: Optional[Decimal] = None
    iv_at_open: Optional[Decimal] = None

    _round = _round_spots_validator("spot_price_at_open")


class TradeClose(BaseModel):
    closed_at: date
    closing_cost: Decimal = Decimal("0")
    closing_spot: Optional[Decimal] = None
    status: TradeStatus = TradeStatus.EXPIRED

    _round = _round_spots_validator("closing_spot")


class TradeAssign(BaseModel):
    assigned_at: date
    closing_spot: Optional[Decimal] = None

    _round = _round_spots_validator("closing_spot")


class TradeRoll(BaseModel):
    roll_date: date
    closing_cost: Decimal  # cost to close the old leg
    closing_spot: Optional[Decimal] = None
    # new leg fields
    new_strike: Decimal
    new_expiry_date: date
    new_total_premium: Decimal
    new_contracts: Optional[int] = None  # defaults to same qty

    _round = _round_spots_validator("closing_spot")


class TradeUpdate(BaseModel):
    symbol: Optional[str] = None
    strategy_type: Optional[StrategyType] = None
    strike: Optional[Decimal] = None
    expiry_date: Optional[date] = None
    contracts: Optional[int] = None
    total_premium: Optional[Decimal] = None
    opened_at: Optional[date] = None
    spot_price_at_open: Optional[Decimal] = None
    iv_at_open: Optional[Decimal] = None
    # Closing fields (for editing closed trades — status is immutable)
    closed_at: Optional[date] = None
    closing_cost: Optional[Decimal] = None
    closing_spot: Optional[Decimal] = None

    _round = _round_spots_validator("spot_price_at_open", "closing_spot")


def _get_trade_or_404(trade_id: int, session: Session) -> Trade:
    trade = session.get(Trade, trade_id)
    if not trade:
        raise HTTPException(404, "Trade not found")
    return trade


def _require_open(trade: Trade) -> None:
    if trade.status != TradeStatus.OPEN:
        raise HTTPException(400, "Trade is not open")


def _resolve_or_create_spot(symbol: str, session: Session) -> Spot:
    symbol = symbol.upper()
    spot = session.exec(select(Spot).where(Spot.symbol == symbol)).first()
    if not spot:
        spot = Spot(symbol=symbol)
        session.add(spot)
        session.commit()
        session.refresh(spot)
        from services import populate_spot_info
        try:
            populate_spot_info(spot, session)
        except Exception:
            pass
    return spot


def _trade_to_dict(t: Trade, symbol: str) -> dict:
    d = t.model_dump()
    d["symbol"] = symbol
    d["premium_per_share"] = float(t.premium_per_share)
    d["break_even"] = float(t.break_even)
    d["dte"] = t.dte
    d["days_in_trade"] = t.days_in_trade
    d["realized_pl"] = float(t.realized_pl) if t.realized_pl is not None else None
    d["realized_pl_pct"] = float(t.realized_pl_pct) if t.realized_pl_pct is not None else None
    return d


def _symbol_for(trade: Trade, session: Session) -> str:
    spot = session.get(Spot, trade.underlying_id)
    return spot.symbol if spot else "?"


@router.get("/trades")
def list_trades(session: Session = Depends(get_session)):
    # JOIN to avoid N+1 queries
    rows = session.exec(
        select(Trade, Spot.symbol)
        .outerjoin(Spot, Trade.underlying_id == Spot.id)
        .order_by(Trade.opened_at.desc())
    ).all()
    return [_trade_to_dict(t, sym or "?") for t, sym in rows]


@router.post("/trades", status_code=201)
def create_trade(body: TradeCreate, session: Session = Depends(get_session)):
    spot = _resolve_or_create_spot(body.symbol, session)
    symbol = spot.symbol

    trade = Trade(
        underlying_id=spot.id,
        strategy_type=body.strategy_type,
        strike=body.strike,
        expiry_date=body.expiry_date,
        contracts=body.contracts,
        total_premium=body.total_premium,
        opened_at=body.opened_at,
        spot_price_at_open=body.spot_price_at_open,
        iv_at_open=body.iv_at_open,
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

    return _trade_to_dict(trade, symbol)


@router.patch("/trades/{trade_id}")
def update_trade(trade_id: int, body: TradeUpdate, session: Session = Depends(get_session)):
    trade = _get_trade_or_404(trade_id, session)

    if body.symbol is not None:
        spot = _resolve_or_create_spot(body.symbol, session)
        trade.underlying_id = spot.id

    for field in ["strategy_type", "strike", "expiry_date", "contracts",
                   "total_premium", "opened_at", "spot_price_at_open",
                   "iv_at_open", "closed_at", "closing_cost", "closing_spot"]:
        val = getattr(body, field)
        if val is not None:
            setattr(trade, field, val)

    trade.updated_at = datetime.now(timezone.utc)

    # --- Sync side-effects ---
    _sync_open_event(trade, session)
    if trade.status != TradeStatus.OPEN:
        _sync_close_event(trade, session)
        if trade.status == TradeStatus.ASSIGNED:
            _sync_assignment_lot(trade, session)

    session.commit()
    session.refresh(trade)

    return _trade_to_dict(trade, _symbol_for(trade, session))


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
    expected_qty = trade.contracts * trade.multiplier
    consumed = max(lot.qty - lot.remaining_qty, 0)
    recalculated_remaining = expected_qty - consumed
    if recalculated_remaining < 0:
        raise HTTPException(
            400,
            f"contracts imply {expected_qty} shares, below consumed shares ({consumed}) for linked lot",
        )

    lot.qty = expected_qty
    lot.remaining_qty = recalculated_remaining
    lot.cost_per_share = trade.strike - trade.premium_per_share
    if trade.closed_at:
        lot.acquired_at = trade.closed_at
    session.add(lot)


@router.post("/trades/{trade_id}/close")
def close_trade(trade_id: int, body: TradeClose, session: Session = Depends(get_session)):
    """Close a trade as Expired or BTC."""
    trade = _get_trade_or_404(trade_id, session)
    _require_open(trade)
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

    return _trade_to_dict(trade, _symbol_for(trade, session))


@router.post("/trades/{trade_id}/assign")
def assign_trade(trade_id: int, body: TradeAssign, session: Session = Depends(get_session)):
    """Handle option assignment. CSP → creates a ShareLot. CC → consumes ShareLots (FIFO)."""
    trade = _get_trade_or_404(trade_id, session)
    _require_open(trade)

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

    return _trade_to_dict(trade, _symbol_for(trade, session))


@router.post("/trades/{trade_id}/roll")
def roll_trade(trade_id: int, body: TradeRoll, session: Session = Depends(get_session)):
    """Roll a trade: close the old leg and open a new one, linked via TradeEvents."""
    trade = _get_trade_or_404(trade_id, session)
    _require_open(trade)

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
    session.flush()  # get roll_close_event.id without committing

    # --- Create new trade ---
    new_contracts = body.new_contracts or trade.contracts
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
    session.flush()  # get new_trade.id without committing

    roll_open_event = TradeEvent(
        trade_id=new_trade.id,
        event_type=EventType.ROLL_OPEN,
        event_date=body.roll_date,
        qty=new_contracts,
        price=body.new_total_premium,
        linked_event_id=roll_close_event.id,
    )
    session.add(roll_open_event)
    session.commit()  # single atomic commit

    symbol = _symbol_for(trade, session)
    return {
        "closed_trade": _trade_to_dict(trade, symbol),
        "new_trade": _trade_to_dict(new_trade, symbol),
    }


@router.get("/trades/{trade_id}")
def get_trade(trade_id: int, session: Session = Depends(get_session)):
    trade = _get_trade_or_404(trade_id, session)
    return _trade_to_dict(trade, _symbol_for(trade, session))


@router.delete("/trades/{trade_id}", status_code=204)
def delete_trade(trade_id: int, session: Session = Depends(get_session)):
    """Delete a trade and all related events and share lots (via DB CASCADE)."""
    trade = _get_trade_or_404(trade_id, session)
    session.delete(trade)
    session.commit()


@router.get("/trades/{trade_id}/detail")
def get_trade_detail(trade_id: int, session: Session = Depends(get_session)):
    """Enriched trade view with live market data for decision-making."""
    from services import get_option_quotes, get_iv_rank, compute_greeks

    trade = _get_trade_or_404(trade_id, session)
    symbol = _symbol_for(trade, session)
    d = _trade_to_dict(trade, symbol)

    # Events timeline
    events = session.exec(
        select(TradeEvent).where(TradeEvent.trade_id == trade_id).order_by(TradeEvent.event_date)
    ).all()
    d["events"] = [e.model_dump() for e in events]

    # Spot info
    spot_obj = session.get(Spot, trade.underlying_id)
    d["spot"] = {
        "name": spot_obj.name,
        "asset_type": spot_obj.asset_type,
        "implied_volatility": float(spot_obj.implied_volatility) if spot_obj.implied_volatility else None,
    } if spot_obj else None

    # Live option data (only for open trades)
    d["live"] = None
    if trade.status == TradeStatus.OPEN:
        contracts = [{
            "trade_id": trade.id,
            "symbol": symbol,
            "expiry_date": trade.expiry_date.isoformat(),
            "strike": float(trade.strike),
            "strategy_type": trade.strategy_type.value,
        }]
        quotes = get_option_quotes(contracts)
        q = quotes.get(trade.id)
        if q:
            d["live"] = q
            # Compute Greeks if we have IV and a spot price
            iv_decimal = q.get("iv")
            spot_price = None
            try:
                spot_price = yf.Ticker(symbol).fast_info.get("lastPrice")
            except Exception:
                pass
            if iv_decimal and spot_price:
                dte = (trade.expiry_date - date.today()).days
                greeks = compute_greeks(
                    spot=spot_price,
                    strike=float(trade.strike),
                    iv=iv_decimal / 100,  # convert from % to decimal
                    dte=dte,
                    strategy_type=trade.strategy_type.value,
                )
                d["live"].update(greeks)

    # IV Rank
    d["iv_rank_data"] = get_iv_rank(symbol)

    return d


@router.post("/trades/recommendation")
def get_trade_recommendation(trade_context: dict):
    """Use Perplexity to generate a trade recommendation from pre-fetched data."""
    from services.openai import get_trade_recommendation as _get_rec

    try:
        text, tokens = _get_rec(trade_context)
    except RuntimeError as e:
        raise HTTPException(503, str(e))

    return {"recommendation": text, "tokens": tokens}
