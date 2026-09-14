#!/usr/bin/env bash
# MPLADS full pipeline runner
# Usage: ./run.sh [--pipeline-only | --backend-only | --frontend-only]
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

PIPELINE=true
BACKEND=true
FRONTEND=true

for arg in "$@"; do
  case $arg in
    --pipeline-only) BACKEND=false; FRONTEND=false ;;
    --backend-only)  PIPELINE=false; FRONTEND=false ;;
    --frontend-only) PIPELINE=false; BACKEND=false ;;
  esac
done

# ── colours ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'
step() { echo -e "\n${CYAN}▶ $1${RESET}"; }
ok()   { echo -e "${GREEN}✓ $1${RESET}"; }

# ── 1. Pipeline ───────────────────────────────────────────────────────────────
if [ "$PIPELINE" = true ]; then
  step "Running anomaly detection pipeline..."
  python3 pipeline/detect_anomalies.py
  ok "Pipeline complete → backend/mplads.db updated"
fi

# ── 2. Backend ────────────────────────────────────────────────────────────────
if [ "$BACKEND" = true ]; then
  step "Starting backend (port 8000)..."
  # Kill any existing instance on port 8000
  lsof -ti:8000 | xargs kill -9 2>/dev/null || true
  sleep 0.5
  cd "$ROOT/backend"
  GROQ_API_KEY="${GROQ_API_KEY}" uvicorn main:app --reload --port 8000 &
  BACKEND_PID=$!
  cd "$ROOT"
  ok "Backend started (PID $BACKEND_PID)"
fi

# ── 3. Frontend ───────────────────────────────────────────────────────────────
if [ "$FRONTEND" = true ]; then
  step "Starting frontend (port 5173)..."
  # Kill any existing Vite instance
  lsof -ti:5173 | xargs kill -9 2>/dev/null || true
  sleep 0.5
  cd "$ROOT/frontend"
  npm run dev &
  FRONTEND_PID=$!
  cd "$ROOT"
  ok "Frontend started (PID $FRONTEND_PID)"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
if [ "$BACKEND" = true ];  then echo -e "  API:      ${YELLOW}http://localhost:8000${RESET}"; fi
if [ "$FRONTEND" = true ]; then echo -e "  Dashboard: ${YELLOW}http://localhost:5173${RESET}"; fi
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo "Press Ctrl+C to stop all services."
echo ""

# Wait for background processes so Ctrl+C kills them cleanly
wait
