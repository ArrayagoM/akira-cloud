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

---

## CAM-009 a CAM-015 — Equipo de desarrollo: evaluación integral y arreglos (17/11/2026)

**Origen.** Siete agentes de solo lectura (arquitectura, seguridad, QA, producto y UX, ventas, celular, DevOps) evaluaron web, celular y escritorio. Con sus informes, cinco desarrolladores implementaron los arreglos por carpeta (sin pisarse), dos revisores independientes los auditaron y se corrigió lo que encontraron. Todo local, **sin publicar, sin push**. Verificado al cierre: `npm test` en `backend-desktop`, `desktop` y `backend`, `node tests/estado.test.js` en `mobile` y `npm run build` en `frontend` dan código 0.

**Lo que NO se hizo, a propósito (decisiones del dueño o cambios de diseño con riesgo):** clave de Groq obligatoria y lo que incluye el trial; cuota por mensaje (`quota.service.js`); flujo de cobro de Mercado Pago (CAM-008); reemplazo de equipos y exportación de claves de `/sync/config`; logout que revoca tokens; ruta local de sesión para 72 h sin internet; borrar `backend/` y `worker/`; que el bot respete puestos; firma de código del instalador; rotar claves.

### CAM-009 — Backend: errores, topes de IA, webhook, admin, JWT, afiliados y datos del latido
- **Causa.** Varias rutas devolvían `err.message` al cliente; el checkout filtraba `BACKEND_URL` y logueaba parte del token de Mercado Pago; soporte, demo y sugerencias gastaban la clave Groq de la plataforma sin tope compartido; el webhook público del bot aceptaba eventos falsos sin límite; el admin armaba regex con texto crudo y no cerraba sesiones al cambiar una clave; los JWT aceptaban cualquier HMAC; un alias de Gmail permitía referirse a uno mismo.
- **Cambio.** Errores genéricos con detalle en el log (`lib/errores.js`, 24 respuestas del admin y rutas de suscripción, login y sugerencias; los códigos HTTP no cambian). Topes diarios en Mongo con falla abierta: soporte 120 por usuario, sugerencias 5 por usuario, demo 300 por IP (`lib/topes-ia.js`). Webhook del bot: 3000 por IP y 100 por usuario cada 10 min, descarta en silencio y siempre responde 200 (el tope por IP se subió de 300 a 3000 tras la revisión: Mercado Pago avisa desde pocas IPs por todos los clientes). Admin: regex escapada (`lib/regex-seguro.js`), `tokenVersion` al cambiar una clave, `/descargas` con orden y tope de 50.000, `/ingresos` con proyección mínima. JWT solo HS256 (todos los `jwt.sign` ya lo eran). Autorreferido no aplicado (`lib/referidos.js`). Aditivos del latido: `ultimoErrorLicencia` y `canal` en `Device`, `GET /api/admin/users/:id/devices` (solo lectura, sin campos sensibles), `versionMinima` y `versionRecomendada` (null si no están definidas).
- **Archivos.** `backend-desktop/`: `lib/errores.js`, `lib/regex-seguro.js`, `lib/topes-ia.js`, `lib/version-app.js` (nuevos); `config/passport.js`, `lib/referidos.js`, `models/Device.js`, `routes/{admin,auth,bot-gate,demo,desktop,licenses,subscription,suggestions,support}.routes.js`, `services/{cuentas,license}.service.js`; tests nuevos `errores-fuga`, `topes-ia`, `bot-webhook-tope`, `admin-seguridad`, `admin-dispositivos`, `jwt-algoritmo`, `autorreferido`, `heartbeat-aditivos` (+ `_ayuda.js`); `package.json` suma esos y `pagos-region` (existía y nadie lo corría).
- **No se tocó.** `quota.service.js`, `/sync/config`, reemplazo de equipos, logout, cobro de Mercado Pago, montos y comisiones, lógica de bloqueo del latido.
- **Pruebas.** `npm test` completo en 0 (41 archivos). Cada test nuevo falla con el código anterior (primer fallo verificado; en `topes-ia` y `bot-webhook-tope` no se vio fallar cada caso uno por uno).
- **Límites.** Nada probado con Mongo, Vercel ni Mercado Pago reales. Los topes son estimaciones sin datos de uso. Los clientes que mostraban el mensaje interno de un error ahora ven un texto genérico. Cambiar una clave desde el admin hace que la PC del cliente reciba 401, entre en gracia de 72 h y después pause el bot hasta que vuelva a ingresar: conviene avisarle.
- **Riesgo.** Medio-bajo, casi todo aditivo. Sin publicar.

