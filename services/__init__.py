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
