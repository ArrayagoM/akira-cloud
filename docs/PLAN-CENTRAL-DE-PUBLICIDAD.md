# Plan: Central de publicidad de Akira

> Estado: **planificación** (octubre 2026). Nada de esto está construido. Las capacidades de cada plataforma se verificaron en su documentación oficial el 7/10/2026 (fuentes al final); las políticas de las plataformas cambian seguido, así que hay que volver a revisarlas antes de construir cada parte.

## 1. Qué es

Una pantalla dentro de Akira, **“Publicidad”**, donde el dueño de un negocio que vende productos elige un producto de su Catálogo (o varios) y con un par de toques:

1. La IA arma el texto (en el tono del negocio) y la imagen o “tarjeta” con precio.
2. Elige **dónde** publicar: Facebook, Instagram, Mercado Libre, estado de WhatsApp, historias de Facebook e Instagram, y TikTok.
3. Revisa, confirma y se publica en todos a la vez (o programado).

Es la misma idea que el calendario de publicaciones que armamos para la página de Akira Cloud, pero para **cada cliente** y con sus productos reales (precio, stock y foto salen del Catálogo, igual que hoy el bot).

Regla de oro (la misma que ya usa el bot): **nunca se publica nada que el dueño no haya revisado y confirmado**, y nunca se inventan precios, stock, ofertas ni promesas.

## 2. Qué se puede hacer en cada canal (hoy)

| Canal | ¿Se puede publicar por API? | Qué hace falta | Dificultad | Riesgo |
|---|---|---|---|---|
| **Estado de WhatsApp** | Sí, con la misma librería que ya usa el bot (Baileys): texto, imagen o video a `status@broadcast`, indicando a qué contactos se muestra. No existe API oficial de WhatsApp Business para publicar estados. | Nada externo: el WhatsApp ya está vinculado. | Baja | **No es oficial**: usarlo en exceso puede llevar a restricciones del número. Mismo riesgo que ya tiene el bot; se mitiga con tope diario y publicaciones espaciadas. Solo lo ven los contactos que tienen guardado el número del negocio. |
| **Facebook (página)** | Sí: posts con foto o video, y **historias** (foto y video) con la API de Páginas de Meta. | App de Meta aprobada (ver sección 3). | Media | Aprobación de Meta (plazo estimado: de 1 a 4 semanas, no garantizado). |
| **Instagram** | Sí: foto, carrusel, reels e **historias**, para cuentas profesionales (Business o Creator) vinculadas a una página de Facebook. Tope: 100 publicaciones por API cada 24 horas por cuenta. | La misma app de Meta. Las imágenes tienen que estar en una **URL pública** al momento de publicar. | Media | Igual que Facebook. |
| **Mercado Libre** | Sí: `POST /items` crea la publicación (título, categoría, precio, cantidad, fotos). | Registrar una app en developers.mercadolibre.com.ar (redirect HTTPS), que el cliente la autorice (OAuth) y que sea vendedor. | **Alta** | Cada categoría exige atributos obligatorios y límites de fotos; si falta uno, rechaza la publicación. Hay que predecir la categoría y completar atributos (la IA ayuda, pero el dueño tiene que revisar). Las comisiones y costos de publicar los paga el vendedor a Mercado Libre. |
| **TikTok** | Sí (video y fotos), **pero** hasta que TikTok audite la app, todo lo publicado queda **en privado** (solo el propio usuario) y con un máximo de 5 usuarios por día. | Cuenta de desarrollador, verificación de dominio, **auditoría de la app** con un video de demostración del flujo completo. Las fotos se cargan desde una URL de un dominio verificado. | Alta | Sin auditoría no sirve para publicar al público. Con auditoría, TikTok exige mostrar vista previa y avisar si es contenido comercial. |
| **Historias de Facebook e Instagram** | Sí, dentro de las mismas APIs de arriba. | Ídem Meta. | Media | Ídem Meta. |

## 2b. Decisión (7/10/2026): cada cliente conecta su propia cuenta de desarrollador

En lugar de que Akira tramite una única app aprobada por Meta para todos sus clientes, **cada negocio conecta su propia app**, y Akira solo lo guía y hace las peticiones desde el programa. Cada uno se hace cargo de lo suyo (su cuenta, su verificación si la necesitara, sus límites).

