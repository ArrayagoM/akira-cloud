@echo off
:: Akira Worker — Arranque automático en Windows
:: Este script inicia el worker con PM2 al encender la PC

cd /d "%USERPROFILE%\OneDrive\Desktop\akira-cloud"

:: Esperar 30 segundos para que la red esté lista
timeout /t 30 /nobreak > nul

:: Iniciar PM2 con el worker
call pm2 start ecosystem.config.js --only worker

:: Guardar lista de procesos
call pm2 save

echo [Akira] Worker iniciado correctamente.
