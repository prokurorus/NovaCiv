#!/bin/bash
# scripts/install-monitoring.sh
#
# Installation script for Prometheus and Grafana on VPS
# Run this script on the VPS server (root@77.42.36.198)
#
# Usage:
#   ssh root@77.42.36.198 "bash -s" < scripts/install-monitoring.sh
#   OR
#   Copy this script to VPS and run: bash install-monitoring.sh

set -euo pipefail

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  NovaCiv Monitoring Setup (Prometheus + Grafana)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}❌ Please run as root${NC}"
    exit 1
fi

# Update system
echo "1️⃣  Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

# Install required packages
echo ""
echo "2️⃣  Installing required packages..."
apt-get install -y -qq curl wget gnupg2 software-properties-common apt-transport-https

# ============================================
# Install Node Exporter
# ============================================
echo ""
echo "3️⃣  Installing Node Exporter..."
NODE_EXPORTER_VERSION="1.7.0"
NODE_EXPORTER_USER="node_exporter"

if ! id "$NODE_EXPORTER_USER" &>/dev/null; then
    useradd --no-create-home --shell /bin/false "$NODE_EXPORTER_USER"
fi

if [ ! -f "/usr/local/bin/node_exporter" ]; then
    wget -q "https://github.com/prometheus/node_exporter/releases/download/v${NODE_EXPORTER_VERSION}/node_exporter-${NODE_EXPORTER_VERSION}.linux-amd64.tar.gz"
    tar xzf "node_exporter-${NODE_EXPORTER_VERSION}.linux-amd64.tar.gz"
    cp "node_exporter-${NODE_EXPORTER_VERSION}.linux-amd64/node_exporter" /usr/local/bin/
    chown "$NODE_EXPORTER_USER:$NODE_EXPORTER_USER" /usr/local/bin/node_exporter
    rm -rf "node_exporter-${NODE_EXPORTER_VERSION}.linux-amd64"*
fi

# Create systemd service for Node Exporter
cat > /etc/systemd/system/node_exporter.service <<EOF
[Unit]
Description=Node Exporter
After=network.target

[Service]
User=$NODE_EXPORTER_USER
Group=$NODE_EXPORTER_USER
Type=simple
ExecStart=/usr/local/bin/node_exporter
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable node_exporter
systemctl restart node_exporter

echo -e "${GREEN}✅ Node Exporter installed and running on port 9100${NC}"

# ============================================
# Install PM2 Exporter
# ============================================
echo ""
echo "4️⃣  Installing PM2 Exporter..."

if ! command -v pm2 &> /dev/null; then
    echo -e "${RED}❌ PM2 is not installed. Please install PM2 first.${NC}"
    exit 1
fi

# Install pm2-prometheus-exporter via npm
if [ ! -f "/usr/local/bin/pm2-prometheus-exporter" ]; then
    npm install -g pm2-prometheus-exporter
fi

# Create systemd service for PM2 Exporter
cat > /etc/systemd/system/pm2-exporter.service <<EOF
[Unit]
Description=PM2 Prometheus Exporter
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/bin/pm2-prometheus-exporter
Restart=always
RestartSec=5
Environment="PM2_PROMETHEUS_PORT=9615"

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable pm2-exporter
systemctl restart pm2-exporter

echo -e "${GREEN}✅ PM2 Exporter installed and running on port 9615${NC}"

# ============================================
# Install Prometheus
# ============================================
echo ""
echo "5️⃣  Installing Prometheus..."

PROMETHEUS_VERSION="2.48.0"
PROMETHEUS_USER="prometheus"
PROMETHEUS_DIR="/etc/prometheus"
PROMETHEUS_DATA_DIR="/var/lib/prometheus"

if ! id "$PROMETHEUS_USER" &>/dev/null; then
    useradd --no-create-home --shell /bin/false "$PROMETHEUS_USER"
fi

if [ ! -f "/usr/local/bin/prometheus" ]; then
    wget -q "https://github.com/prometheus/prometheus/releases/download/v${PROMETHEUS_VERSION}/prometheus-${PROMETHEUS_VERSION}.linux-amd64.tar.gz"
    tar xzf "prometheus-${PROMETHEUS_VERSION}.linux-amd64.tar.gz"
    cp "prometheus-${PROMETHEUS_VERSION}.linux-amd64/prometheus" /usr/local/bin/
    cp "prometheus-${PROMETHEUS_VERSION}.linux-amd64/promtool" /usr/local/bin/
    chown "$PROMETHEUS_USER:$PROMETHEUS_USER" /usr/local/bin/prometheus
    chown "$PROMETHEUS_USER:$PROMETHEUS_USER" /usr/local/bin/promtool
    rm -rf "prometheus-${PROMETHEUS_VERSION}.linux-amd64"*
fi

# Create directories
mkdir -p "$PROMETHEUS_DIR"
mkdir -p "$PROMETHEUS_DATA_DIR"
chown -R "$PROMETHEUS_USER:$PROMETHEUS_USER" "$PROMETHEUS_DIR"
chown -R "$PROMETHEUS_USER:$PROMETHEUS_USER" "$PROMETHEUS_DATA_DIR"

