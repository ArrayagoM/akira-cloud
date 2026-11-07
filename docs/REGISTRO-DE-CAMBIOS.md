# Registro de cambios de Akira Cloud

Regla de trabajo (pedida por el dueño el 5/11/2026): **cada cambio queda anotado acá** con qué archivos se tocaron, por qué, qué prueba lo respalda y qué NO se tocó. Un cambio no se da por terminado si no tiene su entrada y sus pruebas. Nada de esto está publicado hasta que figure como "publicado".

Cómo se lee cada entrada: problema → causa (verificada leyendo el código, o marcada como "supuesta") → archivos tocados → pruebas → riesgo → estado.

---

## CAM-001 — Chat silenciado: el bot seguía contestando (5/11/2026)

**Problema.** El dueño pausó/silenció un chat para que el bot no contestara y el bot siguió respondiendo.

**Causas verificadas en el código** (`desktop/main/bot-engine/services/akira.bot.js`):
1. Un mensaje del cliente que contenía la palabra "akira" salteaba el silencio (`!bodyLower.includes('akira')`). Los comandos "akira ..." son solo del dueño y se procesan antes (rama `fromMe`), así que ese atajo solo servía para que un cliente lo esquivara sin querer ("hola akira").
2. Los audios se descargaban, se transcribían y se contestaban (incluido "no pude entender el audio") antes de mirar si el chat estaba silenciado.
3. La orden de silenciar desde la pantalla Clientes solo se enviaba a la cuenta de WhatsApp 0 (`bot-service.js`, `silenciarCliente`): con dos cuentas, el chat de la segunda seguía respondiendo.
4. Si el chat no estaba cargado en la memoria del bot, la orden de silenciar se perdía sin avisar.

**Archivos tocados.**
| Archivo | Cambio |
|---|---|
| `desktop/main/bot-engine/services/bot/silencio.js` | NUEVO. `debeCallar(usuario)` y `emitirATodas(instancias, evento, payload)`: reglas puras. |
| `desktop/tests/silencio.test.js` | NUEVO. 8 comprobaciones de las reglas. |
| `desktop/main/bot-engine/services/akira.bot.js` | 3 puntos: (a) chequeo de silencio sin el atajo "akira" para mensajes del cliente; (b) guarda al inicio de la rama de audio; (c) handler `cliente:silenciar` busca el chat en la base si no está en memoria y avisa en el log si no lo encuentra. |
| `desktop/main/slots/bot-service.js` | `silenciarCliente` ahora avisa a todas las cuentas activas. |

**Qué NO se tocó (a propósito).** Los adjuntos (comprobantes/PDF) de un chat silenciado se siguen guardando y avisando al dueño: solo se evita contestarle al cliente. Los mensajes proactivos (recordatorios, avisos de pago) no se modificaron. La base de datos y el esquema `BotCliente` no cambian.

**Pruebas.** `node desktop/tests/silencio.test.js` (OK). Revisión de sintaxis de los dos archivos tocados (OK). Siguen pasando `sesion-wa` y `comandos-remotos`. **Límite de la prueba:** las reglas están probadas como funciones; la integración dentro de `akira.bot.js` (un archivo de más de 4000 líneas) se verificó por lectura y sintaxis, no con un WhatsApp real.

**Pendiente conocido (no resuelto en este cambio).** Al arrancar el bot, todos los silencios se borran (`mongo-clientes.service.js`, `inicializar`): una pausa manual no sobrevive a un reinicio de la app. Arreglarlo bien exige distinguir "silencio manual" de "silencio por derivación a una persona" (que sí vence a los 30 min), lo que implica un campo nuevo en la base. Se propone como CAM-004, no se hizo sin consultarlo.

**Riesgo.** Bajo. Estado: **sin publicar** (entra en el próximo instalador).

---

## CAM-002 — App del celular: no se veía dónde cargar productos (5/11/2026)

**Problema.** El dueño dice que en la app del celular no ve dónde cargar productos.

