from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.templating import Jinja2Templates

router = APIRouter()
templates = Jinja2Templates(directory=Path(__file__).resolve().parent.parent / "templates")


@router.get("/")
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@router.get("/symbol/{symbol}")
async def symbol_page(symbol: str, request: Request):
    return templates.TemplateResponse("symbol.html", {"request": request, "symbol": symbol.upper()})
