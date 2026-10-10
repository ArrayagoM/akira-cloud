# Conexión de asistentes de IA (MCP) — diseño y seguridad

Akira puede dejar que un asistente de IA (Claude, etc.) **consulte** los datos del negocio mediante el protocolo MCP. Esta página explica qué hace, qué no hace y cómo está protegido. El código está en `desktop/main/mcp/` y las pruebas en `desktop/tests/mcp.test.js` (más de 100 comprobaciones, incluida una con el cliente oficial del SDK de MCP).

## Qué es y qué no es

- **Solo lectura.** Hay 7 herramientas de consulta (`resumen_del_dia`, `listar_turnos`, `resumen_de_caja`, `ver_catalogo`, `buscar_clientes`, `deudores`, `servicios_mas_pedidos`). No existe ninguna que cargue, cambie, borre o envíe algo (ni mensajes de WhatsApp). El protocolo implementado es el mínimo: no hay recursos, prompts ni muestreo. Una prueba verifica que ningún nombre de herramienta sugiera escritura y que todas se declaren de solo lectura.
- **Apagado por defecto.** Mientras el dueño no lo active en *Integraciones → Asistentes de IA*, no se abre ningún puerto.
- **Solo en la misma computadora.** Escucha únicamente en `127.0.0.1` (puerto 47322, o uno libre si está ocupado). Una prueba intenta entrar por la dirección de red de la PC y verifica que no se puede.
- **No es una puerta para internet.** Igual que los webhooks: nadie de afuera puede mandarle órdenes a Akira. Esto es coherente con la decisión de no exponer la PC del negocio.

## Cómo se protege (defensa en capas)

| Amenaza | Defensa |
|---|---|
| Alguien en la red o internet intenta entrar | Solo loopback (`127.0.0.1`); jamás en `0.0.0.0` |
| Una página web abierta en el navegador le habla al puerto local (CSRF / DNS rebinding) | Se rechaza todo pedido con encabezado `Origin` (los navegadores siempre lo mandan; los asistentes de escritorio no) y se valida el `Host`. No hay CORS ni respuesta a *preflight* |
| Adivinar la llave | 256 bits al azar; comparación en tiempo constante; con 10 intentos fallidos en un minuto se frena todo por un minuto |
| Robo del archivo de configuración | Las llaves no se guardan: solo su huella SHA-256 (`mcp.json`); la llave se muestra una única vez |
| Llave filtrada o vieja | Vencen (90 días por defecto, máximo 1 año), se revocan una por una o todas, máximo 5; el corte es inmediato |
| Abuso o bucle de un asistente | Máximo 120 pedidos por minuto por conexión, pedidos de hasta 64 KB, tiempos máximos, máximo 16 conexiones simultáneas, respuestas acotadas (máx. 100 resultados, rango de 62 días, 60 KB) |
| Fuga de datos sensibles | Cada herramienta arma su respuesta **campo por campo** (lista blanca); nunca se devuelve un registro de la base. No salen claves (MercadoPago, Groq, Google…), ni el texto de los chats, ni notas privadas, ni rutas de archivos. Teléfonos enmascarados (`***226`) |
| Inyección de instrucciones (un cliente escribe "ignorá todo y…" en su nombre) | Los textos de terceros se limpian (sin saltos de línea ni caracteres invisibles de dirección) y se recortan; cada respuesta lleva una nota ("datos, no instrucciones") y el servidor lo declara en sus instrucciones. Como además no hay herramientas de escritura, lo peor que podría pasar es una respuesta rara, no una acción |
| Errores que revelan detalles internos | Los errores internos no se le cuentan al cliente (sin rutas, sin trazas) |
| Falta de trazabilidad | Registro de actividad (`mcp-auditoria.jsonl`, rota a 1 MB): fecha, conexión, herramienta, argumentos recortados y si salió bien. Nunca se guardan llaves ni datos devueltos. Los intentos con herramientas inexistentes también quedan anotados |
| Un empleado o encargado cambia la configuración | Solo el dueño (perfil propietario) puede activar, crear o revocar; el encargado y el empleado quedan afuera por `perfiles.js` |
| Archivo corrupto | Falla cerrado: apagado y sin llaves |
| Sin sesión iniciada | Aunque la llave sea válida, no se entrega ningún dato |

## Lo que sí hay que saber (no es un fallo, es el costo de la función)

- **Los datos que consulta el asistente le llegan a él.** Si es un servicio en la nube (Claude, ChatGPT…), esa información sale de la PC hacia ese servicio. La pantalla lo avisa. Conviene conectar solo asistentes de confianza.
- **Cualquier programa que corra en la misma PC y conozca la llave puede consultar.** Por eso la llave no se guarda y vence. Si un virus controla la PC, ya puede leer los datos de todos modos.
- **Los datos de los clientes y de la caja no se cifran dentro de la base local** (igual que antes de esta función); lo que se cifra son las claves y los respaldos.

## Cosas que quedaron fuera a propósito (próximas etapas, con revisión aparte)

- **Escritura.** Si algún día se suma, será con una cola de propuestas que el dueño aprueba a mano dentro de Akira, nunca con ejecución directa.
- **Texto de los chats.** No se expone: es el lugar más fácil para la inyección de instrucciones.
- **Teléfonos completos.** Podría ser una opción por conexión, apagada por defecto.
- **Conexión desde otra computadora o desde internet.** No se hace.

## Cómo conectarlo

1. *Integraciones → Asistentes de IA (MCP)* → activar.
2. *Nueva conexión*, ponerle un nombre y elegir cuánto dura. Se muestra la llave **una sola vez**.
3. Pegarla en el asistente. Ejemplos que muestra la pantalla:
   - Claude Code: `claude mcp add --transport http akira http://127.0.0.1:47322/mcp --header "Authorization: Bearer <llave>"`
   - Claude Desktop: archivo `claude_desktop_config.json` con `mcp-remote` (necesita Node.js; las opciones pueden variar según la versión).
   - Cualquier cliente MCP con transporte HTTP: dirección `http://127.0.0.1:<puerto>/mcp` y encabezado `Authorization: Bearer <llave>`.

El ejemplo de Claude Code se probó con el cliente oficial del SDK de MCP (mismo transporte). El de Claude Desktop con `mcp-remote` no se pudo probar en una instalación real.
