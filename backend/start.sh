#!/usr/bin/env bash
# Production startup for Render
set -e

echo "▶ Running anomaly detection pipeline..."
python pipeline/detect_anomalies.py
echo "✓ Pipeline complete — mplads.db ready"

echo "▶ Starting FastAPI server..."
cd backend
exec gunicorn main:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:${PORT:-8000} \
  --workers 1 \
  --timeout 120
