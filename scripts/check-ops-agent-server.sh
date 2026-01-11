#!/bin/bash
# Проверка nova-ops-agent на сервере
# Проверяет: ecosystem.config.cjs, ENV_PATH, .env файлы, PM2 окружение, GITHUB_TOKEN

set -euo pipefail

PROJECT_DIR="/root/NovaCiv"
ENV_FILE="$PROJECT_DIR/.env"
ECO_FILE="$PROJECT_DIR/ecosystem.config.cjs"
APP_NAME="nova-ops-agent"

echo "=== ПРОВЕРКА NOVA-OPS-AGENT ==="
echo "Дата: $(date -Is)"
echo "Хост: $(hostname)"
echo

# 1. Проверка, что процесс запущен через ecosystem.config.cjs
echo "=== 1. ПРОВЕРКА ЗАПУСКА ЧЕРЕЗ ECOSYSTEM.CONFIG.CJS ==="
if [ -f "$ECO_FILE" ]; then
  echo "✅ ecosystem.config.cjs существует: $ECO_FILE"
else
  echo "❌ ecosystem.config.cjs НЕ НАЙДЕН: $ECO_FILE"
fi

PM2_ID=$(pm2 id "$APP_NAME" 2>/dev/null | tail -n 1 | tr -d '[:space:]' || echo '')
if [ -z "$PM2_ID" ]; then
  echo "❌ Процесс $APP_NAME не найден в PM2"
  exit 1
fi

# Проверяем PM2 list для поиска информации о запуске через ecosystem
PM2_LIST=$(pm2 list 2>/dev/null || echo "")
if echo "$PM2_LIST" | grep -q "$APP_NAME"; then
  echo "✅ Процесс $APP_NAME найден в PM2 (ID: $PM2_ID)"
fi

# Проверяем pm2 jlist для поиска пути к ecosystem
PM2_JLIST=$(pm2 jlist 2>/dev/null | grep -A 30 "\"name\":\"$APP_NAME\"" || echo "")
if echo "$PM2_JLIST" | grep -q "ecosystem"; then
  echo "✅ Процесс запущен через ecosystem.config.cjs (подтверждено в PM2)"
else
  echo "⚠️  Не удалось подтвердить запуск через ecosystem.config.cjs в PM2"
fi

echo

# 2. Поиск всех .env файлов в /root/NovaCiv (включая подпапки)
echo "=== 2. ВСЕ .ENV ФАЙЛЫ В /root/NovaCiv (включая подпапки) ==="
find "$PROJECT_DIR" -type f -name ".env" 2>/dev/null | sort || echo "Файлы .env не найдены"
echo

# 3. Проверка наличия GITHUB_TOKEN= в /root/NovaCiv/.env
echo "=== 3. ПРОВЕРКА GITHUB_TOKEN В /root/NovaCiv/.env ==="
if [ -f "$ENV_FILE" ]; then
  if grep -qE "^GITHUB_TOKEN=" "$ENV_FILE"; then
    echo "✅ Строка GITHUB_TOKEN= найдена в $ENV_FILE"
  else
    echo "❌ Строка GITHUB_TOKEN= НЕ найдена в $ENV_FILE"
  fi
else
  echo "❌ Файл $ENV_FILE не существует"
fi
echo

# 4. PM2 describe и pm2 env (без секретов)
echo "=== 4. PM2 DESCRIBE nova-ops-agent ==="
pm2 describe "$APP_NAME" 2>/dev/null || echo "Ошибка при выполнении pm2 describe"
echo

echo "=== 5. PM2 ENV (ENV_PATH и PROJECT_DIR) ==="
if [ -n "$PM2_ID" ]; then
  PM2_ENV=$(pm2 env "$PM2_ID" 2>/dev/null || echo "")
  if [ -n "$PM2_ENV" ]; then
    # Выводим только ENV_PATH и PROJECT_DIR (без секретов)
    echo "--- ENV_PATH и PROJECT_DIR в окружении PM2 ---"
    echo "$PM2_ENV" | grep -E "^(ENV_PATH|PROJECT_DIR)=" || echo "Переменные не найдены"
    
    # Проверяем ENV_PATH
    ENV_PATH_VALUE=$(echo "$PM2_ENV" | grep -E "^ENV_PATH=" | cut -d'=' -f2- || echo "")
    if [ -n "$ENV_PATH_VALUE" ]; then
      if [ "$ENV_PATH_VALUE" = "$ENV_FILE" ]; then
        echo "✅ ENV_PATH корректный: $ENV_PATH_VALUE"
      else
        echo "⚠️  ENV_PATH: $ENV_PATH_VALUE (ожидался: $ENV_FILE)"
      fi
    else
      echo "❌ ENV_PATH не установлен"
    fi
    
    # Проверяем PROJECT_DIR
    PROJECT_DIR_VALUE=$(echo "$PM2_ENV" | grep -E "^PROJECT_DIR=" | cut -d'=' -f2- || echo "")
    if [ -n "$PROJECT_DIR_VALUE" ]; then
      if [ "$PROJECT_DIR_VALUE" = "$PROJECT_DIR" ]; then
        echo "✅ PROJECT_DIR корректен: $PROJECT_DIR_VALUE"
      else
        echo "⚠️  PROJECT_DIR: $PROJECT_DIR_VALUE (ожидался: $PROJECT_DIR)"
      fi
    else
      echo "❌ PROJECT_DIR не установлен"
    fi
  else
    echo "❌ Не удалось получить окружение PM2"
  fi