# Copy Prometheus config (if exists in project)
if [ -f "/root/NovaCiv/monitoring/prometheus/prometheus.yml" ]; then
    cp /root/NovaCiv/monitoring/prometheus/prometheus.yml "$PROMETHEUS_DIR/prometheus.yml"
    chown "$PROMETHEUS_USER:$PROMETHEUS_USER" "$PROMETHEUS_DIR/prometheus.yml"
else
    echo -e "${YELLOW}⚠️  Prometheus config not found. Creating default config...${NC}"
    # Create default config
    cat > "$PROMETHEUS_DIR/prometheus.yml" <<'PROMCONF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
  - job_name: 'pm2'
    static_configs:
      - targets: ['localhost:9615']
  - job_name: 'node'
    static_configs:
      - targets: ['localhost:9100']
PROMCONF
    chown "$PROMETHEUS_USER:$PROMETHEUS_USER" "$PROMETHEUS_DIR/prometheus.yml"
fi

# Create systemd service for Prometheus
cat > /etc/systemd/system/prometheus.service <<EOF
[Unit]
Description=Prometheus
After=network.target

[Service]
User=$PROMETHEUS_USER
Group=$PROMETHEUS_USER
Type=simple
ExecStart=/usr/local/bin/prometheus \\
    --config.file=$PROMETHEUS_DIR/prometheus.yml \\
    --storage.tsdb.path=$PROMETHEUS_DATA_DIR \\
    --web.console.templates=/etc/prometheus/consoles \\
    --web.console.libraries=/etc/prometheus/console_libraries \\
    --web.listen-address=0.0.0.0:9090 \\
    --web.enable-lifecycle
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable prometheus
systemctl restart prometheus

echo -e "${GREEN}✅ Prometheus installed and running on port 9090${NC}"

# ============================================
# Install Grafana
# ============================================
echo ""
echo "6️⃣  Installing Grafana..."

if [ ! -f "/usr/share/grafana/bin/grafana-server" ]; then
    # Add Grafana repository
    wget -q -O - https://packages.grafana.com/gpg.key | apt-key add -
    echo "deb https://packages.grafana.com/oss/deb stable main" > /etc/apt/sources.list.d/grafana.list
    
    apt-get update -qq
    apt-get install -y -qq grafana
fi

# Create Grafana provisioning directories
mkdir -p /etc/grafana/provisioning/datasources
mkdir -p /etc/grafana/provisioning/dashboards
mkdir -p /var/lib/grafana/dashboards

# Copy Grafana configs (if exists in project)
if [ -f "/root/NovaCiv/monitoring/grafana/provisioning/datasources/prometheus.yml" ]; then
    cp /root/NovaCiv/monitoring/grafana/provisioning/datasources/prometheus.yml \
       /etc/grafana/provisioning/datasources/prometheus.yml
    chown -R grafana:grafana /etc/grafana/provisioning
fi

if [ -f "/root/NovaCiv/monitoring/grafana/provisioning/dashboards/dashboard.yml" ]; then
    cp /root/NovaCiv/monitoring/grafana/provisioning/dashboards/dashboard.yml \
       /etc/grafana/provisioning/dashboards/dashboard.yml
    chown -R grafana:grafana /etc/grafana/provisioning
fi

# Copy dashboard JSON files
if [ -d "/root/NovaCiv/monitoring/grafana/dashboards" ]; then
    cp /root/NovaCiv/monitoring/grafana/dashboards/*.json /var/lib/grafana/dashboards/ 2>/dev/null || true
    chown -R grafana:grafana /var/lib/grafana/dashboards
fi

# Configure Grafana to listen on all interfaces
sed -i 's/;http_addr = localhost/http_addr = 0.0.0.0/' /etc/grafana/grafana.ini || true

systemctl daemon-reload
systemctl enable grafana-server
systemctl restart grafana-server

echo -e "${GREEN}✅ Grafana installed and running on port 3000${NC}"

# ============================================
# Configure Firewall (if ufw is installed)
# ============================================
echo ""
echo "7️⃣  Configuring firewall..."

if command -v ufw &> /dev/null; then
    ufw allow 9090/tcp comment 'Prometheus'
    ufw allow 3000/tcp comment 'Grafana'
    echo -e "${GREEN}✅ Firewall rules added${NC}"
else
    echo -e "${YELLOW}⚠️  UFW not found. Please manually open ports 9090 (Prometheus) and 3000 (Grafana)${NC}"
fi

# ============================================
# Summary
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ Monitoring setup complete!${NC}"
echo ""
echo "Services installed:"
echo "  • Prometheus: http://$(hostname -I | awk '{print $1}'):9090"
echo "  • Grafana:    http://$(hostname -I | awk '{print $1}'):3000"
echo "  • Node Exporter: http://$(hostname -I | awk '{print $1}'):9100"
echo "  • PM2 Exporter:  http://$(hostname -I | awk '{print $1}'):9615"
echo ""
echo "Default Grafana credentials:"
echo "  Username: admin"
echo "  Password: admin (change on first login!)"
echo ""
echo "Next steps:"
echo "  1. Access Grafana and change default password"
echo "  2. Import dashboards from /var/lib/grafana/dashboards/"
echo "  3. Configure alerts if needed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
