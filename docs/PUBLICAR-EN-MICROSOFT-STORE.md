# Publicar Akira en la Microsoft Store (firma gratis)

Si Akira se publica como paquete MSIX en la Microsoft Store, **Microsoft lo firma por nosotros**: no hace falta comprar ningún certificado y los usuarios no ven el aviso "Windows protegió su PC". Desde septiembre de 2025 la cuenta de desarrollador también es gratis.

El paquete ya se arma solo en GitHub (`.github/workflows/windows-store.yml`). Lo único que falta son pasos que solo puede hacer el dueño, porque piden documento de identidad y datos de la actividad.

## Parte 1 — Abrir la cuenta (la hace el dueño, ~20 minutos + verificación)

1. Entrar a **https://storedeveloper.microsoft.com** (es la única entrada que no cobra) y elegir **Company account**.
   - Se elige "empresa" y no "individual" porque Akira se vende: Microsoft reserva la cuenta individual para uso sin fines comerciales.
2. Iniciar sesión con una cuenta de Microsoft personal.
3. Verificar la actividad: subir un documento oficial (por ejemplo la constancia de monotributo/CUIT de ARCA) o un número DUNS si se tiene.
4. Usar un email con el dominio propio (`soporte@akiracloud.lat`); Gmail no se acepta para verificar la empresa.
5. Esperar la verificación (automática, o 2 a 5 días hábiles si la revisan a mano).

## Parte 2 — Reservar el nombre y copiar 3 datos

1. En Partner Center → **Apps y juegos** → **Nueva app de MSIX o PWA**. Reservar el nombre **Akira** (si está tomado, "Akira Cloud").
2. Entrar a esa app → **Administración de productos** → **Identidad del producto** y copiar:
   - `Package/Identity/Name`  → va en la variable `STORE_IDENTITY_NAME`
   - `Package/Identity/Publisher` (empieza con `CN=`) → `STORE_PUBLISHER`
   - `Package/Properties/PublisherDisplayName` → `STORE_PUBLISHER_DISPLAY_NAME`
3. En GitHub: repositorio → **Settings → Secrets and variables → Actions → pestaña Variables** → crear esas tres variables.

## Parte 3 — Armar el paquete

En GitHub → **Actions → "Armar Akira para la Microsoft Store" → Run workflow**. Al terminar (unos 10 minutos), bajar el `.appx` desde **Artifacts**.

## Parte 4 — Enviar a revisión

En Partner Center, crear el envío y subir el `.appx`. Datos que piden:

| Campo | Qué poner |
|---|---|
| Política de privacidad | `https://akiracloud.lat/privacidad` |
| Sitio web / soporte | `https://akiracloud.lat` · `soporte@akiracloud.lat` |
| Categoría | Negocios (Business) |
| Clasificación por edad | Responder el cuestionario: sin violencia ni contenido adulto; sí hay comunicación entre usuarios (mensajes de WhatsApp) |
| Descripción | Tomar la frase de la guía: «Akira atiende el WhatsApp de tu negocio por vos: contesta las consultas, da turnos y cobra la seña. Además te ordena la caja, los clientes y el stock.» |
| Capturas | Mínimo 1 de 1366×768 (Inicio, Agenda, Caja) |
| Capacidad restringida `runFullTrust` | Es obligatoria en apps de escritorio. Justificación: «La app corre un servidor local y una base de datos en la PC del negocio y se conecta a WhatsApp Web; necesita acceso completo al sistema de archivos del usuario y a la red.» |
| Precio | **Gratis** (la suscripción se cobra aparte, en la web) |

**Aviso importante para la revisión:** la app necesita una licencia (prueba gratis de 7 días). En "Notas para la certificación" dejar un usuario de prueba o explicar cómo crear la cuenta; si no, el revisor no puede entrar y la rechaza.

## Cosas que cambian en la versión de la Store

- **Actualizaciones:** las hace la Store. El actualizador propio se apaga solo (`process.windowsStore`).
- **Cada versión nueva** hay que armarla y subirla a Partner Center (pasa por revisión cada vez). La versión instalada con el `.exe` sigue actualizándose sola como siempre.
- **Desinstalar** borra los datos locales de la app (base de datos y sesión de WhatsApp) porque en MSIX viven dentro del paquete. Recomendar hacer el respaldo antes de desinstalar.
- **Iniciar con Windows:** la opción de la bandeja puede no funcionar dentro del paquete de la Store; hay que probarlo en una PC real.

## Riesgos

- Microsoft puede **rechazar** la app por conectarse a WhatsApp Web de forma no oficial. No se sabe hasta enviarla. Si la rechazan, el plan B es un certificado OV (US$116–300 por año) para firmar el `.exe`.
- El nombre "Akira" puede estar tomado.
- Esto no se pudo probar en una PC con la Store: la primera instalación real sale de la prueba que haga el dueño.
