#!/usr/bin/env bash
# Prepare postneo.ru TLS before changing DNS. Run on the new server.
# EXPECTED_NEW_IP=194.58.100.67 bash stage-domain.sh [OLD_IP]
# The certificate/key travel only over SSH between the owner's servers.
# Certbot renewal on the destination must be configured after the DNS cutover.
set -euo pipefail
umask 077
[ "$(id -u)" = 0 ] || { echo "Run as root." >&2; exit 1; }
OLD="${1:-89.169.32.9}"
[[ "$OLD" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || exit 1
[ -n "${EXPECTED_NEW_IP:-}" ] || { echo "Set EXPECTED_NEW_IP." >&2; exit 1; }
IP="$(curl -4fsS --max-time 15 https://api.ipify.org)"
[ "$IP" = "$EXPECTED_NEW_IP" ] && [ "$IP" != "$OLD" ] || { echo "STOP: wrong target: $IP" >&2; exit 1; }
CONF="$(readlink -f "${POSTNEO_NGINX_CONF:-/etc/nginx/sites-enabled/postneo}")"
WORK="${POSTNEO_WORK_DIR:-/root/postneo-migration}"
CERTS="${POSTNEO_CERT_DIR:-/etc/nginx/postneo-domain}"
[ -f "$CONF" ] || { echo "Nginx site configuration missing." >&2; exit 1; }
nginx -t
# This is a one-time staging operation; never overwrite an existing domain setup.
if nginx -T 2>/dev/null | grep -E '^[[:space:]]*server_name[[:space:]][^;]*postneo\.ru([[:space:];]|$)' >/dev/null; then
    echo "STOP: postneo.ru is already configured; inspect it before staging again." >&2
    exit 1
fi
mkdir -p -m 700 "$WORK" "$CERTS"
STAGE="$(mktemp -d "$CERTS/postneo.ru.XXXXXX")"
BACKUP="$(mktemp "$WORK/nginx-before-domain.XXXXXX.conf")"
CANDIDATE="$(mktemp "$WORK/nginx-domain-candidate.XXXXXX.conf")"
cp -p "$CONF" "$BACKUP"
APPLIED=0; SUCCESS=0
cleanup(){
    local rc=$?
    if [ "$APPLIED" = 1 ] && [ "$SUCCESS" = 0 ]; then
        cp -p "$BACKUP" "$CONF"
        if nginx -t && systemctl reload nginx; then
            echo "Previous nginx configuration restored." >&2
        else
            echo "STOP: could not reload the restored configuration; inspect nginx." >&2
        fi
    fi
    return "$rc"
}
trap cleanup EXIT

echo "Reading certificate and public routing metadata from $OLD."
ssh -T -o StrictHostKeyChecking=yes -o ConnectTimeout=20 "root@$OLD" bash -s <<'REMOTE' | tar -xf - --no-same-owner --no-same-permissions -C "$STAGE" fullchain.pem privkey.pem source-report.json
set -euo pipefail
umask 077
report=$(mktemp -d /tmp/postneo-domain-report.XXXXXX)
trap 'rm -f "$report/source-report.json"; rmdir "$report"' EXIT
python3 - "$report/source-report.json" <<'PYREMOTE'
import json, re, subprocess, sys
def run(args):
    return subprocess.run(args, capture_output=True, text=True)
nginx = run(['nginx', '-T'])
if nginx.returncode:
    sys.exit('Source nginx configuration check failed')
def redact(text):
    return re.sub(r'[A-Za-z0-9_-]{24,}', '[redacted]', text)
headers = sorted({redact(re.sub(r'\s+', ' ', line.split('{', 1)[0].strip()))
                  for line in nginx.stdout.splitlines() if re.match(r'\s*location\s', line)})
names = sorted({line.strip() for line in nginx.stdout.splitlines() if re.match(r'\s*server_name\s', line)})
services = {unit: run(['systemctl', 'is-active', unit]).stdout.strip()
            for unit in ['telegram-bot.service', 'postneo-relay.service']}
ports = set()
for line in run(['ss', '-H', '-ltn']).stdout.splitlines():
    parts = line.split()
    if len(parts) > 3:
        port = parts[3].rsplit(':', 1)[-1]
        if port.isdigit(): ports.add(int(port))
with open(sys.argv[1], 'w') as f:
    json.dump({'services': services, 'server_names': names, 'locations': headers,
               'tcp_ports': sorted(ports)}, f)
PYREMOTE
tar -chf - -C /etc/letsencrypt/live/postneo.ru fullchain.pem privkey.pem -C "$report" source-report.json
REMOTE
for name in fullchain.pem privkey.pem source-report.json; do
    [ -s "$STAGE/$name" ] && [ ! -L "$STAGE/$name" ] || { echo "Invalid transferred file: $name" >&2; exit 1; }
done
chmod 600 "$STAGE/fullchain.pem" "$STAGE/privkey.pem" "$STAGE/source-report.json"
openssl x509 -in "$STAGE/fullchain.pem" -noout -checkend 86400
for name in postneo.ru www.postneo.ru; do
    openssl x509 -in "$STAGE/fullchain.pem" -noout -checkhost "$name"
done
cert_pub="$(openssl x509 -in "$STAGE/fullchain.pem" -pubkey -noout | openssl dgst -sha256)"
key_pub="$(openssl pkey -in "$STAGE/privkey.pem" -pubout | openssl dgst -sha256)"
[ "$cert_pub" = "$key_pub" ] || { echo "Certificate/key mismatch." >&2; exit 1; }

python3 - "$BACKUP" "$CANDIDATE" "$STAGE" <<'PY'
from pathlib import Path
import json, re, sys
source, out, cert = map(Path, sys.argv[1:])
text = source.read_text()
# Restrict this migration to the known generator layout rather than parsing arbitrary nginx syntax.
if not text.startswith('# POSTNEO') or 'location = / { return 302 /postneo/$is_args$args; }' not in text:
    sys.exit('STOP: unexpected site configuration or homepage route')
parts = re.split(r'(?m)(?=^server\s*\{)', text)
candidates = [part for part in parts if re.search(r'(?m)^\s*listen 443 ssl default_server;', part)
              and 'location ^~ /kart' in part]
if len(candidates) != 1:
    sys.exit('STOP: expected exactly one default HTTPS site block')
block = candidates[0].rstrip()
if not block.endswith('}'):
    sys.exit('STOP: unexpected server block boundary')
block = re.sub(r'(?m)^\s*# POSTNEO https[^\n]*\n', '', block)
block = re.sub(r'\Aserver\s*\{', 'server {\n    # POSTNEO domain postneo.ru: staged certificate before DNS cutover', block, count=1)
block, n = re.subn(r'(?m)^(\s*)server_name _;', r'\1server_name postneo.ru www.postneo.ru;', block)
if n != 1: sys.exit('STOP: unexpected server_name')
block, n = re.subn(r'(?m)^(\s*listen (?:\[::\]:)?443 ssl) default_server;', r'\1;', block)
if n not in (1, 2): sys.exit('STOP: unexpected HTTPS listeners')
for directive, filename in [('ssl_certificate', 'fullchain.pem'), ('ssl_certificate_key', 'privkey.pem')]:
    block, n = re.subn(r'(?m)^(\s*' + directive + r'\s+)[^;]+;', lambda m: m[1] + str(cert / filename) + ';', block)
    if n != 1: sys.exit('STOP: unexpected certificate directive')
out.write_text(text.rstrip() + '\n\n' + block + '\n')
report = json.loads((cert / 'source-report.json').read_text())
local = {re.sub(r'[A-Za-z0-9_-]{24,}', '[redacted]', re.sub(r'\s+', ' ', line.split('{', 1)[0].strip()))
         for line in text.splitlines() if re.match(r'\s*location\s', line)}
print('SOURCE_SERVICES:', json.dumps(report['services']))
print('SOURCE_SERVER_NAMES:', json.dumps(report['server_names']))
print('SOURCE_EXTRA_ROUTES:', json.dumps(sorted(set(report['locations']) - local)))
print('SOURCE_TCP_PORTS:', report['tcp_ports'])
PY
cmp -s "$CONF" "$BACKUP" || { echo "STOP: nginx configuration changed during preparation." >&2; exit 1; }
APPLIED=1
cat "$CANDIDATE" > "$CONF"
nginx -t
systemctl reload nginx

# Reload is asynchronous: wait until a new worker serves the domain certificate.
ready=0
for attempt in $(seq 1 10); do
    if curl -fsS --noproxy '*' --resolve postneo.ru:443:127.0.0.1 --max-time 5 -o /dev/null https://postneo.ru/postneo/ 2>/dev/null; then ready=1; break; fi
    sleep 1
done
[ "$ready" = 1 ] || { echo "Domain TLS readiness check failed." >&2; exit 1; }
for name in postneo.ru www.postneo.ru; do
    result="$(curl -fsSL --noproxy '*' --resolve "$name:443:127.0.0.1" --max-time 15 --max-redirs 3 -o /dev/null -w '%{http_code} %{url_effective}' "https://$name/")"
    [ "$result" = "200 https://$name/postneo/" ] || { echo "Unexpected domain homepage: $result" >&2; exit 1; }
    curl -fsS --noproxy '*' --resolve "$name:443:127.0.0.1" --max-time 15 "https://$name/kart/api/health"
    echo; echo "DOMAIN_OK: $result"
done
curl -fsS --noproxy '*' --max-time 15 "https://$IP/kart/api/health"
echo; echo "IP_OK: https://$IP/kart/"
SUCCESS=1
echo "DNS was not changed. Nginx backup: $BACKUP"
echo "Staged certificate directory: $STAGE"
echo "Review source routes before DNS cutover; configure destination Certbot renewal after cutover."
