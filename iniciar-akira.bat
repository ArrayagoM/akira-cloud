@echo off
:: ══════════════════════════════════════════════════════════════
::  Akira Cloud — Arranque automático
::  Doble click para iniciar, o agregar al Task Scheduler.
:: ══════════════════════════════════════════════════════════════

echo ═══════════════════════════════════════
echo   AKIRA CLOUD — Iniciando servicios
echo ═══════════════════════════════════════

:: Verificar que MongoDB esté corriendo
echo [1/3] Verificando MongoDB...
sc query MongoDB | find "RUNNING" >nul
if %errorlevel% neq 0 (
    echo      MongoDB no esta corriendo. Intentando iniciar...
    net start MongoDB
    timeout /t 3 /nobreak >nul
)
echo      OK - MongoDB corriendo

:: Crear carpeta de logs si no existe
if not exist "%~dp0logs" mkdir "%~dp0logs"

:: Verificar PM2
echo [2/3] Verificando PM2...
where pm2 >nul 2>nul
if %errorlevel% neq 0 (
    echo      PM2 no encontrado. Instalando...
    npm install -g pm2
    npm install -g pm2-windows-startup
)
echo      OK - PM2 disponible

:: Arrancar worker con PM2
echo [3/3] Arrancando worker...
cd /d "%~dp0"
pm2 start ecosystem.config.js
pm2 save

echo.
echo ═══════════════════════════════════════
echo   AKIRA CLOUD — Todo corriendo!
echo   - pm2 logs worker   (ver logs)
echo   - pm2 monit          (dashboard)
echo   - pm2 stop worker    (detener)
echo ═══════════════════════════════════════
echo.
pause
