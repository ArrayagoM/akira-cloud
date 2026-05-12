# Guía de verificación de OAuth de Google — Akira Cloud

Este archivo contiene **todo el material listo para copy-paste** para
completar la verificación de la app en Google Cloud Console.

> **TL;DR:** Akira solo necesita 3 scopes (no 17). Aplicá los cambios
> de la sección 1, después copiás los textos de la sección 3 y grabás
> el video de la sección 4.

---

## 1) Reducí los scopes en el Consent Screen

En [Google Cloud Console](https://console.cloud.google.com) →
**APIs & Services** → **OAuth consent screen** → **Edit App** →
**Scopes** → **Update**:

**SACÁ TODOS los scopes** y dejá únicamente estos **3**:

| Scope | Tipo | Para qué |
|---|---|---|
| `https://www.googleapis.com/auth/userinfo.email` | No sensible | Saber a qué cuenta de Google está conectado el usuario |
| `https://www.googleapis.com/auth/userinfo.profile` | No sensible | Mostrar nombre y avatar del usuario en el panel |
| `https://www.googleapis.com/auth/calendar.events` | **Sensible** | Crear/ver/borrar turnos en su calendario (NO toca ACLs ni configs) |

**¿Por qué solo estos?** Porque el código ya los pide así (ver
[`backend/routes/config.routes.js`](backend/routes/config.routes.js)).
Pedir 17 scopes que no usás es la causa #1 de rechazo en verificación
— Google asume que los pedís por descuido o malintencionalmente.

> **Importante:** los scopes `.../auth/calendar` (acceso completo),
> `.../auth/calendar.acls`, `.../auth/calendar.calendars`, etc. son
> **innecesarios** para Akira. Si los dejás, vas a tener que
> justificar 17 scopes en lugar de 1.

---

## 2) Decisión de fondo: ¿necesitás verificación?

Akira tiene 1 scope sensible (`calendar.events`). Tenés dos caminos:

### Opción A — Verificar (recomendado para producción)
- Pasás por el proceso de verificación (textos + video).
- Tarda **2-6 semanas** (a veces más).
- Tu app pierde el cartel "Google no verificó esta app — peligroso continuar".
- Podés tener **usuarios ilimitados**.
- Esto es lo que hay que hacer para una app pública seria.

### Opción B — Modo "Testing" sin verificación
- En Consent screen → **Publishing status: Testing**.
- Agregás manualmente hasta **100 usuarios de prueba** (Test users).
- Esos usuarios pueden conectar Google Calendar pero verán el cartel
  feo de "no verificada".
- Tarda **5 minutos**, no 5 semanas.
- Ideal mientras estás validando con primeros clientes.

**Mi recomendación:** empezá con Opción B (testing) para no bloquearte.
Cuando tengas 5-10 clientes pagos consolidados, pasás a Opción A.

---

## 3) Texto para "Justificación de permisos"

Si vas con Opción A, copy-paste estos textos exactos en el campo
"Justificación" de cada scope.

### Scope: `https://www.googleapis.com/auth/userinfo.email`

```
Akira Cloud necesita la dirección de email del usuario para identificar de
forma única la cuenta de Google que conecta con su bot de WhatsApp. El email
se almacena cifrado en nuestra base de datos y se muestra en el panel del
usuario para que sepa qué cuenta de Google está conectada. No se comparte
con terceros, no se usa para marketing ni para ninguna finalidad fuera de
identificar la cuenta conectada.
```

### Scope: `https://www.googleapis.com/auth/userinfo.profile`

```
Akira Cloud usa el nombre y la foto de perfil del usuario para personalizar
el panel de control y los emails de bienvenida. Es información puramente
visual que se muestra al propio usuario en su dashboard. No se comparte con
terceros ni se usa para ninguna otra finalidad.
```

### Scope: `https://www.googleapis.com/auth/calendar.events`

```
Akira Cloud es un asistente de WhatsApp con inteligencia artificial pensado
para pequeños comerciantes argentinos (peluquerías, consultorios médicos,
gimnasios, alquileres turísticos). El bot atiende automáticamente a los
clientes que escriben por WhatsApp Business y agenda turnos en el Google
Calendar del comerciante.

Necesitamos calendar.events específicamente para tres operaciones:

1. LECTURA (events.list): consultar los eventos existentes en un rango de
   fechas para saber qué horarios están libres y ofrecer disponibilidad
   real al cliente que pide turno por WhatsApp.

2. CREACIÓN (events.insert): crear el evento en el calendario cuando el
   cliente confirma el turno (y paga la seña con MercadoPago si está
   configurado). El evento incluye nombre, teléfono y servicio del cliente.

3. CANCELACIÓN/MODIFICACIÓN (events.delete / events.update): cuando un
   cliente cancela o reagenda su turno por WhatsApp, el bot actualiza el
   evento correspondiente en el calendario para liberar el horario.

El acceso es siempre del USUARIO sobre SU PROPIO calendario — el dueño del
negocio conecta su Google Calendar para que Akira maneje los turnos por él.
NO accedemos a calendarios de terceros, NO compartimos datos con terceros,
NO leemos otros eventos no relacionados con turnos del bot.

Elegimos calendar.events (no el scope completo calendar) deliberadamente
para minimizar permisos: NO necesitamos modificar listas de calendarios,
ACLs, configuraciones, colores, ni propiedades del calendario en sí — solo
los eventos que el bot crea.
```

---

## 4) Guión del video de demostración

El video debe ser:
- En **inglés** (Google verifica en inglés).
- Subido a **YouTube como Unlisted** (no público, no privado).
- Entre **2 y 4 minutos**.
- Mostrando: dominio (akiracloud.lat), pantalla de consentimiento, qué
  hace la app con el scope, y cómo el usuario puede revocar acceso.

### Estructura sugerida (con guión literal)

#### [0:00–0:15] Intro
> *Pantalla mostrando https://akiracloud.lat en el navegador.*
>
> "Hi, this is the OAuth verification demo for Akira Cloud, a WhatsApp
> assistant for small businesses in Argentina. The verified domain is
> akiracloud.lat. I'm Juan Martín Arrayago, the developer."

#### [0:15–0:45] Qué hace la app
> *Mostrando la home y la sección "Cómo funciona".*
>
> "Akira Cloud is a SaaS platform that provides a WhatsApp bot with
> artificial intelligence to automate customer service and appointment
> scheduling for small businesses such as hair salons, medical clinics,
> gyms, and short-term rentals. Business owners connect their Google
> Calendar so the bot can read available time slots and create new
> appointments when their clients book through WhatsApp."

#### [0:45–1:15] Por qué necesitamos el scope
> *Mostrando el panel del usuario y la sección de configuración de Google
> Calendar.*
>
> "We request the calendar.events scope to perform three operations only:
> read existing events to check availability, create new events when a
> client confirms an appointment via WhatsApp, and delete or update events
> when a client cancels or reschedules. We do not modify ACLs, calendar
> settings, or access any calendar other than the one the user explicitly
> connects."

#### [1:15–2:15] Demostración del flujo de OAuth
> *Acción real en pantalla:*
>
> 1. Iniciar sesión en akiracloud.lat con una cuenta de prueba.
> 2. Ir a "Configuración" → click en "Conectar Google Calendar".
> 3. Mostrar la pantalla de consentimiento de Google (con los 3 scopes
>    que aparecen).
> 4. Aceptar.
> 5. Mostrar el panel ya conectado: muestra el email conectado
>    (`miemail@gmail.com`).
> 6. Mostrar un evento que el bot crea automáticamente (puede ser un
>    turno simulado o real).
>
> *Voz en off:*
> "The user explicitly grants permission. The app shows clearly which
> scopes are being requested. After granting, Akira can read available
> slots and create appointments on the user's behalf — only on their
> own calendar."

#### [2:15–2:45] Cómo revocar el acceso
> *Acción en pantalla:*
>
> 1. Ir a [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
> 2. Encontrar Akira Cloud en la lista.
> 3. Click "Remove Access".
>
> *Voz en off:*
> "Users can revoke access at any time directly from their Google account
> settings. We also provide a 'Disconnect Calendar' button in our own
> dashboard for convenience. When access is revoked, our system stops
> creating events and the user's tokens are deleted from our database."

#### [2:45–3:00] Cierre + dominios
> *Pantalla con el dominio en la URL bar.*
>
> "All actions happen on akiracloud.lat, our verified domain hosted on
> Vercel, with the backend on akira-cloud.onrender.com. Privacy policy
> and terms of service are available at akiracloud.lat/privacidad and
> akiracloud.lat/terminos. Thanks for reviewing."

### Tips para grabar
- Usá **OBS Studio** o **Loom** (gratis).
- Grabá en **1080p** mínimo.
- Hablá pausado y claro (Google revisores no son nativos).
- Mostrá la URL bar siempre que cambies de página (prueba que es tu
  dominio verificado).
- Si tu inglés no es perfecto, podés grabar el audio aparte y re-grabarlo
  con calma — es totalmente válido.
- **Subí el video como "Unlisted"** en YouTube — no público, no privado.
- Pegá el link de YouTube en el campo "Vínculo del video" del consent
  screen.

---

## 5) Texto para "Información adicional" (campo de 1000 chars)

```
Akira Cloud (https://akiracloud.lat) is a SaaS WhatsApp bot for small
Argentine businesses (hair salons, medical offices, gyms, vacation rentals,
restaurants). The bot handles customer inquiries and appointment scheduling
24/7 with AI (LLaMA 3.3 via Groq).

The Google Calendar integration lets business owners sync their schedule:
when a client books an appointment via WhatsApp, the bot creates the event
in their connected Google Calendar. We only request calendar.events (not
the full calendar scope) and never access calendars other than the one the
user explicitly connects.

Test credentials:
- URL: https://akiracloud.lat
- Sample test user (please create your own using the public registration):
  https://akiracloud.lat/register
- Privacy policy: https://akiracloud.lat/privacidad
- Terms of service: https://akiracloud.lat/terminos

Backend hosted on Render (akira-cloud.onrender.com), frontend on Vercel
(akira-cloud.vercel.app and akiracloud.lat). Built and maintained by Juan
Martín Arrayago (juanmartinarrayago@gmail.com).
```

---

## 6) Checklist final antes de enviar

Antes de clickear "Submit for verification" verificá que:

- [ ] Solo hay 3 scopes en el consent screen (no 17).
- [ ] Las 3 URLs (home, privacy, terms) responden 200 OK con
      `curl -I` y mencionan tu dominio.
- [ ] El logo está subido (cuadrado, fondo no transparente, nítido).
- [ ] Verificaste **akiracloud.lat** en
      [Google Search Console](https://search.google.com/search-console)
      con la **misma cuenta** dueña del proyecto OAuth — Google revisa
      que los dominios autorizados estén bajo tu control.
- [ ] El campo "Justificación" de cada scope tiene el texto de la
      sección 3.
- [ ] El video está en YouTube como Unlisted y el link está pegado.
- [ ] El campo "Información adicional" tiene el texto de la sección 5.
- [ ] Los emails de contacto están todos como
      `juanmartinarrayago@gmail.com` o equivalentes.

## 7) Qué esperar después

- Google responde en **2-21 días hábiles** (promedio: 5-10).
- Si rechazan, te dicen exactamente qué falta. Lo arreglás y re-envías.
- Mientras tanto, **dejá la app en "Testing" con tu lista de Test
  users** — así los usuarios de prueba pueden seguir usando el sistema.
- Una vez aprobado, cambiás Publishing Status a "In production" y
  cualquier usuario puede conectar Google Calendar sin warning.

---

> **¿No querés pasar por todo esto?** Volvé a la **Opción B** de la
> sección 2 (Testing mode con 100 test users). Es la decisión correcta
> mientras estás validando producto. Verificación se hace cuando ya hay
> tracción real.
