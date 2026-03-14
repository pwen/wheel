"""Service for seeding and querying MarketEvent records."""

import json
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime
from pathlib import Path

import yfinance as yf
from sqlmodel import Session, select, delete

from models.market_event import MarketEvent, EventType, EventSource
from models.spot import Spot, AssetType

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
    EventType.NVIDIA_GTC, EventType.COMPUTEX, EventType.SEMICON_WEST,
    EventType.HOT_CHIPS, EventType.US_BIS_EXPORT, EventType.CERAWEEK,
    EventType.IEA_WEO, EventType.FERC_MEETING, EventType.UN_COP,
    EventType.DAVOS_WEF, EventType.GOOGLE_IO, EventType.AWS_REINVENT,
    EventType.MS_BUILD,
    # China tech/EV/AI
    EventType.HUAWEI_CONNECT, EventType.CN_AUTO_SHOW, EventType.BAIDU_WORLD,
    EventType.ZHONGGUANCUN, EventType.CATL_INNOVATION, EventType.WORLD_BATTERY_EXPO,
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
    "nvidia_gtc": (EventType.NVIDIA_GTC, "NVIDIA GTC"),
    "computex": (EventType.COMPUTEX, "Computex Taipei"),
    "semicon_west": (EventType.SEMICON_WEST, "SEMICON West"),
    "hot_chips": (EventType.HOT_CHIPS, "Hot Chips"),
    "us_bis_export": (EventType.US_BIS_EXPORT, "US BIS Export Controls"),
    "ceraweek": (EventType.CERAWEEK, "CERAWeek"),
    "iea_weo": (EventType.IEA_WEO, "IEA World Energy Outlook"),
    "ferc_meeting": (EventType.FERC_MEETING, "FERC Open Meeting"),
    "un_cop": (EventType.UN_COP, "UN COP Climate Conference"),
    "davos_wef": (EventType.DAVOS_WEF, "Davos / WEF"),
    "google_io": (EventType.GOOGLE_IO, "Google I/O"),
    "aws_reinvent": (EventType.AWS_REINVENT, "Amazon re:Invent"),
    "ms_build": (EventType.MS_BUILD, "Microsoft Build"),
    # China tech/EV/AI
    "huawei_connect": (EventType.HUAWEI_CONNECT, "Huawei Connect"),
    "cn_auto_show": (EventType.CN_AUTO_SHOW, "China Auto Show (Beijing)"),
    "baidu_world": (EventType.BAIDU_WORLD, "Baidu World"),
    "zhongguancun": (EventType.ZHONGGUANCUN, "Zhongguancun Forum"),
    "catl_innovation": (EventType.CATL_INNOVATION, "CATL Innovation Day"),
    "world_battery_expo": (EventType.WORLD_BATTERY_EXPO, "World Battery Industry Expo"),
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

    # Bulk-delete existing macro events for this year
    session.exec(
        delete(MarketEvent).where(
            MarketEvent.event_type.in_(_MACRO_TYPES),
            MarketEvent.event_date >= year_start,
            MarketEvent.event_date <= year_end,
            MarketEvent.symbol.is_(None),
        )
    )
    session.flush()

    # Load seed data
    seed_data = json.loads(SEED_PATH.read_text())
    year_key = str(year)
    if year_key not in seed_data:
        log.warning("No seed data found for year %d in %s", year, SEED_PATH)
        session.commit()
        return {"total": 0, "warning": f"No seed data for {year}"}

    year_data = seed_data[year_key]

    total = 0
    for key, (etype, label) in _TYPE_MAP.items():
        if key not in year_data:
            continue
        region = year_data[key].get("region", "US")
        impact = year_data[key].get("impact", 2)
        url = year_data[key].get("url")
        for date_str in year_data[key]["dates"]:
            d = date.fromisoformat(date_str)
            title = f"{d.strftime('%b')} {label}"
            session.add(MarketEvent(
                event_type=etype, event_date=d,
                title=title, source=EventSource.MANUAL,
                region=region, impact=impact, url=url,
            ))
            total += 1

    session.commit()
    return {"total": total}


# ---------------------------------------------------------------------------
# Symbol events — per-symbol (earnings, ex-dividend) via yfinance
# ---------------------------------------------------------------------------

_SYMBOL_EVENT_TYPES = {EventType.US_EARNINGS, EventType.US_EX_DIVIDEND}


