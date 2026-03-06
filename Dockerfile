FROM python:3.13-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

COPY pyproject.toml uv.lock* ./
RUN uv sync --no-dev --frozen 2>/dev/null || uv sync --no-dev

COPY . .

EXPOSE ${PORT:-5002}

CMD ["sh", "-c", "/app/.venv/bin/python -m uvicorn app:app --host 0.0.0.0 --port ${PORT:-5002}"]
