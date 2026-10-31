#!/usr/bin/env bash
# Сборка «POSTNEO Карточки» для одного ПК.
#   bash desktop/build-desktop.sh            → dist/POSTNEO-Kartochki-win64-<версия>.zip (Windows 10/11, x64)
#   bash desktop/build-desktop.sh linux      → dist/postneo-kart-linux (для проверки на этой машине)
# Нужны: node 22+, go 1.22+, zip; для Windows — доступ к nodejs.org (node.exe кэшируется в desktop/.cache).
set -euo pipefail
APP="$(cd "$(dirname "$0")/.." && pwd)"; cd "$APP"
TARGET="${1:-windows}"
VER="$(node -p "require('./package.json').version")"
NODE_VER="22.22.0"
OUT="dist/postneo-kart-$TARGET"

echo "1/4 сборка сервера (standalone)"
NEXT_TELEMETRY_DISABLED=1 BASE_PATH= npm run build > dist-build.log 2>&1 || { tail -30 dist-build.log; exit 1; }

echo "2/4 раскладка"
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo dev)"
rm -rf "$OUT"; mkdir -p "$OUT/app" "$OUT/node"
cp -r .next/standalone/. "$OUT/app/"
mkdir -p "$OUT/app/.next"; cp -r .next/static "$OUT/app/.next/static"
cp -r public "$OUT/app/public"
cp desktop/desktop-server.cjs "$OUT/app/"
rm -rf "$OUT/app/node_modules/.cache"
echo "$COMMIT" > "$OUT/app/COMMIT"

echo "3/4 node и лаунчер"
if [ "$TARGET" = windows ]; then
  mkdir -p desktop/.cache
  ZIP="desktop/.cache/node-v$NODE_VER-win-x64.zip"
  [ -s "$ZIP" ] || curl -fsSL -o "$ZIP" "https://nodejs.org/dist/v$NODE_VER/node-v$NODE_VER-win-x64.zip"
  unzip -q -o -j "$ZIP" "node-v$NODE_VER-win-x64/node.exe" "node-v$NODE_VER-win-x64/LICENSE" -d "$OUT/node"
  ( cd desktop/launcher
    if command -v go-winres >/dev/null || [ -x "$HOME/go/bin/go-winres" ]; then
      "${GOWINRES:-${HOME}/go/bin/go-winres}" make --in winres/winres.json --out rsrc
    else echo "go-winres не найден: exe будет без иконки"; fi
    GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -H windowsgui" -o "$APP/$OUT/POSTNEO-Kartochki.exe" . )
  python3 - "$OUT/README.txt" <<'PY'
import sys,pathlib
src=pathlib.Path('desktop/README.txt').read_text(encoding='utf-8')
pathlib.Path(sys.argv[1]).write_bytes(b'\xef\xbb\xbf'+src.replace('\r\n','\n').replace('\n','\r\n').encode('utf-8'))
PY
else
  cp "$(command -v node)" "$OUT/node/node"
  ( cd desktop/launcher && CGO_ENABLED=0 go build -trimpath -o "$APP/$OUT/postneo-kart" . )
  cp desktop/README.txt "$OUT/"
fi

echo "4/4 архивы"
PUB="dist/publish"; rm -rf "$PUB"; mkdir -p "$PUB"
# архив приложения для автообновления: содержимое папки app/ в корне
( cd "$OUT/app" && zip -qr "$APP/$PUB/kart-app-$COMMIT.zip" . )
APPZIP="$PUB/kart-app-$COMMIT.zip"
SHA="$(sha256sum "$APPZIP" | cut -d' ' -f1)"; SIZE="$(stat -c %s "$APPZIP")"
cat > "$PUB/kart-version.json" <<JSON
{"commit":"$COMMIT","version":"$VER","app_url":"kart-app-$COMMIT.zip","sha256":"$SHA","size":$SIZE,"built":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","target":"$TARGET"}
JSON
if [ "$TARGET" = windows ]; then
  cp "$OUT/POSTNEO-Kartochki.exe" "$OUT/README.txt" "$PUB/"
  NAME="POSTNEO-Kartochki-win64-$VER.zip"
  ( cd dist && rm -f "$NAME" && zip -qr "$NAME" "postneo-kart-$TARGET" )
  cp "dist/$NAME" "$PUB/POSTNEO-Kartochki-win64.zip"
  ls -la "dist/$NAME" "$PUB"; du -sh "$OUT" | cut -f1 | sed 's/^/распаковано: /'
else
  du -sh "$OUT"
fi
echo "готово: $OUT · раздача: $PUB (commit $COMMIT)"
