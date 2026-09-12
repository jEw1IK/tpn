# Развёртывание на сервере

Сервер: `89.169.32.9`. Ниже — что нужно сделать на нём руками.

---

## Сначала главное про кнопку мини-приложения

**Telegram открывает Web App только по HTTPS с валидным сертификатом.**
На голый IP сертификат не выпускается, поэтому `https://89.169.32.9/bili/`
кнопкой работать не будет — Telegram её просто не откроет.

Два рабочих варианта:

| Вариант | Что нужно | Адрес |
|---|---|---|
| **GitHub Pages** (проще) | Включить Pages в настройках репозитория | `https://jew1ik.github.io/tpn/bili/` |
| **Свой домен** | Домен, направленный на 89.169.32.9, + Let's Encrypt | `https://твой-домен/bili/` |

Сам бот при этом может жить где угодно: он работает через long polling,
то есть только исходящими соединениями. Открывать порты для него не нужно
вообще — они нужны только если раздаёшь мини-приложения со своего сервера.

### Вариант A. GitHub Pages

1. В репозитории: **Settings → Pages**.
2. Source: *Deploy from a branch*, ветка `claude/telegram-bot-pdf-cheatsheets-sdb289`
   (или `main`, если сольёшь ветку), папка `/ (root)`.
3. Через пару минут поднимутся:
   - `https://jew1ik.github.io/tpn/` — калькулятор ПП
   - `https://jew1ik.github.io/tpn/bili/` — калькулятор билирубина
   - `https://jew1ik.github.io/tpn/cheatsheets/` — список PDF
4. Больше на сервере ничего не нужно, `BILI_WEBAPP_URL` уже указывает сюда.

### Вариант B. Свой домен на этом сервере

`install.sh` кладёт мини-приложения в `<каталог бота>/webapp`.
Дальше — nginx и сертификат, конфиг лежит рядом: `nginx-webapp.conf`.

```bash
sudo apt install nginx certbot python3-certbot-nginx
sudo cp nginx-webapp.conf /etc/nginx/sites-available/postneo-webapp
# заменить ДОМЕН и путь в конфиге
sudo ln -s /etc/nginx/sites-available/postneo-webapp /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d ДОМЕН
```

Затем задать боту адрес:
```
BILI_WEBAPP_URL=https://ДОМЕН/bili/
```

---

## Установка модуля в бота

```bash
# на сервере, под пользователем, от которого работает бот
cd ~
curl -fsSL -o install.sh \
  https://raw.githubusercontent.com/jEw1IK/tpn/claude/telegram-bot-pdf-cheatsheets-sdb289/cheatsheets/deploy/install.sh
chmod +x install.sh
./install.sh /путь/к/каталогу/бота        # например /opt/postneo
```

Скрипт:

- скачивает ветку и кладёт `cheatsheets/` рядом с кодом бота;
- **не трогает** твой код — только печатает, что дописать;
- если модуль уже стоял, делает бэкап `cheatsheets.backup.ГГГГММДД-ЧЧММСС`
  и переносит кэш `file_id`, чтобы PDF не заливались в Telegram заново;
- проверяет, что все 13 PDF на месте и что виден aiogram 3.x.

Готовые PDF лежат в репозитории, поэтому **reportlab на сервере не нужен** —
бот просто отдаёт файлы с диска.

### Две строки в коде бота

```python
from cheatsheets.bot.aiogram_router import cheatsheets_router
from cheatsheets.bot.bilirubin_router import bilirubin_router

dp.include_router(cheatsheets_router)
dp.include_router(bilirubin_router)
```

Важно: `cheatsheets/` должен лежать в том каталоге, откуда запускается бот
(или в `PYTHONPATH`). Если бот запускается из `/opt/postneo/main.py`, то
каталог `/opt/postneo/cheatsheets/` — то, что нужно.

### Команды в меню

```python
from aiogram.types import BotCommand

await bot.set_my_commands([
    BotCommand(command="shpory", description="📄 Шпаргалки в PDF"),
    BotCommand(command="bili",   description="🧮 Калькулятор билирубина"),
    BotCommand(command="ozpk",   description="🩸 Объём ОЗПК по массе"),
])
```

### Переменные окружения

| Переменная | Зачем | По умолчанию |
|---|---|---|
| `BILI_WEBAPP_URL` | Адрес мини-приложения для кнопки | `https://jew1ik.github.io/tpn/bili/` |
| `CHEATSHEET_FILE_ID_CACHE` | Путь к кэшу `file_id` | `cheatsheets/bot/file_id_cache.json` |

---

## Проверка

После перезапуска бота, в личке с ним:

```
/shpory              → меню разделов, любая кнопка присылает PDF
/shpory гбн          → сразу шпаргалка по ГБН
/bili                → кнопка открытия калькулятора
/bili 38 48 250      → ФТ 239, ОЗПК 342, «показана стандартная фототерапия»
/bili 29 100 300     → строка 28–29 нед, интенсивная ФТ, напоминание про консилиум
/ozpk 3200           → 544 мл, эр. взвесь 363, СЗП 181
```

Если `/bili 38 48 250` даёт не 239 и 342 — значит, подхватилась старая версия
данных, проверь, что `cheatsheets/data/bilirubin.json` из свежей ветки.

---

## Обновление

```bash
./cheatsheets/deploy/update.sh /opt/postneo postneo-bot
```

Второй аргумент — имя systemd-сервиса, его перезапустят автоматически.
Кэш `file_id` переносится, поэтому заново в Telegram заливаются только те PDF,
которые действительно изменились (сверяется по sha256).

---

## Если бот запускается как systemd-сервис

Шаблон — `postneo-bot.service` рядом. Установка:

```bash
sudo cp postneo-bot.service /etc/systemd/system/
sudo nano /etc/systemd/system/postneo-bot.service   # поправить пути и пользователя
sudo systemctl daemon-reload
sudo systemctl enable --now postneo-bot
sudo journalctl -u postneo-bot -f
```

---

## Частые грабли

| Симптом | Причина |
|---|---|
| `ModuleNotFoundError: cheatsheets` | Бот запускается не из того каталога. Проверь `WorkingDirectory` в юните |
| Кнопка калькулятора ничего не делает | Адрес не HTTPS или сертификат невалиден. На голый IP не заработает |
| Кнопка есть в личке, но не в группе | Так и задумано: `web_app` работает только в личных чатах, в группах роутер сам подставляет обычную ссылку |
| PDF приходят долго при первой отправке | Нормально: первый раз файл заливается в Telegram, дальше идёт по `file_id` мгновенно |
| После обновления PDF заливаются заново | Тоже нормально, если содержимое изменилось: кэш инвалидируется по sha256 |
| `/bili` отвечает, `/shpory` молчит | Подключён только один роутер — нужны оба `include_router` |
