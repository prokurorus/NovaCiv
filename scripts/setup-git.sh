#!/bin/bash
set -euo pipefail

# Скрипт настройки Git для NovaCiv Ops Agent
# Используется если git на сервере не настроен

PROJECT_DIR="/root/NovaCiv"

echo "=== Настройка Git для NovaCiv Ops Agent ==="
echo ""

cd "$PROJECT_DIR" || exit 1

# Проверяем наличие .git
if [ ! -d ".git" ]; then
    echo "❌ .git directory not found"
    echo "   This directory is not a git repository"
    echo "   Please initialize git or clone the repository"
    exit 1
fi

# Настраиваем user.name
if [ -z "$(git config user.name)" ]; then
    echo "Setting git user.name..."
    git config user.name "NovaCiv Ops Agent"
    echo "✅ user.name = NovaCiv Ops Agent"
fi

# Настраиваем user.email
if [ -z "$(git config user.email)" ]; then
    echo "Setting git user.email..."
    git config user.email "ops-agent@novaciv.space"
    echo "✅ user.email = ops-agent@novaciv.space"
fi

# Проверяем remote
if ! git remote get-url origin >/dev/null 2>&1; then
    echo ""
    echo "⚠️  Git remote 'origin' not configured"
    echo "   Please run:"
    echo "   git remote add origin <your-github-repo-url>"
    exit 1
else
    echo "✅ Git remote configured:"
    git remote get-url origin
fi

# Проверяем доступ к GitHub (если есть GITHUB_TOKEN в .env)
if [ -f ".env" ] && grep -q "^GITHUB_TOKEN=" ".env" 2>/dev/null; then
    echo ""
    echo "✅ GITHUB_TOKEN found in .env"
else
    echo ""
    echo "⚠️  GITHUB_TOKEN not found in .env"
    echo "   Please add GITHUB_TOKEN to .env file"
fi

echo ""
echo "=== Git настройка завершена ==="
