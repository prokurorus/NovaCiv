# PROD Recovery: Инструкции для диагностики

**Режим:** PROD recovery (строго)  
**Цель:** Убрать 500 у fetch-news/news-cron и вернуть новости  
**Deploy:** main@031cdae (rollback уже в проде)

---

## ШАГ A — Быстрые HTTP проверки

**Выполнить на ПК, используя C:\Windows\System32\curl.exe (НЕ PowerShell алиасы)**

Выполнить следующие команды и прислать **ТОЛЬКО статусы + первые 1–2 строки тела** (без токенов):

```powershell
C:\Windows\System32\curl.exe -i "https://novaciv.space/.netlify/functions/fetch-news"
```

```powershell
C:\Windows\System32\curl.exe -i "https://novaciv.space/.netlify/functions/news-cron"
```

```powershell
C:\Windows\System32\curl.exe -i "https://novaciv.space/.netlify/functions/ops-run-now?dry=1"
```

**Ожидаемо:** 403 допустимо (auth gate жив), 500 недопустимо.

---

## ШАГ B — Netlify Logs: достать РЕАЛЬНУЮ причину 500

Если fetch-news или news-cron = 500:

1. Netlify → **Functions** → `fetch-news` → **Invocations** (или **Recent invocations**)
2. Открыть последнюю инвокацию (по времени HTTP-теста из ШАГ A)
3. Открыть **Runtime logs** / **Error**
4. Скопировать **30–60 строк вокруг**:
   - `Error: ...`
   - `at ... (file:line:col)`
   - `Cannot find module ...`
   - `Task timed out ...`

**То же самое для `news-cron`.**

**Важно:** не копировать env, токены, конфиги целиком — только stack trace.

---

## ШАГ C — Проверка ENV в Netlify (только present/absent, без значений)

Netlify → **Site configuration** → **Environment variables** → **Production**

Отметить наличие:
- `OPS_CRON_SECRET` — present/absent
- `NEWS_CRON_SECRET` — present/absent
- `FIREBASE_DB_URL` и/или `FIREBASE_DATABASE_URL` — present/absent (что заведено)

**Если NEWS_CRON_SECRET отсутствует:**
- Добавить `NEWS_CRON_SECRET` = (точно такое же значение как `OPS_CRON_SECRET`) копированием в UI
- Значение нигде не печатать

---

## ШАГ D — Проверка Deploy log на bundling/Node issues

Netlify → **Deploys** → открыть **Published deploy @031cdae** → **Deploy log**

Найти ошибки в блоках **Functions/Build**:
- `Error bundling`
- `Cannot find module`
- `Failed to create function`
- `Node version mismatch`

Скопировать **20–40 строк вокруг ошибки**.

---

## ШАГ F — Если выяснится таймаут/долгая работа (20–30 минут)

Если в логах есть `timeout` или понятно, что функция делает тяжёлую агрегацию:

**Решение:** Netlify functions должны быть "тонкими":
- fetch-news/news-cron НЕ ищут новости сами
- они только триггерят серверный воркер (или ставят job в Firebase), который делает тяжёлую работу

Дальше предложи минимальный план переноса тяжёлой части на сервер (без переписывания всего).

---

## ШАГ G — Выровнять сервер с main (если новости движком на сервере)

На сервере (через SSH/Cursor Remote):
```bash
cd /root/NovaCiv && git pull
pm2 status
pm2 restart нужных процессов --update-env
```
(только те, что связаны с news/ops)

Проверить логи 1–2 минуты.

---

## ФИНАЛЬНЫЙ ОТЧЁТ (одним сообщением)

- **HTTP:** fetch-news / news-cron / ops-run-now?dry=1 → статус + 1–2 строки тела
- **Если 500:** причина = exact error + file:line из Netlify Runtime logs (или Deploy log)
- **ENV:** OPS_CRON_SECRET present/absent; NEWS_CRON_SECRET present/absent; FIREBASE_DB_URL present/absent
- **Решение:** ENV-only / timeout-architecture / bundling-missing-module / code(file:line)
