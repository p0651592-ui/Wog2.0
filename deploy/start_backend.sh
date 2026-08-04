#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/root/Wog2.0"
VENV_BIN="${APP_DIR}/.venv/bin"

cd "${APP_DIR}"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

PORT="${PORT:-10000}"

if [[ -x "${VENV_BIN}/uvicorn" ]]; then
  exec "${VENV_BIN}/uvicorn" main:app --host 0.0.0.0 --port "${PORT}"
fi

if command -v uvicorn >/dev/null 2>&1; then
  exec uvicorn main:app --host 0.0.0.0 --port "${PORT}"
fi

echo "uvicorn is not installed" >&2
exit 1