**Causa verificada** (`frontend/src/components/celular/CargarProducto.jsx`): la pestaña "Productos" existe (tercera de cuatro), pero si la PC no tiene activado "Controlar desde la app del celular" (viene apagado por defecto) se reemplazaba toda la pantalla por una tarjeta chica ("Falta un paso en tu PC") sin título ni formulario: parecía que la función no existía. Además, una PC con Akira anterior a la 1.0.34 (la de Microsoft Store es la 1.0.32) aceptaba productos que nunca iba a recibir.
**Verificado en producción por el agente:** la web publicada es la Etapa 1 (sin "Completar con IA"); la Etapa 2 todavía no está desplegada.

**Archivos tocados.**
| Archivo | Cambio |
|---|---|
| `frontend/src/lib/versionPc.js` | NUEVO. `versionAlcanza(version, minima)` y `VERSION_MIN_PRODUCTOS = '1.0.34'`. Pura. |
| `desktop/tests/version-pc.test.js` | NUEVO. 9 comprobaciones (1.0.32 no alcanza, 1.0.100 > 1.0.34, versión desconocida no bloquea). |
| `frontend/src/components/celular/CargarProducto.jsx` | Cuando no hay PC habilitada ahora muestra el título "Cargar productos", qué hace la pantalla y los pasos; si la PC tiene versión vieja, un aviso con enlace a `/descargar`. Con PC habilitada pero vieja, aviso arriba del formulario. El flujo de envío no se tocó. |

**Pruebas.** `node desktop/tests/version-pc.test.js` OK. `vite build` OK (en carpeta temporal, ya borrada). **Límite:** el aspecto visual de la pantalla no se probó en un navegador en esta pasada.
**Riesgo.** Bajo (solo textos y un aviso). Estado: **sin publicar** (web: `vercel --prod --yes`).

---

## AUD-001 — Auditoría de seguridad (5/11/2026) — SOLO DIAGNÓSTICO, nada corregido todavía

Hecha por un agente de solo lectura; los tres hallazgos más graves los reverifiqué yo en el código. Nada de lo siguiente se modificó: el backend es producción y cada arreglo necesita su propia entrada, pruebas y OK del dueño.

| # | Severidad | Hallazgo | Verificado por mí |
|---|---|---|---|
| 1 | Alta | El enlace "darme de baja" de cada email contiene un JWT sin vencimiento firmado con el mismo secreto de las sesiones; `config/passport.js` lo acepta como sesión completa (no mira el campo `p`). | Sí (`services/email.novedades.js:20`, `config/passport.js:24-35`) |
| 2 | Alta | Con un JWT robado se puede activar un equipo nuevo (`/licenses/activate`) y leer en claro las claves del negocio (`/sync/config`). | No |
| 3 | Alta | "Bloquear usuario" solo revoca los equipos; nada asigna `status='bloqueado'`, así que el usuario sigue entrando. | Sí (búsqueda sin asignaciones; `services/bot.manager.js`) |
| 4 | Alta | Pagos de suscripción pueden perderse (el webhook responde 200 y procesa después; reclamo y activación en dos pasos). | No (depende de Vercel) |
| 5 | Alta | Contraseña real de Mongo Atlas en el historial de git (`backend/.env.example`, commits e1f72fb, 5013a70, 5a17609). Repo público. **Acción del dueño: rotarla.** | Agente (el repo es público según mis notas) |
| 6 | Media | `mongoSanitize()` corre antes del parser JSON: el body no se sanea. | Sí (`app.js:50` vs `:104-105`) |
| 7 | Media | El control remoto "apagado por defecto" lo puede prender cualquier sesión de la cuenta. | No |
| 8-9 | Media | Webhooks de Mercado Pago sin firma obligatoria y con ids sin validar. | No |
| 10-14 | Media | Logs/errores con datos internos; IA sin tope por usuario; fraude de afiliados; logout que no revoca; webhook legacy del bot escucha en toda la red (puerto 3100). | No |
| — | Escala | PBKDF2 síncrono en cada lectura de claves; polling cada 10-20 s por PC; límites en memoria incompatibles con serverless; fotos en base64 en Mongo; consultas admin sin índice. | No |

Orden de arreglo propuesto: rotar Mongo (dueño) → #1 → #3 → #6 → #2/#7 → webhooks (#8, #9) → pagos atómicos (#4) → el resto.

---

## CAM-003 — Seguridad: enlace de baja, bloqueo de usuarios y limpieza del cuerpo (5/11/2026)

