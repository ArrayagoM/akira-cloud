# Seguridad — Akira

## 0. Alcance (leer antes que el resto)

Todo lo de este archivo aplica exclusivamente a:
- El código de este repo.
- Infraestructura propia del usuario (su backend, su base de datos, sus servidores/dominios).
- Entornos de staging/test propios.

**Nunca** se usa para escanear, explotar o probar sistemas de terceros (otro dominio, otra empresa, un cliente del usuario) sin una autorización explícita y por escrito de ese tercero. Si en algún momento un pedido de "testeo de seguridad" apunta a un target que no es claramente del usuario, preguntar antes de ejecutar cualquier herramienta activa (scanners, fuzzers, intentos de explotación).

## 1. Superficie de ataque real de este proyecto

- **Auth**: `passport.js` (Google/Facebook OAuth), JWT (`jsonwebtoken`), cookies (`cookie-parser`).
- **Entrada de usuario no confiable, dos veces**: (a) el usuario final de la app web (formularios, `express-validator`), y (b) el cliente de WhatsApp escribiéndole al bot — este segundo es el más subestimado: **todo mensaje de WhatsApp es input no confiable que termina en un prompt de LLM**, es superficie de prompt injection.
- **Webhooks entrantes**: MercadoPago (pagos) y el propio worker↔backend. Un webhook no verificado es una forma de que cualquiera dispare una acción (confirmar un pago falso, crear un turno) sin haber pagado ni hablado con el bot.
- **Datos sensibles en Mongo**: credenciales de sesión de WhatsApp, tokens de Google Calendar, datos de clientes finales (`ClienteMemoria`, `perfilResumen`).

## 2. Checklist de auditoría (propio código)

### Inyección
- `express-mongo-sanitize` ya está en dependencias — confirmar que está montado como middleware global en `server.js`, no solo importado.
- Cualquier query Mongoose construida con concatenación de strings de input de usuario (en vez de operadores/objetos) es sospechosa — revisar.
- El bot no ejecuta código/shell a partir de nada que venga de un mensaje de WhatsApp o del LLM — si alguna tool nueva llega a invocar `exec`/`eval` con un argumento generado por el LLM, es una inyección de comandos esperando pasar. Nunca hacerlo; si hace falta ejecutar algo, usar una lista cerrada de acciones permitidas (allowlist), nunca el string libre.

### Prompt injection (específico de este proyecto)
- El cliente de WhatsApp puede escribir cualquier cosa, incluyendo intentos de "ignorá tus instrucciones anteriores" o pedirle al bot que revele el system prompt, ejecute una tool de admin, o cambie precios.
- Mitigaciones ya vigentes a mantener: gate de admin basado en `fromMe` + JID del canal + rol, no en lo que dice el mensaje; sanitización de `tool_calls` huérfanos antes de mandar a Groq.
- Al agregar una tool nueva, preguntar: **¿esta tool puede ser invocada por texto de un mensaje de cliente normal, o solo por lógica de código?** Si el LLM decide libremente cuándo llamarla y la tool tiene efecto sensible (cobrar, cancelar algo, exponer datos de otro cliente), necesita una validación de negocio adicional fuera del LLM (el LLM decide *que* se llame, el código valida *si corresponde* antes de ejecutar).

### Autenticación y sesión
- JWT: verificar expiración razonable, `httpOnly` en la cookie si se usa cookie para el token, `secure` en producción.
- OAuth (`passport.js`): confirmar que el flujo no permite account takeover por email no verificado (si Google/Facebook no confirma el email, no debería poder "reclamar" una cuenta existente con ese email).

### Webhooks
- MercadoPago: verificar firma/`x-signature` del webhook, no confiar en el payload solo porque llegó a la URL correcta. Verificar el pago consultando la API de MercadoPago con el ID recibido, no solo confiar en el status que manda el webhook.
- Idempotencia: un webhook repetido no debe duplicar turno/cobro (ver también `testing.md`).

### Secretos
- `.env` nunca commiteado — confirmar `.gitignore` lo cubre.
- `ENCRYPTION_KEY`/`JWT_SECRET` con longitud mínima ya validada en `env.validator.js` — no bajar ese estándar.
- Ningún secreto (API key de Groq, credenciales de Google, access token de MercadoPago) debe aparecer en logs (`winston`/`pino`) ni en mensajes de error devueltos al cliente.

### Rate limiting / abuso
- `express-rate-limit` ya está en dependencias — confirmar que cubre endpoints de auth (fuerza bruta de login) y endpoints que disparan costo real (llamadas a Groq, envío de WhatsApp) para evitar abuso que genere costo o baneo de la cuenta de WhatsApp.
- El cupo de mensajes por plan (`quota.service.js`) es también un control de seguridad económica, no solo de producto — no debería poder eludirse manipulando el request.

### Headers y transporte
- `helmet` y `hpp` ya en dependencias — confirmar montados. HTTPS forzado en producción (Render/Railway ya lo dan, pero confirmar que no hay un endpoint que acepta HTTP plano para algo sensible).

## 3. Dependencias

- Correr `npm audit` (backend, frontend, worker) periódicamente; priorizar vulnerabilidades `high`/`critical` con exploit conocido sobre las de severidad baja sin vector de explotación real en este contexto.
- Antes de agregar una dependencia nueva a cualquiera de los tres `package.json`, chequear: mantenimiento activo, no tiene un reemplazo built-in de Node más simple, y no duplica algo que ya está instalado.

## 4. Pentesting activo sobre infraestructura propia (cuando el usuario lo pida explícitamente)

Solo contra staging/entornos propios, y confirmando el alcance antes de correr nada:
- **Escaneo de dependencias/SAST**: `npm audit`, `eslint-plugin-security`, Semgrep con reglas de OWASP.
- **DAST liviano**: OWASP ZAP en modo baseline contra la propia URL de staging.
- **Revisión manual dirigida**: probar los flujos de auth, webhooks y prompt injection descritos arriba a mano, con casos concretos (no un scanner ciego) — es donde este proyecto tiene más riesgo real.
- Nunca correr un scanner de alto volumen (fuzzing agresivo, brute force real) contra producción — puede tirar el servicio o gastar cupo de APIs de terceros (Groq, MercadoPago, Google) y generar costo/baneo real.

## 5. Qué hacer si se encuentra algo

Reportar al usuario con: qué se encontró, en qué archivo/línea, severidad real (¿es explotable hoy o es defensa en profundidad?), y el fix mínimo — no un rediseño completo a menos que lo pida. Nunca "arreglar silenciosamente" un hallazgo de seguridad sin decir qué se encontró; el usuario necesita saber qué estuvo expuesto y por cuánto tiempo.
