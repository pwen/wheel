from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates

router = APIRouter()
templates = Jinja2Templates(directory=Path(__file__).resolve().parent.parent / "templates")

# Tab name → URL path mapping
_TAB_PATHS = {"/": "dashboard", "/trades": "trades", "/recap": "recap",
              "/dashboard": "dashboard", "/lots": "lots", "/spots": "spots",
              "/holdings": "spots", "/holdings/spots": "spots",
              "/holdings/pairings": "spots"}


@router.get("/")
@router.get("/trades")
@router.get("/recap")
@router.get("/dashboard")
@router.get("/lots")
@router.get("/spots")
@router.get("/holdings")
@router.get("/holdings/spots")
@router.get("/holdings/pairings")
async def tab_page(request: Request):
    tab = _TAB_PATHS.get(request.url.path, "trades")
    return templates.TemplateResponse("index.html", {"request": request, "active_tab": tab})


@router.get("/symbol/{symbol}")
async def symbol_page(symbol: str, request: Request):
    return templates.TemplateResponse("symbol.html", {"request": request, "symbol": symbol.upper()})


@router.get("/trade/{trade_id}")
async def trade_page(trade_id: int, request: Request):
    return templates.TemplateResponse("trade.html", {"request": request, "trade_id": trade_id})
