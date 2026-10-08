# Akira — app móvil (Android + iOS)

> **Estado (oct-2026): esta app nativa NO se publica en tiendas** (decisión del dueño). La app del celular vive dentro de
> la web: `frontend/src/pages/CelularPage.jsx` → `https://akiracloud.lat/celular` (se instala desde el navegador y recibe
> avisos con Web Push). Este código queda como referencia y comparte la lógica de `src/estado.js` con
> `frontend/src/lib/estadoMovil.js` (si cambia una, cambiar la otra).

App de **monitoreo y ajustes mínimos**. El bot, la sesión de WhatsApp y los datos del negocio siguen en la PC.
Desde el celular se puede:

- ver si el bot está atendiendo (o por qué se cayó) y cuándo fue la última señal de la PC;
- ver unos números del negocio (solo si el usuario lo activó en la PC);
- **pausar / reanudar** el bot y activar el **modo vacaciones** (solo si el usuario lo activó en la PC);
- recibir **notificaciones** si el bot se cae o vuelve (WhatsApp no puede avisar de su propia caída).

Hecha con Expo (React Native): un solo código para las dos plataformas.

## Probar la interfaz sin celular

```bash
cd mobile
npm install
EXPO_PUBLIC_API_URL=https://akira-licencias.vercel.app/api npx expo export --platform web
```

Los tests de la lógica (qué se muestra según el estado) corren con Node: `npm test`.

## Armar la app para tu celular (primera vez)

Las notificaciones push **no funcionan en Expo Go**: hace falta una versión propia armada con EAS (en la nube,
sin Mac ni Android Studio).

1. Crear una cuenta gratis en <https://expo.dev>.
2. `cd mobile && npx eas-cli@latest login`
3. `npx eas-cli@latest init` → crea el proyecto y escribe el `projectId` en `app.json` (`extra.eas.projectId`).
4. **Android**: crear un proyecto de Firebase (gratis) y subir la credencial FCM V1 con `npx eas-cli credentials`
   (guía: <https://docs.expo.dev/push-notifications/fcm-credentials/>).
5. Armar el instalador de prueba:
   - Android (APK para instalar directo): `npx eas-cli@latest build --platform android --profile preview`
   - iOS: requiere cuenta de Apple Developer (US$99/año) y registrar el iPhone:
     `npx eas-cli@latest build --platform ios --profile preview`
6. Instalar, iniciar sesión con la misma cuenta que usás en la PC y tocar **Ajustes → Activar notificaciones**.

## Publicar en las tiendas

- Google Play: cuenta de desarrollador (US$25, pago único) → `eas build --platform android --profile production`
  y `eas submit --platform android`.
- App Store: Apple Developer (US$99/año) → `eas build --platform ios --profile production` y `eas submit --platform ios`.
- Ficha de la tienda: política de privacidad `https://akiracloud.lat/privacidad`, soporte `soporte@akiracloud.lat`.
  Textos sugeridos: *“Controlá el bot de WhatsApp de tu negocio desde el celular: mirá si está atendiendo, recibí
  alertas si se cae y pausalo cuando quieras. Necesitás tener Akira instalada en tu PC con Windows.”*

## Íconos

`cd desktop && node_modules/electron/dist/electron.exe ../mobile/scripts/generar-iconos.js` regenera todo `assets/`
con el mismo logo de la interfaz.

## Cómo se comunica

`https://akira-licencias.vercel.app/api` (se puede cambiar con `EXPO_PUBLIC_API_URL`):
`/auth/login`, `/mobile/estado`, `/mobile/comandos`, `/mobile/registrar`, `/auth/alertas`.
La sesión se guarda en el Keychain (iOS) / Keystore (Android).
