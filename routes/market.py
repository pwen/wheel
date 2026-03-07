from datetime import date

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from db import get_session
from models import MarketFlash
from services.market_flash import generate_market_flash

router = APIRouter(tags=["market"])


@router.get("/market-flash")
def get_market_flash(session: Session = Depends(get_session)):
    """Return cached market flash for today, or 404 if none exists."""
    today = date.today()
    flash = session.exec(
        select(MarketFlash).where(MarketFlash.flash_date == today)
    ).first()
    if not flash:
        return {"date": today.isoformat(), "markdown": None}
    return {"date": today.isoformat(), "markdown": flash.markdown}


@router.post("/market-flash")
def create_market_flash(session: Session = Depends(get_session)):
    """Generate today's market flash via Perplexity and save it."""
    today = date.today()

    # Return existing if already generated today
    existing = session.exec(
        select(MarketFlash).where(MarketFlash.flash_date == today)
    ).first()
    if existing:
        return {"date": today.isoformat(), "markdown": existing.markdown}

    markdown = generate_market_flash(today.isoformat())
    flash = MarketFlash(flash_date=today, markdown=markdown)
    session.add(flash)
    session.commit()
    session.refresh(flash)
    return {"date": today.isoformat(), "markdown": flash.markdown}