### CAM-010 — Escritorio: guardián de licencia, control remoto, test del puerto y capa de datos
- **Causa.** Cualquier 403 del latido frenaba todos los bots y los fallos no dejaban rastro; una orden remota colgada dejaba el control del celular muerto hasta reiniciar; el test del puerto 3100 dependía de la PC; la capa de datos local trataba un operador desconocido como "coincide con todo".
- **Cambio.** `guardian.js`: un 403 con motivo (revocado, vigente falso, motivo conocido o "Cuenta bloqueada") bloquea ya; un 403 sin motivo necesita 3 seguidos; registra estado y motivo normalizado (`sin_internet`, `timeout`, `servidor`, `sesion`, `bloqueo`) y envía `ultimoError` en el siguiente latido bueno. `license-client.js`: manda `x-akira-version` y `x-akira-canal` (store o exe). `comandos-remotos.js`: límite de 30 s por orden (60 s por producto), vigilante de 3 min que se renueva en cada orden (corrección tras la revisión: un sondeo con varias órdenes lentas no es un sondeo colgado y su doble ejecución duplicaba productos), registro por orden y `diagnostico()`. `conversacion.test.js`: verifica que el bot no hace `listen` sin depender del puerto. `mongoose-lite.js`: operador de consulta desconocido lanza error (inventario y suite instrumentada: nada lo usa).
- **Archivos.** `desktop/main/license/{guardian,license-client}.js`, `desktop/main/comandos-remotos.js`, `desktop/main/db/mongoose-lite.js`, `desktop/main/index.js` (1 línea: pasa el `log` al guardián); tests `guardian`, `license-client` (nuevo), `comandos-remotos`, `conversacion`, `mongoose-lite`.
- **No se tocó.** UI, aviso `sin_conexion`, frecuencia de sondeo, formato de lo que se envía al backend.
- **Pruebas.** `npm test` en `desktop` en 0. Mutaciones verificadas, incluida la del vigilante.
- **Límites.** Un 403 sin motivo bloquea recién al tercer latido (~45 min). Una acción colgada puede completarse tarde en segundo plano aunque la nube ya la tenga como fallo.
- **Riesgo.** Bajo, compatible hacia atrás y adelante. Sin publicar.

### CAM-011 — Frontend: sesión, avisos, onboarding, respaldo, seguridad, contraste, carga y panel admin
- **Causa.** `/auth/me` borraba el token ante cualquier error y `api.js` ante cualquier 401 (cortes de red, 503 del proxy local sin internet, clave actual mal, código inválido); texto de contraseña a quien entra con Google; dos guías de onboarding a la vez; sin aviso de respaldo; HTML de la IA de soporte sin escapar; texto gris a 2,4 a 3,1:1 de contraste; unas 45 páginas en el bundle inicial; panel admin sin datos de equipos.
- **Cambio.** El token se borra solo ante 401 real; un 401 en otra llamada se confirma con `/auth/me` antes de cerrar la sesión; sin conexión se muestra "Sin conexión, reintentando" con reintentos de 2 a 60 s **sin tope** (corrección tras la revisión: con tope la pantalla quedaba trabada aunque volviera internet). Avisos según cómo entró el usuario. Una sola guía de onboarding (se borró `OnboardingChecklist.jsx`); en la web pide instalar Akira en vez de iniciar el bot. Aviso de respaldo en el escritorio (no activa nada). Escape del HTML de soporte. `--muted` a `#7a90a7` (AA). Carga diferida de páginas (bundle inicial de 743 KB a 511 KB). Sección "Equipos" del admin; el estado del bot se lee en la forma real de la PC (`slots`, `pausado`, `vacaciones`) (corrección tras la revisión). Al cerrar sesión se borran el borrador de producto y el último estado del celular.
- **Archivos.** `frontend/src/`: `App.jsx`, `context/AuthContext.jsx`, `services/api.js`, `pages/{Login,Dashboard,AdminPanel}.jsx`, `components/{LicenciaAviso,PrimerosPasos,AkiraSupport}.jsx`, `index.css`, `vite.config.js`; nuevos `components/{SinConexion,AvisoRespaldo,AdminEquipos}.jsx` y `lib/{sesion,textosSesion,cargaPerezosa,primerosPasos,avisoRespaldo,formatoMensaje,equiposAdmin}.js`; tests `sesion`, `primeros-pasos`, `aviso-respaldo`, `formato-mensaje`, `contraste`, `equipos-admin`.
- **No se tocó.** Almacenamiento de tokens, `OAuthCallback`, textos de marketing, precios, trial, clave de Groq.
- **Límites.** No probado en navegador real (solo funciones puras y build). Sin internet no se muestra la app, solo la pantalla de reintento, aunque el escritorio tolera 72 h (pendiente: ruta local de sesión). Una sesión realmente vencida tarda una consulta más en redirigir.
- **Riesgo.** Medio-bajo; lo más sensible es la sesión. Probar a mano antes de publicar.

