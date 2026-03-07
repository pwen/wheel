# CLAUDE.md – Wheel Tracker

## Package Management
- **Use `uv`** for all dependency management (`uv sync`, `uv run`)
- **Never use `pip` or `pip3`** directly
- Python 3.13 (Docker), requires >=3.11

## Local Development
- Start Postgres: `docker compose up -d db` (port **5433** locally)
- Run app: `uv run python -m uvicorn app:app --host 0.0.0.0 --port 5002 --reload`
- Or run everything in Docker: `docker compose up -d` (app + db)
- App URL: http://localhost:5002

## Database
- PostgreSQL 16 via Docker Compose
- Local port: **5433** (mapped from container 5432)
- Credentials: `wheel / wheel`, database: `wheel`
- Migrations run automatically on app startup (Alembic in lifespan hook)
- Manual migration: `DATABASE_URL=postgresql://wheel:wheel@localhost:5433/wheel uv run alembic upgrade head`

## Deployment (Railway)
- Deployed via **Dockerfile** builder (`railway.toml`)
- Railway injects `PORT` env var (typically **8080**) — the Dockerfile uses `${PORT:-5002}`
- **Networking target port must match Railway's `PORT`** (8080), NOT the local default (5002)
- Railway also injects `DATABASE_URL` — linked from a Railway Postgres service
- `db.py` handles Railway's `postgres://` → `postgresql://` URL rewrite
- Healthcheck: `GET /health`
- Auto-deploys on push to main

## Makefile Shortcuts
- `make setup` — install deps
- `make run` — `docker compose up -d`
- `make db` — start Postgres only
- `make build` — rebuild Docker image
- `make stop` — stop everything
- `make logs` — tail app logs
- `make reset-db` — wipe DB volumes and restart Postgres
- `make db-upgrade` / `make db-downgrade` — run migrations locally

## Stack
- FastAPI + SQLModel + Alembic + Jinja2
- Frontend: vanilla JS + Tailwind CSS (CDN)
- Market data: yfinance (spot prices, option chains, ticker metadata)

## Key Directories
- `models/` — Spot, Trade, TradeEvent, ShareLot
- `routes/` — trades, spots, lots, prices (API), pages (HTML)
- `services/` — yfinance integration (prices, option quotes, spot metadata)
- `templates/` — Jinja2 (index.html, symbol.html, partials/)
- `static/js/` — modular JS (trades, lots, close, prices, symbol_detail, spots, etc.)
- `scripts/` — utility scripts (explore_yf.py)

## Environment Variables
- `DATABASE_URL` — Postgres connection string (Railway injects this)
- `APP_PASSWORD` — single password for access control
- `SECRET_KEY` — random string for cookie signing
- `PERPLEXITY_API_KEY` — Perplexity API key for AI recommendations
- `CRON_SECRET` — Bearer token for GitHub Actions scheduled refresh endpoints

## GitHub Actions Secrets
- `APP_URL` — Railway deployment URL (e.g. `https://wheel-xxx.up.railway.app`)
- `CRON_SECRET` — must match the Railway env var

## Scheduled Refresh
- Weekly (Sunday 10pm UTC): `.github/workflows/refresh-spots-weekly.yml` — refreshes avg volume, option volume, OI, IV, bid-ask spread
- Monthly (1st of month 8am UTC): `.github/workflows/refresh-spots-monthly.yml` — refreshes PE, beta, market cap, AUM, expense ratio
- Both call `POST /api/spots/refresh-all?tier=weekly|monthly` with Bearer token auth