else
  echo "❌ ID процесса PM2 не найден"
fi
echo

# 5. Проверка кода server/ops-agent.js
echo "=== 6. ПРОВЕРКА КОДА server/ops-agent.js ==="
OPS_AGENT_FILE="$PROJECT_DIR/server/ops-agent.js"
if [ -f "$OPS_AGENT_FILE" ]; then
  # Проверяем, что используется ENV_PATH
  if grep -q "ENV_PATH" "$OPS_AGENT_FILE" && grep -qE "require\(\"dotenv\"\)\.config\(\s*\{[^}]*path:" "$OPS_AGENT_FILE"; then
    echo "✅ Код использует dotenv с указанием пути через ENV_PATH"
    # Показываем соответствующую строку
    grep -E "require\(\"dotenv\"\)\.config\(\s*\{[^}]*path:" "$OPS_AGENT_FILE" | head -n 1 | sed 's/^/   /'
  elif grep -qE "require\(\"dotenv\"\)\.config\(\)" "$OPS_AGENT_FILE" && ! grep -qE "require\(\"dotenv\"\)\.config\(\s*\{[^}]*path:" "$OPS_AGENT_FILE"; then
    echo "❌ Код использует dotenv без указания пути - ТРЕБУЕТСЯ ИСПРАВЛЕНИЕ"
  else
    echo "⚠️  Код может использовать dotenv без пути - требуется проверка"
  fi
else
  echo "❌ Файл $OPS_AGENT_FILE не найден"
fi
echo

# 6. Перезапуск и проверка стабильности
echo "=== 7. ПЕРЕЗАПУСК И ПРОВЕРКА СТАБИЛЬНОСТИ ==="
echo "Перезапускаем $APP_NAME..."
pm2 restart "$APP_NAME" 2>&1 || echo "Ошибка при перезапуске"

# Ждем 5 секунд для запуска
sleep 5

# Проверяем статус
PM2_STATUS_JSON=$(pm2 jlist 2>/dev/null | grep -A 10 "\"name\":\"$APP_NAME\"" || echo "")
STATUS=$(echo "$PM2_STATUS_JSON" | grep -oE '"status":"[^"]+"' | cut -d'"' -f4 || echo "unknown")

if [ "$STATUS" = "online" ]; then
  RESTARTS=$(echo "$PM2_STATUS_JSON" | grep -oE '"restart_time":[0-9]+' | cut -d':' -f2 || echo "0")
  echo "✅ Процесс запущен (статус: online, перезапусков: $RESTARTS)"
  
  # Проверяем логи на ошибки загрузки .env
  LOGS=$(pm2 logs "$APP_NAME" --lines 30 --nostream 2>/dev/null || echo "")
  if echo "$LOGS" | grep -qiE "(error|failed to load|\.env file not found|GITHUB_TOKEN not set)" && ! echo "$LOGS" | grep -qE "(Loaded .env|GITHUB_TOKEN loaded)"; then
    echo "❌ Обнаружены ошибки в логах"
    STABILITY="не стабильно"
    REASON="Процесс запущен, но есть ошибки загрузки .env или GITHUB_TOKEN"
  elif echo "$LOGS" | grep -qE "(Loaded .env|GITHUB_TOKEN loaded)"; then
    echo "✅ .env загружен успешно (подтверждено в логах)"
    STABILITY="стабильно"
    REASON="Процесс запущен, .env загружается корректно, ENV_PATH установлен"
  else
    echo "⚠️  Не удалось подтвердить загрузку .env из логов (проверьте логи вручную)"
    STABILITY="требуется проверка"
    REASON="Процесс запущен, но не удалось подтвердить загрузку .env из логов"
  fi
else
  echo "❌ Процесс не запущен или упал (статус: $STATUS)"
  STABILITY="не стабильно"
  REASON="Процесс не запущен или упал после перезапуска"
fi

echo
echo "=== ИТОГ ==="
echo "Стабильность: $STABILITY"
echo "Причина: $REASON"
if [ "$STABILITY" = "не стабильно" ]; then
  echo "Рекомендация: Проверьте логи: pm2 logs $APP_NAME"
fi
echo
echo "=== БЫСТРАЯ ДИАГНОСТИКА (команда для будущего использования) ==="
echo "PM2_ID=\$(pm2 id $APP_NAME 2>/dev/null | tail -n 1 | tr -d '[:space:]') && pm2 describe $APP_NAME && echo '---' && pm2 env \$PM2_ID | grep -E '^(ENV_PATH|PROJECT_DIR)=' && grep -qE '^GITHUB_TOKEN=' $ENV_FILE && echo '✅ GITHUB_TOKEN exists' || echo '❌ GITHUB_TOKEN missing'"
