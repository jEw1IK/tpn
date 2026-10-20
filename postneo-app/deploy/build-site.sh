#!/usr/bin/env bash
# Статический сайт POSTNEO: next export с относительными путями, каталог _next → nx, результат в ../postneo (его раздают сервер и Pages).
# Запуск из любого места: bash postneo-app/deploy/build-site.sh
set -euo pipefail
APP="$(cd "$(dirname "$0")/.." && pwd)"; OUT="$APP/../postneo"
cd "$APP"
cp next.config.ts next.config.ts.bak
cat > next.config.ts <<'CFG'
import type { NextConfig } from "next";
const nextConfig: NextConfig = { reactStrictMode: true, output: "export", assetPrefix: "./", images: { unoptimized: true } };
export default nextConfig;
CFG
rm -rf out
# Серверные маршруты в статический сайт не входят: на время сборки убираем их в сторону.
HIDE="$APP/.export-hidden"; rm -rf "$HIDE"; mkdir -p "$HIDE"
for d in app/api app/login app/setup "app/(kart)"; do [ -e "$d" ] && mkdir -p "$HIDE/$(dirname "$d")" && mv "$d" "$HIDE/$d"; done
restore(){ mv -f next.config.ts.bak next.config.ts 2>/dev/null; for d in app/api app/login app/setup "app/(kart)"; do [ -e "$HIDE/$d" ] && mv "$HIDE/$d" "$d"; done; rm -rf "$HIDE"; }
trap restore EXIT
npx next build > build.log 2>&1 || { tail -40 build.log; exit 1; }
restore; trap - EXIT
rm -rf "$OUT/nx" && cp -r out/_next "$OUT/nx" && cp out/calculator.html out/index.html out/favicon-p.svg out/favicon.svg "$OUT/" && cp -r out/images out/examples "$OUT/"
python3 - "$OUT" <<'PY'
import glob,os,re,sys
out=sys.argv[1];files=glob.glob(out+'/*.html')+glob.glob(out+'/nx/**/*.js',recursive=True)+glob.glob(out+'/nx/**/*.css',recursive=True)+glob.glob(out+'/nx/**/*.txt',recursive=True)
n=0
for f in files:
    s=open(f,encoding='utf-8').read();t=s.replace('_next/static','nx/static').replace('/_next/','/nx/')
    if f.endswith('.html'):
        t=t.replace('href="/calculator"','href="calculator.html"').replace('href="/"','href="index.html"')
        t=re.sub(r'(href|src)="/(?!/)',r'\1="',t)
    if '�' in t: t=t.replace('�','\\uFFFD')
    if t!=s: open(f,'w',encoding='utf-8').write(t);n+=1
print('post-processed',n,'files; leftover _next refs:',sum(open(f,encoding='utf-8').read().count('_next/') for f in files))
PY
echo "готово: $OUT"
