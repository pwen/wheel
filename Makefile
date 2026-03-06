.PHONY: help setup run db build stop logs reset-db db db-upgrade db-downgrade

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

setup: 
	uv sync

run:
	docker compose up -d

db: 
	docker compose up -d db

build: 
	docker compose build --no-cache

stop: 
	docker compose down

logs: 
	docker compose logs app --follow

reset-db: 
	docker compose down -v
	docker compose up -d db

# ---------------------------------------------------------------------------
# Migrations (run locally against Postgres on port 5433)
# ---------------------------------------------------------------------------

db-upgrade: ## Apply pending migrations
	DATABASE_URL=postgresql://wheel:wheel@localhost:5433/wheel uv run alembic upgrade head

db-downgrade: ## Roll back the last migration
	DATABASE_URL=postgresql://wheel:wheel@localhost:5433/wheel uv run alembic downgrade -1