Por qué funciona (Meta): una app en modo desarrollo puede usar los permisos de publicación sobre las páginas e Instagram **de quien tiene un rol en esa app**, sin App Review ni verificación del negocio. Si el dueño crea su propia app y es administrador de ella y de su página, entra en ese caso.

Cómo sería el flujo dentro de Akira (pantalla “Publicidad → Conectar”):
1. Una guía paso a paso (con capturas) para crear la app en developers.facebook.com, con los valores exactos para copiar y pegar.
2. El dueño pega el **ID y la clave de su app** en Akira (se guardan cifradas en su PC, como las claves de Groq y MercadoPago).
3. Akira abre el inicio de sesión de Meta, el dueño acepta, y Akira guarda el permiso de su página e Instagram (también en su PC).
4. Desde ahí Akira publica con esa conexión. Si algo se rompe, es en su app y no afecta a nadie más.

Detalle técnico: el retorno del inicio de sesión necesita una dirección HTTPS; se resuelve con una página sencilla de akiracloud.lat que solo **reenvía** el código a la PC del cliente (sin guardar nada ni conocer ninguna clave).

Lo mismo aplica a **Mercado Libre** (cada vendedor registra su aplicación y la autoriza).

Límites de este modelo:
- **Más pasos para el cliente** (crear la app lleva unos 15 a 30 minutos y la pantalla de Meta cambia seguido): hay que hacer la guía muy clara y mantenerla al día.
- **Instagram** requiere cuenta profesional (Business o Creator) vinculada a una página de Facebook.
- **TikTok no se resuelve así**: la auditoría la exige TikTok a cada app y, sin ella, solo se publica en privado. Para TikTok queda el kit y el botón Compartir.
- Si más adelante conviene un camino de un solo clic, se puede sumar una **app central de Akira** (con la verificación de Meta de la sección 3) como segunda opción, sin tirar nada de lo anterior.

## 3. La alternativa central: la aprobación de Meta (opcional, más adelante)

Para que **otros** negocios autoricen a una única app de Akira a publicar en sus páginas y cuentas, esa app necesita **Acceso Avanzado**, que exige:

- **Verificación del negocio** (de quien tiene la app, o sea Akira/TinchoDev): documentación legal, por ejemplo CUIT.
- **Verificación como Tech Provider** (hasta 5 días hábiles) para los permisos `pages_manage_posts` e `instagram_content_publish`.
- **App Review** de cada permiso (2 a 5 días hábiles por vuelta, a veces más): una app funcionando, un video mostrando el flujo real, la descripción del uso y una política de privacidad (ya tenemos `akiracloud.lat/privacidad`).

Mientras la app está en modo desarrollo, solo pueden usarla quienes tienen un rol en la app (nosotros): sirve para probar con las cuentas de Akira, **no** para clientes.

## 4. Cómo encaja con “los datos viven en tu PC”

Es el punto de diseño más delicado. Hoy el catálogo, las fotos y las claves están en la PC del cliente y la nube solo maneja cuenta y licencia.

- **Conexión (OAuth):** el login con Meta, Mercado Libre y TikTok necesita un servidor con la clave secreta de nuestra app. Esa parte vive en la nube (akiracloud.lat) y entrega el permiso a la PC del cliente. Los **tokens** de cada cliente se guardan cifrados **en su PC** (igual que las claves de Groq y MercadoPago), no en nuestra base.
- **Imágenes:** Instagram, Facebook y TikTok necesitan una **URL pública** de la foto. Propuesta: subir la imagen a un almacenamiento temporal nuestro solo para publicar y borrarla después. Son fotos de productos que el dueño igual va a mostrar públicamente, y nunca se suben chats, clientes ni documentos.
- **Publicar:** lo hace la PC del cliente (como el resto del bot), con la PC prendida. Los programados salen mientras Akira esté abierta.
- **Privacidad:** actualizar la política y los textos para decir qué sale de la PC (solo lo que el dueño elige publicar).

## 5. Propuesta por etapas (de menos a más riesgo)

**Etapa 1: “Kit de publicación” y WhatsApp (sin aprobaciones externas).** Se puede construir ya.
- Pantalla Publicidad: elegís un producto, la IA arma texto + imagen con precio, para cada canal (largo y hashtags distintos).
- **Estado de WhatsApp**: se publica directo (con tope diario y vista previa).
- Para Facebook, Instagram, Mercado Libre y TikTok: **un kit listo** para copiar y descargar, y desde el celular un botón **Compartir** (la app web del celular puede abrir el menú de compartir del teléfono con la imagen y el texto, y de ahí a Instagram, historias o TikTok). Funciona desde el día 1 y no depende de nadie.
- Calendario de publicaciones y recordatorio “hoy toca publicar”.

