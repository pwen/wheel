import yfinance as yf


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

    for sym, trades in by_symbol.items():
        try:
            ticker = yf.Ticker(sym)
            # Cache chains per expiry
            chains: dict[str, object] = {}
            for t in trades:
                expiry = t["expiry_date"]  # "YYYY-MM-DD"
                try:
                    if expiry not in chains:
                        chains[expiry] = ticker.option_chain(expiry)
                    chain = chains[expiry]
                    # CSP = put, CC = call
                    df = chain.puts if t["strategy_type"] == "CSP" else chain.calls
                    row = df[df["strike"] == float(t["strike"])]
                    if row.empty:
                        results[t["trade_id"]] = {"mid": None, "iv": None}
                        continue
                    row = row.iloc[0]
                    bid = float(row["bid"]) if row["bid"] > 0 else None
                    ask = float(row["ask"]) if row["ask"] > 0 else None
                    mid = round((bid + ask) / 2, 4) if bid and ask else (bid or ask)
                    iv = round(float(row["impliedVolatility"]) * 100, 2) if row["impliedVolatility"] else None
                    results[t["trade_id"]] = {"mid": mid, "iv": iv}
                except Exception:
                    results[t["trade_id"]] = {"mid": None, "iv": None}
        except Exception:
            for t in trades:
                results[t["trade_id"]] = {"mid": None, "iv": None}

    return results
