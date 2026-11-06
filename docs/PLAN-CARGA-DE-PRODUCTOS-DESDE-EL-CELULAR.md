# Plan: cargar productos desde el celular con la cámara

Pedido del dueño (2/11/2026): desde el celular, con la cámara, detectar un producto, procesarlo, dejarlo listo para editar y ponerle precio; que llegue al programa de la PC con su imagen para que el bot lo use; y poder escanear el código de barras con la cámara.

**ESTADO (2/11/2026): la Etapa 1 está construida y probada en el repositorio, sin publicar.** Decisiones tomadas: sin IA primero, web del celular (PWA) antes que cámara nativa, opcional y apagado por defecto con el mismo interruptor del control remoto ("Controlar desde la app del celular"). Código: backend `lib/productos-celular.js`, `lib/codigo-lookup.js`, `models/ProductoPendiente.js`, rutas en `routes/mobile.routes.js` y `routes/licenses.routes.js` (+ límite de 1,8 MB solo para esa ruta en `app.js`); PC `main/productos-celular.js` y `main/comandos-remotos.js`; web `components/celular/CargarProducto.jsx` y `lib/productoCelular.js`. Tests: `backend-desktop/tests/productos-celular.test.js`, `desktop/tests/productos-celular.test.js` y ampliación de `comandos-remotos.test.js`. Falta: desplegar backend y web, publicar la 1.0.34 de la PC y probar con un Android y un iPhone reales. Etapas 2 y 3 siguen pendientes.

**Veredicto: es viable.** La mitad de las piezas ya existen. No hay que inventar nada nuevo en la arquitectura, solo sumar una "bandeja de productos" entre el celular y la PC.

## Lo que ya existe (verificado en el código)

| Pieza | Dónde | Estado |
|---|---|---|
| App del celular (web instalable `/celular`, PWA) | `frontend/src/pages/CelularPage.jsx`, `routes/mobile.routes.js` | En vivo, solo lee estado y manda 4 órdenes simples |
| Canal celular → nube → PC | `lib/comandos.js` (nube), `desktop/main/comandos-remotos.js` (PC consulta cada ~1 min si el dueño activó "control desde el celular") | En vivo, pero las órdenes no llevan datos ni imágenes |
| Catálogo en la PC con campos `nombre, precio, categoria, stock, descripcion, codigo` | `desktop/main/gestion/mapeo.js`, pantalla Catálogo | En vivo |
| Fotos de productos guardadas en la PC (se reducen, máx. 3 MB) y que el bot manda por WhatsApp | `desktop/main/catalogo-fotos.js` | En vivo |
| Lector de código de barras USB en Vender | `desktop/main/local-api/routes/gestion.routes.js` | En vivo; la cámara del celular figura como pendiente |
| Lectura de texto de fotos sin internet (OCR, Tesseract) | `desktop/main/bot-engine/services/bot/ocr.service.js` | En vivo |
| IA con modelo que ve imágenes (Groq, `llama-4-scout`) con la clave propia de cada cliente | `desktop/main/marketing/servicio.js`, `groq.service.js` | En vivo para texto; la visión no se usa todavía |

## Lo que falta construir

1. **Bandeja en la nube** (modelo `ProductoPendiente`): guarda el producto cargado desde el celular (datos + foto reducida) hasta que la PC lo retira, y lo borra al confirmarse (tope de 7 días si la PC no aparece). Solo de la cuenta del dueño; tope de tamaño y de cantidad.
2. **Pantalla "Productos" en `/celular`**: botón de cámara, escáner de código de barras, formulario editable (nombre, precio, categoría, stock, descripción) y envío.
3. **Importador en la PC**: al consultar la nube, baja los productos pendientes, guarda la foto con `catalogo-fotos`, crea el producto en el Catálogo (si el código de barras ya existe, actualiza en vez de duplicar) y confirma a la nube. Se enciende con el mismo interruptor del control desde el celular.
4. **Detección con IA** (etapa 2): foto del producto -> nombre, marca, categoría y descripción sugeridos. El precio NUNCA lo inventa la IA: lo pone el usuario.

## Etapas

