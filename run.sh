#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP_DIR="$ROOT_DIR/tmp"
ENTRY_FILE="$ROOT_DIR/web_app.py"
LOG_FILE="$TMP_DIR/web_app.log"
PID_FILE="$TMP_DIR/.web_app.pid"
HOST="127.0.0.1"
PORT="${SPIDER_XHS_PORT:-${PORT:-8765}}"

mkdir -p "$TMP_DIR"

choose_python() {
  local candidate
  for candidate in \
    "$ROOT_DIR/.venv/bin/python3" \
    "$ROOT_DIR/venv/bin/python3" \
    "$(command -v python3 2>/dev/null || true)" \
    "$(command -v python 2>/dev/null || true)"; do
    if [[ -n "$candidate" && -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  echo "No usable python interpreter was found." >&2
  exit 1
}

python_healthcheck() {
  local python_bin="$1"
  "$python_bin" - "$PORT" <<'PY'
import json
import sys
from urllib.request import urlopen

port = sys.argv[1]
with urlopen(f"http://127.0.0.1:{port}/api/health", timeout=2) as response:
    payload = json.loads(response.read().decode("utf-8"))
    if not payload.get("success"):
        raise SystemExit(1)
PY
}

is_our_process() {
  local pid="$1"
  local cmd

  cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  [[ -n "$cmd" ]] || return 1
  [[ "$cmd" == *"web_app.py"* ]] || return 1
  [[ "$cmd" == *"Spider_XHS"* || "$cmd" == *"$ROOT_DIR"* ]] || return 1
}

collect_running_pids() {
  local collected=()
  local pid

  if [[ -f "$PID_FILE" ]]; then
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null && is_our_process "$pid"; then
      collected+=("$pid")
    fi
  fi

  if command -v lsof >/dev/null 2>&1; then
    while IFS= read -r pid; do
      [[ -n "$pid" ]] || continue
      if is_our_process "$pid"; then
        collected+=("$pid")
      fi
    done < <(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)
  fi

  if command -v pgrep >/dev/null 2>&1; then
    while IFS= read -r pid; do
      [[ -n "$pid" ]] || continue
      if is_our_process "$pid"; then
        collected+=("$pid")
      fi
    done < <(pgrep -f "web_app.py" 2>/dev/null || true)
  fi

  if [[ ${#collected[@]} -eq 0 ]]; then
    return 0
  fi

  printf '%s\n' "${collected[@]}" | awk '!seen[$0]++'
}

ensure_port_is_safe() {
  local pid
  local cmd

  [[ -n "${PORT:-}" ]] || return 0
  command -v lsof >/dev/null 2>&1 || return 0

  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    if is_our_process "$pid"; then
      continue
    fi

    cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    echo "Port $PORT is already in use by another process: ${cmd:-pid $pid}" >&2
    exit 1
  done < <(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)
}

stop_pid() {
  local pid="$1"
  local waited=0

  if ! kill -0 "$pid" 2>/dev/null; then
    return 0
  fi

  kill "$pid" 2>/dev/null || true

  while kill -0 "$pid" 2>/dev/null; do
    if (( waited >= 20 )); then
      break
    fi
    sleep 0.5
    waited=$((waited + 1))
  done

  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null || true
  fi
}

start_server() {
  local python_bin="$1"

  : > "$LOG_FILE"
  "$python_bin" - "$ROOT_DIR" "$ENTRY_FILE" "$PORT" "$LOG_FILE" "$PID_FILE" <<'PY'
import subprocess
import sys
from pathlib import Path

root_dir = Path(sys.argv[1])
entry_file = Path(sys.argv[2])
port = sys.argv[3]
log_file = Path(sys.argv[4])
pid_file = Path(sys.argv[5])

with log_file.open("ab") as handle:
    process = subprocess.Popen(
        [sys.executable, str(entry_file), port],
        cwd=str(root_dir),
        stdout=handle,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )

pid_file.write_text(f"{process.pid}\n", encoding="utf-8")
PY
}

wait_until_ready() {
  local python_bin="$1"
  local pid="$2"
  local attempt=0

  while (( attempt < 40 )); do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "Spider_XHS failed to start. See log: $LOG_FILE" >&2
      tail -n 40 "$LOG_FILE" 2>/dev/null || true
      exit 1
    fi

    if command -v curl >/dev/null 2>&1; then
      if curl -fsS "http://$HOST:$PORT/api/health" >/dev/null 2>&1; then
        return 0
      fi
    elif python_healthcheck "$python_bin"; then
      return 0
    fi

    sleep 0.5
    attempt=$((attempt + 1))
  done

  echo "Spider_XHS did not become ready in time. See log: $LOG_FILE" >&2
  tail -n 40 "$LOG_FILE" 2>/dev/null || true
  exit 1
}

main() {
  local python_bin
  local running_pids=()
  local pid

  python_bin="$(choose_python)"

  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    running_pids+=("$pid")
  done < <(collect_running_pids || true)

  if [[ ${#running_pids[@]} -gt 0 ]]; then
    echo "Stopping existing Spider_XHS process..."
    for pid in "${running_pids[@]}"; do
      stop_pid "$pid"
    done
  fi

  rm -f "$PID_FILE"
  ensure_port_is_safe

  echo "Starting Spider_XHS Web console..."
  start_server "$python_bin"
  wait_until_ready "$python_bin" "$(cat "$PID_FILE")"

  echo "Spider_XHS is running."
  echo "URL: http://$HOST:$PORT"
  echo "Log: $LOG_FILE"
  echo "PID: $(cat "$PID_FILE")"
}

main "$@"
