#!/usr/bin/env bash
# Switch the staged domain certificate to the destination Certbot lineage.
# Run on the RU server after certbot certonly has issued both domain names.
set -euo pipefail
umask 077
[ "$(id -u)" = 0 ] || { echo "Run as root." >&2; exit 1; }
[ -n "${EXPECTED_NEW_IP:-}" ] || { echo "Set EXPECTED_NEW_IP." >&2; exit 1; }
IP="$(curl -4fsS --max-time 15 https://api.ipify.org)"
[ "$IP" = "$EXPECTED_NEW_IP" ] || { echo "STOP: wrong server: $IP" >&2; exit 1; }
CONF="$(readlink -f "${POSTNEO_NGINX_CONF:-/etc/nginx/sites-enabled/postneo}")"
WORK="${POSTNEO_WORK_DIR:-/root/postneo-migration}"
STAGED="${POSTNEO_CERT_DIR:-/etc/nginx/postneo-domain}"
LIVE="${POSTNEO_DOMAIN_LIVE:-/etc/letsencrypt/live/postneo.ru}"
RENEWAL="${POSTNEO_DOMAIN_RENEWAL:-/etc/letsencrypt/renewal/postneo.ru.conf}"
[ -s "$CONF" ] && [ -s "$RENEWAL" ] || { echo "Nginx site or Certbot renewal configuration missing." >&2; exit 1; }
grep -Eq '^authenticator[[:space:]]*=[[:space:]]*webroot[[:space:]]*$' "$RENEWAL" || { echo "STOP: expected a managed webroot certificate." >&2; exit 1; }
nginx -t
openssl x509 -in "$LIVE/fullchain.pem" -noout -checkend 86400
for name in postneo.ru www.postneo.ru; do
    openssl x509 -in "$LIVE/fullchain.pem" -noout -checkhost "$name"
done
cert_pub="$(openssl x509 -in "$LIVE/fullchain.pem" -pubkey -noout | openssl dgst -sha256)"
key_pub="$(openssl pkey -in "$LIVE/privkey.pem" -pubout | openssl dgst -sha256)"
[ "$cert_pub" = "$key_pub" ] || { echo "Certificate/key mismatch." >&2; exit 1; }
mkdir -p -m 700 "$WORK"
BACKUP="$(mktemp "$WORK/nginx-before-managed-cert.XXXXXX.conf")"
CANDIDATE="$(mktemp "$WORK/nginx-managed-cert.XXXXXX.conf")"
cp -p "$CONF" "$BACKUP"
APPLIED=0; ACTIVATED=0
cleanup(){
    local rc=$?
    if [ "$APPLIED" = 1 ] && [ "$ACTIVATED" = 0 ]; then
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
python3 - "$BACKUP" "$CANDIDATE" "$STAGED" "$LIVE" <<'PY'
from pathlib import Path
import re, sys
source, candidate, staged, live = map(Path, sys.argv[1:])
text = source.read_text()
if not text.startswith('# POSTNEO') or text.count('server_name postneo.ru www.postneo.ru;') != 1:
    sys.exit('STOP: unexpected domain configuration')
for directive, name in [('ssl_certificate', 'fullchain.pem'), ('ssl_certificate_key', 'privkey.pem')]:
    old = r'(?m)^(\s*' + directive + r'\s+)' + re.escape(str(staged)) + r'/postneo\.ru\.[A-Za-z0-9]+/' + name.replace('.', r'\.') + ';'
    text, count = re.subn(old, lambda m: m[1] + str(live / name) + ';', text)
    if count == 0:
        managed = r'(?m)^\s*' + directive + r'\s+' + re.escape(str(live / name)) + ';'
        if len(re.findall(managed, text)) != 1:
            sys.exit('STOP: expected exactly one staged or managed domain certificate')
    elif count != 1:
        sys.exit('STOP: more than one staged certificate directive')
text = text.replace('# POSTNEO domain postneo.ru: staged certificate before DNS cutover',
                    '# POSTNEO domain postneo.ru: certificate managed by local Certbot')
candidate.write_text(text)
PY
cmp -s "$CONF" "$BACKUP" || { echo "STOP: nginx configuration changed during preparation." >&2; exit 1; }
APPLIED=1
cat "$CANDIDATE" > "$CONF"
nginx -t
systemctl reload nginx

# Compare the certificate actually served by each SNI name with the new lineage.
# A successful HTTPS request alone could still have used an old worker/certificate.
python3 - "$LIVE/fullchain.pem" "${POSTNEO_TLS_CHECK_PORT:-443}" <<'PY'
import hashlib, re, socket, ssl, sys, time
from pathlib import Path
pem = re.search(r'-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----', Path(sys.argv[1]).read_text(), re.S)
if not pem: sys.exit('Managed certificate is not PEM')
expected = hashlib.sha256(ssl.PEM_cert_to_DER_cert(pem[0])).digest()
ctx = ssl.create_default_context()
for name in ['postneo.ru', 'www.postneo.ru']:
    for attempt in range(10):
        try:
            with socket.create_connection(('127.0.0.1', int(sys.argv[2])), timeout=5) as sock:
                with ctx.wrap_socket(sock, server_hostname=name) as tls:
                    if hashlib.sha256(tls.getpeercert(binary_form=True)).digest() == expected:
                        print('CERT_ACTIVE:', name)
                        break
        except (OSError, ssl.SSLError):
            pass
        time.sleep(1)
    else:
        sys.exit('New trusted certificate is not being served for ' + name)
PY
for name in postneo.ru www.postneo.ru; do
    result="$(curl -fsSL --noproxy '*' --resolve "$name:443:127.0.0.1" --max-time 15 --max-redirs 3 -o /dev/null -w '%{http_code} %{url_effective}' "https://$name/")"
    [ "$result" = "200 https://$name/postneo/" ] || { echo "Unexpected homepage: $result" >&2; exit 1; }
    curl -fsS --noproxy '*' --resolve "$name:443:127.0.0.1" --max-time 15 "https://$name/kart/api/health"
    echo; echo "DOMAIN_OK: $result"
done
curl -fsS --noproxy '*' --max-time 15 "https://$IP/kart/api/health"
echo; echo "IP_OK: https://$IP/kart/"
ACTIVATED=1
echo "Managed certificate installed. Nginx backup: $BACKUP"

# Renewal failures should leave the valid managed certificate in service.
TIMER=""
for unit in snap.certbot.renew.timer certbot.timer; do
    if systemctl is-active --quiet "$unit"; then TIMER="$unit"; break; fi
done
[ -n "$TIMER" ] || { echo "STOP: no active Certbot timer; certificate is installed but renewal setup needs attention." >&2; exit 1; }
systemctl is-enabled --quiet "$TIMER" || systemctl enable "$TIMER"
echo "RENEWAL_TIMER: $TIMER"
echo "Testing renewal of all managed certificates, including the IP certificate. This may take a few minutes."
certbot renew --dry-run --run-deploy-hooks
echo "RENEWAL_OK"
