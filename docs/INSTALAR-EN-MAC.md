# Akira en Mac — guía para probarla

Es **el mismo programa** que en Windows (bot de WhatsApp con IA, agenda, caja, clientes, catálogo, reportes, etc.).
Esta versión es **de prueba**: todavía no está firmada por Apple, así que macOS muestra un aviso la primera vez.

## Qué archivo bajar
- Mac con chip **M1, M2, M3 o M4** (Apple Silicon): `AkiraCloud-mac-arm64.dmg`
- Mac **Intel** (anteriores a 2020): `AkiraCloud-mac-x64.dmg`
  (Para saber cuál es: menú  → "Acerca de esta Mac" → si dice "Chip: Apple M…" es el primero; si dice "Procesador: Intel", el segundo.)

## Instalar
1. Abrí el `.dmg` y arrastrá **Akira** a la carpeta **Aplicaciones**.
2. La primera vez, **no hagas doble clic**: en Aplicaciones, clic derecho (o Ctrl+clic) sobre **Akira → Abrir → Abrir**.
3. Si macOS dice que "está dañada" o no deja abrirla, en la app **Terminal** pegá esto y apretá Enter (una sola vez):

   ```
   xattr -cr /Applications/Akira.app
   ```

   Y volvé a abrirla con clic derecho → Abrir.
4. Creá tu cuenta o iniciá sesión y seguí los "Primeros pasos" (clave de Groq gratis, datos del negocio, escanear el QR de WhatsApp).

## Cómo funciona en Mac
- Al cerrar la ventana, **Akira sigue funcionando** en segundo plano: queda el ícono en la **barra de menú** (arriba a la derecha). Desde ahí se abre de nuevo o se sale. También se reabre con el ícono del Dock.
- La Mac tiene que estar **prendida y con internet** para que el bot responda (igual que la PC con Windows).
- "Iniciar al encender la Mac" se activa desde el ícono de la barra de menú.
- Las claves (Groq, MercadoPago) se guardan cifradas en el **Llavero** de macOS. Si pide la contraseña del Llavero, es normal.

## Diferencias con Windows (por ahora)
- **No se actualiza sola**: las actualizaciones automáticas de Mac exigen una app firmada por Apple (cuenta de pago, US$99/año). Para actualizar hay que instalar el `.dmg` nuevo.
- Los avisos de la app salen como notificaciones de macOS; la primera vez puede pedir permiso en Ajustes del Sistema → Notificaciones.

## Si algo falla
Mandá a soporte@akiracloud.lat el archivo de registro: `~/Library/Application Support/Akira/logs/akira.log` y el modelo de Mac.