### CAM-012 — Celular (PWA): confirmación, resultado de órdenes, sondeo, cámara y sin conexión
- **Causa.** El celular apagaba el bot con un toque, ignoraba el resultado final de las órdenes (cortaba a los 90 s sin avisar aunque la orden vive 10 min), consultaba cada 10 s contra un tope de 300 pedidos por 15 min por IP compartido con la PC, no distinguía errores de cámara, y la pantalla sin conexión era fija.
- **Cambio.** Diálogo accesible "Apagar el bot" y "Activar vacaciones". Lista de las últimas 5 órdenes con estado y hora, seguimiento hasta que termina o vence y retoma al recargar. Sondeo adaptativo (30 s en reposo, 4 a 15 s con orden pendiente, pausa con la pestaña oculta, retroceso por error). Cámara con resolución ideal 1280, linterna y errores diferenciados. Último estado conocido y borrador de producto en `localStorage` (sin fotos); `offline.html` con script externo (`offline.js`); service worker v2 que no guarda nada de `/api`. `dvh` y áreas táctiles de 44 px.
- **Archivos.** `frontend/src/pages/CelularPage.jsx`, `components/celular/{CargarProducto,DialogoConfirmar}.jsx`, `components/celular/{useDialogo,useSondeo}.js`, `lib/{estadoMovil,productoCelular}.js`, `public/{sw.js,offline.html,offline.js}`, `mobile/src/estado.js` (espejo idéntico), `mobile/tests/{estado,producto-celular}.test.js`.
- **No se tocó.** Backend, PC, idempotencia del envío de productos, emparejamiento, manifest e iconos.
- **Pruebas.** Build OK; `mobile` 114 comprobaciones.
- **Límites.** Sin prueba en celular real (aspecto, foco, linterna, cámara, service worker activo). Antes de publicar: probar en Android e iPhone apagar y reanudar, recarga con orden pendiente, sin internet y cámara.
- **Riesgo.** Bajo a medio. Sin publicar.

### CAM-013 — Operación: gitignore, CI, herramienta de subida y publicación
- **Causa.** La publicación dependía de una herramienta suelta en `%TEMP%`; el instalador podía publicarse antes que el servidor; no había CI; un `git add -A` podía subir una clave de Atlas.
- **Cambio.** `.gitignore` ampliado (`scripts/migrar-atlas-a-local.js`, `*.env`, `.env.*` salvo `.env.example`, `*.pem`, `*.pfx`, `*.p12`, `*.key`, `*.tmp`, `.claude/worktrees/`). `.github/workflows/tests.yml` (en cada push, permisos mínimos, sin secretos). `scripts/blob-upload.js`: copia de la herramienta de subida al repo (sin secretos, toma `TOK` del entorno), que ahora comprueba en solo lectura si la copia por versión ya existe con otro contenido **antes** de pisar `AkiraCloud.exe` (corrección tras la revisión). `scripts/publicar-version.ps1`: orden verificaciones, servidor, instalador, versión; chequeo de código de salida de `vercel --prod`; modos `-DryRun`, `-SoloVerificar`, `-OmitirPruebas`. `docs/OPERACION-PUBLICACION.md`: runbook con rollback.
- **No se tocó.** Los tres workflows existentes, código de producto, nube, Atlas.
- **Pruebas.** YAML y `.ps1` parseados; el script probado con herramientas simuladas en 5 escenarios; CI simulado en un clon limpio. **No se ejecutó nada contra la nube.**
- **Límites.** El workflow no corrió en GitHub (Linux nunca corrió estas suites). El nuevo orden cuesta dos despliegues por versión. La primera vez usar `-DryRun` y `-SoloVerificar`. `backend-desktop/.env.example` sigue sin versionar porque un `.gitignore` anidado lo oculta.
- **Riesgo.** Bajo (solo operación).

