# Plan: Proveedores inteligentes (buscar, comparar y calificar)

> Estado: **planificación** (octubre 2026). Nada de esto está construido. Hoy la sección Proveedores guarda los proveedores del negocio, sus movimientos (compras y pagos) y el saldo; no busca nada en internet.

## 1. Qué se pidió

Que un negocio que vende celulares (o auriculares, o ropa, o lo que sea) pueda, desde Proveedores, pedirle a Akira que le **busque fuentes confiables** y le muestre una **comparativa**: precios, costos de envío, una **calificación de fiabilidad** de cada proveedor, etc., adaptado al rubro del negocio.

## 2. La idea central: no es un solo “scraping”, son tres fuentes con riesgos distintos

| Fuente | Qué da | Riesgo / límite |
|---|---|---|
| **A. Lo que el negocio ya tiene en Akira** (sus compras, pagos, demoras, devoluciones) | Fiabilidad **propia y verdadera** de cada proveedor, historial de precios que pagó | Ninguno. Es la parte más valiosa y no necesita internet. |
| **B. Listas de precios que el dueño sube** (Excel, CSV, PDF o foto del WhatsApp del mayorista) | Comparativa real entre proveedores que el dueño ya conoce, con fecha | Ninguno. La IA extrae los precios; el dueño revisa. |
| **C. Búsqueda en la web** (Mercado Libre, tiendas, mayoristas públicos) | Descubrir proveedores y precios de referencia nuevos | Ver sección 3. |

## 3. Sobre el “scraping”: qué se puede y qué no

Sacar datos leyendo páginas web tiene tres problemas que hay que decir de frente:

1. **Términos de uso.** Mercado Libre, Amazon, la mayoría de las tiendas grandes y las redes **prohíben** el scraping automatizado en sus términos. Hacerlo desde la PC de cada cliente multiplica el problema (muchas IP, muchos negocios) y puede terminar en bloqueos de IP o de cuenta. No lo vamos a construir sobre sitios que lo prohíben.
2. **Fragilidad.** Cada sitio cambia su HTML seguido: un scraper que hoy anda, mañana devuelve basura sin avisar. Eso es peor que no tener nada, porque el dueño decide con precios equivocados.
3. **Confiabilidad de los datos.** Un precio publicado no es un precio vigente ni un stock real, y una “calificación” sacada de internet se puede inflar con reseñas falsas.

**Camino que sí proponemos (en este orden de preferencia):**

1. **APIs oficiales** donde existan. Mercado Libre tiene API pública de búsqueda de ítems y de **reputación del vendedor** (nivel, ventas completadas, reclamos, demoras), que es justo el dato de fiabilidad que se necesita y viene de la propia plataforma. Hay que verificar en la documentación vigente qué endpoints requieren autenticación y cuáles son abiertos antes de construir (cambian seguido).
2. **Buscadores con API** (por ejemplo una API de búsqueda web con licencia) para descubrir sitios de mayoristas y distribuidores del rubro; después se leen **solo páginas permitidas** (respetando `robots.txt`) y siempre se muestra el **enlace a la fuente y la fecha** de cada dato.
3. **Lo que el dueño sube o pega** (fuentes B), que es lo más confiable y lo que más usan los comercios reales: la lista de precios del mayorista llega por WhatsApp o PDF.
4. **Scraping directo**: solo en sitios cuyos términos lo permitan, y siempre marcado como “dato de referencia, verificar con el proveedor”. Nunca como fuente única de una decisión.

## 4. Qué vería el usuario

Pantalla **Proveedores → Explorar** (nueva pestaña):

1. **Rubro.** Se toma del perfil del negocio (ya existe en Marketing: `marketing.json`) y se puede cambiar: “celulares”, “auriculares”, “indumentaria”…
2. **Búsqueda guiada.** “¿Qué querés comprar?” (producto o categoría, cantidad aproximada, zona de entrega). La IA arma las consultas.
3. **Comparativa** con una fila por proveedor:
   - Precio unitario y por cantidad (si se conoce), con **fecha y fuente** de cada dato.
   - Costo de envío **estimado** (solo si la fuente lo informa o el dueño lo carga; no se inventa).
   - **Fiabilidad** (ver sección 5), con el detalle de por qué.
   - Condiciones: mínimo de compra, medios de pago, plazo de entrega, garantía.
