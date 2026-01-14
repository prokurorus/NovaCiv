# Мониторинг NovaCiv: Prometheus и Grafana

## Обзор

Настроен мониторинг инфраструктуры NovaCiv с использованием Prometheus для сбора метрик и Grafana для визуализации.

## Архитектура мониторинга

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   PM2 Apps  │────▶│  PM2 Exporter│────▶│  Prometheus │
│ (nova-video,│     │   (port 9615) │     │  (port 9090)│
│  nova-ops,  │     └──────────────┘     └──────┬───────┘
│  admin-api) │                                │
└─────────────┘                                │
                                               │
┌─────────────┐                                │
│   System    │     ┌──────────────┐          │
│  (CPU, RAM, │────▶│ Node Exporter│───────────┘
│   Disk)     │     │  (port 9100) │
└─────────────┘     └──────────────┘
                                               │
                                    ┌──────────▼──────┐
                                    │     Grafana     │
                                    │   (port 3000)   │
                                    └─────────────────┘
```

## Установка на VPS

### Автоматическая установка

```bash
# С локального компьютера
ssh root@77.42.36.198 "bash -s" < scripts/install-monitoring.sh

# Или скопировать скрипт на сервер и запустить
scp scripts/install-monitoring.sh root@77.42.36.198:/root/
ssh root@77.42.36.198 "bash /root/install-monitoring.sh"
```

### Что устанавливается

1. **Node Exporter** (порт 9100) - системные метрики (CPU, память, диск, сеть)
2. **PM2 Exporter** (порт 9615) - метрики PM2 процессов
3. **Prometheus** (порт 9090) - сбор и хранение метрик
4. **Grafana** (порт 3000) - визуализация метрик

### Ручная установка компонентов

Если автоматическая установка не подходит, можно установить компоненты вручную:

#### Node Exporter

```bash
wget https://github.com/prometheus/node_exporter/releases/download/v1.7.0/node_exporter-1.7.0.linux-amd64.tar.gz
tar xzf node_exporter-1.7.0.linux-amd64.tar.gz
cp node_exporter-1.7.0.linux-amd64/node_exporter /usr/local/bin/
useradd --no-create-home --shell /bin/false node_exporter
chown node_exporter:node_exporter /usr/local/bin/node_exporter
```

#### PM2 Exporter

```bash
npm install -g pm2-prometheus-exporter
```

#### Prometheus

```bash
wget https://github.com/prometheus/prometheus/releases/download/v2.48.0/prometheus-2.48.0.linux-amd64.tar.gz
tar xzf prometheus-2.48.0.linux-amd64.tar.gz
cp prometheus-2.48.0.linux-amd64/prometheus /usr/local/bin/
```

#### Grafana

```bash
wget -q -O - https://packages.grafana.com/gpg.key | apt-key add -
echo "deb https://packages.grafana.com/oss/deb stable main" > /etc/apt/sources.list.d/grafana.list
apt-get update
apt-get install grafana
```

## Конфигурация

### Prometheus

Конфигурация находится в `/etc/prometheus/prometheus.yml` на VPS.

Основные настройки:
- **scrape_interval**: 15s - частота сбора метрик
- **Targets**:
  - `localhost:9090` - сам Prometheus
  - `localhost:9615` - PM2 Exporter
  - `localhost:9100` - Node Exporter

Для применения изменений:
```bash
systemctl reload prometheus
```

### Grafana

#### Первый вход

1. Откройте `http://<VPS_IP>:3000`
2. Логин: `admin`
3. Пароль: `admin` (обязательно измените при первом входе!)

#### Настройка источника данных

Prometheus автоматически настраивается через provisioning (`/etc/grafana/provisioning/datasources/prometheus.yml`).

Если нужно добавить вручную:
1. Configuration → Data Sources → Add data source
2. Выберите Prometheus
3. URL: `http://localhost:9090`
4. Save & Test

#### Импорт дашбордов

Дашборд PM2 Overview автоматически импортируется из `/var/lib/grafana/dashboards/pm2-overview.json`.

Для ручного импорта:
1. Dashboards → Import
2. Загрузите JSON файл из `monitoring/grafana/dashboards/`

## Доступ к сервисам

### Локальный доступ (с VPS)

- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3000`
- Node Exporter: `http://localhost:9100/metrics`
- PM2 Exporter: `http://localhost:9615/metrics`

### Удаленный доступ

Для доступа с внешних IP необходимо:

1. **Настроить firewall** (если используется UFW):
```bash
ufw allow 9090/tcp comment 'Prometheus'
ufw allow 3000/tcp comment 'Grafana'
```

2. **Использовать SSH туннель** (рекомендуется для безопасности):
```bash
# Prometheus
ssh -L 9090:localhost:9090 root@77.42.36.198

# Grafana
ssh -L 3000:localhost:3000 root@77.42.36.198
```

