# Publica la versión del programa que está compilada en desktop\dist:
#   1) sube el instalador y el manifiesto a Vercel Blob (con verificación del hash)
#   2) le avisa al servidor cuál es la versión nueva (DESKTOP_VERSION y DESKTOP_SIZE_MB)
#   3) despliega el servidor (backend-desktop)
# Uso (PowerShell, desde cualquier carpeta):  powershell -ExecutionPolicy Bypass -File C:\Users\jmarr\OneDrive\Desktop\akira-cloud\scripts\publicar-version.ps1
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $repo 'desktop\dist'
$backend = Join-Path $repo 'backend-desktop'
$up3 = Join-Path $env:TEMP 'blobup\up3.js'
$tmp = Join-Path $env:TEMP 'akira-env-pull.tmp'

if (-not (Test-Path $up3)) { throw "No encuentro $up3 (la herramienta de subida)." }
$yml = Get-Content (Join-Path $dist 'latest.yml') -Raw
$version = [regex]::Match($yml, '(?m)^version:\s*(\S+)').Groups[1].Value
$mb = [math]::Round((Get-Item (Join-Path $dist 'AkiraCloud.exe')).Length / 1MB)
Write-Host "Publicando la versión $version ($mb MB)..." -ForegroundColor Green

Push-Location $backend
try {
  Write-Host '1/4 Sacando el permiso de subida (queda en un archivo temporal que se borra al final)...'
  vercel whoami | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Vercel no tiene la sesión iniciada en esta terminal. Corré primero:  vercel login   (se abre el navegador) y después volvé a correr este script.' }
  vercel env pull $tmp --environment=production --yes | Out-Null
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $tmp)) { throw 'No se pudo leer la configuración de Vercel.' }
  $tok = ((Get-Content $tmp) | Where-Object { $_ -match '^BLOB_READ_WRITE_TOKEN=' }) -replace '^BLOB_READ_WRITE_TOKEN=', '' -replace '"', ''
  if (-not $tok) { throw 'No encontré BLOB_READ_WRITE_TOKEN.' }

  Write-Host '2/4 Subiendo el instalador y verificando (tarda unos 5 minutos, no cierres la ventana)...'
  $env:TOK = $tok
  node $up3 $dist
  if ($LASTEXITCODE -ne 0) { throw "La subida falló (código $LASTEXITCODE). NO se avisó al servidor." }
  Remove-Item Env:TOK -ErrorAction SilentlyContinue

  Write-Host '3/4 Avisando al servidor cuál es la versión nueva...'
  vercel env rm DESKTOP_VERSION production --yes | Out-Null
  vercel env add DESKTOP_VERSION production --value $version --yes | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo guardar DESKTOP_VERSION.' }
  vercel env rm DESKTOP_SIZE_MB production --yes | Out-Null
  vercel env add DESKTOP_SIZE_MB production --value "$mb" --yes | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo guardar DESKTOP_SIZE_MB.' }

  Write-Host '4/4 Desplegando el servidor...'
  vercel --prod --yes
}
finally {
  Remove-Item $tmp -ErrorAction SilentlyContinue
  Remove-Item Env:TOK -ErrorAction SilentlyContinue
  Pop-Location
}

Write-Host 'Verificando lo publicado...' -ForegroundColor Green
(Invoke-RestMethod 'https://akira-licencias.vercel.app/api/desktop/latest') | ConvertTo-Json
Write-Host "Listo: la versión $version quedó publicada. Los clientes se actualizan solos." -ForegroundColor Green