### CAM-014 — Agenda: turnos manuales y puestos en paralelo
- **Causa.** La Agenda solo mostraba turnos creados por el bot: no se podían cargar ni editar a mano, y no había forma de manejar trabajos a la vez en distintos lugares o equipos.
- **Cambio.** Alta manual (`POST /api/turnos`) y edición ampliada (`PATCH`: cliente, trabajo, detalle, fecha, hora, duración, puesto, profesional, precio informativo). Un **puesto** es el `calendarId` del turno: los choques se detectan por solapamiento dentro del mismo puesto y turnos en puestos distintos pueden correr a la vez. El puesto General resuelve al mismo calendario que usa el bot, así que bot y turnos manuales se ven entre sí. Lista de puestos en `Config.puestosAgenda` (`GET` y `PUT /puestos`, máximo 20). En la UI: botón "Nuevo turno", modal de detalle y edición, y vista del día agrupada por puesto con la marca "A la vez con…". Campos aditivos en `GET /bot/agenda`.
- **Archivos.** `desktop/main/gestion/turnos-manual.js` (nuevo), `desktop/main/local-api/routes/turnos.routes.js`, `desktop/main/local-api/routes/bot.routes.js` (+8 líneas aditivas), `frontend/src/lib/turnoManual.js`, `frontend/src/components/agenda/{TurnoFormModal,DiaPorPuestos}.jsx`, `frontend/src/pages/AgendaPage.jsx`; tests `turnos-manual` (110) y `turnos-manual-ui`.
- **No se tocó.** El bot y su calendario, `Turno.js` y su índice, `mongoose-lite.js`, la Caja, Mercado Pago, Google Calendar, alojamiento.
- **Pruebas.** `npm test` en `desktop` en 0. 13 de 14 mutaciones detectadas; la restante (un cancelado sigue chocando) se cubrió con una aserción directa.
- **Límites.** El bot no respeta puestos ni capacidad en paralelo: un turno manual en otro puesto no le quita disponibilidad. Los turnos manuales no se sincronizan con Google Calendar. El precio es informativo y no entra a la Caja. No se reprograman turnos sincronizados con Google ni pendientes de pago. Un turno que cruza la medianoche se muestra en su día de inicio. **Esta función no pasó por revisión independiente.**
- **Riesgo.** Bajo (aditivo). El punto sensible es la equivalencia General = calendario del bot, cubierta con tests.

### CAM-015 — Menú lateral: conserva su posición al cambiar de perfil
- **Causa.** La pantalla de PINs reemplaza a toda la app, así que el menú se desmontaba y al volver arrancaba arriba de todo: quien estaba en Caja tenía que volver a bajar.
- **Cambio.** El menú recuerda su posición y la restaura al montarse, y se asegura de que la pantalla actual quede a la vista (si ya se ve, no se mueve).
- **Archivos.** `frontend/src/lib/menuScroll.js` (nuevo), `frontend/src/components/Layout.jsx` (14 líneas), `desktop/tests/menu-scroll.test.js` (17 comprobaciones).
- **Límites.** La lógica está probada; la conexión con el menú real solo se confirma en la app (cambiar de perfil estando en Caja, y con un perfil de empleado que tiene menos opciones).
- **Riesgo.** Bajo.

### CAM-016 — Ideas en la app de escritorio y versión 1.0.38 (18/11/2026)
- **Causa.** La página "Ideas" (`/sugerencias`) existía solo en la web: el menú de escritorio la escondía y la app local no reenviaba `/api/suggestions` a la nube, así que quien usa la app instalada (casi todos) no tenía cómo dejar ideas para verlas en la pestaña Ideas del admin. Coincide con el "0 ideas enviadas" del radar de usuarios (hipótesis: no se consultó la base).
- **Cambio.** `server.js` reenvía `/api/suggestions` a la nube igual que `/api/auth`, `/api/subscriptions` y `/api/admin` (el servidor sigue exigiendo sesión; ver y responder ideas sigue siendo solo rol admin). `Layout.jsx` deja de ocultar "Ideas" en el menú de escritorio (solo se oculta la página de descarga). El tope de 5 ideas por usuario y día de CAM-009 acota el costo de la IA que las analiza.
- **Versión.** `desktop/package.json` pasa de 1.0.36 a **1.0.38**: la 1.0.36 que está en certificación en la Store es un código anterior a CAM-009 a CAM-016, y se evita publicar dos códigos distintos con el mismo número. La 1.0.37 no se usa.
- **Archivos.** `desktop/main/local-api/server.js` (1 línea), `frontend/src/components/Layout.jsx`, `desktop/package.json`, `desktop/tests/ideas-escritorio.test.js` (nuevo, 10 comprobaciones).
- **No se tocó.** El servidor de ideas (`suggestions.routes.js`), la página `SugerenciasPage.jsx`, el panel admin.
- **Pruebas.** El test levanta una "nube" falsa y comprueba lo que recibe (POST, GET `/mias`, PATCH, con y sin sesión) y que `server.js` y el menú tengan el cambio. Verificado quitando cada cambio: el test falla; restaurados, pasa. Las dos últimas comprobaciones leen el código fuente (menos robustas que un test de pantalla).
- **Límites.** Para que las ideas lleguen, el servidor tiene que ser el actual (el endpoint ya existe en producción). Un perfil de empleado sigue sin ver Ideas (no figura en su menú permitido).
- **Riesgo.** Bajo. Sin publicar.

