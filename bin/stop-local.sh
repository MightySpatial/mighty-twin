#!/usr/bin/env bash
# bin/stop-local.sh — Stop Twin's local dev servers without touching DT or postgres.
#
# Kills only Twin-specific processes:
#   - uvicorn on port 5003 (Twin api)
#   - vite + the pnpm dev runner under apps/web (Twin web)
#
# Leaves brew postgresql@17 running (it's shared with DT) and never touches
# any process bound to port 5001 (that's MightyDT).

set -euo pipefail

BLUE=$'\033[0;34m'; GREEN=$'\033[0;32m'; NC=$'\033[0m'

API_PORT=5003

echo "${BLUE}Killing Twin api on :${API_PORT}…${NC}"
pkill -f "uvicorn.*${API_PORT}" 2>/dev/null || true

echo "${BLUE}Killing Twin web (vite + pnpm dev under apps/web)…${NC}"
ps aux | grep -E "node .*apps/web" | grep -v grep | awk '{print $2}' | xargs -r kill 2>/dev/null || true
ps aux | grep -E "pnpm .* @mighty-twin/web dev" | grep -v grep | awk '{print $2}' | xargs -r kill 2>/dev/null || true

sleep 1
echo "${GREEN}✅ Twin local stack stopped (DT on :5001 untouched)${NC}"