Corrige AUD-001 #1, #3 y #6. **Backend de producción: sin publicar hasta que el dueño publique** (`scripts/publicar-version.ps1` o el despliegue del backend).

| Archivo | Cambio |
|---|---|
| `backend-desktop/config/passport.js` | La sesión rechaza cualquier token que traiga el campo `p` (tokens de un solo propósito, como el enlace de baja). Las sesiones normales no llevan `p`: no cambia nada para ellas. |
| `backend-desktop/lib/sesion.js` | `evaluarRenovacion` también rechaza esos tokens (no se pueden canjear por una sesión renovada en `/auth/renovar`). |
| `backend-desktop/services/bot.manager.js` | `panicStop` ahora marca `status='bloqueado'`, guarda el motivo, sube `tokenVersion` (cierra sus sesiones) y revoca equipos con una marca; nunca bloquea a un administrador. Nuevo `desbloquear`: reactiva la cuenta y devuelve SOLO los equipos revocados por el bloqueo. |
| `backend-desktop/routes/admin.routes.js` | Bloquear: no permite bloquearse a uno mismo y devuelve 400 si no se pudo. Desbloquear usa `botManager.desbloquear`. |
| `backend-desktop/app.js` | Segundo `mongoSanitize({ allowDots: true })` después de leer el cuerpo (el primero corre antes y no lo limpiaba). `allowDots` evita tocar claves con punto de cuerpos legítimos. |
| `backend-desktop/tests/seguridad-sesion.test.js` | NUEVO. 19 comprobaciones por HTTP con passport y el middleware reales. |
| `backend-desktop/package.json` | Se agregó la prueba nueva al `npm test`. |

**Decisión consciente.** Los enlaces de baja ya enviados siguen funcionando para darse de baja (no se cambió su firma ni su verificación): lo que se cerró es usarlos como sesión. Se puede sumar vencimiento en el futuro, pero rompería los emails viejos.
**Pruebas.** `seguridad-sesion` 19/19; se comprobó que sin el arreglo de passport la prueba FALLA (la prueba sí detecta el error). Suite completa del backend: pasa entera. **Límites:** el orden del filtro en `app.js` se verificó leyendo el archivo, no levantando todo el servidor; la ruta de admin se probó a nivel de la lógica (`bot.manager`), no por HTTP; no se probó contra Mongo real.
**Riesgo.** Bajo a medio: el bloqueo ahora tiene efecto real (antes era decorativo), así que conviene probarlo primero con una cuenta propia de prueba después de publicar. Un usuario que esté marcado como bloqueado desde antes seguirá activo hasta que se lo vuelva a bloquear.

---

## CAM-004 — La pausa manual de un chat sobrevive al reinicio y no se levanta sola (5/11/2026)

**Problema.** Al abrir Akira se borraban TODOS los silencios; además, si el dueño le escribía al cliente desde el chat, el bot se reactivaba solo (justo cuando el dueño había pausado el chat para atenderlo él). **Evidencia real:** el registro de esta PC muestra `[DB] 🔓 2 cliente(s) des-silenciado(s) al arrancar` el 5/11 a las 15:02 (UTC): dos chats pausados se liberaron al reiniciar.

**Diseño.** Dos tipos de silencio, distinguidos por una marca nueva `silenciadoManual` en el registro del cliente (la base local no tiene esquema fijo: no hace falta migración).
- **Manual** (pausa desde Clientes): vale hasta que el dueño la reactive; sobrevive al reinicio; no se levanta cuando el dueño responde.
- **Automático** (derivación a una persona, `akira stop`): temporal, como siempre (30 min / respuesta del dueño / reinicio).
- Los registros viejos sin marca cuentan como automáticos: **nada cambia para lo que ya existe**.

| Archivo | Cambio |
|---|---|
| `desktop/main/bot-engine/services/bot/silencio.js` | Se suman `esManual`, `debeConservarAlArrancar`, `puedeAutoReactivar` (puras). |
| `desktop/main/bot-engine/services/bot/mongo-clientes.service.js` | Al arrancar y al cargar un cliente suelto se conserva solo el silencio manual; al guardar, la marca solo existe mientras haya silencio (no queda pegada). |
| `desktop/main/bot-engine/services/akira.bot.js` | La respuesta del dueño y el temporizador de 30 min respetan la pausa manual; `akira stop`/`reactivate`/derivación marcan "no manual"; el aviso en caliente desde Clientes marca "manual". |
| `desktop/main/local-api/routes/bot.routes.js` | Pausar/reactivar desde Clientes guarda la marca en la base (sirve aunque el bot no esté corriendo). |
| `desktop/tests/silencio.test.js`, `desktop/tests/clientes-memoria.test.js` | +5 y +6 comprobaciones (reinicio real con la base local: la manual se conserva; la automática y la de registro viejo se levantan; la marca no se pierde al charlar ni queda pegada al reactivar). |