**Etapa 2: Facebook e Instagram (página, feed, reels e historias) con la app propia de cada cliente.**
- Sin esperar aprobaciones: cada negocio conecta su propia app (sección 2b).
- Se construye y se prueba de punta a punta con **tu cuenta** (tu página y tu Instagram profesional): la guía de conexión, el inicio de sesión, las publicaciones y las historias.
- Después se prueba con 2 o 3 clientes reales antes de abrirlo a todos.

**Etapa 3: Mercado Libre (también con la app propia de cada vendedor).**
- Publicar como **borrador** revisado por el dueño: Akira propone categoría, título, atributos y fotos; el dueño corrige y confirma. Empezar con pocas categorías (por ejemplo ropa, accesorios, productos de belleza) y ampliar.
- Sincronizar stock y precio con el Catálogo (que una venta en el local baje el stock en Mercado Libre y al revés).

**Etapa 4: TikTok.**
- Recién después de tener Meta aprobado (ya sabremos pasar una auditoría). Hasta que TikTok audite, solo queda el kit y el botón Compartir.

## 6. Qué necesito de vos (👤)

1. **Decidir el alcance de la etapa 1** (¿empezamos ya por ahí? es lo único que no depende de nadie).
2. **Meta (solo para probar con tu cuenta):** crear una app en developers.facebook.com con tu usuario (modo desarrollo, sin verificación ni CUIT). Los pasos que hagas quedan como base de la guía para clientes; si querés, los hacemos juntos por la pantalla.
3. **Mercado Libre (solo para probar con tu cuenta):** registrar tu aplicación en developers.mercadolibre.com.ar (el retorno HTTPS lo resuelve la página de akiracloud.lat).
4. **TikTok:** cuenta de desarrollador y verificación del dominio, más adelante.
5. Tener a mano tu **página de Facebook** (Akira Cloud) y una cuenta de **Instagram profesional** vinculada a ella, para las pruebas.

## 7. Riesgos y reglas que vamos a respetar

- **WhatsApp (no oficial):** tope diario, espaciado y avisar al dueño del riesgo. Es la parte frágil.
- **Spam:** nada de publicar repetido ni masivo. Un máximo razonable por canal y por día, y vista previa obligatoria.
- **Contenido comercial:** TikTok y Meta exigen marcar lo promocional; la IA no promete resultados ni inventa ofertas.
- **Cambios de las APIs:** las plataformas cambian permisos y límites; hay que dejar cada canal aislado para poder apagarlo sin romper el resto.
- **Mercado Libre:** una publicación mal armada se rechaza o, peor, se publica con datos incorrectos: por eso siempre pasa por revisión del dueño.

## 8. Esfuerzo estimado (orden de magnitud)

| Etapa | Esfuerzo | Depende de terceros |
|---|---|---|
| 1. Kit + estado de WhatsApp + compartir desde el celular | Medio (S/M) | No |
| 2. Facebook e Instagram (app propia de cada cliente) | Medio/Grande (M/L): guía de conexión + inicio de sesión + publicar | No (se prueba con tu cuenta) |
| 3. Mercado Libre (app propia de cada vendedor) | Grande (L) | Poco (registro de app de cada uno) |
| 4. TikTok | Grande (L) | **Sí: auditoría de TikTok** |

## Fuentes (documentación oficial, consultadas el 7/10/2026)

- Instagram: publicación de contenido (feed, reels, historias, límites) — https://developers.facebook.com/docs/instagram-platform/content-publishing
- Facebook: API de historias de Páginas — https://developers.facebook.com/docs/page-stories-api
- Meta: permisos y verificación para otras empresas — https://developers.facebook.com/docs/permissions
- TikTok: Content Posting API (fotos, auditoría y modo privado) — https://developers.tiktok.com/doc/content-posting-api-reference-photo-post y https://developers.tiktok.com/doc/content-sharing-guidelines
- Mercado Libre: registrar la aplicación y publicar productos — https://developers.mercadolibre.com.ar/en_us/es_ar/register-your-application y https://developers.mercadolibre.com.ar/publica-productos
- WhatsApp (Baileys): estados (`status@broadcast`) — https://www.mintlify.com/whiskeysockets/baileys/advanced/broadcast-stories
