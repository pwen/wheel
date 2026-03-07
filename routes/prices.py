from typing import Optional
from datetime import date

from fastapi import APIRouter, Query
from pydantic import BaseModel

from services import get_current_prices, get_option_quotes, get_spot_price_on_date

router = APIRouter(tags=["prices"])


@router.get("/spot-price")
def spot_price(symbol: str = Query(...), on_date: date = Query(...)):
    symbol = symbol.upper()
    price = get_spot_price_on_date(symbol, on_date)
    return {"symbol": symbol, "date": on_date.isoformat(), "price": price}


@router.get("/prices")
def get_prices(symbols: list[str] = Query(...)):
    symbols = [s.upper() for s in symbols]
    return get_current_prices(symbols)


class OptionQuoteRequest(BaseModel):
    trade_id: int
    symbol: str
    expiry_date: str  # "YYYY-MM-DD"
    strike: float
    strategy_type: str  # "CSP" or "CC"


@router.post("/option-prices")
def get_option_prices(contracts: list[OptionQuoteRequest]):
    raw = [c.model_dump() for c in contracts]
    for r in raw:
        r["symbol"] = r["symbol"].upper()
    return get_option_quotes(raw)


@router.get("/option-iv")
def get_option_iv(
    symbol: str = Query(...),
    expiry_date: str = Query(...),
    strike: float = Query(...),
    strategy_type: str = Query(...),
):
    """Fetch current IV for a specific option contract."""
    symbol = symbol.upper()
    contracts = [{
        "trade_id": 0,
        "symbol": symbol,
        "expiry_date": expiry_date,
        "strike": strike,
        "strategy_type": strategy_type.upper(),
    }]
    quotes = get_option_quotes(contracts)
    q = quotes.get(0)
    return {"iv": q["iv"] if q else None}
