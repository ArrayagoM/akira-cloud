# Seguridad de las cuentas (alta, verificación, sesiones)

Escrito el 23/10/2026 después de detectar cuentas sospechosas en el panel de admin. Estado: **hecho y probado en el repo, pendiente de desplegar** (backend, web y versión del programa).

## Qué estaba mal

1. **El alta no verificaba el email.** Cualquiera podía crear una cuenta con cualquier email y recibía sesión al instante. Eso permite cuentas falsas, usar el email de otra persona y llenar la base.
2. **Secuestro previo de cuentas.** Si alguien registraba el email de otra persona con *su* contraseña y esa persona después entraba con Google o Facebook, el sistema vinculaba el proveedor a la cuenta existente y la contraseña del atacante seguía valiendo.
3. **Sin defensa contra robots**: ni campo trampa ni token de formulario, y los límites de intentos vivían en la memoria del servidor (en Vercel se reinician en cada arranque, o sea que no frenaban nada).
4. Validación débil: nombre y teléfono sin controles, contraseñas comunes aceptadas ("Password1"), `search` del admin usado como expresión regular, CORS que aceptaba cualquier dominio que *empezara* con `https://akiracloud.lat`, y recuperar contraseña sin tope por email (se podía usar para llenarle la casilla a alguien).
5. El sitio web casi no tenía encabezados de seguridad.

## Qué se hizo

| Tema | Cómo queda |
|---|---|
| Alta de cuentas | Crea la cuenta **sin verificar** y manda un código de 6 dígitos al email; **no entrega sesión** hasta escribirlo. El código vence a los 15 minutos, se guarda como hash (HMAC), admite 5 intentos (contados de forma atómica, aunque lleguen en paralelo) y se puede reenviar cada 60 s, 5 veces por hora. |
| Inicio de sesión | Una cuenta sin verificar recibe `403 EMAIL_NO_VERIFICADO` aunque la contraseña sea correcta; la pantalla muestra el campo del código. Un token firmado de esa cuenta tampoco sirve. Las cuentas anteriores (campo ausente) se consideran verificadas, así nadie queda afuera. |
| Robots | Token de formulario firmado (el servidor lo entrega al abrir /register; un envío en menos de 3 s o sin token se rechaza; máximo 3 usos), campo trampa invisible, topes por IP (6 por hora, 15 por día), por email, y emails descartables bloqueados. Todo en la base (`Limite`, con vencimiento automático), no en memoria. |
| Google y Facebook | Si la cuenta existente tenía una contraseña nunca verificada, al entrar con el proveedor se **borra esa contraseña**, se cierran las sesiones anteriores y la cuenta queda verificada. Una cuenta verificada por código conserva su contraseña. Si el proveedor no confirma el email, no se crea nada. |
| Validación (servidor y pantalla) | Nombre y apellido solo con letras, sin números ni links; teléfono de 8 a 15 dígitos; contraseña de 8 a 72 caracteres con mayúscula, minúscula y número, sin las más comunes ni parte del email o del nombre; tipos estrictos (un objeto en lugar de texto se rechaza); largos máximos en todos los campos de acceso. Las reglas están en `backend-desktop/lib/seguridad-cuentas.js` y su espejo en `frontend/src/utils/validaciones.js`. |
| Recuperar y cambiar contraseña | Topes por IP y por email; misma regla de contraseñas; llegar por el link del email también verifica la cuenta. |
| Admin | Etiqueta "sin verificar", filtro, botones por cuenta (exigir confirmar el email / marcar como verificado) y el panel **Cuentas para revisar** (lista con vista previa y recién después "Exigir verificación"; no borra ni bloquea nada). La búsqueda de usuarios ya no es una expresión regular libre. |
| Servidor | CORS con coincidencia exacta de origen (los de desarrollo solo fuera de producción). |
| Sitio web | `Content-Security-Policy` (probada en un navegador real: 0 violaciones en las páginas principales y bloquea conexiones ajenas), `Strict-Transport-Security`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`. |

## Cifrado: qué hay y qué no

- Contraseñas: bcrypt con costo 12. Token de recuperar contraseña: SHA-256. Código de verificación: HMAC-SHA256 con la clave del servidor. Sesiones: JWT firmado, revocables con `tokenVersion`.
- Programa de escritorio: las claves (Groq, Mercado Pago, Google, Rime) se guardan cifradas con el almacén de claves del sistema; los respaldos van cifrados con contraseña.
- Transporte: HTTPS en todo; ahora con HSTS.
- **No hay** cifrado extra de campos en la base de la nube más allá de lo que da el proveedor de la base. La nube guarda poco: cuenta, licencia y contadores; los datos de gestión están solo en la PC del cliente.

## Cómo se opera

- Variables de entorno de emergencia (en Vercel, backend): `VERIFICACION_EMAIL=off` (vuelve al alta de antes, sin código; usar solo si el correo deja de funcionar) y `REGISTRO_TOKEN=off` (apaga solo el token de formulario). Con el valor por defecto todo está activo.
- Si el correo no sale, el alta responde 503 y **no deja una cuenta imposible de verificar**.
- **Para las cuentas sospechosas que ya existen** (como las del panel): Admin → Usuarios → "Cuentas para revisar" → Revisar → mirar la lista → "Exigir verificación". Las cuentas reales confirman con el código al volver a entrar; las falsas no pueden.
- Un robot que sí controle un buzón real puede verificar su cuenta: el límite de eso son los topes por IP y los emails descartables bloqueados. Un captcha (Cloudflare Turnstile) está preparado en `services/cuentas.service.js` pero **no conectado a la pantalla**: no activarlo hasta sumar el widget y permitir `challenges.cloudflare.com` en la política CSP.

## Pendiente

- Desplegar (backend, web y una versión nueva del programa, que comparte la pantalla de registro).
- Que el dueño corra "Cuentas para revisar" con su sesión de administrador.
- Revisar los registros de las cuentas sospechosas (IP y fecha en la pestaña Logs, tipo `auth_register`) para ver si vienen de una misma IP.
- Si el volumen crece: captcha, y pedir verificación también al cambiar de email.
