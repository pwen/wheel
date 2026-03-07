"""Scheduled spot data refresh — split into fast (weekly) and slow (monthly) tiers."""

import logging
from datetime import datetime
from decimal import Decimal

import yfinance as yf

from models.spot import Spot
from services.yfinance import _populate_options_data

log = logging.getLogger(__name__)


def refresh_fundamentals(spot, session) -> bool:
    """Monthly refresh: PE, beta, market cap, AUM, expense ratio."""
    try:
        ticker = yf.Ticker(spot.symbol)
        info = ticker.info
    except Exception:
        log.warning("yfinance fetch failed for %s", spot.symbol)
        return False

    changed = False

    beta = info.get("beta") or info.get("beta3Year")
    if beta is not None:
        spot.beta = Decimal(str(round(beta, 3)))
        changed = True
    if info.get("trailingPE") is not None:
        spot.pe_ratio = Decimal(str(round(info["trailingPE"], 2)))
        changed = True
    if info.get("marketCap") is not None:
        spot.market_cap = Decimal(str(info["marketCap"]))
        changed = True
    if info.get("totalAssets") is not None:
        spot.aum = Decimal(str(info["totalAssets"]))
        changed = True
    expense = info.get("netExpenseRatio") or info.get("annualReportExpenseRatio")
    if expense is not None:
        spot.expense_ratio = Decimal(str(round(expense / 100, 6)))
        changed = True

    if changed:
        spot.updated_at = datetime.utcnow()
        session.add(spot)

    return changed


def refresh_market_data(spot, session) -> bool:
    """Weekly refresh: avg volume, option volume, OI, IV, bid-ask spread."""
    try:
        ticker = yf.Ticker(spot.symbol)
        info = ticker.info
    except Exception:
        log.warning("yfinance fetch failed for %s", spot.symbol)
        return False

    changed = False

    if info.get("averageVolume") is not None:
        spot.avg_daily_volume = info["averageVolume"]
        changed = True

    _populate_options_data(ticker, info, spot)
    # _populate_options_data sets option_volume, open_interest, implied_volatility, bid_ask_spread
    changed = True

    if changed:
        spot.updated_at = datetime.utcnow()
        session.add(spot)

    return changed
