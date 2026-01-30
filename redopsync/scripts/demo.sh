#!/usr/bin/env bash
set -euo pipefail

echo "[demo] Starting RedOpSync (docker compose up --build)"
docker compose up --build -d

echo "[demo] Waiting for API health..."
for i in {1..60}; do
  if curl -fsS http://localhost:8000/health >/dev/null 2>&1; then
    echo "[demo] API is up."
    break
  fi
  sleep 1
done

echo "[demo] Import fixtures is not implemented in starter scaffold."
echo "       Once implemented, this script should create a project and import fixtures."
echo "[demo] Open web UI: http://localhost:3000"
