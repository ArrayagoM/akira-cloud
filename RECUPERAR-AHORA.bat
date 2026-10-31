@echo off
:: ============================================================
::  AKIRA CLOUD — Recuperacion de emergencia
::  Reinicia el worker YA y reinstala auto-start 24/7.
::  Ejecutar como Administrador (click derecho → "Ejecutar como administrador")
:: ============================================================
setlocal EnableDelayedExpansion

echo.
echo  =====================================================
echo    AKIRA CLOUD — Recuperacion de Emergencia
echo  =====================================================
echo.

:: ── Verificar Admin ──────────────────────────────────────
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] Necesita permisos de Administrador.
    echo      Click derecho en este archivo, luego "Ejecutar como administrador".
    pause
    exit /b 1
)

set "AKIRA_DIR=C:\Users\jmarr\OneDrive\Desktop\akira-cloud"
set "SCRIPTS_DIR=%AKIRA_DIR%\scripts"
set "LOG_DIR=%AKIRA_DIR%\logs"
set "ACTUAL_USER=jmarr"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

:: ── PASO 1: Verificar Node y PM2 ──────────────────────────
echo  [1/6] Verificando Node.js y PM2...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  ERROR: Node.js no encontrado. Instalar desde https://nodejs.org
    pause & exit /b 1
)
where pm2 >nul 2>nul
if %errorlevel% neq 0 (
    echo  PM2 no instalado. Instalando globalmente...
    call npm install -g pm2
)

for /f "delims=" %%i in ('where pm2 2^>nul') do set "PM2_EXE=%%i"
echo  PM2: %PM2_EXE%
echo.

:: ── PASO 2: Matar daemon viejo para arranque limpio ──────
echo  [2/6] Reinicio limpio de PM2 daemon...
pm2 kill >nul 2>nul
timeout /t 2 /nobreak >nul

:: ── PASO 3: Arrancar el worker ────────────────────────────
echo  [3/6] Iniciando worker...
cd /d "%AKIRA_DIR%"
pm2 start ecosystem.config.js --only worker
pm2 save --force
echo.

:: ── PASO 4: Auto-start al encender Windows ────────────────
echo  [4/6] Configurando inicio automatico con Windows...

:: Metodo A: pm2-startup (lo instala como tarea del usuario)
where pm2-startup >nul 2>nul
if %errorlevel% neq 0 (
    echo  Instalando pm2-startup...
    call npm install -g pm2-startup
)
pm2-startup install >nul 2>nul
echo  pm2-startup configurado.

:: Metodo B (respaldo): tarea ONLOGON para el usuario jmarr
set "TASK_BOOT=AkiraBootWorker"
schtasks /delete /tn "%TASK_BOOT%" /f >nul 2>nul
schtasks /create /tn "%TASK_BOOT%" ^
  /tr "\"%PM2_EXE%\" resurrect" ^
  /sc ONLOGON ^
  /ru "%ACTUAL_USER%" ^
  /rl HIGHEST ^
  /delay 0000:30 ^
  /f >nul 2>nul
if %errorlevel% equ 0 (
    echo  OK: Tarea de login creada ^(PM2 resurrecta al entrar a Windows^)
) else (
    echo  WARN: Tarea ONLOGON fallida. pm2-startup ya cubre esto.
)
echo.

:: ── PASO 5: Reinstalar watchdog ───────────────────────────
echo  [5/6] Instalando watchdog ^(cada 5 min^)...
set "TASK_WD=AkiraWatchdog"
set "PS_SCRIPT=%SCRIPTS_DIR%\watchdog.ps1"

if not exist "%PS_SCRIPT%" (
    echo  WARN: %PS_SCRIPT% no encontrado. Saltando watchdog.
    goto :skip_watchdog
)

schtasks /delete /tn "%TASK_WD%" /f >nul 2>nul

:: IMPORTANTE: correr como el usuario (jmarr), no SYSTEM.
:: PM2 corre en la sesion del usuario — SYSTEM no puede verlo.
:: /it = solo cuando el usuario esta logueado (interactive)
schtasks /create /tn "%TASK_WD%" ^
  /tr "powershell.exe -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File \"%PS_SCRIPT%\"" ^
  /sc MINUTE /mo 5 ^
  /ru "%ACTUAL_USER%" ^
  /rl HIGHEST ^
  /it ^
  /f >nul 2>nul

if %errorlevel% equ 0 (
    echo  OK: Watchdog cada 5 min como usuario %ACTUAL_USER%
) else (
    echo  WARN: Watchdog no instalado. El worker seguira corriendo, solo no habra auto-recuperacion.
    echo        Intentalo de nuevo como Admin.
)

:skip_watchdog
echo.

:: ── PASO 6: No suspender la PC ───────────────────────────
echo  [6/6] Deshabilitando suspension/hibernacion...
powercfg /change standby-timeout-ac 0 >nul 2>nul
powercfg /change hibernate-timeout-ac 0 >nul 2>nul
powercfg /change standby-timeout-dc 0 >nul 2>nul
echo  OK
echo.

:: ── Estado final ──────────────────────────────────────────
echo  =====================================================
echo    ESTADO FINAL DE PM2
echo  =====================================================
pm2 status
echo.
echo  =====================================================
echo.
echo  Si ves "online" arriba: BOTS CORRIENDO OK.
echo.
echo  Si ves "errored": abre PowerShell y corre:
echo     pm2 logs worker --lines 30
echo  para ver el error exacto.
echo.
echo  Comandos utiles (abrir PowerShell):
echo     pm2 logs worker       logs en tiempo real
echo     pm2 restart worker    reiniciar
echo     pm2 monit             dashboard grafico
echo  =====================================================
echo.

:: Correr watchdog una vez ahora para verificar
if exist "%PS_SCRIPT%" (
    echo  Ejecutando primera verificacion del watchdog...
    powershell.exe -NonInteractive -ExecutionPolicy Bypass -File "%PS_SCRIPT%"
    echo.
)

pause
