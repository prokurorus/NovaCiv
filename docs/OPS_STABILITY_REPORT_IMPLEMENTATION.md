## Что изменено

- `netlify/functions/admin-proxy.js`: добавлен длинный таймаут для `snapshot:report`, прокси всегда добавляет `X-Admin-Token` из server-side env.
- `server/admin-domovoy-api.js`: `snapshot:report` теперь вызывает `runStabilityReport()`, возвращает краткий `summary` и пути артефактов; ошибки OpenAI отдаются понятным текстом.
- `server/ops-stability-report.js`: сохраняет артефакты в `_state/telemetry_latest.json`, `_state/system_report_latest.md`, `_state/system_report_latest.json`, пишет/обновляет `_state/monitoring_state.json`.
- `server/lib/systemTelemetry.js`: добавлен fallback парсинга `pm2 status --no-color`, чтение `_state/monitoring_state.json` для cron-полей.
- `server/lib/stabilityReport.js`: возвращает `{ reportMd, createdAt, model, usage }` и работает только на VPS.
- `src/pages/Admin.tsx`: кнопка "Отчет устойчивости" вызывает `snapshot:report` через `/.netlify/functions/admin-proxy`.
- `runbooks/stability_report_daily.sh`: уточнена cron-строка с логированием.
- `docs/RUNBOOKS.md`, `docs/PROJECT_STATE.md`: актуализированы пути артефактов.

## Как работает end-to-end

1) Админка `/admin` нажимает кнопку "Отчет устойчивости".
2) Клиент отправляет `POST /.netlify/functions/admin-proxy` с `{ action: "snapshot:report", text: "manual run" }`.
3) Netlify Function добавляет `X-Admin-Token` из server-side env и проксирует запрос на VPS `/admin/domovoy`.
4) VPS `admin-domovoy-api.js` запускает `runStabilityReport()`:
   - собирает telemetry → sanitize → сохраняет в `_state/telemetry_latest.json`
   - если `OPENAI_API_KEY` есть: запрашивает OpenAI и сохраняет отчет в `_state/system_report_latest.md` + метаданные JSON
   - обновляет `_state/monitoring_state.json`
5) Ответ возвращается в UI как сообщение "NovaCiv Admin: ...".

## Как включается cron

Пример (UTC):

```
0 3 * * * bash /root/NovaCiv/runbooks/stability_report_daily.sh >> /var/log/novaciv_stability_report.log 2>&1
```

Скрипт: `runbooks/stability_report_daily.sh`

## Известные ограничения

- Метрики best-effort: зависят от доступности `pm2`, `ss`, `ip`, `df`, `free` на VPS.
- Fallback парсинг `pm2 status --no-color` может терять поля при нестандартном формате таблицы.
- Если `OPENAI_API_KEY` отсутствует, отчет не генерируется, но telemetry сохраняется.

## Что НЕ делали

- Не добавляли метрики Netlify/клиентские метрики (вне VPS).
- Не добавляли `pm2 jlist` и доступ к env-файлам — запрещено по правилам безопасности.
