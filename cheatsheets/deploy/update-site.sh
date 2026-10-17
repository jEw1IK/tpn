#!/usr/bin/env bash
# Обновление сайта ПОСТ·НЕО на сервере. Забирает свежую ветку main, выкладывает
# статические файлы в новый релиз и мгновенно переключает на него nginx.
#
#   sudo postneo-site-update             обновить, если в main есть новое
#   sudo postneo-site-update --force     выложить заново тот же коммит
#   sudo postneo-site-update --status    какая версия сейчас на сервере
#   sudo postneo-site-update --rollback  вернуть предыдущий релиз и приостановить
#                                        автообновление (снимает --force)
#
# Устройство каталога (по умолчанию /opt/postneo/site):
#   repo.git    голый клон репозитория глубиной 1, только для обновлений
#   releases/   по каталогу на выкладку: только то, что отдаёт nginx
#   current     ссылка на действующий релиз; это root в конфиге nginx
#
# Клон бота /opt/postneo/app, его токен и сервис скрипт не трогает.
# Ставится и запускается по таймеру через install-site.sh.
set -euo pipefail

REPO="${REPO:-https://github.com/jEw1IK/tpn.git}"
BRANCH="${BRANCH:-main}"
SITE_ROOT="${SITE_ROOT:-/opt/postneo/site}"
KEEP="${KEEP:-5}"
SELF_PATH="${SELF_PATH:-/usr/local/sbin/postneo-site-update}"
# Что публикуется. Всё остальное из репозитория в веб-корень не попадает.
PUBLISH=(index.html postneo scales sedation enteral cheatsheets/index.html cheatsheets/pdf)
# Без этих файлов релиз не выкладывается.
REQUIRED=(postneo/index.html postneo/calculator.html)

GIT_DIR="$SITE_ROOT/repo.git"
RELEASES="$SITE_ROOT/releases"
CURRENT="$SITE_ROOT/current"
PIN="$SITE_ROOT/.pinned"

die()  { printf '\033[31mОшибка:\033[0m %s\n' "$1" >&2; exit 1; }
ok()   { printf '\033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '\033[33m!\033[0m %s\n' "$1" >&2; }
git_() { git --git-dir="$GIT_DIR" "$@"; }

MODE="update"
case "${1:-}" in
    "") ;;
    --force) MODE="force" ;;
    --status) MODE="status" ;;
    --rollback) MODE="rollback" ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) die "неизвестный ключ $1 (есть --force, --status, --rollback)" ;;
esac

current_release() { [ -L "$CURRENT" ] && basename "$(readlink "$CURRENT")" || true; }
# Короткий хеш коммита действующего релиза: имя релиза «ГГГГММДД-ЧЧММСС-хеш».
current_commit() { local name; name="$(current_release)"; printf '%s' "${name##*-}"; }
switch_to() {
    ln -sfn "releases/$1" "$SITE_ROOT/.current.tmp"
    mv -Tf "$SITE_ROOT/.current.tmp" "$CURRENT"
}
show_status() {
    local name; name="$(current_release)"
    if [ -z "$name" ]; then echo "Сайт ещё не выложен: $CURRENT отсутствует."; return; fi
    echo "Действующий релиз: $name"
    [ -f "$CURRENT/version.json" ] && { cat "$CURRENT/version.json"; echo; }
    echo "Релизы на диске (новые снизу):"
    ls -1 "$RELEASES" | sed "s/^$name\$/$name   ← действующий/; s/^/  /"
    [ -f "$PIN" ] && echo "Автообновление приостановлено после отката: $(cat "$PIN")" || true
}

if [ "$MODE" = "status" ]; then show_status; exit 0; fi

[ "$(id -u)" = "0" ] || die "запускай через sudo"
command -v git >/dev/null || die "нужен git: apt install -y git"
command -v tar >/dev/null || die "нужен tar"

mkdir -p "$RELEASES"
chmod 755 "$SITE_ROOT" "$RELEASES"
# Обновления по таймеру и вручную не должны идти одновременно.
exec 9>"$SITE_ROOT/.lock"
command -v flock >/dev/null && { flock -n 9 || { echo "Обновление уже идёт, пропускаю."; exit 0; }; }

if [ "$MODE" = "rollback" ]; then
    name="$(current_release)"
    [ -n "$name" ] || die "откатывать нечего: релиз ещё не выложен"
    previous="$(ls -1 "$RELEASES" | sort | awk -v cur="$name" '$0==cur{print prev; exit} {prev=$0}')"
    [ -n "$previous" ] || die "нет релиза старше $name"
    switch_to "$previous"
    # Иначе таймер через 10 минут снова выложит свежий main поверх отката.
    echo "$(date -Iseconds) откат с $name на $previous" > "$PIN"
    ok "откат: $name → $previous; автообновление приостановлено до запуска с --force"
    show_status
    exit 0
fi

# 1. Свежий код
if [ -d "$GIT_DIR" ]; then
    git_ remote set-url origin "$REPO"
