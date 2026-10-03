#!/usr/bin/env bash
set -eo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE="$ROOT/.tools/node-v22.16.0-linux-x64/bin/node"
CLI="$ROOT/frontend/dist-tools/convert-rviz.mjs"
if [ ! -x "$NODE" ]; then echo "项目 Node 缺失；先运行 scripts/setup-node.sh" >&2; exit 1; fi
if [ ! -f "$CLI" ]; then echo "转换工具未构建；在 frontend 执行 npm run build:converter（使用项目 Node）" >&2; exit 1; fi
for SOURCE in "$ROOT/frontend/tools/"*.ts "$ROOT/frontend/tools/build-converter.mjs" "$ROOT/frontend/src/layers.ts" "$ROOT/frontend/src/address.ts" "$ROOT/frontend/package-lock.json"; do
  if [ "$SOURCE" -nt "$CLI" ]; then echo "转换工具产物落后源码；请在 frontend 执行 npm run build:converter" >&2; exit 1; fi
done
exec "$NODE" "$CLI" "$@"
