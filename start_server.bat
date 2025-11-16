@echo off
cd /d %~dp0
echo Запуск локального сервера на http://localhost:8000
python -m http.server
pause