else
    git clone --quiet --bare --depth 1 --branch "$BRANCH" "$REPO" "$GIT_DIR" || die "не удалось склонировать $REPO"
    chmod 700 "$GIT_DIR"
fi
git_ fetch --quiet --depth 1 --force origin "+refs/heads/$BRANCH:refs/heads/$BRANCH" \
    || die "не удалось получить $BRANCH из $REPO (нет сети?) — сайт остался на прежней версии"
NEW="$(git_ rev-parse "refs/heads/$BRANCH")"
SHORT="${NEW:0:7}"
OLD="$(current_commit)"

if [ "$MODE" = "update" ] && [ -f "$PIN" ]; then
    echo "Автообновление приостановлено после отката ($(cat "$PIN")). Свежая версия $SHORT: sudo postneo-site-update --force"
    exit 0
fi
if [ "$MODE" = "update" ] && [ "$OLD" = "$SHORT" ]; then
    echo "Сайт уже на свежей версии $SHORT ($BRANCH)."
    exit 0
fi

for path in "${REQUIRED[@]}"; do
    git_ cat-file -e "$NEW:$path" 2>/dev/null || die "в коммите $SHORT нет $path — сборка сайта не закоммичена?"
done

# 2. Новый релиз во временном каталоге
NAME="$(date +%Y%m%d-%H%M%S)-$SHORT"
# Две выкладки в одну секунду (--force подряд) не должны получить одно имя.
while [ -e "$RELEASES/$NAME" ]; do sleep 1; NAME="$(date +%Y%m%d-%H%M%S)-$SHORT"; done
TMP="$RELEASES/.$NAME.tmp"
rm -rf "$TMP"; mkdir -p "$TMP"
trap 'rm -rf "$TMP" "$SITE_ROOT/.current.tmp"' EXIT
paths=()
for path in "${PUBLISH[@]}"; do
    if git_ cat-file -e "$NEW:$path" 2>/dev/null; then paths+=("$path"); else warn "в коммите нет $path — пропускаю"; fi
done
git_ archive --format=tar "$NEW" -- "${paths[@]}" | tar -x -C "$TMP"
find "$TMP" -type d -exec chmod 755 {} +
find "$TMP" -type f -exec chmod 644 {} +

# 3. Проверка целостности: каждый файл сборки, на который ссылаются страницы
# POSTNEO, должен лежать в релизе. Иначе на сервере будет белый экран.
missing=0
for page in "$TMP"/postneo/*.html; do
    while IFS= read -r asset; do
        [ -f "$TMP/postneo/$asset" ] || { warn "в $(basename "$page") ссылка на отсутствующий $asset"; missing=$((missing+1)); }
    done < <(grep -o '\(href\|src\)="\(\./\)\?nx/[^"]*"' "$page" | sed 's/^[a-z]*="//; s/"$//; s#^\./##' | sort -u)
done
[ "$missing" -eq 0 ] || die "сборка неполная ($missing файлов) — сайт остался на прежней версии"

# 4. Метка версии: http://сервер/version.json
json() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr -d '\000-\037'; }
cat > "$TMP/version.json" <<EOF
{"commit":"$NEW","short":"$SHORT","branch":"$BRANCH","committed":"$(json "$(git_ log -1 --format=%cI "$NEW")")","subject":"$(json "$(git_ log -1 --format=%s "$NEW")")","release":"$NAME","deployed":"$(date -Iseconds)"}
EOF
chmod 644 "$TMP/version.json"

# 5. Мгновенное переключение: ссылка current меняется одним rename
mv -T "$TMP" "$RELEASES/$NAME"
switch_to "$NAME"
trap - EXIT
rm -f "$PIN"
ok "сайт: ${OLD:-—} → $SHORT  $(git_ log -1 --format=%s "$NEW")"

# 6. Старые релизы: оставляем последние $KEEP, действующий не трогаем никогда
ls -1 "$RELEASES" | sort | head -n "-$KEEP" | while IFS= read -r old; do
    [ "$old" = "$NAME" ] || rm -rf "${RELEASES:?}/$old"
done
find "$RELEASES" -maxdepth 1 -name '.*.tmp' -mmin +60 -exec rm -rf {} + 2>/dev/null || true
git_ gc --quiet --prune=now 2>/dev/null || true

# 7. Скрипт обновляет сам себя из того же коммита
if [ -f "$SELF_PATH" ] && git_ cat-file -e "$NEW:cheatsheets/deploy/update-site.sh" 2>/dev/null; then
    if git_ show "$NEW:cheatsheets/deploy/update-site.sh" > "$SELF_PATH.new" 2>/dev/null; then
        if cmp -s "$SELF_PATH.new" "$SELF_PATH"; then rm -f "$SELF_PATH.new"
        else chmod 755 "$SELF_PATH.new" && mv -f "$SELF_PATH.new" "$SELF_PATH" && ok "скрипт обновления обновлён"; fi
    else rm -f "$SELF_PATH.new"; warn "не удалось обновить $SELF_PATH"; fi
fi
exit 0
