# Развёртывание на сервере

Сервер: `89.169.32.9`. Ниже — что нужно сделать на нём руками.

---

## Сначала главное про кнопку мини-приложения

**Telegram открывает Web App только по HTTPS с валидным сертификатом.**
На голый IP сертификат не выпускается, поэтому `https://89.169.32.9/#scales`
кнопкой работать не будет — Telegram её просто не откроет.

Два рабочих варианта:

| Вариант | Что нужно | Адрес |
|---|---|---|
| **GitHub Pages** (проще) | Включить Pages в настройках репозитория | `https://jew1ik.github.io/tpn/#scales` |
| **Свой домен** | Домен, направленный на 89.169.32.9, + Let's Encrypt | `https://твой-домен/#scales` |

Сам бот при этом может жить где угодно: он работает через long polling,
то есть только исходящими соединениями. Открывать порты для него не нужно
вообще — они нужны только если раздаёшь мини-приложения со своего сервера.

### Вариант A. GitHub Pages

1. В репозитории: **Settings → Pages**.
2. Source: *Deploy from a branch*, ветка `claude/telegram-bot-pdf-cheatsheets-sdb289`
   (или `main`, если сольёшь ветку), папка `/ (root)`.
3. Через пару минут поднимутся:
   - `https://jew1ik.github.io/tpn/` — калькулятор ПП
   - `https://jew1ik.github.io/tpn/#scales` — то же приложение на вкладке «Шкалы»
   - `https://jew1ik.github.io/tpn/cheatsheets/` — список PDF
4. Больше на сервере ничего не нужно, `SCALES_WEBAPP_URL` уже указывает сюда.

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
SCALES_WEBAPP_URL=https://ДОМЕН/#scales
```

---

## Витрина бота без правки кода

Часть работы можно сделать через Bot API, вообще не трогая код: повесить
кнопку меню на калькулятор, прописать команды и описание.

```bash
export BOT_TOKEN='1234567890:AA...'
./setup-bot-menu.sh
unset BOT_TOKEN
```

Токен передаётся переменной окружения, а не аргументом — иначе он осел бы
в истории оболочки и был бы виден в `ps`. Скрипт сначала показывает, чей это
токен, проверяет что мини-приложение реально отдаёт 200, и спрашивает
подтверждение. На битую ссылку кнопку не повесит.

Что получится сразу: в списке команд появляются `/shpory` и `/scales`,
кнопка меню рядом с полем ввода открывает выбранное мини-приложение.
**Отвечать** на эти команды бот начнёт только после подключения модуля
к коду — витрина и логика это разные вещи.

Вернуть кнопку меню в обычный список команд: `MENU=commands ./setup-bot-menu.sh`

---

## Если обновляешься с версии, где был калькулятор билирубина

Калькулятор убран — осталась только шпаргалка по ГБН. Поэтому после
обновления модуля **обязательно** правится код бота, иначе он не запустится.

**1. Убрать импорт, которого больше нет.** Файла `bilirubin_router.py`
в модуле нет, и строка

```python
from cheatsheets.bot.bilirubin_router import bilirubin_router
```

уронит бота на старте с `ModuleNotFoundError`. Удалить её вместе с
`dp.include_router(bilirubin_router)`.

**2. Подключить шкалы вместо него:**

```python
from cheatsheets.bot.scales_router import scales_router
dp.include_router(scales_router)
```

**3. Убрать `/bili` и `/ozpk` из `set_my_commands`** — команд больше нет,
а в списке они останутся висеть.

**4. Заменить кнопку на клавиатуре.** Готовая кнопка лежит в модуле и
открывает мини-приложение сразу на вкладке со шкалами — в один тап,
как кнопка парентерального питания:

```python
from aiogram.types import KeyboardButton, ReplyKeyboardMarkup, WebAppInfo
from cheatsheets.bot.keyboard import scales_button

ReplyKeyboardMarkup(
    keyboard=[
        [KeyboardButton(text="🔎 Найти рекомендации")],
        [KeyboardButton(text="🧬 Парентеральное питание",
                        web_app=WebAppInfo(url="https://jew1ik.github.io/tpn/"))],
        [KeyboardButton(text="📄 Шпаргалки"), scales_button()],
        [KeyboardButton(text="ℹ️ О проекте"), KeyboardButton(text="❓ Помощь")],
    ],
    resize_keyboard=True,
)
```

`scales_button()` принимает свою подпись и свой адрес, если нужно:
`scales_button("📊 Шкалы оценки")`.

Кнопки `web_app` в реплай-клавиатуре работают **только в личных чатах**.
Если бот отдаёт клавиатуру в группе, используйте обычную
`KeyboardButton(text="📊 Шкалы")` — её поймает `scales_router` и ответит
сообщением с инлайн-кнопкой.

**5. Обновить текст справки** — готовый лежит в `cheatsheets/bot/help_text.py`.

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
from cheatsheets.bot.scales_router import scales_router

dp.include_router(cheatsheets_router)
dp.include_router(scales_router)
```

**Порядок важен.** Эти роутеры подключаются **до** обработчика свободного
текста: `scales_router` ловит нажатие кнопки «📊 Шкалы» по точному совпадению,
и если поиск по КР зарегистрирован раньше, он перехватит нажатие первым.
Свободный текст вроде «шкалы боли у недоношенных» роутер пропускает дальше —
сравнение точное, не по вхождению.

Важно: `cheatsheets/` должен лежать в том каталоге, откуда запускается бот
(или в `PYTHONPATH`). Если бот запускается из `/opt/postneo/main.py`, то
каталог `/opt/postneo/cheatsheets/` — то, что нужно.

### Команды в меню

```python
from aiogram.types import BotCommand

await bot.set_my_commands([
    BotCommand(command="shpory", description="📄 Шпаргалки в PDF"),
    BotCommand(command="scales", description="📊 Шкалы: nSOFA, боль, седация"),
])
```

### Переменные окружения

| Переменная | Зачем | По умолчанию |
|---|---|---|
| `SCALES_WEBAPP_URL` | Адрес мини-приложения, вкладка «Шкалы» | `https://jew1ik.github.io/tpn/#scales` |
| `CHEATSHEET_FILE_ID_CACHE` | Путь к кэшу `file_id` | `cheatsheets/bot/file_id_cache.json` |

---

## Проверка

После перезапуска бота, в личке с ним:

```
/shpory              → меню разделов, любая кнопка присылает PDF
/shpory гбн          → сразу шпаргалка по ГБН
/scales              → кнопка, открывающая шкалы
📊 Шкалы             → то же самое нажатием кнопки на клавиатуре
```

В шкале nSOFA при максимуме по всем трём системам должно получиться 15 баллов,
в NIPS — 7. Если цифры другие, подхватилась старая версия `data/scales.json`.

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
| `/scales` отвечает, `/shpory` молчит | Подключён только один роутер — нужны оба `include_router` |
