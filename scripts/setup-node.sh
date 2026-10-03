#!/usr/bin/env bash
# Install a pinned, checksum-verified Linux Node runtime inside this project.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION=22.16.0
ARCHIVE="node-v${VERSION}-linux-x64.tar.xz"
DEST="$ROOT/.tools/node-v${VERSION}-linux-x64"
if [[ "$(uname -m)" != x86_64 ]]; then
  echo 'This bootstrap currently supports Linux x86_64 only.' >&2
  exit 1
fi
if [[ -x "$DEST/bin/node" ]]; then
  "$DEST/bin/node" --version
  exit 0
fi
mkdir -p "$ROOT/.tools"
TEMP="$(mktemp -d "$ROOT/.tools/download.XXXXXX")"
trap 'rm -rf "$TEMP"' EXIT
BASE="https://nodejs.org/dist/v${VERSION}"
curl --fail --location --retry 2 "$BASE/$ARCHIVE" -o "$TEMP/$ARCHIVE"
curl --fail --location --retry 2 "$BASE/SHASUMS256.txt" -o "$TEMP/SHASUMS256.txt"
(cd "$TEMP" && grep "  $ARCHIVE$" SHASUMS256.txt | sha256sum --check -)
tar -xJf "$TEMP/$ARCHIVE" -C "$ROOT/.tools"
"$DEST/bin/node" --version
