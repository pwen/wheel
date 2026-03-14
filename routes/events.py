import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from db import get_session
from models.market_event import MarketEvent, EventType
from services.events import seed_macro_events, seed_symbol_events
from services.openai import get_event_summary

log = logging.getLogger(__name__)
router = APIRouter(tags=["events"])


@router.post("/events/seed-macro")
def seed_macro(
    year: int = Query(..., ge=2025, le=2100),
    session: Session = Depends(get_session),
):
    """Reset and re-seed macro events for a given year. Deletes existing, then recreates."""
    result = seed_macro_events(year, session)
    return {"year": year, **result}


@router.post("/events/seed-symbols")
def seed_symbols(
    year: int = Query(default=None, ge=2025, le=2100),
    session: Session = Depends(get_session),
):
    """Fetch and seed per-symbol events (earnings, ex-dividend) for all tracked symbols."""
    if year is None:
        year = date.today().year
    result = seed_symbol_events(year, session)
    return {"year": year, **result}


@router.get("/events")
def list_events(
    start: Optional[date] = None,
    end: Optional[date] = None,
    event_type: Optional[EventType] = None,
    symbol: Optional[str] = None,
    region: Optional[str] = None,
    limit: int = Query(default=200, ge=1, le=1000),
    session: Session = Depends(get_session),
):
    """Query market events with optional filters."""
    stmt = select(MarketEvent).order_by(MarketEvent.event_date.desc())

    if start:
        stmt = stmt.where(MarketEvent.event_date >= start)
    if end:
        stmt = stmt.where(MarketEvent.event_date <= end)
    if event_type:
        stmt = stmt.where(MarketEvent.event_type == event_type)
    if symbol:
        stmt = stmt.where(MarketEvent.symbol == symbol.upper())
    if region:
        stmt = stmt.where(MarketEvent.region == region.upper())

    stmt = stmt.limit(limit)
    rows = session.exec(stmt).all()
    return [r.model_dump() for r in rows]


@router.get("/events/{event_id}/summary")
def event_summary(event_id: int, session: Session = Depends(get_session)):
    """Get an AI-generated summary of a specific event. Cached after first call."""
    event = session.get(MarketEvent, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    if event.ai_summary:
        return {"event_id": event_id, "summary": event.ai_summary}

    summary = get_event_summary(
        event_title=event.title,
        event_type=event.event_type,
        event_date=str(event.event_date),
        region=event.region,
    )
    event.ai_summary = summary
    session.add(event)
    session.commit()
    return {"event_id": event_id, "summary": summary}
