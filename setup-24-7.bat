@echo off
:: ============================================================
::  Akira Cloud — Configuracion 24/7
::  Ejecutar UNA SOLA VEZ como Administrador.
::  Hace todo lo necesario para que el worker arranque solo
::  despues de cualquier reinicio de Windows.
:: ============================================================
setlocal

echo.
echo =========================================================
echo   AKIRA CLOUD — Setup 24/7
echo   Ejecutando como: %USERNAME%
echo =========================================================
echo.

:: Verificar que se corre como Administrador
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Este script necesita permisos de Administrador.
    echo     Hace click derecho y elige "Ejecutar como administrador".
    pause
    exit /b 1
)

set "AKIRA_DIR=%USERPROFILE%\OneDrive\Desktop\akira-cloud"
set "SCRIPTS_DIR=%AKIRA_DIR%\scripts"
set "LOG_DIR=%AKIRA_DIR%\logs"

:: Crear carpeta de logs si no existe
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo [1/5] Verificando Node.js y PM2...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo      ERROR: Node.js no encontrado. Instala desde https://nodejs.org
    pause
    exit /b 1
)
where pm2 >nul 2>nul
if %errorlevel% neq 0 (
    echo      PM2 no encontrado. Instalando...
    call npm install -g pm2
)
echo      OK

echo.
echo [2/5] Iniciando el worker con PM2...
cd /d "%AKIRA_DIR%"
call pm2 start ecosystem.config.js --only worker
call pm2 save
echo      OK

echo.
echo [3/5] Registrando PM2 en el inicio de Windows (pm2-startup)...
:: pm2-startup es la forma oficial de que PM2 arranque con Windows
where pm2-startup >nul 2>nul
if %errorlevel% neq 0 (
    call npm install -g pm2-startup
)
call pm2-startup install
echo      OK - PM2 arrancara automaticamente al encender la PC

echo.
echo [4/5] Instalando tarea watchdog en el Programador de Tareas...
:: Registrar watchdog.ps1 para que corra cada 5 minutos
set "TASK_NAME=AkiraWatchdog"
set "PS_SCRIPT=%SCRIPTS_DIR%\watchdog.ps1"

:: Eliminar tarea anterior si existe
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>nul

:: Crear tarea: cada 5 minutos, en cualquier estado de sesion
schtasks /create ^
  /tn "%TASK_NAME%" ^
  /tr "powershell.exe -NonInteractive -ExecutionPolicy Bypass -File \"%PS_SCRIPT%\"" ^
  /sc MINUTE ^
  /mo 5 ^
  /ru SYSTEM ^
  /rl HIGHEST ^
  /f >nul

if %errorlevel% equ 0 (
    echo      OK - Watchdog registrado: cada 5 min como SYSTEM
) else (
    echo      WARN: No se pudo crear la tarea como SYSTEM. Intentando con usuario actual...
    schtasks /create ^
      /tn "%TASK_NAME%" ^
      /tr "powershell.exe -NonInteractive -ExecutionPolicy Bypass -File \"%PS_SCRIPT%\"" ^
      /sc MINUTE ^
      /mo 5 ^
      /ru "%USERNAME%" ^
      /rl HIGHEST ^
      /f >nul
    if %errorlevel% equ 0 (
        echo      OK - Watchdog registrado con usuario %USERNAME%
    ) else (
        echo      ERROR: No se pudo registrar el watchdog. Revisa permisos.
    )
)

echo.
echo [5/5] Configurando Windows para NO dormir mientras el worker corra...
:: Deshabilitar el sleep automatico (pantalla puede apagarse, CPU no)
powercfg /change standby-timeout-ac 0
powercfg /change standby-timeout-dc 0
powercfg /change hibernate-timeout-ac 0
echo      OK - Sleep/hibernacion deshabilitados

echo.
echo =========================================================
echo   SETUP COMPLETADO
echo.
echo   Resumen:
echo   - Worker corriendo con PM2
echo   - PM2 arranca automatico con Windows
echo   - Watchdog chequeando cada 5 min
echo   - PC configurada para no dormir
echo.
echo   Comandos utiles:
echo   - pm2 logs worker         (ver logs en tiempo real)
echo   - pm2 monit               (dashboard PM2)
echo   - pm2 restart worker      (reiniciar manualmente)
echo   - pm2 stop worker         (detener)
echo =========================================================
echo.

:: Ejecutar watchdog una vez ahora para verificar
echo Ejecutando primera verificacion del watchdog...
powershell.exe -NonInteractive -ExecutionPolicy Bypass -File "%PS_SCRIPT%"

echo.
echo Listo! Los bots van a correr 24/7 automaticamente.
pause