**Pruebas.** Suite completa del escritorio: 1907 comprobaciones, sin fallas. **Límite:** el cableado dentro de `akira.bot.js` se verificó por lectura, sintaxis y las pruebas del servicio de clientes, no con WhatsApp real. Nota: `akira stop` dice "se reactiva sola en 30 min" pero nunca tuvo temporizador (sigue igual; no se tocó).
**Riesgo.** Bajo. Estado: **sin publicar** (próximo instalador).

---

## CAM-005 — Órdenes del celular: avisos de fallo y "hecho" honesto (5/11/2026)

**Problema.** El dueño pausó desde el celular y la PC siguió. **Hallazgo en los registros reales de esta PC (1.0.35, control remoto activado desde el 7/10):** las únicas órdenes recibidas fueron `vacaciones-on` (8/10), `bot-reanudar` y `vacaciones-off` (14/10). **Nunca llegó un `bot-pausar`** y no hay ninguna orden en noviembre. El canal funcionó en octubre; la PC consulta la nube cada minuto y, si falla, fallaba **en silencio**: no hay forma de saber por qué. Además la PC daba por "hecha" una pausa aunque no hubiera ningún bot activo.
**Causa de fondo: no confirmada.** Candidatas: una consulta que falla en silencio (sesión vencida, red); una carrera en la nube (el celular y la PC reescriben el arreglo `comandos` del mismo equipo y el último gana — hallazgo del agente, verificado en el código, pero con ventana de milisegundos); otro equipo registrado. Con este cambio la próxima vez queda rastro.

| Archivo | Cambio |
|---|---|
| `desktop/main/comandos-remotos.js` | Si no puede consultar la nube lo anota en el registro (como máximo cada 30 min); "pausar" sin ningún bot activo se informa como fallo (no "hecho") y no deja una pausa fantasma. |
| `desktop/tests/comandos-remotos.test.js` | +4 comprobaciones (anotación, límite de 30 min, fallo honesto, la nube recibe el fallo). |

**Pendiente (no hecho, necesita decisión):** hacer atómica la cola de órdenes en la nube (hoy `Device.comandos` se reescribe entero por quien guarda último). Es backend de producción: requiere entrada propia y pruebas.
**Riesgo.** Bajo. Estado: **sin publicar** (próximo instalador).

---

## CAM-006 — Versión 1.0.36: instalador, paquete de la Microsoft Store y commits (5/11/2026)

**Qué es.** Primera versión que junta todo lo pendiente (carga de productos con IA, afiliados, y los arreglos CAM-001, 004 y 005). Se subió de 1.0.35 a 1.0.36 a propósito: la 1.0.35 ya compilada no tenía los arreglos de hoy.

| Pieza | Estado |
|---|---|
| `desktop/package.json` | `version` 1.0.36 |
| Instalador directo `desktop/dist/AkiraCloud.exe` (93,9 MB) | Compilado con `npm run release:build`: pruebas del escritorio OK y 9/9 verificaciones del paquete OK. `latest.yml` anuncia 1.0.36. **Sin subir** (`scripts/publicar-version.ps1` lo sube y avisa al servidor). |
| Paquete Store `desktop/dist-store/AkiraCloud-1.0.36.msix` (168 MB) | Armado con el `makeappx` oficial de Microsoft (firma verificada: Microsoft Corporation) sobre el mismo `win-unpacked` del instalador, con `Version="1.0.36.0"` en `stage-1.0.36/AppxManifest.xml` (copia del manifiesto de la 1.0.32, mismas identidades). La carpeta y el paquete de la 1.0.32 NO se tocaron. **Sin subir a Partner Center.** |
| Commits locales | `ffd81b0` backend · `98d3d1d` escritorio · `ddb9247` web y documentos. **Sin `push`.** |