### CAM-017 — "Continuar con Google" en la app de Android (19/11/2026)
- **Causa.** La pantalla de ingreso de la app nativa de Android (`mobile/`) solo tenía email y contraseña; decía "¿Entrás con Google? Creá una contraseña desde Olvidé mi contraseña". Quien se había registrado con Google no tenía botón. La web ya lo tenía.
- **Cambio en el servidor** (`backend-desktop/routes/auth.routes.js`, `models/OAuthCode.js`). `/api/auth/google` acepta `mobile_challenge` (sha256 en hexa de un verificador al azar que genera la app). Va firmado dentro de `state`. Al volver de Google, el servidor redirige a `akira://oauth?code=…` (esquema fijo; nunca a una dirección que mande el cliente). El código guarda el desafío y `/api/auth/oauth-token` exige el `verifier` (PKCE): un código robado por otra app instalada en el celular no sirve, y el código queda gastado ante un intento fallido. La web y el escritorio no mandan desafío y siguen exactamente igual (probado). No cambia nada en Google Cloud: la dirección de retorno registrada es la misma.
- **Cambio en la app** (`mobile/`). Botón "Continuar con Google" (navegador del sistema vía `expo-web-browser`, verificador con `expo-crypto`), `src/google.js` (piezas puras), `src/api.js` (`iniciarConGoogle`), `src/pantallas/Login.js`. `app.json`: plugin `expo-web-browser`, versión 1.0.1, `versionCode` 2. Dependencias nuevas en `package.json` y `package-lock.json` (el armado usa `npm ci`).
- **Pruebas.** `backend-desktop/tests/oauth-celular.test.js` (21 comprobaciones, rutas reales con la estrategia de Google simulada; verificado quitando el control del verifier: el test falla) y `mobile/tests/google.test.js` (20). Suites del servidor completas (`npm test`) y de la app en verde. El JS de Android se empaquetó completo (Hermes) y `expo prebuild` generó el manifiesto con el esquema `akira` y `versionCode 2`.
- **Límites.** No se armó el .apk ni se probó en un celular real (el armado corre en GitHub Actions y exige Android SDK). Para que el botón funcione **el servidor nuevo tiene que estar publicado antes** que el .apk: con el servidor viejo el navegador queda en la web y la app no recibe nada (no se rompe nada, pero no entra). El .apk sale con firma de prueba: para instalar la 1.0.1 hay que desinstalar la anterior (limitación que ya existía). Entrar con Google con un email nuevo crea la cuenta, igual que en la web.
- **Riesgo.** Bajo para el servidor (cambio aditivo, solo se activa con el parámetro nuevo). Sin publicar.

