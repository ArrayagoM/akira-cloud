# Arquitectura y buenas prácticas — Akira

Contexto real del repo (no genérico): backend Express + Mongoose, frontend React/Vite, worker Node standalone que corre Baileys (WhatsApp) en la PC del cliente y habla con el backend por HTTP/socket.io. LLM vía Groq. Pagos vía MercadoPago. Turnos vía Google Calendar. Despliegue con PM2 (`ecosystem.config.js`) y un watchdog de PowerShell.

## 1. Capas y dónde va cada cosa

Convención ya establecida en `backend/` — respetarla, no inventar una nueva:

- `routes/*.routes.js` — solo parseo de request, validación de entrada (express-validator), llamada al service, formateo de response. **Cero lógica de negocio acá.**
- `services/*.js` y `services/bot/*.js` — lógica de negocio. Un service no debería importar `req`/`res` de Express jamás — si un service necesita eso, es una señal de que la responsabilidad está mal ubicada.
- `models/*.js` — schemas Mongoose. Métodos de instancia/estáticos que son puramente de datos (ej. `User.generarCodigoUnico`) viven acá; lógica que combina varios modelos o llama servicios externos, no.
- `config/*.js` — fuente única de verdad de configuración (ver `config/planes.js` como ejemplo correcto: un solo lugar define qué incluye cada plan, no repetido en 3 archivos).
- `middleware/*.js` — cross-cutting: auth, rate limiting, sanitización.

Cuando agregues una feature, preguntate primero: **¿esto ya tiene un lugar?** Antes de crear un archivo nuevo, buscá si el patrón ya existe (ej. un nuevo tool del bot va en `services/bot/`, no suelto en `akira.bot.js`).

## 2. El "cerebro" del bot (`akira.bot.js` y `services/bot/*`)

Este es el módulo de mayor riesgo del proyecto porque:
- Es grande y cambia seguido (fixes de alucinaciones, nuevas tools).
- Bugs acá tienen impacto directo en plata real (cobros de MercadoPago, turnos de calendario) y en la experiencia del cliente final del cliente (WhatsApp).

Reglas específicas para tocarlo:
- **Toda función que arma un prompt o decide qué tool ejecutar debe ser pura y testeable** (recibe datos, devuelve string/objeto — sin llamar a Groq/Mongo adentro). Ver `construirSystemPromptRespuestaFinal` como el patrón correcto ya usado en commits recientes.
- **Sanitizar SIEMPRE el historial antes de mandarlo a Groq** (ya hay un fix de esto — `0a9f58a`). Cualquier cambio al manejo de `historial`/`tool_calls` debe mantener esa invariante: nunca mandar un `tool_calls` huérfano (sin su `tool` response correspondiente) porque Groq puede alucinar una acción espontánea (booking fantasma).
- Cambios en tools que devuelven listas (`consultar_disponibilidad`, `consultar_catalogo`, etc.) deben forzar al LLM a listar completo, no resumir — ya es un bug conocido y recurrente, no lo reintroduzcas.
- Cualquier gate de seguridad (ej. verificar que un mensaje del canal admin viene realmente del admin) vive en `akira.bot.js`, no en `system.bot.js` — mantené esa separación: `system.bot.js` ejecuta comandos, `akira.bot.js` decide si están autorizados.

## 3. Multi-tenant / multi-slot

El proyecto es multi-usuario y multi-cuenta de WhatsApp por usuario (slots). Cualquier feature nueva que toque `ClienteMemoria`, `BotCliente` o el enrutamiento de sesiones tiene que preguntarse explícitamente: **¿esto aísla correctamente por usuario y por slot?** Hubo bugs reales de esto (`3c7c679 aislamiento multi-usuario/multi-slot`, `4cf1404 enrutamiento cuando hay múltiples WhatsApp activos`). Al revisar código nuevo en esta área, buscá específicamente:
- Variables/cachés a nivel de módulo (fuera de una función) que deberían ser por-sesión y no lo son.
- Queries a Mongo sin filtrar por `userId`/`slotId`.

## 4. Gating por plan

`config/planes.js` es la fuente única de verdad de qué puede hacer cada plan (mensajes/mes, calendar, mercadopago, audio). **Nunca hardcodees un chequeo de feature en otro archivo** — importá `featuresDePlan(plan)`. Si agregás una feature nueva que debería estar gateada por plan, agregala ahí primero.

## 5. Manejo de errores y resiliencia

- El worker corre en la PC del cliente y puede perder conexión, reiniciarse, o quedar con el backend caído (`webhook fallback cuando Render reinicia`, `d3abd43`). Todo código que hable worker↔backend debe asumir que el otro lado puede no estar disponible y tener reintento/fallback explícito, no solo un try/catch que loguea y sigue.
- Nunca dejes un `catch` vacío o que solo hace `console.log(err)` en código que toca dinero (MercadoPago) o turnos (Calendar) — como mínimo, guardar el estado como "pendiente de reconciliación" en vez de asumir éxito o fallar silenciosamente.

## 6. Checklist de revisión de PR/diff propio

Antes de dar por terminado un cambio, repasar:

1. ¿La responsabilidad está en la capa correcta (route/service/model)?
2. ¿Hay una fuente única de verdad para esta regla de negocio, o la estoy duplicando?
3. ¿Este cambio afecta aislamiento multi-usuario/multi-slot?
4. ¿Hay manejo de error explícito en los puntos de fallo externos (Groq, MercadoPago, Google Calendar, WhatsApp)?
5. ¿Se agregó/actualizó un test para el bug que se está arreglando (ver [testing.md](testing.md))?
6. ¿El diff introduce algo que debería pasar por `security.md` (input externo, secretos, auth)?
7. ¿No quedó código muerto, `console.log` de debug, o un archivo `.tmp` (como el `akira.bot.tmp` que ya está dando vueltas en el repo — limpiarlo)?

## 7. Deuda técnica visible hoy en el repo (para priorizar, no para ignorar)

- `backend/services/akira.bot.tmp` — archivo temporal trackeado/untracked, no debería existir en el repo. Confirmar con el usuario si se puede borrar.
- Múltiples archivos sueltos en la raíz (`Dockerfile`, `Dockerfile.worker`, `railway.toml` duplicado en raíz y en `backend/`, varios `.bat`) — candidatos a mover a una carpeta `deploy/` u `ops/` para no ensuciar la raíz del repo.
- `.claude/worktrees/*` aparecen como gitlinks en el índice sin `.gitmodules` — es ruido de sesiones de Claude Code, no debería trackearse; considerar agregarlo a `.gitignore`.
