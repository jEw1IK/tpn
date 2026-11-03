# POSTNEO · конфиг nginx целиком: сайт из репозитория, отделение /kart, пакет /download, HTTPS на IP и на домен.
# Собирается с нуля при каждом запуске setup-ru-server.sh, поэтому в нём нет следов прежних вставок.
#
# Сайт раздаётся по белому списку: корневая страница, robots.txt, sitemap.xml, файлы подтверждения Яндекса и Google,
# страницы, скрипты, стили, PDF, картинки и шрифты. Исходники приложения (postneo-app), .git, файлы бота, *.md, *.py,
# *.json и прочее служебное отдают 404.
#
# Блоки /kart и /download/ стоят с ^~: иначе правило «*.js → файл с диска» перехватило бы скрипты отделения.
# Строки «location /kart» и «location /download/» install-kart-server.sh ищет, чтобы не вставлять свои блоки второй раз.
#
# Запуск: python3 nginx-postneo.py OUT --site DIR --download DIR --webroot DIR --domain postneo.ru
#         [--ip-cert DIR] [--domain-cert DIR] [--domain-names "postneo.ru www.postneo.ru"] [--ipv6] [--kart-port 3001]
import argparse, os

p = argparse.ArgumentParser()
p.add_argument('out')
p.add_argument('--site', required=True)
p.add_argument('--download', required=True)
p.add_argument('--webroot', required=True)
p.add_argument('--domain', required=True)
p.add_argument('--domain-names', default='')
p.add_argument('--ip-cert', default='')
p.add_argument('--domain-cert', default='')
p.add_argument('--headers', default='/etc/nginx/snippets/postneo-headers.conf')
p.add_argument('--tls', default='/etc/nginx/snippets/postneo-tls.conf')
p.add_argument('--kart-port', default='3001')
p.add_argument('--ipv6', action='store_true')
a = p.parse_args()

def has(cert):
    return bool(cert) and os.path.isfile(os.path.join(cert, 'fullchain.pem')) and os.path.isfile(os.path.join(cert, 'privkey.pem'))

ip_ok, dom_ok = has(a.ip_cert), has(a.domain_cert)
names = a.domain_names.strip() or a.domain
H = a.headers

def listen(port, extra=''):
    out = f'    listen {port}{extra};\n'
    if a.ipv6:
        out += f'    listen [::]:{port}{extra};\n'
    return out

acme = f'''    # Let's Encrypt: проверка владения (и для IP, и для домена)
    location ^~ /.well-known/acme-challenge/ {{ root {a.webroot}; default_type text/plain; }}
'''
download = f'''    # POSTNEO: пакет для ПК и его обновления, по обычному http тоже (больничные сети не всегда пускают https)
    location ^~ /download/ {{
        alias {a.download}/;
        autoindex off;
        add_header Cache-Control "no-cache" always;
        include {H};
    }}
'''
calc = '''    # POSTNEO calc: короткий адрес калькулятора
    location = /calculator { return 302 /postneo/calculator.html; }
    location = /calculator.html { return 302 /postneo/calculator.html; }
'''

def site():
    return f'''    root {a.site};
    index index.html;
    charset utf-8;
    server_tokens off;
    client_max_body_size 5m;
    include {H};

    gzip on;
    gzip_vary on;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/javascript application/javascript application/json image/svg+xml;

    # POSTNEO Карточки: приложение на node, слушает только 127.0.0.1
    location ^~ /kart {{
        proxy_pass http://127.0.0.1:{a.kart_port};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }}
{download}{calc}
    # POSTNEO static: долгий кэш файлов с хэшем в имени
    location ^~ /postneo/nx/ {{ expires 1y; add_header Cache-Control "public, immutable"; include {H}; access_log off; }}
    location ^~ /postneo/images/ {{ expires 30d; add_header Cache-Control "public"; include {H}; }}
    location ^~ /postneo/examples/ {{ expires 7d; add_header Cache-Control "public"; include {H}; }}

    # белый список: всё, чего нет ниже, отдаёт 404
    location = / {{ try_files /index.html =404; }}
    location = /robots.txt {{ }}
    location = /sitemap.xml {{ }}
    location = /version.json {{ add_header Cache-Control "no-cache" always; include {H}; }}
    location ^~ /postneo-app/ {{ return 404; }}
    location ~ /\\. {{ return 404; }}
    location ~ ^/(postneo|cheatsheets|enteral|scales|sedation)$ {{ return 301 $uri/; }}
    location ~* \\.(html|css|js|mjs|pdf|svg|webp|png|jpe?g|gif|ico|woff2?|ttf)$ {{ try_files $uri =404; }}
    location ~ /$ {{ try_files ${{uri}}index.html =404; }}
    location / {{ return 404; }}
'''

def ssl(cert):
    return f'''    ssl_certificate {cert}/fullchain.pem;
    ssl_certificate_key {cert}/privkey.pem;
    include {a.tls};
'''

blocks = []
# 80: проверки Let's Encrypt и пакет для ПК всегда по http; остальное — на https, когда сертификат уже есть
if ip_ok or dom_ok:
    blocks.append(f'''server {{
    # POSTNEO http: только проверки сертификата и пакет для ПК, остальное на https
{listen(80, ' default_server')}    server_name _;
    server_tokens off;
{acme}{download}{calc}    location / {{ return 301 https://$host$request_uri; }}
}}''')
else:
    blocks.append(f'''server {{
    # POSTNEO http: сертификатов пока нет, сайт работает по http (вход в отделение заработает после https)
{listen(80, ' default_server')}    server_name _;
{acme}{site()}}}''')

# 443 по IP: сертификат на IP; если его нет, но есть доменный — пусть отвечает он
default_cert = a.ip_cert if ip_ok else (a.domain_cert if dom_ok else '')
if default_cert:
    blocks.append(f'''server {{
    # POSTNEO https по IP (и любое имя, кроме домена)
{listen(443, ' ssl default_server')}    server_name _;
{ssl(default_cert)}{site()}}}''')
if dom_ok:
    blocks.append(f'''server {{
    # POSTNEO domain {a.domain}: свой сертификат, выбирается по имени (SNI)
{listen(443, ' ssl')}    server_name {names};
{ssl(a.domain_cert)}{site()}}}''')

head = '# POSTNEO · собран nginx-postneo.py, правки руками перезапишутся при следующем запуске setup-ru-server.sh\n\n'
open(a.out, 'w').write(head + '\n\n'.join(blocks) + '\n')
print('nginx: конфиг собран:', 'IP' if ip_ok else '', 'домен' if dom_ok else '', '' if (ip_ok or dom_ok) else 'без сертификатов (http)')
