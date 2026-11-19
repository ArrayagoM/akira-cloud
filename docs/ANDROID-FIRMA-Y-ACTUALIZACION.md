# App de Android: firma fija y actualización automática

La app de Android (`mobile/`) se baja de `akiracloud.lat/descargar` como un archivo `.apk` (no está en Google Play). Para que **se actualice sola** hacen falta dos cosas, y las dos están hechas en el código:

1. **Una clave de firma fija.** Android solo instala una versión nueva encima de la anterior si las dos están firmadas con la misma clave. Hasta ahora cada armado usaba una clave de prueba distinta, por eso había que desinstalar.
2. **Que la app se entere de la versión nueva.** Al abrirse (y al volver a primer plano, como mucho cada 30 minutos) la app consulta `GET /api/mobile/android`. Si hay una versión más nueva muestra un aviso con el botón "Actualizar ahora": baja el archivo y Android pide confirmar la instalación. Los datos y la sesión se mantienen.

**Lo que no se puede:** Android no deja instalar una app en silencio si no viene de Google Play. Siempre aparece la pantalla de confirmación de Android, y la primera vez pide permiso para "instalar apps de esta fuente". Con un toque queda.

## Paso único: crear la clave fija (lo hace el dueño, una sola vez)

1. En una terminal, desde la carpeta del proyecto (cambiá `TU-USUARIO`):

   ```powershell
   node scripts/generar-clave-android.js "C:\Users\TU-USUARIO\Desktop\Akira-clave-android"
   ```

   No necesita Java ni Android Studio. Crea la carpeta con `akira-release.p12` (la clave) y `LEEME-SECRETOS.txt` (los valores para GitHub), y muestra la huella pública del certificado.
2. **Guardá esa carpeta entera en un lugar seguro** (pendrive, gestor de contraseñas). **No la subas a GitHub ni la mandes por mail.** Si se pierde, no se puede actualizar la app instalada: habría que reinstalarla una vez más. El script se niega a pisar una clave existente.
3. En GitHub: repositorio `ArrayagoM/akira-cloud` → Settings → Secrets and variables → Actions → New repository secret. Creá estos cuatro, con los valores de `LEEME-SECRETOS.txt`:
   - `ANDROID_KEY_ALIAS`
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_PASSWORD`
   - `ANDROID_KEYSTORE_B64` (una sola línea larga: copiarla entera)

## Cómo se arma y se publica una versión

1. **Primero el servidor** (`backend-desktop`), porque la app consulta ahí cuál es la última.
2. `git push` y, en GitHub → Actions → "Armar Akira para Android" → Run workflow. Tarda unos 10 a 15 minutos.
3. El armado: sube solo el `versionCode` (número de armado + 100), firma con la clave fija (si están los secretos), verifica que haya una sola firma y que el paquete sea `lat.akiracloud.app`, y deja el `.apk` y un `android-version.json` en la release de nombre fijo **`android-actual`** (además de la pre-release `android-prueba-N` de siempre). No hay que tocar ninguna variable de entorno: la página de descarga y la app toman la última de ahí. Si GitHub no responde, el servidor sigue ofreciendo lo último que supo (hasta un día) o la variable `DESKTOP_ANDROID_URL` de siempre.
4. Probar el `.apk` en un celular antes de avisar a los clientes.

## Qué pasa con las instalaciones que ya existen

Las versiones armadas hasta hoy están firmadas con claves de prueba que no coinciden con la fija. **Una sola vez** esos celulares tienen que desinstalar Akira e instalar la versión nueva desde `akiracloud.lat/descargar` (e iniciar sesión de nuevo). La app, si es una versión nueva pero de prueba, se lo explica con un aviso. **Desde esa versión en adelante se actualiza sola.**

Si todavía no se cargaron los secretos, el armado funciona igual con la clave de prueba de siempre (y marca `firmaEstable: false`): la app avisa que hay una versión nueva pero explica que hay que desinstalar la anterior.

## Archivos

- `.github/workflows/android.yml`: armado, firma, `android-version.json` y release `android-actual`.
- `scripts/generar-clave-android.js`: crea la clave (una vez).
- `backend-desktop/lib/android-ultima.js`, `routes/mobile.routes.js` (`GET /api/mobile/android`), `routes/desktop.routes.js` (la descarga sigue la última).
- `mobile/src/actualizar.js` (decisiones), `mobile/src/AvisoActualizacion.js` (aviso y descarga), `mobile/app.json` (permiso `REQUEST_INSTALL_PACKAGES`).
- Pruebas: `backend-desktop/tests/android-ultima.test.js`, `tests/desktop-mac.test.js`, `mobile/tests/actualizar.test.js`.