Затем откройте в браузере:
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3000`

3. **Или настроить Nginx reverse proxy** (для production):
```nginx
server {
    listen 80;
    server_name grafana.novaciv.space;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Мониторинг PM2 процессов

### Доступные метрики

PM2 Exporter предоставляет следующие метрики:

- `pm2_processes` - количество процессов по статусу
- `pm2_cpu_usage` - использование CPU по процессу
- `pm2_memory_usage` - использование памяти по процессу
- `pm2_restart_count` - количество перезапусков
- `pm2_uptime` - время работы процесса

### Проверка работы PM2 Exporter

```bash
# Проверить статус
systemctl status pm2-exporter

# Посмотреть логи
journalctl -u pm2-exporter -f

# Проверить метрики
curl http://localhost:9615/metrics
```

## Системные метрики

Node Exporter собирает:

- CPU: использование по ядрам, load average
- Memory: общая память, доступная, использованная
- Disk: использование диска, I/O операции
- Network: входящий/исходящий трафик

## Дашборды Grafana

### PM2 Overview

Основной дашборд для мониторинга PM2 процессов включает:

1. **PM2 Process Status** - статус процессов (online/offline)
2. **PM2 CPU Usage** - график использования CPU
3. **PM2 Memory Usage** - график использования памяти
4. **PM2 Restart Count** - количество перезапусков
5. **System CPU Usage** - общее использование CPU системы
6. **System Memory Usage** - общее использование памяти
7. **Disk Usage** - использование диска

## Управление сервисами

### Prometheus

```bash
# Статус
systemctl status prometheus

# Перезапуск
systemctl restart prometheus

# Логи
journalctl -u prometheus -f

# Проверка конфигурации
promtool check config /etc/prometheus/prometheus.yml
```

### Grafana

```bash
# Статус
systemctl status grafana-server

# Перезапуск
systemctl restart grafana-server

# Логи
journalctl -u grafana-server -f
```

### Node Exporter

```bash
# Статус
systemctl status node_exporter

# Перезапуск
systemctl restart node_exporter
```

### PM2 Exporter

```bash
# Статус
systemctl status pm2-exporter

# Перезапуск
systemctl restart pm2-exporter
```

## Обновление конфигураций

После изменений в репозитории:

```bash
# На VPS
cd /root/NovaCiv
git pull

# Скопировать новые конфигурации
cp monitoring/prometheus/prometheus.yml /etc/prometheus/prometheus.yml
cp monitoring/grafana/provisioning/datasources/prometheus.yml /etc/grafana/provisioning/datasources/
cp monitoring/grafana/dashboards/*.json /var/lib/grafana/dashboards/

# Перезагрузить сервисы
systemctl reload prometheus
systemctl restart grafana-server
```

## Troubleshooting

### Prometheus не собирает метрики

1. Проверьте доступность targets:
```bash
curl http://localhost:9615/metrics  # PM2 Exporter
curl http://localhost:9100/metrics  # Node Exporter
```

2. Проверьте конфигурацию:
```bash
promtool check config /etc/prometheus/prometheus.yml
```

3. Проверьте логи:
```bash
journalctl -u prometheus -n 50
```

### Grafana не показывает данные

1. Проверьте подключение к Prometheus:
   - Configuration → Data Sources → Prometheus → Test

2. Проверьте, что Prometheus собирает метрики:
   - Откройте Prometheus UI → Status → Targets

3. Проверьте временной диапазон в дашборде

### PM2 Exporter не работает

1. Убедитесь, что PM2 запущен:
```bash
pm2 status
```

2. Проверьте, что pm2-prometheus-exporter установлен:
```bash
which pm2-prometheus-exporter
```

3. Перезапустите экспортер:
```bash
systemctl restart pm2-exporter
```

## Безопасность

### Рекомендации

1. **Измените пароль Grafana** при первом входе
2. **Используйте SSH туннели** для доступа вместо открытых портов
3. **Настройте Nginx с аутентификацией** для production
4. **Ограничьте доступ к Prometheus** (только для чтения через Grafana)
5. **Регулярно обновляйте** компоненты мониторинга

### Настройка базовой аутентификации в Nginx

```nginx
server {
    listen 80;
    server_name grafana.novaciv.space;

    auth_basic "Grafana Access";
    auth_basic_user_file /etc/nginx/.htpasswd;

    location / {
        proxy_pass http://localhost:3000;
    }
}
```

Создание файла паролей:
```bash
apt-get install apache2-utils
htpasswd -c /etc/nginx/.htpasswd username
```

## Дополнительные ресурсы

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [PM2 Exporter](https://github.com/slashdoom/pm2-prometheus-exporter)
- [Node Exporter](https://github.com/prometheus/node_exporter)
