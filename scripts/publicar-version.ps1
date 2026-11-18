# Publica la versión del programa que está compilada en desktop\dist. Orden (el servidor SIEMPRE antes que el instalador):
#   0) verificaciones locales: latest.yml, hash del instalador, pruebas del servidor (backend-desktop)
#   1) saca el permiso de subida de Vercel (queda en un archivo temporal que se borra al final)
#   2) despliega el servidor (backend-desktop) y comprueba que responde
#   3) sube el instalador y el manifiesto a Vercel Blob (con verificación del hash); el manifiesto (latest.yml) es lo último
#      que se publica y es lo que hace que los clientes se actualicen: así nunca bajan una versión nueva contra un servidor viejo
#   4) le avisa al servidor cuál es la versión nueva (DESKTOP_VERSION y DESKTOP_SIZE_MB) y lo vuelve a desplegar solo si cambiaron
# Modos que NO tocan la nube (para revisar antes de publicar de verdad):
#   -DryRun        imprime los pasos con los valores reales y revisa que estén los archivos; no corre pruebas, ni vercel, ni node
#   -SoloVerificar corre solo las verificaciones locales (archivos, hash, pruebas del servidor) y no toca la nube
#   -OmitirPruebas no corre las pruebas del servidor (no recomendado)
# Uso (PowerShell, desde cualquier carpeta):  powershell -ExecutionPolicy Bypass -File C:\Users\jmarr\OneDrive\Desktop\akira-cloud\scripts\publicar-version.ps1 [-DryRun | -SoloVerificar]
# Herramienta de subida: scripts\blob-upload.js (del repo); si no está, usa %TEMP%\blobup\up3.js (la copia vieja).
param(
  [switch]$DryRun,
  [switch]$SoloVerificar,
  [switch]$OmitirPruebas
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $repo 'desktop\dist'
$backend = Join-Path $repo 'backend-desktop'
$upRepo = Join-Path $PSScriptRoot 'blob-upload.js'
$upTemp = Join-Path $env:TEMP 'blobup\up3.js'
$blobdir = Join-Path $env:TEMP 'blobup'   # acá viven las dependencias de la herramienta de subida (@vercel/blob)
$tmp = Join-Path $env:TEMP 'akira-env-pull.tmp'
$api = 'https://akira-licencias.vercel.app/api/desktop/latest'
$urlBlob = 'https://75e2pc5qx5jjfp4g.public.blob.vercel-storage.com/'
$soloLocal = $DryRun -or $SoloVerificar

if (Test-Path $upRepo) { $up3 = $upRepo } elseif (Test-Path $upTemp) { $up3 = $upTemp } else { throw "No encuentro la herramienta de subida (ni $upRepo ni $upTemp)." }
$ymlPath = Join-Path $dist 'latest.yml'
$exePath = Join-Path $dist 'AkiraCloud.exe'
if (-not (Test-Path $ymlPath)) { throw "No encuentro $ymlPath (¿se armó el instalador con npm run release:build?)." }
if (-not (Test-Path $exePath)) { throw "No encuentro $exePath (¿se armó el instalador con npm run release:build?)." }
$yml = Get-Content $ymlPath -Raw
$version = [regex]::Match($yml, '(?m)^version:\s*(\S+)').Groups[1].Value
$esperado = [regex]::Match($yml, '(?m)^sha512:\s*(\S+)').Groups[1].Value
if (-not $version -or -not $esperado) { throw 'latest.yml no tiene version o sha512: no se publica nada.' }
$mb = [math]::Round((Get-Item $exePath).Length / 1MB)
Write-Host "Publicando la versión $version ($mb MB)..." -ForegroundColor Green
if ($DryRun) { Write-Host '[DryRun] Modo prueba: se imprimen los pasos y NO se ejecuta nada (ni pruebas, ni vercel, ni node, ni red).' -ForegroundColor Yellow }
elseif ($SoloVerificar) { Write-Host '[SoloVerificar] Se corren solo las verificaciones locales; NO se toca la nube.' -ForegroundColor Yellow }
Write-Host "  Herramienta de subida: $up3"

# --- 0) Verificaciones locales (todas ocurren ANTES de desplegar nada) ---
if ($DryRun) {
  Write-Host '0/5 [DryRun] Se verificaría el hash del instalador contra latest.yml y se correrían las pruebas de backend-desktop (npm test).'
}
else {
  Write-Host '0/5 Verificando el instalador contra latest.yml...'
  $hex = (Get-FileHash -Algorithm SHA512 -LiteralPath $exePath).Hash
  $bytes = New-Object byte[] 64
  for ($i = 0; $i -lt 64; $i++) { $bytes[$i] = [Convert]::ToByte($hex.Substring($i * 2, 2), 16) }
  if ([Convert]::ToBase64String($bytes) -ne $esperado) { throw 'El .exe local NO coincide con latest.yml: no se publica nada.' }
  Write-Host '  OK: el sha512 de AkiraCloud.exe coincide con latest.yml.'
  if ($OmitirPruebas) { Write-Host '  (pruebas del servidor omitidas por -OmitirPruebas)' -ForegroundColor Yellow }
  else {
    Write-Host '  Corriendo las pruebas del servidor (backend-desktop)...'
    $mongoPrevio = $env:MONGO_URI
    Remove-Item Env:MONGO_URI -ErrorAction SilentlyContinue   # que ninguna prueba pueda conectarse a una base real
    Push-Location $backend
    try {
      npm test
      if ($LASTEXITCODE -ne 0) { throw 'Las pruebas del servidor fallaron: no se publica nada.' }
    }
    finally {
      Pop-Location
      if ($null -ne $mongoPrevio) { $env:MONGO_URI = $mongoPrevio }
    }
    Write-Host '  OK: pruebas del servidor.'
  }
  if (-not $soloLocal) {
    # Si esta versión ya tiene su copia propia (AkiraCloud-<versión>.exe) con otro tamaño, la subida cortaría más adelante: mejor enterarse acá, antes de desplegar.
    try { $r = Invoke-WebRequest -Uri "$($urlBlob)AkiraCloud-$version.exe?v=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())" -Method Head -UseBasicParsing } catch { $r = $null }
    if ($r) {
      $largo = [int64]"$($r.Headers['Content-Length'])"
      if ($largo -ne (Get-Item $exePath).Length) { throw "AkiraCloud-$version.exe YA está publicado con otro contenido (la Store verifica ese hash y no se puede sobrescribir). Subí una versión nueva." }
    }
  }
}

if ($soloLocal) {
  Write-Host ''
  Write-Host 'Pasos que se harían en una publicación real (en este orden):' -ForegroundColor Cyan
  Write-Host '  1/5 vercel whoami + vercel env pull (permiso de subida, archivo temporal que se borra)'
  Write-Host '  2/5 vercel --prod --yes en backend-desktop (servidor nuevo) y comprobar que /api/desktop/latest responde'
  Write-Host "  3/5 node $up3 $dist (sube AkiraCloud.exe, espera a la CDN, copia por versión y al final latest.yml)"
  Write-Host "  4/5 DESKTOP_VERSION=$version y DESKTOP_SIZE_MB=$mb (solo si cambiaron) y nuevo vercel --prod --yes"
  Write-Host "  5/5 verificar que $api devuelva la versión $version"
  Write-Host 'Listo: no se tocó la nube.' -ForegroundColor Green
  return
}

Push-Location $backend
$nodePathPrevio = $env:NODE_PATH
try {
  Write-Host '1/5 Sacando el permiso de subida (queda en un archivo temporal que se borra al final)...'
  vercel whoami | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Vercel no tiene la sesión iniciada en esta terminal. Corré primero:  vercel login   (se abre el navegador) y después volvé a correr este script.' }
  vercel env pull $tmp --environment=production --yes | Out-Null
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $tmp)) { throw 'No se pudo leer la configuración de Vercel.' }
  $envProd = Get-Content $tmp
  $tok = ($envProd | Where-Object { $_ -match '^BLOB_READ_WRITE_TOKEN=' }) -replace '^BLOB_READ_WRITE_TOKEN=', '' -replace '"', ''
  if (-not $tok) { throw 'No encontré BLOB_READ_WRITE_TOKEN.' }
  $verActual = (($envProd | Where-Object { $_ -match '^DESKTOP_VERSION=' } | Select-Object -First 1) -replace '^DESKTOP_VERSION=', '' -replace '"', '')
  $mbActual = (($envProd | Where-Object { $_ -match '^DESKTOP_SIZE_MB=' } | Select-Object -First 1) -replace '^DESKTOP_SIZE_MB=', '' -replace '"', '')

  if (-not (Test-Path (Join-Path $blobdir 'node_modules\@vercel\blob\package.json'))) {
    Write-Host '  Instalando la herramienta de subida...'
    if (-not (Test-Path $blobdir)) { New-Item -ItemType Directory -Path $blobdir | Out-Null }
    if (-not (Test-Path (Join-Path $blobdir 'package.json'))) { '{"name":"blobup","version":"1.0.0","private":true,"dependencies":{"@vercel/blob":"^2.8.2"}}' | Set-Content -Path (Join-Path $blobdir 'package.json') -Encoding Ascii }
    Push-Location $blobdir; npm install --no-audit --no-fund | Out-Null; Pop-Location
  }

  Write-Host '2/5 Desplegando el servidor (todavía no se sube el instalador)...'
  vercel --prod --yes
  if ($LASTEXITCODE -ne 0) { throw 'El despliegue del servidor falló. NO se subió el instalador: los clientes siguen en la versión anterior. Para volver el servidor atrás:  vercel rollback' }
  try { $resp = Invoke-RestMethod $api } catch { $resp = $null }
  if (-not $resp) { throw "El servidor nuevo no responde en $api. NO se subió el instalador. Para volver atrás:  vercel rollback" }
  Write-Host '  OK: el servidor nuevo responde.'

  Write-Host '3/5 Subiendo el instalador y verificando (tarda unos 5 minutos, no cierres la ventana)...'
  $env:TOK = $tok
  $env:NODE_PATH = Join-Path $blobdir 'node_modules'
  node $up3 $dist
  if ($LASTEXITCODE -ne 0) { throw "La subida falló (código $LASTEXITCODE). El servidor YA está desplegado (es compatible con los clientes anteriores) y NO se avisó la versión nueva. Se puede repetir el script." }
  Remove-Item Env:TOK -ErrorAction SilentlyContinue

  if ($verActual -eq $version -and $mbActual -eq "$mb") {
    Write-Host "4/5 DESKTOP_VERSION ($version) y DESKTOP_SIZE_MB ($mb) ya estaban al día: no hace falta volver a desplegar."
  }
  else {
    Write-Host '4/5 Avisando al servidor cuál es la versión nueva...'
    vercel env rm DESKTOP_VERSION production --yes | Out-Null
    vercel env add DESKTOP_VERSION production --value $version --yes | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo guardar DESKTOP_VERSION. El instalador YA está publicado; falta avisarle la versión al servidor (repetí el script).' }
    vercel env rm DESKTOP_SIZE_MB production --yes | Out-Null
    vercel env add DESKTOP_SIZE_MB production --value "$mb" --yes | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo guardar DESKTOP_SIZE_MB. El instalador YA está publicado; falta avisarle el tamaño al servidor (repetí el script).' }
    Write-Host '  Desplegando el servidor con la versión nueva...'
    vercel --prod --yes
    if ($LASTEXITCODE -ne 0) { throw 'El segundo despliegue falló. El instalador YA está publicado y el servidor anterior sigue funcionando; solo muestra la versión vieja en la web. Repetí el script o corré  vercel --prod --yes  en backend-desktop.' }
  }
}
finally {
  Remove-Item $tmp -ErrorAction SilentlyContinue
  Remove-Item Env:TOK -ErrorAction SilentlyContinue
  $env:NODE_PATH = $nodePathPrevio
  Pop-Location
}

Write-Host '5/5 Verificando lo publicado...' -ForegroundColor Green
$final = Invoke-RestMethod $api
$final | ConvertTo-Json
if ($final.version -ne $version) { Write-Warning "El servidor informa la versión '$($final.version)' y se publicó la $version (puede ser la caché de 5 minutos de /api/desktop/latest: volvé a mirar en un rato)." }
Write-Host "Listo: la versión $version quedó publicada. Los clientes se actualizan solos." -ForegroundColor Green
