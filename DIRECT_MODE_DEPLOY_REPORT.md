# Direct Mode Deploy Report

**Дата:** 2026-01-14  
**Цель:** Довести "Direct" режим до реально работающего прод-цикла

---

## STEP 1 — GitHub: Коммиты и Push ✅

**Статус:** ✅ Выполнено

**Созданные коммиты:**
1. `61f748d` — `feat(admin): add direct mode (UI + proxy routing)`
   - Файлы: `src/pages/Admin.tsx`, `netlify/functions-lite/admin-proxy.js`
   
2. `d0a8aad` — `feat(vps): add /admin/direct endpoint (direct OpenAI chat)`
   - Файлы: `server/admin-domovoy-api.js`

**Push:** ✅ Успешно отправлен в `main`

---

## STEP 2 — Netlify: Деплой ⏳

**Статус:** ⏳ Требует ручной проверки

**Действие:** Откройте страницу `/admin` на продакшн-сайте и проверьте Git SHA в build marker.

**Ожидаемый SHA:** `d0a8aad` (или более новый, если был дополнительный деплой)

---

## STEP 3 — VPS Deploy ✅

**Статус:** ✅ Выполнено

**Детали:**
- **VPS:** `root@77.42.36.198`
- **Путь:** `/root/NovaCiv`
- **Git SHA до:** `bd0a29a`
- **Git pull:** ✅ Успешно (Fast-forward)
- **Git SHA после:** `d0a8aad` ✅ (совпадает с последним коммитом)
- **PM2 restart:** ✅ `nova-admin-domovoy` перезапущен с `--update-env`
- **PM2 status:** ✅ `online` (uptime: 2s, restarts: 9)

**Логи подтверждают:**
```
[admin-domovoy-api] Server listening on port 3001
[admin-domovoy-api] Endpoint: POST http://localhost:3001/admin/domovoy
[admin-domovoy-api] Endpoint: POST http://localhost:3001/admin/direct ✅
```

---

## STEP 4 — Smoke Tests ⏳

**Статус:** ⏳ Требует ручной проверки

### A) Локальный curl тест
**Статус:** ⏭️ Пропущен (токен нельзя вывести безопасно)

**Причина:** Согласно правилам безопасности, токен не должен выводиться в командах.

### B) Проверка через /admin UI
**Статус:** ⏳ Требует ручной проверки

**Инструкции:**
1. Откройте `/admin` на продакшн-сайте
2. Выберите режим **"Диалог (прямой)"**
3. Задайте вопрос: **"почему мы получили 504 вчера и что изменили?"**

**Ожидаемые результаты:**
- ✅ Нет предложений Grafana
- ✅ В `debug.mode` видно `"direct"`
- ✅ `upstreamStatus: 200`
- ✅ Получен ответ от OpenAI

**Если не работает:**
- Проверьте `debug.origin` (должно быть `"admin-proxy"`)
- Проверьте `debug.upstreamUrl` (должно быть `http://77.42.36.198:3001/admin/direct`)
- Проверьте `debug.upstreamStatus` (должно быть `200`)
- Проверьте ошибки в консоли браузера и Netlify Functions logs

---

## STEP 5 — Отчёт

### Резюме

| Шаг | Статус | Детали |
|-----|--------|--------|
| STEP 1: GitHub | ✅ | 2 коммита созданы и отправлены |
| STEP 2: Netlify | ⏳ | Требует проверки SHA на `/admin` |
| STEP 3: VPS | ✅ | Код обновлён, процесс online |
| STEP 4: Tests | ⏳ | Требует проверки через UI |

### Git SHA

- **GitHub main:** `d0a8aad`
- **VPS HEAD:** `d0a8aad` ✅ (совпадает)
- **Netlify /admin SHA:** ⏳ (требует проверки)

### Direct Mode Status

- **VPS endpoint:** ✅ Зарегистрирован (`/admin/direct`)
- **Proxy routing:** ✅ Реализовано (маршрутизация по `mode === "direct"`)
- **UI mode selector:** ✅ Добавлен ("Диалог (прямой)")
- **End-to-end:** ⏳ Требует проверки через UI

### Следующие шаги

1. **Проверить Netlify деплой:**
   - Открыть `/admin` и проверить Git SHA в build marker
   - Убедиться, что SHA = `d0a8aad` или новее

2. **Проверить Direct режим через UI:**
   - Выбрать "Диалог (прямой)"
   - Задать тестовый вопрос
   - Проверить `debug.mode = "direct"` и `upstreamStatus = 200`

3. **Если не работает:**
   - Проверить Netlify Functions logs для `admin-proxy`
   - Проверить VPS logs: `ssh root@77.42.36.198 "pm2 logs nova-admin-domovoy --lines 50"`
   - Проверить сетевую доступность VPS из Netlify

---

**Отчёт подготовлен:** 2026-01-14  
**Версия:** 1.0
