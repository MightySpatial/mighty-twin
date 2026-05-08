## Build context = repo root (set by apps/api/railway.toml).
## Stage 1 builds the React viewer (apps/web) using the pnpm workspace.
## Stage 2 installs the FastAPI service via uv against the python/ workspace,
## then copies the prebuilt viewer dist so FastAPI can serve it at /viewer.

# ---- Stage 1: viewer-builder -----------------------------------------------
FROM node:22-alpine AS viewer-builder

# Install pnpm via npm — corepack prepare fails on Railway US East
# builders (see commit 205445b on apps/web/Dockerfile).
RUN npm install -g pnpm@9.15.0

WORKDIR /repo

# Workspace root + lockfile + tsconfigs (web tsconfig extends ../../tsconfig.base.json).
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig*.json ./

# Cache-bust arg — increment RAILWAY_CACHE_BUST env var in Railway dashboard
# to force re-fetch of packages layer if BuildKit snapshot goes stale.
ARG CACHE_BUST=1
RUN echo "cache bust: $CACHE_BUST"

# Workspace packages required for the web build's `workspace:` deps.
COPY packages/ ./packages/

# Web app source.
COPY apps/web/ ./apps/web/

# API origin baked into the bundle. Same-origin in production (frontend served
# from /viewer on the API host), so default to that host.
ARG VITE_API_URL=https://mighty-twin-web.up.railway.app
ENV VITE_API_URL=$VITE_API_URL

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @mighty-twin/web build


# ---- Stage 2: api ----------------------------------------------------------
FROM python:3.12-slim AS api

RUN apt-get update && apt-get install -y --no-install-recommends \
        git ca-certificates libpq5 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv

WORKDIR /app

# Workspace root + every member uv needs.
COPY pyproject.toml uv.lock ./
COPY python ./python
COPY apps/api ./apps/api

RUN uv sync --project apps/api --frozen --no-dev || uv sync --project apps/api --no-dev

# Bring in the prebuilt viewer; FastAPI mounts it at /viewer when present.
COPY --from=viewer-builder /repo/apps/web/dist ./apps/web/dist

EXPOSE 8080
ENV PORT=8080

WORKDIR /app/apps/api
# alembic.ini lives here; run migrations on boot then start uvicorn.
CMD ["sh", "-c", "uv run alembic upgrade head && uv run uvicorn twin_api.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
