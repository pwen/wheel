# Wheel Tracker

A personal bookkeeping app for tracking the [wheel strategy](https://www.investopedia.com/terms/w/wheel-strategy.asp) — selling cash-secured puts (CSP) and covered calls (CC).

Built with FastAPI, SQLModel, Tailwind CSS, and vanilla JS. Market data via yfinance.

## Local Development

```bash
make setup        # install dependencies
make db           # start Postgres (port 5433)
make run          # start app + db via Docker Compose
make logs         # tail app logs
make db-upgrade   # apply pending migrations
make db-downgrade # roll back last migration
make reset-db     # wipe DB and restart Postgres
```

Seed the database with sample trades (app must be running):

```bash
docker compose exec app python scripts/seed.py
```
Or if running outside Docker with app up at localhost:5002
```
uv run python scripts/seed.py
```

```bash
uv sync
docker compose up -d db
uv run python -m uvicorn app:app --host 0.0.0.0 --port 5002 --reload
```

App runs at http://localhost:5002. Migrations run automatically on startup.

## Deploy to Railway

The app deploys via Dockerfile. See [CLAUDE.md](CLAUDE.md) for Railway-specific notes (port config, DATABASE_URL linking).

Set these env vars on Railway:
- `DATABASE_URL` — reference from a Railway Postgres service
- `APP_PASSWORD` — single password for access control
- `SECRET_KEY` — random string for cookie signing
- `PERPLEXITY_API_KEY` -  key for communicating with perlexity api
