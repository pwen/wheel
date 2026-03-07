import hashlib
import hmac
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Request, Form
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.base import BaseHTTPMiddleware

from routes import trades, spots, prices, lots, pages, dashboard, market

APP_PASSWORD = os.environ.get("APP_PASSWORD", "")
_SECRET = os.environ.get("SECRET_KEY", "wheel-dev-secret")


def _make_token(password: str) -> str:
    return hmac.new(_SECRET.encode(), password.encode(), hashlib.sha256).hexdigest()


class AuthMiddleware(BaseHTTPMiddleware):
    OPEN_PATHS = {"/health", "/login"}

    async def dispatch(self, request: Request, call_next):
        if not APP_PASSWORD:
            return await call_next(request)

        path = request.url.path
        if path in self.OPEN_PATHS or path.startswith("/static"):
            return await call_next(request)

        token = request.cookies.get("auth")
        if token == _make_token(APP_PASSWORD):
            return await call_next(request)

        if path.startswith("/api"):
            from fastapi.responses import JSONResponse
            return JSONResponse({"detail": "Unauthorized"}, status_code=401)

        return RedirectResponse("/login", status_code=302)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from alembic import command
    from alembic.config import Config

    alembic_cfg = Config(str(Path(__file__).resolve().parent / "alembic.ini"))
    command.upgrade(alembic_cfg, "head")
    yield


app = FastAPI(title="Wheel Tracker", lifespan=lifespan)
app.add_middleware(AuthMiddleware)

BASE_DIR = Path(__file__).resolve().parent
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")


@app.get("/login", response_class=HTMLResponse)
def login_page():
    return """<!DOCTYPE html>
<html><head><title>Wheel Tracker — Login</title>
<script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-gray-50 flex items-center justify-center min-h-screen">
<form method="post" action="/login" class="bg-white p-8 rounded-lg shadow-md w-80">
  <h1 class="text-lg font-semibold mb-4 text-center">Wheel Tracker</h1>
  <input type="password" name="password" placeholder="Password" required autofocus
    class="w-full border rounded px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-400">
  <button type="submit"
    class="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">Enter</button>
</form></body></html>"""


@app.post("/login")
def login(password: str = Form(...)):
    if hmac.compare_digest(password, APP_PASSWORD):
        resp = RedirectResponse("/", status_code=302)
        resp.set_cookie("auth", _make_token(password), httponly=True, max_age=60 * 60 * 24 * 30, samesite="lax")
        return resp
    return RedirectResponse("/login", status_code=302)


# API routes
app.include_router(trades.router, prefix="/api")
app.include_router(spots.router, prefix="/api")
app.include_router(prices.router, prefix="/api")
app.include_router(lots.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(market.router, prefix="/api")

# Page routes (HTML)
app.include_router(pages.router)


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=5002, reload=True)