**Quedó afuera de los commits a propósito:** `scripts/migrar-atlas-a-local.js` (contiene la contraseña de Mongo), `backend/services/akira.bot.tmp` (temporal) y todo el material de marketing (videos y capturas).
**Límite.** El paquete MSIX no se instaló ni se probó abriéndolo; solo se verificó que `makeappx` lo creó sin errores y que el contenido es el del instalador ya verificado.
**Falta (acción del dueño):** subir `AkiraCloud-1.0.36.msix` en Partner Center → Paquetes (envío nuevo) y esperar la certificación; publicar el instalador y el backend (`publicar-version.ps1`); desplegar la web.

---

## CAM-007 — Órdenes del celular: el celular y la PC ya no se pisan al guardar (6/11/2026)

**Problema (verificado en el código).** `POST /api/mobile/comandos` (celular manda una orden) y `POST /api/licenses/comandos` (la PC consulta cada ~1 min) leían el equipo entero, cambiaban la lista `Device.comandos` y la guardaban entera. El último en guardar borraba lo del otro: una orden "pausar" podía perderse si la PC consultaba en el mismo instante, sin ningún aviso.
**Qué se cambió.** Guardado condicional por versión (`comandosV`): si alguien cambió la lista mientras tanto, se vuelve a leer y se reintenta (máx. 4 veces; si no se logra, 503 y la app puede reintentar, nunca se pierde en silencio). Si la lista no cambia (consulta de rutina de la PC) NO se reescribe: solo se actualiza el latido y el control remoto. Equipos viejos sin `comandosV` cuentan como versión 0.

| Archivo | Cambio |
|---|---|
| `backend-desktop/lib/comandos-guardar.js` (nuevo) | `mutarComandos`: lee, aplica la lógica pura de `comandos.js` y guarda con la condición de versión. |
| `backend-desktop/routes/mobile.routes.js` | `POST /comandos` usa `mutarComandos` (mismas respuestas 200/404/409/429/400 que antes). |
| `backend-desktop/routes/licenses.routes.js` | `POST /comandos` (consulta de la PC) usa `mutarComandos`; equipo revocado sigue dando 403 sin registrar latido. |
| `backend-desktop/models/Device.js` | Campo nuevo `comandosV` (Number, default 0). Compatible con datos existentes. |
| `backend-desktop/tests/comandos-concurrencia.test.js` (nuevo, 19 comprobaciones) y `package.json` | Casos: celular + consulta de la PC a la vez, dos órdenes a la vez, confirmación + orden nueva, equipos sin versión, consulta sin cambios, cambio ajeno en medio, 503 tras agotar reintentos. |
| `backend-desktop/tests/mobile.test.js` | El modelo simulado acepta `updateOne` (no cambia lo que verifica). |

**Qué NO se tocó.** `lib/comandos.js` (lógica pura), la PC (`desktop/`), las demás rutas que escriben el equipo (latido, resumen, estado del bot): solo escriben sus propios campos, no la lista.
**Pruebas.** `npm test` del backend completo: todo verde. Incluye una comprobación "de contraste" que reproduce el guardado anterior y muestra que la orden se perdía.
**Límites.** (1) La carrera real tenía una ventana de milisegundos (la consulta de la PC es 1 por minuto), así que **probablemente no explica por sí sola** que nunca llegara un `bot-pausar`; la causa de fondo sigue sin confirmar (ver CAM-005). (2) Probado con una base simulada, no con MongoDB real. (3) Al intentar demostrar que el test falla con las rutas viejas, lo hizo por un motivo mecánico (el modelo simulado no tiene `save`), así que esa prueba no sirve como evidencia; la evidencia es la comprobación de contraste.
**Riesgo.** Bajo-medio (backend de producción). Agrega un campo nuevo con valor por defecto; no cambia datos existentes. Estado: **sin publicar** (próximo `publicar-version.ps1`).

---

## CAM-008 — Cobro con Mercado Pago: pago atómico, webhook que reintenta, firma e ids validados (6/11/2026)

**Cierra los hallazgos 4, 8 y 9 de AUD-001** (análisis de un agente de solo lectura; los puntos clave los verifiqué yo en el código de `subscription.routes.js`).

