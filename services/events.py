"""Service for seeding and querying MarketEvent records."""

import json
import logging
from calendar import monthcalendar, FRIDAY
from datetime import date, datetime
from pathlib import Path

from sqlmodel import Session, select

from models.market_event import MarketEvent, EventType, EventSource

log = logging.getLogger(__name__)

SEED_PATH = Path(__file__).resolve().parent.parent / "seeds" / "macro_events.json"


def _third_friday(year: int, month: int) -> date:
    """Return the 3rd Friday of the given month."""
    weeks = monthcalendar(year, month)
    count = 0
    for week in weeks:
        if week[FRIDAY] != 0:
            count += 1
            if count == 3:
                return date(year, month, week[FRIDAY])
    raise ValueError(f"Could not find 3rd Friday for {year}-{month}")


def _first_friday(year: int, month: int) -> date:
    """Return the 1st Friday of the given month."""
    weeks = monthcalendar(year, month)
    for week in weeks:
        if week[FRIDAY] != 0:
            return date(year, month, week[FRIDAY])
    raise ValueError(f"Could not find 1st Friday for {year}-{month}")


# Macro event types — used to scope the delete-then-recreate
_MACRO_TYPES = {
    EventType.OPEX, EventType.TRIPLE_WITCHING, EventType.JOBS,
    EventType.FOMC, EventType.CPI, EventType.GDP,
}


def seed_macro_events(year: int, session: Session) -> dict:
    """Reset and re-seed all macro events for a given year.

    Deletes all existing macro events for the year, then recreates from
    computed dates + seed JSON.  Safe to re-run — always produces a clean state.

    Computed: OpEx (monthly), Triple Witching (quarterly), Jobs/NFP (monthly).
    From seed JSON: FOMC, CPI, GDP.
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

    counts = {
        "deleted": deleted,
        "opex": 0, "triple_witching": 0, "jobs": 0,
        "fomc": 0, "cpi": 0, "gdp": 0,
    }
    triple_months = {3, 6, 9, 12}

    # --- Computed events ---
    for month in range(1, 13):
        # OpEx — 3rd Friday
        opex_date = _third_friday(year, month)
        session.add(MarketEvent(
            event_type=EventType.OPEX, event_date=opex_date,
            title=f"{opex_date.strftime('%b')} OpEx", source=EventSource.COMPUTED,
            region="US",
        ))
        counts["opex"] += 1

        # Triple Witching — 3rd Friday of quarter-end months
        if month in triple_months:
            session.add(MarketEvent(
                event_type=EventType.TRIPLE_WITCHING, event_date=opex_date,
                title=f"Q{month // 3} Triple Witching", source=EventSource.COMPUTED,
                region="US",
            ))
            counts["triple_witching"] += 1

        # Jobs / NFP — 1st Friday
        jobs_date = _first_friday(year, month)
        session.add(MarketEvent(
            event_type=EventType.JOBS, event_date=jobs_date,
            title=f"{jobs_date.strftime('%b')} Jobs Report (NFP)", source=EventSource.COMPUTED,
            region="US",
        ))
        counts["jobs"] += 1

    # --- Seed-file events (FOMC, CPI, GDP) ---
    seed_data = json.loads(SEED_PATH.read_text())
    year_key = str(year)
    if year_key not in seed_data:
        log.warning("No seed data found for year %d in %s", year, SEED_PATH)
        session.commit()
        return {**counts, "warning": f"No seed data for {year}; only computed events seeded"}

    year_data = seed_data[year_key]

    type_map: dict[str, tuple[EventType, str]] = {
        "fomc": (EventType.FOMC, "FOMC Meeting"),
        "cpi": (EventType.CPI, "CPI Release"),
        "gdp": (EventType.GDP, "GDP Advance Estimate"),
    }

    for key, (etype, label) in type_map.items():
        if key not in year_data:
            continue
        region = year_data[key].get("region", "US")
        for date_str in year_data[key]["dates"]:
            d = date.fromisoformat(date_str)
            title = f"{d.strftime('%b')} {label}"
            session.add(MarketEvent(
                event_type=etype, event_date=d,
                title=title, source=EventSource.MANUAL,
                region=region,
            ))
            counts[key] += 1

    session.commit()
    return counts
