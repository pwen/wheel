from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta
from decimal import Decimal

import yfinance as yf

from models.spot import AssetType


def populate_spot_info(spot, session) -> None:
    """Fetch metadata from yfinance and update a Spot record in place."""
    try:
        info = yf.Ticker(spot.symbol).info
    except Exception:
        return

    quote_type = info.get("quoteType", "")
    if quote_type == "ETF":
        spot.asset_type = AssetType.ETF
    elif quote_type == "EQUITY":
        spot.asset_type = AssetType.STOCK

    spot.name = info.get("shortName") or info.get("longName")
    spot.sector = info.get("sector") or info.get("category")
    spot.industry = info.get("industry")
    spot.region = info.get("region")
    if info.get("beta") is not None:
        spot.beta = Decimal(str(round(info["beta"], 3)))
    if info.get("trailingPE") is not None:
        spot.pe_ratio = Decimal(str(round(info["trailingPE"], 2)))
    if info.get("marketCap") is not None:
        spot.market_cap = Decimal(str(info["marketCap"]))
    if info.get("averageVolume") is not None:
        spot.avg_daily_volume = info["averageVolume"]
    if info.get("totalAssets") is not None:
        spot.aum = Decimal(str(info["totalAssets"]))
    expense = info.get("netExpenseRatio") or info.get("annualReportExpenseRatio")
    if expense is not None:
        spot.expense_ratio = Decimal(str(round(expense / 100, 6)))

    spot.updated_at = datetime.utcnow()
    session.add(spot)
    session.commit()
    session.refresh(spot)


def get_spot_price_on_date(symbol: str, on_date: date) -> float | None:
    """Fetch the spot closing price for a symbol on a given date.

    If the date is today, returns the current price.
    If the date is in the past, returns the market close price for that day.
    """
    try:
        ticker = yf.Ticker(symbol)
        if on_date >= date.today():
            return float(ticker.fast_info.last_price)
        # Fetch a small window around the date to handle weekends/holidays
        start = on_date - timedelta(days=5)
        end = on_date + timedelta(days=1)
        hist = ticker.history(start=start.isoformat(), end=end.isoformat())
        if hist.empty:
            return None
        # Get the closest date <= on_date
        hist.index = hist.index.tz_localize(None)
        mask = hist.index.date <= on_date
        if not mask.any():
            return None
        return round(float(hist.loc[mask, "Close"].iloc[-1]), 2)
    except Exception:
        return None


def get_current_prices(symbols: list[str]) -> dict[str, float | None]:
    """Fetch current prices for a batch of symbols via yfinance.

    Returns a dict of symbol -> last price (or None if unavailable).
    """
    if not symbols:
        return {}

    prices = {}
    try:
        tickers = yf.Tickers(" ".join(symbols))
        for sym in symbols:
            try:
                info = tickers.tickers[sym].fast_info
                prices[sym] = float(info.last_price)
            except Exception:
                prices[sym] = None
    except Exception:
        for sym in symbols:
            prices[sym] = None

    return prices


def get_option_quotes(contracts: list[dict]) -> dict[int, dict]:
    """Fetch live option data for a list of open trades.

    Each contract dict has: trade_id, symbol, expiry_date, strike, strategy_type.
    Returns dict of trade_id -> {mid, iv} or None values if unavailable.
    """
    if not contracts:
        return {}

    results = {}
    # Group by symbol to minimize API calls
    by_symbol: dict[str, list[dict]] = {}
    for c in contracts:
        by_symbol.setdefault(c["symbol"], []).append(c)

    def _fetch_symbol(sym: str, trades: list[dict]) -> dict[int, dict]:
        """Fetch option data for all trades of a single symbol."""
        out = {}
        try:
            ticker = yf.Ticker(sym)
            chains: dict[str, object] = {}
            for t in trades:
                expiry = t["expiry_date"]
                try:
                    if expiry not in chains:
                        chains[expiry] = ticker.option_chain(expiry)
                    chain = chains[expiry]
                    df = chain.puts if t["strategy_type"] == "CSP" else chain.calls
                    row = df[df["strike"] == float(t["strike"])]
                    if row.empty:
                        out[t["trade_id"]] = {"mid": None, "iv": None}
                        continue
                    row = row.iloc[0]
                    bid = float(row["bid"]) if row["bid"] > 0 else None
                    ask = float(row["ask"]) if row["ask"] > 0 else None
                    mid = round((bid + ask) / 2, 4) if bid and ask else (bid or ask)
                    iv = round(float(row["impliedVolatility"]) * 100, 2) if row["impliedVolatility"] else None
                    out[t["trade_id"]] = {"mid": mid, "iv": iv}
                except Exception:
                    out[t["trade_id"]] = {"mid": None, "iv": None}
        except Exception:
            for t in trades:
                out[t["trade_id"]] = {"mid": None, "iv": None}
        return out

    with ThreadPoolExecutor(max_workers=min(8, len(by_symbol))) as pool:
        futures = {pool.submit(_fetch_symbol, sym, trades): sym for sym, trades in by_symbol.items()}
        for future in as_completed(futures):
            results.update(future.result())

    return results