**Problemas verificados.**
1. *(#4)* Reclamar el pago (`pagosMpProcesados`) y activar el plan eran **dos escrituras**: un corte en el medio dejaba el pago "ya procesado" y al cliente **sin plan**. Además el webhook respondía 200 **antes** de procesar: si algo fallaba, Mercado Pago nunca reintentaba (y en Vercel la función puede congelarse al responder).
2. *(#8)* La firma del aviso era opcional en tres sentidos: sin secreto, sin cabecera, o con una firma de otro largo (pasaba). Un error al verificar también dejaba pasar.
3. *(#9)* El id de pago que llega por la URL (`/return`), el cuerpo (`/verificar-pago`, webhook) se pegaba tal cual en la ruta que se consulta a Mercado Pago. El host es fijo (no hay SSRF a otros sitios), pero un id como `../x` armaba consultas no previstas con el token de la plataforma. Un `userId` inválido en la referencia tiraba un error de conversión.

**Qué se cambió.**
- Reclamo + activación = **una sola escritura** (`findOneAndUpdate` con `$push` + `$set`), condicionada a que el vencimiento siga siendo el leído (dos pagos distintos a la vez suman sus meses, no se pisan; hasta 3 relecturas).
- El webhook **procesa y recién responde**: falla pasajera (MP no contesta, 404 por demora, base cortada) → **500** y Mercado Pago reintenta; lo que no se arregla reintentando (no aprobado, plan desconocido, monto corto, ya procesado, referencia inválida) → 200.
- Firma: función pura. Con secreto, una firma presente y mala (incluida truncada) → 401. **Sin secreto o sin cabecera sigue pasando, con un aviso en el log** (el manifiesto nunca se probó en producción: endurecer de golpe podría rechazar cobros reales). Con `MP_WEBHOOK_FIRMA_ESTRICTA=1` un aviso sin firma válida se rechaza.
- Ids: solo numéricos (`^\d{1,20}$`); `userId` solo 24 hexadecimales; el helper `mpRequest` solo acepta `/v1/payments/<id>` y `/checkout/preferences`, y corta a los 8 s.

| Archivo | Cambio |
|---|---|
| `backend-desktop/lib/mp-seguridad.js` (nuevo) | `idPagoValido`, `userIdValido`, `rutaMpPermitida`, `verificarFirmaMp` (puras). |
| `backend-desktop/routes/subscription.routes.js` | Lo anterior: `mpRequest`, `activarPlanYProcesarReferido`, `/return`, `/verificar-pago`, `/webhook`, `/webhook/:userId`. |
| `backend-desktop/tests/mp-seguridad.test.js` (nuevo, 17), `tests/cobro-webhook.test.js` (nuevo, 29), `tests/cobro.test.js` (+7, modelo simulado adaptado) y `package.json` | Pruebas. |

**Qué NO se tocó.** Precios, reglas de monto, vencimientos y créditos de referidos (`lib/cobro.js` y la lógica de referidos quedan igual); `backend/` (copia vieja, no es la que está en producción); el flujo de creación de la preferencia.
**Pruebas.** `npm test` del backend completo: verde. Comprobé que el caso "corte entre dos escrituras" **falla con el código anterior** (queda cobrado sin plan) y pasa con el nuevo.
**Límites / no verificado.** (1) Probado con Mercado Pago y base simulados, no con un pago real: antes de publicar conviene un pago real mínimo o el simulador de avisos del panel de MP. (2) No sé si `MP_PLATFORM_WEBHOOK_SECRET` está cargado en Vercel ni si MP firma los avisos que salen de `notification_url`; por eso la firma queda en modo "avisar". (3) No hay protección contra repetición de avisos viejos (solo advertencia por `ts` > 5 min), aunque un aviso repetido no puede cobrar dos veces. (4) Si hay hoy algún cliente con pago "reclamado" y plan sin activar (el defecto anterior), esto no lo repara: se detecta comparando `pagosMpProcesados` de los usuarios contra la colección `Pago`.
**Riesgo.** **Medio** (es el camino del dinero). Mitigación: tests, cambio acotado a una función y al webhook, mismos campos y reglas. Un aviso de prueba de MP con un id inexistente ahora devuelve 500 (antes 200): es esperable y MP lo reintenta unas veces. Estado: **sin publicar**.
