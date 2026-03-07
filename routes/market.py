from datetime import date, datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from db import get_session
from models import MarketFlash
from services.market_flash import generate_market_flash

router = APIRouter(tags=["market"])

# Use Pacific time (user's local timezone) so the date doesn't flip early
_PT = ZoneInfo("America/Los_Angeles")


def _today_local() -> date:
    return datetime.now(_PT).date()


@router.get("/market-flash")
def get_market_flash(session: Session = Depends(get_session)):
    """Return cached market flash for today, or 404 if none exists."""
    today = _today_local()
    flash = session.exec(
        select(MarketFlash).where(MarketFlash.flash_date == today)
    ).first()
    if not flash:
        return {"date": today.isoformat(), "markdown": None}
    return {"date": today.isoformat(), "markdown": flash.markdown}


@router.post("/market-flash")
def create_market_flash(force: bool = False, session: Session = Depends(get_session)):
    """Generate today's market flash via Perplexity and save it."""
    today = _today_local()

    existing = session.exec(
        select(MarketFlash).where(MarketFlash.flash_date == today)
    ).first()

    if existing and not force:
        return {"date": today.isoformat(), "markdown": existing.markdown}

    markdown = generate_market_flash(today.isoformat())

    if existing:
        existing.markdown = markdown
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return {"date": today.isoformat(), "markdown": existing.markdown}

    flash = MarketFlash(flash_date=today, markdown=markdown)
    session.add(flash)
    session.commit()
    session.refresh(flash)
    return {"date": today.isoformat(), "markdown": flash.markdown}
