#!/usr/bin/env bash
# bin/start-local.sh — Boot Mighty Twin locally (no Docker).
#
# Mirrors MightyDT's start_local_vm.sh pattern — native Postgres via brew,
# dedicated user-per-app, idempotent setup. Coexists with MightyDT (DT on
# 5001, Twin on 5003).
#
# Idempotent: safe to run repeatedly. Will:
#   1. ensure brew postgresql@17 is up
#   2. ensure user/db/PostGIS exist
#   3. run alembic upgrade head
#   4. kill any stale Twin api on 5003 + vite on 3002
#   5. start the FastAPI api in background (logs: /tmp/twin-api.log)
#   6. start the vite dev server in background (logs: /tmp/twin-web.log)
#   7. print URLs and pids

set -euo pipefail

BLUE=$'\033[0;34m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; NC=$'\033[0m'

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DB_USER="mightytwin"
DB_PASSWORD="mightytwin_dev"
DB_NAME="mightytwin"
DATABASE_URL="postgresql+psycopg://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}"
API_PORT=5003
WEB_PORT=3002

# --- Postgres -----------------------------------------------------------
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"
if ! pg_isready -q -h 127.0.0.1 -p 5432; then
  echo "${BLUE}Starting Postgres (brew services)…${NC}"
  brew services start postgresql@17 >/dev/null
  for _ in 1 2 3 4 5; do pg_isready -q -h 127.0.0.1 -p 5432 && break; sleep 1; done
fi
echo "${GREEN}✅ Postgres ready${NC}"

# --- DB + role + PostGIS (idempotent) -----------------------------------
psql -q -h 127.0.0.1 -p 5432 -U "$USER" -d postgres <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';
  END IF;
END
\$\$;
SQL
if ! psql -h 127.0.0.1 -p 5432 -U "$USER" -lqt | cut -d '|' -f1 | grep -qw "$DB_NAME"; then
  echo "${BLUE}Creating database ${DB_NAME}…${NC}"
  createdb -h 127.0.0.1 -p 5432 -U "$USER" -O "$DB_USER" "$DB_NAME"
fi
psql -q -h 127.0.0.1 -p 5432 -U "$USER" -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS postgis"
echo "${GREEN}✅ DB ${DB_NAME} ready (PostGIS enabled)${NC}"

# --- Migrations ---------------------------------------------------------
echo "${BLUE}Running alembic upgrade head…${NC}"
( cd "$ROOT/apps/api" && DATABASE_URL="$DATABASE_URL" uv run alembic upgrade head >/dev/null 2>&1 )
echo "${GREEN}✅ Migrations applied${NC}"

# --- Kill stale processes ----------------------------------------------
pkill -f "uvicorn.*${API_PORT}" 2>/dev/null || true
pkill -f "vite.*${WEB_PORT}" 2>/dev/null || true
# vite doesn't always include port in its argv; also kill the workspace runner
ps aux | grep -E "node .*apps/web" | grep -v grep | awk '{print $2}' | xargs -r kill 2>/dev/null || true
sleep 1

# --- Start API ----------------------------------------------------------
echo "${BLUE}Starting api (uvicorn)…${NC}"
( cd "$ROOT/apps/api" && DATABASE_URL="$DATABASE_URL" \
    uv run uvicorn twin_api.main:app --host 127.0.0.1 --port "$API_PORT" \
    > /tmp/twin-api.log 2>&1 ) &
API_PID=$!

# --- Start web ----------------------------------------------------------
echo "${BLUE}Starting web (vite)…${NC}"
( cd "$ROOT" && pnpm dev > /tmp/twin-web.log 2>&1 ) &
WEB_PID=$!

sleep 4

# --- Health check -------------------------------------------------------
if curl -fs "http://127.0.0.1:${API_PORT}/health" >/dev/null; then
  echo "${GREEN}✅ api:${NC} http://127.0.0.1:${API_PORT}/health  (pid ${API_PID})"
else
  echo "${YELLOW}⚠ api not responding yet — tail /tmp/twin-api.log${NC}"
fi

if curl -fs "http://localhost:${WEB_PORT}/" >/dev/null; then
  echo "${GREEN}✅ web:${NC} http://localhost:${WEB_PORT}/  (pid ${WEB_PID})"
else
  echo "${YELLOW}⚠ web not responding yet — tail /tmp/twin-web.log${NC}"
fi

cat <<EOF

${GREEN}Open:${NC} http://localhost:${WEB_PORT}/
   sign in with any creds — dev_stubs accepts everything

${BLUE}Logs:${NC}
   tail -f /tmp/twin-api.log
   tail -f /tmp/twin-web.log

${BLUE}Stop:${NC}
   bash bin/stop-local.sh
EOF
