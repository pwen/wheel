from fastapi import APIRouter, Query

from services import get_current_prices

router = APIRouter(tags=["prices"])


@router.get("/prices")
def get_prices(symbols: list[str] = Query(...)):
    symbols = [s.upper() for s in symbols]
    return get_current_prices(symbols)
