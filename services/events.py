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
    # US
    EventType.US_OPEX, EventType.US_TRIPLE_WITCHING, EventType.US_JOBS,
    EventType.US_FOMC, EventType.US_CPI, EventType.US_GDP,
    EventType.US_PCE, EventType.US_PPI,
    EventType.US_ISM_MFG, EventType.US_ISM_SVC, EventType.US_RETAIL_SALES,
    EventType.US_CONSUMER_CONF, EventType.US_JOLTS, EventType.US_JACKSON_HOLE,
    EventType.US_MICHIGAN, EventType.US_RUSSELL_RECON, EventType.US_SP500_REBAL,
    # Global
    EventType.OPEC_MEETING, EventType.COMEX_GOLD_DELIVERY, EventType.WGC_DEMAND,
    EventType.AI_SAFETY_SUMMIT, EventType.G7_SUMMIT, EventType.WAIC_SHANGHAI,
    EventType.CES, EventType.WUZHEN_WIC,
    # China
    EventType.CN_LPR, EventType.CN_GDP, EventType.CN_CPI,
    EventType.CN_PPI, EventType.CN_PMI, EventType.CAIXIN_PMI,
    EventType.TWO_SESSIONS, EventType.CN_TRADE, EventType.CEWC,
    # EU
    EventType.EU_ECB, EventType.EU_CPI, EventType.EU_GDP,
    EventType.EU_PMI, EventType.EU_ECB_MINUTES, EventType.EU_TRADE,
    # Germany
    EventType.DE_IFO,
    # Japan
    EventType.JP_BOJ, EventType.JP_CPI, EventType.JP_TANKAN,
    # India
    EventType.IN_RBI, EventType.IN_CPI, EventType.IN_GDP,
    # Brazil
    EventType.BR_COPOM, EventType.BR_CPI,
    # Mexico
    EventType.MX_BANXICO, EventType.MX_CPI,
}

# JSON key → (EventType, display label)
_TYPE_MAP: dict[str, tuple[EventType, str]] = {
    # US
    "us_fomc": (EventType.US_FOMC, "FOMC Meeting"),
    "us_cpi": (EventType.US_CPI, "US CPI Release"),
    "us_gdp": (EventType.US_GDP, "US GDP Advance Estimate"),
    "us_opex": (EventType.US_OPEX, "US OpEx"),
    "us_triple_witching": (EventType.US_TRIPLE_WITCHING, "US Triple Witching"),
    "us_jobs": (EventType.US_JOBS, "US Jobs Report (NFP)"),
    "us_pce": (EventType.US_PCE, "US PCE Price Index"),
    "us_ppi": (EventType.US_PPI, "US PPI Release"),
    "us_ism_mfg": (EventType.US_ISM_MFG, "ISM Manufacturing PMI"),
    "us_ism_svc": (EventType.US_ISM_SVC, "ISM Services PMI"),
    "us_retail_sales": (EventType.US_RETAIL_SALES, "US Retail Sales"),
    "us_consumer_conf": (EventType.US_CONSUMER_CONF, "Consumer Confidence"),
    "us_jolts": (EventType.US_JOLTS, "JOLTS Job Openings"),
    "us_jackson_hole": (EventType.US_JACKSON_HOLE, "Jackson Hole Symposium"),
    "us_michigan": (EventType.US_MICHIGAN, "Michigan Consumer Sentiment"),
    "us_russell_recon": (EventType.US_RUSSELL_RECON, "Russell Reconstitution"),
    "us_sp500_rebal": (EventType.US_SP500_REBAL, "S&P 500 Rebalancing"),
    # Global
    "opec_meeting": (EventType.OPEC_MEETING, "OPEC+ Meeting"),
    "comex_gold_delivery": (EventType.COMEX_GOLD_DELIVERY, "COMEX Gold Delivery"),
    "wgc_demand": (EventType.WGC_DEMAND, "World Gold Council Demand Trends"),
    "ai_safety_summit": (EventType.AI_SAFETY_SUMMIT, "AI Safety Summit"),
    "g7_summit": (EventType.G7_SUMMIT, "G7 Summit"),
    "waic_shanghai": (EventType.WAIC_SHANGHAI, "WAIC Shanghai"),
    "ces": (EventType.CES, "CES"),
    "wuzhen_wic": (EventType.WUZHEN_WIC, "Wuzhen World Internet Conference"),
    # China
    "cn_lpr": (EventType.CN_LPR, "LPR (Loan Prime Rate)"),
    "cn_gdp": (EventType.CN_GDP, "China GDP"),
    "cn_cpi": (EventType.CN_CPI, "China CPI"),
    "cn_ppi": (EventType.CN_PPI, "China PPI"),
    "cn_pmi": (EventType.CN_PMI, "NBS PMI"),
    "caixin_pmi": (EventType.CAIXIN_PMI, "Caixin PMI"),
    "two_sessions": (EventType.TWO_SESSIONS, "Two Sessions"),
    "cn_trade": (EventType.CN_TRADE, "China Trade Balance"),
    "cewc": (EventType.CEWC, "CEWC"),
    # EU
    "eu_ecb": (EventType.EU_ECB, "ECB Rate Decision"),
    "eu_cpi": (EventType.EU_CPI, "EU CPI (HICP Flash)"),
    "eu_gdp": (EventType.EU_GDP, "EU GDP"),
    "eu_pmi": (EventType.EU_PMI, "EU PMI (Composite Flash)"),
    "eu_ecb_minutes": (EventType.EU_ECB_MINUTES, "ECB Meeting Minutes"),
    "eu_trade": (EventType.EU_TRADE, "EU Trade Balance"),
    # Germany
    "de_ifo": (EventType.DE_IFO, "German Ifo Business Climate"),
    # Japan
    "jp_boj": (EventType.JP_BOJ, "BOJ Rate Decision"),
    "jp_cpi": (EventType.JP_CPI, "Japan CPI"),
    "jp_tankan": (EventType.JP_TANKAN, "Tankan Survey"),
    # India
    "in_rbi": (EventType.IN_RBI, "RBI Rate Decision"),
    "in_cpi": (EventType.IN_CPI, "India CPI"),
    "in_gdp": (EventType.IN_GDP, "India GDP"),
    # Brazil
    "br_copom": (EventType.BR_COPOM, "Copom Rate Decision"),
    "br_cpi": (EventType.BR_CPI, "Brazil CPI (IPCA)"),
    # Mexico
    "mx_banxico": (EventType.MX_BANXICO, "Banxico Rate Decision"),
    "mx_cpi": (EventType.MX_CPI, "Mexico CPI"),
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
        impact = year_data[key].get("impact", 2)
        url = year_data[key].get("url")
        count = 0
        for date_str in year_data[key]["dates"]:
            d = date.fromisoformat(date_str)
            title = f"{d.strftime('%b')} {label}"
            session.add(MarketEvent(
                event_type=etype, event_date=d,
                title=title, source=EventSource.MANUAL,
                region=region, impact=impact, url=url,
            ))
            count += 1
        counts[key] = count

    session.commit()
    return counts
