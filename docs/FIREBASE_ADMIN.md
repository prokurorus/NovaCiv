# Firebase Admin — Инструменты и документация

**Единая точка доступа к Firebase Realtime Database для всех серверных модулей и скриптов.**

---

## 📦 Модуль инициализации

**Путь:** `server/lib/firebaseAdmin.js`

**Экспорт:**
- `getAdminApp()` — получает или создает экземпляр Firebase Admin App (синглтон)
- `getDb()` — получает экземпляр базы данных (синглтон)

**Использование:**
```javascript
const { getDb } = require("../server/lib/firebaseAdmin");

const db = getDb();
const ref = db.ref("forum/topics");
```

---

## 🔧 Переменные окружения

Для локальной работы создайте файл `.env` в корне проекта:

```bash
# URL базы данных Firebase Realtime Database
FIREBASE_DB_URL=https://novaciv-web-default-rtdb.europe-west1.firebasedatabase.app

# Или альтернативное имя:
# FIREBASE_DATABASE_URL=...

# JSON сервисного аккаунта Firebase (полный JSON объект)
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}
```

**Важно:**
- `FIREBASE_SERVICE_ACCOUNT_JSON` должен быть валидным JSON объектом (не путь к файлу)
- В `.env` JSON можно указать в одну строку или использовать экранирование
- Секреты не логируются в консоль

---

## 🧪 Smoke Test

**Путь:** `tools/firebase-smoke-test.js`

**Что делает:**
1. Подключается к Firebase Realtime Database
2. Читает первые 5 ключей из `/forum/topics`
3. Пишет тестовый ключ `/_debug/smokeTest`
4. Проверяет, что запись прошла
5. Удаляет тестовый ключ
6. Проверяет, что удаление прошло

**Запуск:**
```bash
node tools/firebase-smoke-test.js
```

**Ожидаемый результат:**
```
[smoke-test] Starting Firebase connection test...
[smoke-test] Connected to Firebase
[smoke-test] Reading /forum/topics (first 5 keys)...
[smoke-test] Found N topic(s): [...]
[smoke-test] Writing test key /_debug/smokeTest...
[smoke-test] Test key written successfully
[smoke-test] Test key read back successfully
[smoke-test] Deleting test key...
[smoke-test] Test key deleted
[smoke-test] Test key deletion confirmed
[smoke-test] OK - All tests passed
```

**Если ошибка:**
- Проверьте, что `.env` файл содержит `FIREBASE_DB_URL` и `FIREBASE_SERVICE_ACCOUNT_JSON`
- Убедитесь, что сервисный аккаунт имеет права на чтение/запись в базу
- Проверьте, что `firebase-admin` установлен: `npm install firebase-admin`

---

## 📋 Firebase Rules — Индекс для section

**Проблема:** При запросе `orderBy="section"` Firebase требует индекс на поле `section`.

**Решение:** Добавить индекс в Firebase Rules.

**Файл патча:** `docs/firebase.rules.patch.json`

**Как применить вручную:**

1. Откройте [Firebase Console](https://console.firebase.google.com/)
2. Выберите проект `novaciv-web`
3. Перейдите в **Realtime Database** → **Rules**
4. Добавьте индекс для `/forum/topics`:

```json
{
  "rules": {
    "forum": {
      "topics": {
        ".indexOn": ["section"],
        "$topicId": {
          ".read": true,
          ".write": true
        }
      }
    }
  }
}
```

5. Нажмите **Publish**

**Альтернатива через Firebase CLI:**
```bash
firebase deploy --only database:rules
```

**После применения индекса:**
- Запросы `orderBy="section"` будут работать быстро
- Fallback в `news-cron.js` больше не будет срабатывать (но останется как резерв)

---

## 🔍 Диагностика

### Проверка подключения
```bash
node tools/firebase-smoke-test.js
```

### Проверка переменных окружения
```bash
# Linux/Mac
echo $FIREBASE_DB_URL
echo $FIREBASE_SERVICE_ACCOUNT_JSON | jq .project_id

# Windows (PowerShell)
$env:FIREBASE_DB_URL
$env:FIREBASE_SERVICE_ACCOUNT_JSON | ConvertFrom-Json | Select-Object project_id
```

### Логи в коде
Модуль `firebaseAdmin.js` логирует только host базы данных (без секретов):
```
[firebase-admin] Initialized with database: novaciv-web-default-rtdb.europe-west1.firebasedatabase.app
```

---

## ⚠️ Безопасность

- **Секреты не логируются** — в логах только host базы данных
- **Синглтон** — Firebase Admin инициализируется один раз
- **`.env` не коммитится** — добавлен в `.gitignore`

---

## 📚 Дополнительные ресурсы

- [Firebase Admin SDK Documentation](https://firebase.google.com/docs/admin/setup)
- [Firebase Realtime Database Rules](https://firebase.google.com/docs/database/security)
- [Firebase Indexes](https://firebase.google.com/docs/database/security/indexing-data)

---

*Документ обновляется при изменениях в системе.*
