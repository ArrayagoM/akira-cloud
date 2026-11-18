# Operación: cómo se publica una versión (runbook)

Fuentes: `scripts/publicar-version.ps1`, `scripts/blob-upload.js`, `docs/PUBLICAR-EN-MICROSOFT-STORE.md` y `docs/REGISTRO-DE-CAMBIOS.md`.
Producción real: servidor en Vercel (`akira-licencias.vercel.app`, carpeta `backend-desktop/`), MongoDB Atlas, instalador en Vercel Blob, web en Vercel (`frontend/`) y paquete en la Microsoft Store.

## 1. Checklist previo (no se publica nada hasta tenerlo completo)
- [ ] Pruebas verdes: `npm test` en `backend-desktop/` y `backend/`; `node tests/estado.test.js` en `mobile/`; `npm run build` en `frontend/`. El instalador se arma con `npm run release:build` en `desktop/` (corre `npm test` y `release:check`). En GitHub las corre `.github/workflows/tests.yml`: tiene que estar en verde.
- [ ] Todo commiteado y con `git push` (el despliegue sube lo que hay en la carpeta, no lo commiteado: que no haya cambios sueltos).
- [ ] Tag de la versión (propuesta, hoy los tags son de pruebas): `git tag v1.0.36` y `git push origin v1.0.36`.
- [ ] Respaldo de Atlas hecho y guardado fuera de la PC (snapshot desde la consola de Atlas o `mongodump`; no hay script en el repo). Solo el dueño.
- [ ] `ENCRYPTION_KEY` guardada fuera de Vercel (gestor de contraseñas). Cifra las API Keys de los clientes (AES-256-GCM): si se pierde, esos datos no se pueden leer.
- [ ] Ensayo sin tocar la nube: `powershell -ExecutionPolicy Bypass -File scripts\publicar-version.ps1 -DryRun` (imprime los pasos) y después `-SoloVerificar` (hash del instalador y pruebas del servidor).

## 2. Orden y pasos (cada uno con su verificación y su vuelta atrás)
Regla: el servidor va antes que el instalador. Los clientes se actualizan solos desde `latest.yml` (Vercel Blob), que es lo último que sube el script. Por eso el servidor nuevo tiene que seguir funcionando con los clientes viejos.

| Paso | Cómo | Verificación | Vuelta atrás |
|---|---|---|---|
| 1. Servidor | `scripts\publicar-version.ps1` (hace `vercel --prod --yes` en `backend-desktop/`) | El script comprueba que `/api/desktop/latest` responde y corta antes de subir el instalador si no. | `vercel rollback` en `backend-desktop/` (vuelve al despliegue anterior). No revierte las variables guardadas en Vercel: revisar `DESKTOP_VERSION`. |
| 2. Instalador | Lo hace el mismo script con `scripts/blob-upload.js` | El script verifica el sha512 local, que la CDN sirva el archivo nuevo, la copia `AkiraCloud-<versión>.exe` y relee el manifiesto. | Solo hacia adelante: el instalador y la copia por versión no se pisan. Si salió mal, se arma una versión nueva (ej. 1.0.37) y se vuelve a publicar. El actualizador no tiene habilitado bajar de versión (no usa allowDowngrade). |
| 3. Versión en el servidor | El script guarda `DESKTOP_VERSION` y `DESKTOP_SIZE_MB` y vuelve a desplegar solo si cambiaron | Imprime `/api/desktop/latest`: la `version` tiene que ser la publicada (hay caché de 5 minutos). | `vercel rollback`, o repetir el script (es seguro repetirlo). |
| 4. Web | `vercel --prod --yes` (el proyecto Vercel `akira-cloud` apunta a `frontend/`) | Abrir `https://akiracloud.lat` y revisar inicio, descarga y login. | `vercel rollback` del proyecto de la web. |
| 5. Microsoft Store | Armar el `.appx`/`.msix` (workflow "Armar Akira para la Microsoft Store" o `makeappx`) y subirlo en Partner Center → Paquetes (envío nuevo) | Partner Center muestra el envío en certificación y después publicado. Cada versión pasa por revisión. | Desde este repo no hay vuelta atrás: se corrige y se envía una versión nueva (pasa por revisión otra vez). |

Si el script falla a mitad de camino, el mensaje dice en qué paso quedó: si falló el servidor, no se subió nada; si falló la subida, el servidor ya está desplegado y los clientes siguen en la versión anterior.

## 3. Qué SOLO puede hacer el dueño
- `vercel login` (se abre el navegador) y correr `publicar-version.ps1` con esa sesión.
- Respaldo de Atlas y custodia de `ENCRYPTION_KEY`.
- Cuenta de Partner Center (verificación de identidad), reservar el nombre, copiar los 3 datos de "Identidad del producto", cargar las variables `STORE_*` en GitHub y subir cada paquete a Partner Center.
- Dejar en "Notas para la certificación" un usuario de prueba o cómo crearlo, y responder a la certificación (si no, el revisor rechaza la app).

## 4. Después de publicar
- Anotar la versión, la hora y lo verificado en `docs/REGISTRO-DE-CAMBIOS.md`.
- A las 4 horas (los clientes consultan cada 4 h) mirar que la web y `/api/desktop/latest` sigan respondiendo.
