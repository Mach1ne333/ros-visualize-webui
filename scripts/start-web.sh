#!/usr/bin/env bash
# Inherit the user's overlay environment; no hardcoded robot workspace path.
set -eo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source /opt/ros/humble/setup.bash
PORT="${1:-5173}"
if [ "$#" -gt 0 ]; then shift; fi
exec python3 "$ROOT/server/app.py" --port "$PORT" "$@"
