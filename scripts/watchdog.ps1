# ============================================================
#  Akira Cloud — Watchdog 24/7
#  Corre cada 5 minutos via Task Scheduler (como el usuario, no SYSTEM).
#  Verifica que PM2 y el worker estén corriendo.
#  Si detecta un problema, reinicia automáticamente.
# ============================================================

# Buscar el directorio de Akira sin depender de $env:USERPROFILE
# (que cambia si corre como SYSTEM)
$AkiraDir = "C:\Users\jmarr\OneDrive\Desktop\akira-cloud"

# Fallback: buscar en perfiles de usuario conocidos
if (-not (Test-Path $AkiraDir)) {
    $candidates = @(
        "$env:USERPROFILE\OneDrive\Desktop\akira-cloud",
        "C:\Users\juanm\OneDrive\Desktop\akira-cloud",
        "C:\Users\admin\OneDrive\Desktop\akira-cloud"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { $AkiraDir = $c; break }
    }
}

$LogFile   = "$AkiraDir\logs\watchdog.log"
$Timestamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")

# Asegurar que existe la carpeta de logs
if (-not (Test-Path "$AkiraDir\logs")) {
    New-Item -ItemType Directory -Path "$AkiraDir\logs" -Force | Out-Null
}

function Write-Log {
    param([string]$Msg)
    $line = "$Timestamp [Watchdog] $Msg"
    try { Add-Content -Path $LogFile -Value $line -ErrorAction Stop } catch {}
    Write-Host $line
}

# ── Rotar log si supera 2 MB ─────────────────────────────────
if (Test-Path $LogFile) {
    $size = (Get-Item $LogFile).Length
    if ($size -gt 2MB) {
        $backup = "$AkiraDir\logs\watchdog-old.log"
        if (Test-Path $backup) { Remove-Item $backup -Force -ErrorAction SilentlyContinue }
        Rename-Item $LogFile $backup -ErrorAction SilentlyContinue
    }
}

Write-Log "=== Chequeando estado del sistema ==="

# ── 1. Verificar que PM2 existe en PATH ──────────────────────
$pm2Cmd = Get-Command pm2 -ErrorAction SilentlyContinue
if (-not $pm2Cmd) {
    # Intentar rutas comunes de npm global en Windows
    $npmGlobal = @(
        "$env:APPDATA\npm\pm2.cmd",
        "C:\Users\jmarr\AppData\Roaming\npm\pm2.cmd",
        "$env:USERPROFILE\AppData\Roaming\npm\pm2.cmd"
    )
    $pm2Bin = $null
    foreach ($p in $npmGlobal) {
        if (Test-Path $p) { $pm2Bin = $p; break }
    }
    if (-not $pm2Bin) {
        Write-Log "ERROR: pm2 no encontrado. Ejecuta RECUPERAR-AHORA.bat como Admin."
        exit 1
    }
} else {
    $pm2Bin = "pm2"
}

# ── 2. Estado de PM2 ─────────────────────────────────────────
$pm2Output = & $pm2Bin jlist 2>$null
$pm2Status = $null
try { $pm2Status = $pm2Output | ConvertFrom-Json } catch {}

if ($null -eq $pm2Status -or $pm2Status.Count -eq 0) {
    Write-Log "WARN: PM2 daemon caído o sin procesos. Iniciando worker..."
    Set-Location $AkiraDir
    & $pm2Bin start ecosystem.config.js --only worker 2>$null
    & $pm2Bin save --force 2>$null
    Start-Sleep -Seconds 12
    Write-Log "Worker iniciado (PM2 daemon resucitado)."
    exit 0
}

# ── 3. Buscar proceso 'worker' ────────────────────────────────
$workerProc = $pm2Status | Where-Object { $_.name -eq "worker" }

if ($null -eq $workerProc) {
    Write-Log "WARN: proceso 'worker' no en PM2. Iniciando..."
    Set-Location $AkiraDir
    & $pm2Bin start ecosystem.config.js --only worker 2>$null
    & $pm2Bin save --force 2>$null
    Start-Sleep -Seconds 12
    Write-Log "Worker registrado en PM2."
    exit 0
}

# ── 4. Verificar estado ───────────────────────────────────────
$status   = $workerProc.pm2_env.status
$restarts = $workerProc.pm2_env.restart_time
$memBytes = $workerProc.monit.memory
$memory   = if ($memBytes) { [math]::Round($memBytes / 1MB, 1) } else { 0 }

Write-Log "Worker: status=$status  restarts=$restarts  mem=${memory}MB"

if ($status -ne "online") {
    Write-Log "ALERTA: worker '$status'. Reiniciando..."
    & $pm2Bin restart worker 2>$null
    Start-Sleep -Seconds 10
    $newStatus = ((& $pm2Bin jlist 2>$null | ConvertFrom-Json) |
                  Where-Object { $_.name -eq "worker" }).pm2_env.status
    Write-Log "Estado post-restart: $newStatus"
} elseif ($memory -gt 700) {
    Write-Log "ALERTA: memoria ${memory}MB > 700MB. Reiniciando para limpiar..."
    & $pm2Bin restart worker 2>$null
    Start-Sleep -Seconds 10
    Write-Log "Worker reiniciado por memoria."
} else {
    Write-Log "OK: worker corriendo normalmente."
}

# ── 5. Ping al backend ────────────────────────────────────────
$backendUrl = ""
$envFile = "$AkiraDir\worker\.env"
if (Test-Path $envFile) {
    $envLines = Get-Content $envFile -ErrorAction SilentlyContinue
    foreach ($line in $envLines) {
        if ($line -match "^(BACKEND_URL|RENDER_URL|BACKEND)\s*=\s*(.+)") {
            $backendUrl = $Matches[2].Trim().Trim('"')
            break
        }
    }
}

if ($backendUrl -ne "") {
    try {
        $resp = Invoke-WebRequest -Uri "$backendUrl/api/health" -TimeoutSec 20 -UseBasicParsing -ErrorAction Stop
        Write-Log "Backend OK: HTTP $($resp.StatusCode)"
    } catch {
        Write-Log "WARN: Backend no responde ($($_.Exception.Message)) — puede estar despertando (Render free tier)"
    }
}

Write-Log "=== Chequeo completado ==="