4. **Acciones:** guardar como proveedor, agregar a favoritos, pedir cotización (arma el mensaje de WhatsApp, lo revisa el dueño), comparar contra lo que ya paga.
5. **Seguimiento de precios:** avisar si un proveedor sube o baja más de cierto porcentaje (con los datos que subió el dueño o las compras registradas).

Reglas de la casa (las mismas que ya usa la IA de Akira): **nada inventado** (si no hay dato, dice “sin dato”), siempre con fuente y fecha, y el dueño decide.

## 5. Calificación de fiabilidad: cómo se calcula

Un puntaje de 0 a 100 **explicable**, nunca una caja negra. Se combina solo lo que haya:

- **Historial propio** (peso mayor): entregas a tiempo, diferencias de precio entre cotización y factura, reclamos o devoluciones, cantidad de compras, antigüedad. Sale de los movimientos que ya se cargan en Akira (habrá que sumar campos: “llegó a tiempo”, “hubo problema”).
- **Reputación en la plataforma** (si la fuente la da por API): nivel de vendedor, porcentaje de reclamos, antigüedad.
- **Señales verificables del sitio**: datos fiscales visibles (CUIT, razón social), dirección física, medios de pago seguros, política de devolución visible.
- **Alertas** que bajan el puntaje: precios muy por debajo del mercado, pago solo por transferencia a una persona, sin datos de contacto, reseñas sospechosas.

Se muestra desglosado (“Fiabilidad 72/100: 40 por tu historial, 22 por reputación, 10 por datos del sitio”) y con la leyenda de que es una **guía** y no una garantía.

## 6. Cómo encaja con “los datos viven en tu PC”

- Las listas de precios, el historial y las calificaciones **se guardan en la base local** (SQLite) del cliente, igual que el resto.
- Las búsquedas en internet salen desde la PC del cliente con **su** clave de Groq (ya se configura en Config) y, si hace falta una API de búsqueda, con **su** propia clave (misma filosofía que la clave de Groq: nada compartido que pueda filtrarse).
- Akira (la nube) no ve ni guarda lo que el usuario busca ni los precios.

## 7. Propuesta por etapas

**Etapa 1 (sin riesgo, la más útil):** listas de precios y comparativa propia.
- Subir Excel/CSV/PDF/foto, la IA extrae productos y precios, el dueño revisa.
- Historial de precios por proveedor y producto, comparativa entre proveedores y “quién me conviene hoy”.
- Calificación de fiabilidad con el **historial propio**.

**Etapa 2:** descubrimiento con APIs oficiales.
- Búsqueda de productos y **reputación de vendedores en Mercado Libre** por su API.
- Sugerencias de proveedores por rubro (con fuente y fecha).

**Etapa 3:** búsqueda en la web abierta, solo sitios que lo permitan, con tope de consultas y avisos de “dato de referencia”.

**Etapa 4:** avisos de cambios de precio y pedidos de cotización por WhatsApp.

## 8. Decisiones que necesito de vos (👤)

1. ¿Empezamos por la **etapa 1** (listas de precios + comparativa + fiabilidad propia)? Es lo que más aporta y no depende de nadie.
2. ¿Aceptás que **no** hagamos scraping de sitios que lo prohíben (Mercado Libre incluido) y usemos sus APIs oficiales? Es la única forma de que sea estable y legal.
3. ¿Querés que el rubro salga del perfil del negocio o lo elija el usuario cada vez?
4. Para la etapa 2: registrar tu aplicación en developers.mercadolibre.com.ar (la misma que se necesita para Publicaciones: se reutiliza).

## 9. Esfuerzo estimado

| Etapa | Esfuerzo | Depende de terceros |
|---|---|---|
| 1. Listas de precios + comparativa + fiabilidad propia | Medio | No |
| 2. API de Mercado Libre (búsqueda + reputación) | Medio | Registro de app |
| 3. Búsqueda en web abierta | Grande | Sí (términos de cada sitio, cambios de HTML) |
| 4. Avisos y cotizaciones | Chico/Medio | No |
