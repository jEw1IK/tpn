#!/usr/bin/env bash
# Публикация пакета для ПК в ветку desktop-dist (без истории: каждая публикация заменяет предыдущую).
# Сервер зеркалирует её в /download/, лаунчеры обновляются оттуда. Запуск после build-desktop.sh.
set -euo pipefail
APP="$(cd "$(dirname "$0")/.." && pwd)"; REPO="$(cd "$APP/.." && pwd)"; PUB="$APP/dist/publish"
[ -s "$PUB/kart-version.json" ] || { echo "сначала bash desktop/build-desktop.sh"; exit 1; }
WT="$APP/dist/publish-wt"; rm -rf "$WT"; git -C "$REPO" worktree prune
git -C "$REPO" worktree add --detach "$WT" HEAD >/dev/null 2>&1
cd "$WT"
git checkout -q --orphan desktop-dist
git rm -rfq . >/dev/null 2>&1 || true
rm -rf ./* .[!.]* 2>/dev/null || true
cp "$PUB"/kart-app-*.zip "$PUB"/kart-version.json "$PUB"/POSTNEO-Kartochki.exe "$PUB"/README.txt .
cat > README.md <<'MD'
# POSTNEO Карточки: раздача пакета для ПК

Ветка без истории, её перезаписывает `desktop/publish-desktop.sh`. Сервер отделения
зеркалирует файлы в `/download/`, лаунчер на рабочих местах обновляется оттуда.

- `kart-version.json` — текущий коммит, имя архива приложения, sha256 и размер
- `kart-app-<commit>.zip` — папка приложения для автообновления (без node и лаунчера)
- `POSTNEO-Kartochki.exe` — лаунчер для Windows
- `README.txt` — инструкция внутри пакета
MD
git add -A
git -c user.name="Sergey Nekhoroshkin" -c user.email="84bybrrdnm@privaterelay.appleid.com" commit -qm "Пакет для ПК: $(python3 -c "import json;print(json.load(open('kart-version.json'))['commit'])")"
git push -q --force origin desktop-dist
cd "$APP"; git -C "$REPO" worktree remove --force "$WT"
echo "опубликовано: https://raw.githubusercontent.com/jEw1IK/tpn/desktop-dist/kart-version.json"