**Etapa 1 (base, sin IA)**: foto + código de barras con la cámara + formulario + bandeja + importador. Si el código es de un alimento o bebida conocido, se completa nombre y marca desde Open Food Facts (gratis); si no lo encuentra, se carga a mano. Queda funcionando de punta a punta.

**Etapa 2 (IA)**: detección del producto desde la foto, con la clave de Groq de cada cliente (la misma que ya usan en Marketing, gratis para ellos). Siempre deja el borrador editable y marca "sugerido por IA, revisalo".

**Etapa 3 (comodidad)**: carga en ráfaga (varios productos seguidos), lista de borradores por revisar en la PC, y cámara nativa en la app de Android de prueba.

## Límites y riesgos (decirlos como son)

- **Código de barras en iPhone:** Safari no trae el lector integrado; se usa una librería de lectura (ZXing). Funciona, pero con poca luz es más lento. En Android con Chrome usa el lector del sistema.
- **Bases de códigos:** Open Food Facts cubre sobre todo alimentos y de forma parcial los productos argentinos; ropa, repuestos y otros rubros casi nunca aparecen. No hay garantía: si no está, se carga a mano.
- **La IA se equivoca**: puede confundir marca o variante. Por eso siempre queda para editar y no se guarda sola.
- **Privacidad:** hoy los datos de gestión no salen de la PC. Con esto, la foto y los datos del producto pasan por la nube de forma temporal (hasta que la PC los retira y se borran). Hay que decírselo al cliente y es opcional (apagado por defecto, igual que el control remoto).
- **La PC tiene que estar prendida y con internet** para recibir; si no, esperan en la bandeja hasta 7 días.
- **Tiempo de procesamiento:** la foto se reduce en el celular antes de enviar (unos 1,5 MB) para que suba rápido con datos móviles.

## Decisiones pendientes del dueño

1. ¿Arrancamos por la Etapa 1 (sin IA) o directo con IA? Recomendación: Etapa 1 primero.
2. IA con la clave de Groq de cada cliente (recomendado) o con la del dueño (costo propio).
3. ¿PWA primero (sirve en Android y iPhone) y cámara nativa después? Recomendado.
4. ¿Se acepta que la foto pase por la nube de forma temporal, opcional y apagado por defecto?

## Pruebas previstas

Tests de la bandeja (tope de tamaño, de cantidad, vencimiento, solo del dueño), del importador (sin duplicados por código de barras, foto guardada, confirmación) y del escaneo con un código de ejemplo. Verificación en un celular Android y uno iPhone reales antes de publicar.

## Estado: Etapa 2 (3/11/2026, sin publicar)

El dueño pidió que la IA lea la foto en la app ANTES de enviar, para revisar y editar. Quedó así:
- **En la app (principal):** al sacar la foto, `POST /api/mobile/productos/analizar` (`backend-desktop/lib/ia-foto-producto.js`) la lee con Groq visión (`llama-4-scout`, respaldo `llama-4-maverick`) y devuelve nombre, categoría y descripción sugeridos. Se completan solo los campos vacíos (o los que la IA había sugerido y el dueño no tocó), marcados "sugerido por IA". Botón "Completar con IA desde la foto" para reintentar. La foto no se guarda en esa lectura.
- **Clave usada:** la de la plataforma (`GROQ_PLATFORM_API_KEY` o `GROQ_API_KEY`, ya usada por la demo, sugerencias y soporte): fracción de centavo por foto. Tope por usuario: 6 por minuto y 60 por día. Sin clave o con la IA caída, la ruta responde "no disponible" y el dueño escribe a mano.
- **Respaldo en la PC** (`desktop/main/ia-producto.js`): solo si un producto llega con foto y SIN nombre, la PC lo lee con la clave de Groq del cliente; si tampoco puede, queda "Producto sin nombre dd/mm hh:mm". Si llega con nombre, la PC no toca nada.
- **Reglas:** nunca precio ni stock (si el texto de la IA trae un precio, se descarta el campo); solo lo que se lee o se ve; el prompt y el saneado están duplicados entre backend y PC y hay que cambiarlos juntos.
- Probado con tests (clientes simulados) y la pantalla en un navegador con servidor simulado. Pendiente: probar con la clave real y fotos reales de productos.
