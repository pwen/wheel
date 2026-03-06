from typing import Optional
from fastapi import APIRouter, Query
from pydantic import BaseModel

from services import get_current_prices, get_option_quotes

router = APIRouter(tags=["prices"])


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