def _fetch_symbol_dates(symbol: str, year: int) -> dict:
    """Fetch earnings and ex-dividend dates for a symbol from yfinance.

    Returns {"earnings": [date, ...], "dividends": [date, ...]}.
    Runs in a thread pool worker — no DB access here.
    """
    year_start = date(year, 1, 1)
    year_end = date(year, 12, 31)
    result: dict[str, list[date]] = {"earnings": [], "dividends": []}

    try:
        ticker = yf.Ticker(symbol)
    except Exception:
        log.warning("yfinance: failed to create Ticker for %s", symbol)
        return result

    # Earnings dates
    try:
        df = ticker.get_earnings_dates(limit=20)
        if df is not None and not df.empty:
            for ts in df.index:
                d = ts.date() if hasattr(ts, "date") else ts
                if isinstance(d, datetime):
                    d = d.date()
                if year_start <= d <= year_end:
                    result["earnings"].append(d)
            # De-dup (yfinance sometimes returns duplicates)
            result["earnings"] = sorted(set(result["earnings"]))
    except Exception:
        log.debug("yfinance: no earnings dates for %s", symbol)

    # Ex-dividend dates (from dividend history)
    try:
        divs = ticker.dividends
        if divs is not None and len(divs) > 0:
            for ts in divs.index:
                d = ts.date() if hasattr(ts, "date") else ts
                if isinstance(d, datetime):
                    d = d.date()
                if year_start <= d <= year_end:
                    result["dividends"].append(d)
            result["dividends"] = sorted(set(result["dividends"]))
    except Exception:
        log.debug("yfinance: no dividend data for %s", symbol)

    return result


def seed_symbol_events(year: int, session: Session) -> dict:
    """Fetch and seed earnings + ex-dividend events for all tracked Spot symbols.

    Deletes existing symbol events for the year, then recreates from yfinance.
    """
    year_start = date(year, 1, 1)
    year_end = date(year, 12, 31)

    # Bulk-delete existing symbol events for this year
    session.exec(
        delete(MarketEvent).where(
            MarketEvent.event_type.in_(_SYMBOL_EVENT_TYPES),
            MarketEvent.event_date >= year_start,
            MarketEvent.event_date <= year_end,
            MarketEvent.symbol.is_not(None),
        )
    )
    session.flush()

    # Get all tracked symbols (skip ETFs — no earnings)
    spots = session.exec(select(Spot).where(Spot.asset_type != AssetType.ETF)).all()
    if not spots:
        session.commit()
        return {"total": 0, "symbols": 0}

    symbols = [s.symbol for s in spots]

    # Fetch dates in parallel (yfinance is I/O-bound)
    fetched: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = {pool.submit(_fetch_symbol_dates, sym, year): sym for sym in symbols}
        for future in as_completed(futures):
            sym = futures[future]
            try:
                fetched[sym] = future.result()
            except Exception:
                log.warning("Failed to fetch dates for %s", sym)
                fetched[sym] = {"earnings": [], "dividends": []}

    # Create MarketEvent records
    total = 0
    symbols_with_events = 0
    for sym in symbols:
        data = fetched.get(sym, {"earnings": [], "dividends": []})
        sym_count = 0

        for d in data["earnings"]:
            session.add(MarketEvent(
                event_type=EventType.US_EARNINGS,
                event_date=d,
                symbol=sym,
                title=f"{sym} Earnings",
                source=EventSource.YFINANCE,
                region="US",
                impact=3,
            ))
            sym_count += 1

        for d in data["dividends"]:
            session.add(MarketEvent(
                event_type=EventType.US_EX_DIVIDEND,
                event_date=d,
                symbol=sym,
                title=f"{sym} Ex-Dividend",
                source=EventSource.YFINANCE,
                region="US",
                impact=2,
            ))
            sym_count += 1

        total += sym_count
        if sym_count > 0:
            symbols_with_events += 1

    session.commit()
    return {"total": total, "symbols": len(symbols), "with_events": symbols_with_events}


def seed_single_symbol_events(symbol: str, year: int, session: Session) -> int:
    """Fetch and seed events for a single symbol. Returns count of events created."""
    year_start = date(year, 1, 1)
    year_end = date(year, 12, 31)

    # Bulk-delete existing events for this symbol + year
    session.exec(
        delete(MarketEvent).where(
            MarketEvent.event_type.in_(_SYMBOL_EVENT_TYPES),
            MarketEvent.event_date >= year_start,
            MarketEvent.event_date <= year_end,
            MarketEvent.symbol == symbol,
        )
    )
    session.flush()

    data = _fetch_symbol_dates(symbol, year)
    total = 0

    for d in data["earnings"]:
        session.add(MarketEvent(
            event_type=EventType.US_EARNINGS,
            event_date=d,
            symbol=symbol,
            title=f"{symbol} Earnings",
            source=EventSource.YFINANCE,
            region="US",
            impact=3,
        ))
        total += 1

    for d in data["dividends"]:
        session.add(MarketEvent(
            event_type=EventType.US_EX_DIVIDEND,
            event_date=d,
            symbol=symbol,
            title=f"{symbol} Ex-Dividend",
            source=EventSource.YFINANCE,
            region="US",
            impact=2,
        ))
        total += 1

    session.commit()
    return total
