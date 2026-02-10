#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-4173}"
HOST="${HOST:-0.0.0.0}"
PYTHON_BIN="${PYTHON_BIN:-}"
AUTO_OPEN="${AUTO_OPEN:-0}"

print_step() {
  printf "\n[launcher] %s\n" "$1"
}

find_python() {
  if [[ -n "$PYTHON_BIN" ]]; then
    if command -v "$PYTHON_BIN" >/dev/null 2>&1; then
      echo "$PYTHON_BIN"
      return
    fi
    echo "Configured PYTHON_BIN '$PYTHON_BIN' not found in PATH." >&2
    exit 1
  fi

  if command -v python3 >/dev/null 2>&1; then
    echo "python3"
    return
  fi

  if command -v python >/dev/null 2>&1; then
    echo "python"
    return
  fi

  echo "Python is required but was not found. Install Python 3 and retry." >&2
  exit 1
}

port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltn "sport = :$port" 2>/dev/null | tail -n +2 | grep -q "."
    return $?
  fi

  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi

  return 1
}

open_browser_if_requested() {
  local url="$1"
  if [[ "$AUTO_OPEN" != "1" ]]; then
    return
  fi

  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 || true
    return
  fi

  if command -v open >/dev/null 2>&1; then
    open "$url" >/dev/null 2>&1 || true
    return
  fi

  if command -v start >/dev/null 2>&1; then
    start "$url" >/dev/null 2>&1 || true
  fi
}

print_step "Checking prerequisites"
PY_BIN="$(find_python)"
print_step "Using Python binary: $PY_BIN"

if port_in_use "$PORT"; then
  echo "Port $PORT is already in use. Stop the process using it or set PORT=<free_port>." >&2
  exit 1
fi

print_step "Starting Diablo clone server"
URL="http://localhost:${PORT}"
echo "Game URL: $URL"
echo "Tip: run AUTO_OPEN=1 ./scripts/launch_game.sh to open browser automatically."

open_browser_if_requested "$URL"

cd "$ROOT_DIR"
exec "$PY_BIN" -m http.server "$PORT" --bind "$HOST"
