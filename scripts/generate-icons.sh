#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SVG="$ROOT/build/icon.svg"
ICONSET="$ROOT/build/icon.iconset"

mkdir -p "$ICONSET"

if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "rsvg-convert is required (brew install librsvg)" >&2
  exit 1
fi

render() {
  local size="$1"
  local out="$2"
  rsvg-convert -w "$size" -h "$size" "$SVG" -o "$out"
}

render 1024 "$ROOT/build/icon.png"
render 16   "$ICONSET/icon_16x16.png"
render 32   "$ICONSET/icon_16x16@2x.png"
render 32   "$ICONSET/icon_32x32.png"
render 64   "$ICONSET/icon_32x32@2x.png"
render 128  "$ICONSET/icon_128x128.png"
render 256  "$ICONSET/icon_128x128@2x.png"
render 256  "$ICONSET/icon_256x256.png"
render 512  "$ICONSET/icon_256x256@2x.png"
render 512  "$ICONSET/icon_512x512.png"
render 1024 "$ICONSET/icon_512x512@2x.png"

if command -v iconutil >/dev/null 2>&1; then
  iconutil -c icns "$ICONSET" -o "$ROOT/build/icon.icns" && echo "Generated build/icon.icns" || echo "Warning: iconutil failed; build/icon.icns not updated" >&2
fi

if command -v npx >/dev/null 2>&1; then
  npx --yes png-to-ico "$ROOT/build/icon.png" > "$ROOT/build/icon.ico"
  echo "Generated build/icon.ico"
fi

echo "Generated build/icon.png"