### CAM-018 — El ingreso con contraseña daba "Error interno del servidor" desde la dirección anterior de la web (19/11/2026)
- **Causa.** Los registros de producción (19/11, 10:20 a 10:26) mostraron siete `POST /api/auth/login` con error 500 y el mensaje `CORS: origen no permitido` para el origen `https://akira-cloud.vercel.app`. Ese es el proyecto de Vercel de la web, que sigue sirviendo el sitio aunque el dominio principal pasó a `akiracloud.lat`. `backend-desktop/app.js` solo permitía `akiracloud.lat`, `www.akiracloud.lat` y `FRONTEND_URL`, y el rechazo de CORS sale por el manejador general como 500 "Error interno del servidor". Quien tenía guardada o instalada (acceso directo, app instalada desde el navegador) la dirección vieja no podía iniciar sesión con contraseña.
- **Cambio.** `backend-desktop/app.js`: se agrega `https://akira-cloud.vercel.app` a los orígenes permitidos (coincidencia exacta, como los demás). Nada más.
- **Pruebas.** `backend-desktop/tests/cors-origenes.test.js` (11 comprobaciones, con `app.js` real y sin base de datos): los tres orígenes propios pasan (también la consulta previa OPTIONS del ingreso), sin Origin sigue entrando, y quedan bloqueados `evil.example`, `akira-cloud.vercel.app.evil.com`, la versión `http://`, un dominio parecido, una vista previa de Vercel y `null`. Verificado quitando la línea: el test falla. Reproducido antes del cambio: 500 desde esa dirección, 200 desde `akiracloud.lat`. Suite completa del servidor en verde.
- **App de Android** (`mobile/src/pantallas/Login.js`). Si una cuenta de Google prueba con contraseña, el servidor responde 401 "Esta cuenta usa OAuth…" y la app lo escondía detrás de "Email o contraseña incorrectos". Ahora dice "Esta cuenta entra con Google. Tocá Continuar con Google".
- **Límites.** El .apk no manda Origin, así que este error no le pasa a la app nativa: afecta a quien entra desde el navegador o una app instalada desde `akira-cloud.vercel.app`. Hay que publicar el servidor para que surta efecto. Mientras tanto, esa gente puede entrar por `https://akiracloud.lat`.
- **Riesgo.** Muy bajo (un origen propio más en la lista). Sin publicar.

### CAM-019 — Cada usuario elige qué números del resumen del negocio ve (19/11/2026)
- **Motivo.** Un cliente entró a la web y veía solo una tarjeta vacía ("Mirá tu negocio desde el celular") sin caja ni turnos. Además, el resumen era "todo o nada": no se podía elegir qué mostrar.
- **Qué hace.** Aparece el botón **"Elegir qué ver"** en la web (panel de la cuenta → "Tu negocio hoy") y en la pestaña Resumen de la página del celular. Seis datos para tildar: mensajes de hoy; turnos de hoy y del mes; caja (ingresos, gastos y resultado del mes); lo que te deben y lo que debés; cantidad de clientes; documentos sin revisar. Se guarda al tocar cada uno y siempre tiene que quedar al menos uno.
- **Cómo.** La PC sigue mandando los mismos contadores (los que el usuario aceptó al activar "Ver tu negocio desde el celular"). La elección se guarda en la cuenta (`User.resumenVer`) y el **servidor filtra al responder**: `GET /api/licenses/mine` (web) y `GET /api/mobile/estado` (página del celular y .apk). Por eso funciona con las PCs y los .apk ya instalados, sin versión nueva de escritorio. Nuevos `GET/PUT /api/auth/resumen-ver`. Sin elección guardada se muestra todo (nada cambia para los usuarios actuales). Lo que guarda el servidor no se toca: cambiar la elección vuelve a mostrar el dato al instante.
- **Pantallas.** El panel web dejó de rellenar con ceros: solo muestra las tarjetas de los datos que llegaron; "Resultado del mes" exige ingresos y gastos. La página del celular y el .apk ya listaban solo lo que llegaba. Sin selector en el .apk (hereda la elección hecha en la web o en la página del celular).
- **Archivos.** `backend-desktop/lib/resumen-negocio.js` (grupos y filtro), `lib/comandos.js`, `routes/mobile.routes.js`, `routes/licenses.routes.js`, `routes/auth.routes.js`, `models/User.js`; `frontend/src/lib/resumenVer.js`, `components/ElegirResumen.jsx`, `pages/CuentaPanel.jsx`, `pages/CelularPage.jsx`.
- **Pruebas.** `backend-desktop/tests/resumen-ver.test.js` (33 comprobaciones: filtro puro, preferencia, las dos rutas, usuarios sin elección, PC sin resumen; verificado quitando el filtro de cada ruta: falla) y `desktop/tests/resumen-ver-ui.test.js` (17). Suites completas del servidor y de escritorio en verde; la web compila.
- **Límites.** Es una preferencia de lo que se **ve**: la PC sigue enviando todos los contadores permitidos mientras "Ver tu negocio desde el celular" esté activo en la PC. Elegir qué **envía** la PC requeriría versión nueva de escritorio (no incluido). Sigue sin existir la lista de turnos con nombres ni el detalle de la Caja en la web (solo números). Hay que activar el interruptor en la PC una vez.
- **Riesgo.** Bajo: cambio aditivo, sin elección guardada todo se ve igual que antes. Sin publicar (servidor y web).
