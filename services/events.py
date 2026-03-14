"""Service for seeding and querying MarketEvent records."""

import json
import logging
from datetime import date, datetime
from pathlib import Path

from sqlmodel import Session, select

from models.market_event import MarketEvent, EventType, EventSource

log = logging.getLogger(__name__)

SEED_PATH = Path(__file__).resolve().parent.parent / "seeds" / "macro_events.json"

# Macro event types — used to scope the delete-then-recreate
_MACRO_TYPES = {
    EventType.OPEX, EventType.TRIPLE_WITCHING, EventType.JOBS,
    EventType.FOMC, EventType.CPI, EventType.GDP,
    EventType.PCE, EventType.PPI,
}

# JSON key → (EventType, display label)
_TYPE_MAP: dict[str, tuple[EventType, str]] = {
    "fomc": (EventType.FOMC, "FOMC Meeting"),
    "cpi": (EventType.CPI, "CPI Release"),
    "gdp": (EventType.GDP, "GDP Advance Estimate"),
    "opex": (EventType.OPEX, "OpEx"),
    "triple_witching": (EventType.TRIPLE_WITCHING, "Triple Witching"),
    "jobs": (EventType.JOBS, "Jobs Report (NFP)"),
    "pce": (EventType.PCE, "PCE Price Index"),
    "ppi": (EventType.PPI, "PPI Release"),
}


def seed_macro_events(year: int, session: Session) -> dict:
    """Reset and re-seed all macro events for a given year.

    Deletes all existing macro events for the year, then recreates from
    the seed JSON file.  Safe to re-run — always produces a clean state.
    """
    year_start = date(year, 1, 1)
    year_end = date(year, 12, 31)

    # Delete all existing macro events for this year
    existing = session.exec(
        select(MarketEvent).where(
            MarketEvent.event_type.in_(_MACRO_TYPES),
            MarketEvent.event_date >= year_start,
            MarketEvent.event_date <= year_end,
            MarketEvent.symbol.is_(None),
        )
    ).all()
    deleted = len(existing)
    for e in existing:
        session.delete(e)
    session.flush()

    counts: dict[str, int] = {"deleted": deleted}

    # Load seed data
    seed_data = json.loads(SEED_PATH.read_text())
    year_key = str(year)
    if year_key not in seed_data:
        log.warning("No seed data found for year %d in %s", year, SEED_PATH)
        session.commit()
        return {**counts, "warning": f"No seed data for {year}"}

    year_data = seed_data[year_key]

    for key, (etype, label) in _TYPE_MAP.items():
        if key not in year_data:
            counts[key] = 0
            continue
        region = year_data[key].get("region", "US")
        count = 0
        for date_str in year_data[key]["dates"]:
            d = date.fromisoformat(date_str)
            title = f"{d.strftime('%b')} {label}"
            session.add(MarketEvent(
                event_type=etype, event_date=d,
                title=title, source=EventSource.MANUAL,
                region=region,
            ))
            count += 1
        counts[key] = count

    session.commit()
    return counts
