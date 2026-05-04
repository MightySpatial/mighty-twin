## Build context = repo root.  Use the railway.toml in this directory to
## set the project to apps/api; Railway then runs the build from the repo
## root and we COPY the workspace python libs + the api itself.

FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        git ca-certificates libpq5 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv

WORKDIR /app

# Copy the workspace root + every member uv needs.
COPY pyproject.toml uv.lock ./
COPY python ./python
COPY apps/api ./apps/api

# Sync against the api project's dependency closure (workspace members
# auto-resolve via the root pyproject.toml's [tool.uv.workspace]).
RUN uv sync --project apps/api --frozen --no-dev || uv sync --project apps/api --no-dev

EXPOSE 5003
USER 10001:10001

# Railway sets PORT; default 5003 for parity with local dev.
ENV PORT=5003
WORKDIR /app/apps/api
CMD ["sh", "-c", "uv run uvicorn twin_api.main:app --host 0.0.0.0 --port ${PORT:-5003}"]
