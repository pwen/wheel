from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta
from decimal import Decimal

import yfinance as yf

from models.spot import AssetType


def populate_spot_info(spot, session) -> None:
    """Fetch metadata from yfinance and update a Spot record in place."""
    try:
        ticker = yf.Ticker(spot.symbol)
        info = ticker.info
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
    beta = info.get("beta") or info.get("beta3Year")
    if beta is not None:
        spot.beta = Decimal(str(round(beta, 3)))
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

    # Options market data: volume, OI, ATM IV, bid-ask spread
    _populate_options_data(ticker, info, spot)

    spot.updated_at = datetime.utcnow()
    session.add(spot)
    session.commit()
    session.refresh(spot)


def _populate_options_data(ticker, info: dict, spot) -> None:
    """Fetch options chain data and populate liquidity fields on a Spot."""
    try:
        expirations = ticker.options
        if not expirations:
            return

        # Pick expiry closest to 30 days out for representative data
        today = date.today()
        target = today + timedelta(days=30)
        best_exp = min(expirations, key=lambda e: abs((date.fromisoformat(e) - target).days))

        chain = ticker.option_chain(best_exp)
        puts = chain.puts
        calls = chain.calls

        # Total option volume and open interest for this expiry
        put_vol = puts["volume"].sum() if not puts["volume"].isna().all() else 0
        call_vol = calls["volume"].sum() if not calls["volume"].isna().all() else 0
        total_vol = int(put_vol + call_vol)
        if total_vol > 0:
            spot.option_volume = total_vol

        total_oi = int(puts["openInterest"].sum() + calls["openInterest"].sum())
        if total_oi > 0:
            spot.open_interest = total_oi

        # ATM implied volatility and bid-ask spread
        current_price = info.get("currentPrice") or info.get("regularMarketPrice")
        if current_price and len(puts) > 0 and len(calls) > 0:
            atm_put = puts.iloc[(puts["strike"] - current_price).abs().argsort()[:1]]
            atm_call = calls.iloc[(calls["strike"] - current_price).abs().argsort()[:1]]

            put_iv = atm_put["impliedVolatility"].values[0]
            call_iv = atm_call["impliedVolatility"].values[0]
            avg_iv = (put_iv + call_iv) / 2
            if avg_iv > 0:
                spot.implied_volatility = Decimal(str(round(avg_iv, 4)))

            put_spread = atm_put["ask"].values[0] - atm_put["bid"].values[0]
            call_spread = atm_call["ask"].values[0] - atm_call["bid"].values[0]
            avg_spread = (put_spread + call_spread) / 2
            if avg_spread >= 0:
                spot.bid_ask_spread = Decimal(str(round(avg_spread, 2)))
    except Exception:
        pass  # Options data is best-effort


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
                    volume = int(row["volume"]) if row.get("volume") and not (isinstance(row["volume"], float) and row["volume"] != row["volume"]) else None
                    oi = int(row["openInterest"]) if row.get("openInterest") and not (isinstance(row["openInterest"], float) and row["openInterest"] != row["openInterest"]) else None
                    out[t["trade_id"]] = {"mid": mid, "iv": iv, "bid": bid, "ask": ask, "volume": volume, "open_interest": oi}
                except Exception:
                    out[t["trade_id"]] = {"mid": None, "iv": None, "bid": None, "ask": None, "volume": None, "open_interest": None}
        except Exception:
            for t in trades:
                out[t["trade_id"]] = {"mid": None, "iv": None, "bid": None, "ask": None, "volume": None, "open_interest": None}
        return out

    with ThreadPoolExecutor(max_workers=min(8, len(by_symbol))) as pool:
        futures = {pool.submit(_fetch_symbol, sym, trades): sym for sym, trades in by_symbol.items()}
        for future in as_completed(futures):
            results.update(future.result())

    return results


def compute_greeks(spot: float, strike: float, iv: float, dte: int, strategy_type: str, r: float = 0.045) -> dict:
    """Compute option Greeks via Black-Scholes.

    Args:
        spot: Current underlying price
        strike: Option strike price
        iv: Implied volatility as a decimal (e.g., 0.30 for 30%)
        dte: Days to expiration
        strategy_type: 'CSP' (put) or 'CC' (call)
        r: Risk-free rate (default 4.5%)

    Returns:
        dict with delta, theta (per day in $), gamma, prob_otm
    """
    import math

    if dte <= 0 or iv <= 0 or spot <= 0 or strike <= 0:
        return {"delta": None, "theta": None, "gamma": None, "prob_otm": None}

    T = dte / 365.0
    sqrt_T = math.sqrt(T)
    d1 = (math.log(spot / strike) + (r + 0.5 * iv ** 2) * T) / (iv * sqrt_T)
    d2 = d1 - iv * sqrt_T

    # Standard normal CDF and PDF using math.erf
    def norm_cdf(x):
        return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))

    def norm_pdf(x):
        return math.exp(-0.5 * x * x) / math.sqrt(2.0 * math.pi)

    is_put = strategy_type == "CSP"

    if is_put:
        delta = round(norm_cdf(d1) - 1, 4)       # Negative for puts
        prob_otm = round(norm_cdf(d2) * 100, 1)   # P(S > K) = prob put expires OTM
    else:
        delta = round(norm_cdf(d1), 4)             # Positive for calls
        prob_otm = round(norm_cdf(-d2) * 100, 1)   # P(S < K) = prob call expires OTM

    # Theta per day (in dollars per share)
    theta_component = -(spot * norm_pdf(d1) * iv) / (2 * sqrt_T)
    if is_put:
        theta = theta_component + r * strike * math.exp(-r * T) * norm_cdf(-d2)
    else:
        theta = theta_component - r * strike * math.exp(-r * T) * norm_cdf(d2)
    theta_per_day = round(theta / 365, 4)

    # Gamma (same for puts and calls)
    gamma = round(norm_pdf(d1) / (spot * iv * sqrt_T), 6)

    return {
        "delta": delta,
        "theta": theta_per_day,
        "gamma": gamma,
        "prob_otm": prob_otm,
    }


def get_iv_rank(symbol: str) -> dict:
    """Calculate IV Rank for a symbol using 1-year historical close data.

    IV Rank = (current_iv - 52w_low) / (52w_high - 52w_low) * 100

    Uses HV (historical volatility from daily returns) as a proxy since yfinance
    doesn't provide historical IV. Current IV comes from ATM option chain.
    """
    try:
        ticker = yf.Ticker(symbol)
        # Get 1 year of daily prices for historical volatility
        hist = ticker.history(period="1y")
        if hist.empty or len(hist) < 30:
            return {"iv_rank": None, "current_iv": None}

        # Calculate rolling 30-day HV (annualized) as IV proxy
        import numpy as np
        returns = np.log(hist["Close"] / hist["Close"].shift(1)).dropna()
        rolling_hv = returns.rolling(window=21).std() * np.sqrt(252) * 100  # annualized %

        rolling_hv = rolling_hv.dropna()
        if len(rolling_hv) < 10:
            return {"iv_rank": None, "current_iv": None}

        current_hv = float(rolling_hv.iloc[-1])
        hv_min = float(rolling_hv.min())
        hv_max = float(rolling_hv.max())

        iv_rank = None
        if hv_max > hv_min:
            iv_rank = round((current_hv - hv_min) / (hv_max - hv_min) * 100, 1)

        return {
            "iv_rank": iv_rank,
            "current_iv": round(current_hv, 1),
        }
    except Exception:
        return {"iv_rank": None, "current_iv": None}
