from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates

router = APIRouter()
templates = Jinja2Templates(directory=Path(__file__).resolve().parent.parent / "templates")


@router.get("/")
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@router.get("/dashboard")
async def dashboard_page():
    return RedirectResponse(url="/?tab=dashboard", status_code=302)


@router.get("/recap")
async def recap_page():
    return RedirectResponse(url="/?tab=recap", status_code=302)


@router.get("/symbol/{symbol}")
async def symbol_page(symbol: str, request: Request):
    return templates.TemplateResponse("symbol.html", {"request": request, "symbol": symbol.upper()})


@router.get("/trade/{trade_id}")
async def trade_page(trade_id: int, request: Request):
    return templates.TemplateResponse("trade.html", {"request": request, "trade_id": trade_id})
