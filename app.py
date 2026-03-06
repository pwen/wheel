import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from routes import trades, spots, prices, lots, pages


@asynccontextmanager
async def lifespan(app: FastAPI):
    from alembic import command
    from alembic.config import Config

    alembic_cfg = Config(str(Path(__file__).resolve().parent / "alembic.ini"))
    command.upgrade(alembic_cfg, "head")
    yield


app = FastAPI(title="Wheel Tracker", lifespan=lifespan)

BASE_DIR = Path(__file__).resolve().parent
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")

# API routes
app.include_router(trades.router, prefix="/api")
app.include_router(spots.router, prefix="/api")
app.include_router(prices.router, prefix="/api")
app.include_router(lots.router, prefix="/api")

# Page routes (HTML)
app.include_router(pages.router)


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=5002, reload=True)
