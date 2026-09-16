# Развёртывание на сервере

Сервер: `89.169.32.9`. Бот работает через long polling — только исходящие
соединения, открывать порты не нужно.

---

## Быстрый путь: готовый бот одной командой

В репозитории лежит собранный бот: поиск по 57 клиническим рекомендациям,
15 шпаргалок в PDF, дозы препаратов, шкалы и калькулятор питания. Свой код
писать не нужно.

```bash
ssh root@89.169.32.9
apt update && apt install -y git python3-venv
git clone --depth 1 https://github.com/jEw1IK/tpn.git /tmp/tpn
sudo /tmp/tpn/cheatsheets/deploy/install-bot.sh /opt/postneo
```

Скрипт спросит токен от @BotFather (ввод не отображается), создаст
виртуальное окружение, системного пользователя `postneo`, напишет
systemd-юнит и запустит сервис. Повторный запуск той же команды —
это обновление: заберёт свежий код и перезапустит бота.

```
Обновить:    sudo /opt/postneo/app/cheatsheets/deploy/install-bot.sh /opt/postneo
Логи:        journalctl -u postneo-bot -f
Остановить:  sudo systemctl stop postneo-bot
```

Что где лежит после установки:

| Путь | Что это |
|---|---|
| `/opt/postneo/app` | клон репозитория, обновляется `git fetch` |
| `/opt/postneo/.venv` | питон-окружение с aiogram |
| `/opt/postneo/.env` | токен и адреса, права 600 |
| `/opt/postneo/file_id_cache.json` | кэш Telegram: PDF не заливается дважды |

### Если бот уже работает на этом сервере

Старый процесс нужно остановить — иначе два бота будут драться за один
токен, и Telegram начнёт отдавать обновления то одному, то другому:

```bash
sudo systemctl stop <старый-сервис>
sudo systemctl disable <старый-сервис>
```

---

## Настройки: /opt/postneo/.env

```
BOT_TOKEN=123456:AA…                                  обязательно
TPN_WEBAPP_URL=https://jew1ik.github.io/tpn/          калькулятор питания
SCALES_WEBAPP_URL=https://jew1ik.github.io/tpn/#scales вкладка «Шкалы»
CHEATSHEET_FILE_ID_CACHE=/opt/postneo/file_id_cache.json
CHANNEL_URL=https://t.me/…                            появится команда /channel
```

После правки: `sudo systemctl restart postneo-bot`.

---

## Про кнопку мини-приложения

**Telegram открывает Web App только по HTTPS с валидным сертификатом.**
На голый IP сертификат не выпускается, поэтому `https://89.169.32.9/#scales`
кнопкой не заработает.

| Вариант | Что нужно | Адрес |
|---|---|---|
| **GitHub Pages** (уже настроено) | ничего | `https://jew1ik.github.io/tpn/#scales` |
| **Свой домен** | домен на 89.169.32.9 + Let's Encrypt | `https://домен/#scales` |

### Свой домен вместо Pages

`install.sh` кладёт мини-приложения в `<каталог бота>/webapp`; конфиг nginx
лежит рядом — `nginx-webapp.conf`.

```bash
sudo apt install nginx certbot python3-certbot-nginx
sudo cp nginx-webapp.conf /etc/nginx/sites-available/postneo-webapp
# заменить ДОМЕН и путь в конфиге
sudo ln -s /etc/nginx/sites-available/postneo-webapp /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d ДОМЕН
```

Затем в `.env`: `SCALES_WEBAPP_URL=https://ДОМЕН/#scales` и
`TPN_WEBAPP_URL=https://ДОМЕН/`.

---

## Второй путь: встроить модуль в свой код бота

Если хочется оставить свой код, а взять только начинку:

```bash
./cheatsheets/deploy/install.sh /путь/к/каталогу/бота
```

Скрипт кладёт рядом каталог `cheatsheets/` и ничего не правит сам.
Дальше в коде:

```python
from cheatsheets.bot.aiogram_router import cheatsheets_router
from cheatsheets.bot.scales_router import scales_router
from cheatsheets.bot.search_router import search_router
from cheatsheets.bot.keyboard import main_keyboard, scales_button, tpn_button
from cheatsheets.bot.help_text import HELP_TEXT

dp.include_router(scales_router)        # ловит кнопку «📊 Шкалы»
dp.include_router(cheatsheets_router)   # /shpory и его колбэки
dp.include_router(search_router)        # ПОСЛЕДНИМ: он забирает весь свободный текст
```

Порядок важен. `search_router` отвечает на любое текстовое сообщение,
поэтому всё, что должно срабатывать раньше, подключается выше.

### Что убрать из старого кода — можно скриптом

`patch_bot.py` делает это сам: снимает копию файла, правит, проверяет
синтаксис и откатывается, если после правок Python перестал разбирать файл.

```bash
sudo /opt/telegram-bot/.venv/bin/python \
     /opt/telegram-bot/cheatsheets/deploy/patch_bot.py /opt/telegram-bot/bot.py
```

Сначала можно посмотреть без изменений — флаг `--dry`. Если список команд
вынесен в отдельный файл, для него есть `--menu-only`.

Тексты справки скрипт не трогает специально: он показывает нужные строки
в конце вывода, а решение принимает человек.

| Убрать | Почему |
|---|---|
| `from cheatsheets.bot.bilirubin_router import bilirubin_router` | модуля больше нет — бот упадёт на старте с `ModuleNotFoundError` |
| `dp.include_router(bilirubin_router)` | то же самое |
| кнопку `🟡 Билирубин` | вместо неё `scales_button()` |
| `/bili` и `/ozpk` в `set_my_commands` | команд больше нет, в меню висят мёртвыми |

Расчёт билирубина убран сознательно — осталась шпаргалка `gbn.pdf`
с таблицами порогов фототерапии и ОЗПК по КР 917_1 и 916_1.

---

## Проверка после установки

| Что нажать | Что должно прийти |
|---|---|
| `/start` | приветствие и клавиатура из шести кнопок |
| `желтуха` | карточка КР «Неонатальная желтуха» и кнопка со шпаргалкой |
| `P23.0` | «Врожденная пневмония» |
| `/doza гентамицин 1200` | схема по ГВ и «5 мг/кг → 6 мг на введение» |
| `/shpory` | разделы, из них PDF |
| `/scales` | кнопка, открывающая шкалы внутри Telegram |
| `/help` | справка без `/bili` и `/ozpk` |

Локально то же самое прогоняется без сервера и без токена:

```bash
cd cheatsheets && python tests/test_bot.py
```

---

## Частые грабли

**Бот молчит.** `journalctl -u postneo-bot -n 50`. Чаще всего это второй
экземпляр со старым кодом: `systemctl list-units | grep -i bot`.

**`ModuleNotFoundError: cheatsheets`.** `WorkingDirectory` в юните должен
указывать на каталог, внутри которого лежит `cheatsheets/` — то есть на
`/opt/postneo/app`.

**Кнопка мини-приложения не нажимается.** Она работает только в личном
чате и только по HTTPS. В группе бот отдаёт обычную ссылку.

**PDF приходит с ошибкой.** Проверь, что `pdf/*.pdf` на месте:
`ls /opt/postneo/app/cheatsheets/pdf | wc -l` — должно быть 15.

**Изменения не видны.** Код на сервере обновляется только `install-bot.sh`.
Правки в GitHub сами туда не доезжают.
