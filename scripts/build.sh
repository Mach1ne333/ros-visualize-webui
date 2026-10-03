#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$ROOT/.tools/node-v22.16.0-linux-x64/bin:/usr/bin:/bin"
if [[ ! -x "$ROOT/.tools/node-v22.16.0-linux-x64/bin/node" ]]; then
  echo 'Run scripts/setup-node.sh first.' >&2
  exit 1
fi
cd "$ROOT/frontend"
npm ci --no-audit --no-fund
npm run build
python3 -m py_compile "$ROOT/server/app.py"
