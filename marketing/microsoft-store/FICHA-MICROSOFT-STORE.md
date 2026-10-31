# Ficha de Akira Cloud para Microsoft Store (Partner Center)

**Camino elegido: paquete MSIX/AppX** (Microsoft lo firma al aprobarlo; no hace falta comprar certificado). El borrador anterior de tipo "EXE o MSI" se borró el 28/10/2026.

- Producto: Akira Cloud, ID de Store **9PM7BL2V6W22**, https://apps.microsoft.com/detail/9PM7BL2V6W22
- Panel: https://partner.microsoft.com/es-ES/dashboard/products/9PM7BL2V6W22/overview
- Identidad (va en el build): Name `TinTechSAS.AkiraCloud`, Publisher `CN=8B7C4A44-8A3A-4925-B827-A9B91CBF81DE`, PublisherDisplayName `TinTech SAS`
- Desarrollado por: TinTech
- Reserva del nombre: válida 90 días desde el 28/10/2026.

## Build del paquete (desde desktop/)
```
npx electron-builder --win appx --x64 -c.directories.output=dist-store -c.appx.identityName=TinTechSAS.AkiraCloud "-c.appx.publisher=CN=8B7C4A44-8A3A-4925-B827-A9B91CBF81DE" "-c.appx.publisherDisplayName=TinTech SAS"
```
Sale en `desktop/dist-store/`. El build de la Store no usa el actualizador propio (`process.windowsStore`): las actualizaciones las hace la Store. Cada versión nueva se sube como un envío nuevo en Partner Center.

## Estado en Partner Center (envío 1)
- Precios y disponibilidad: todos los mercados, ARS precio 0 (gratis; la suscripción se cobra por fuera con Mercado Pago).
- Propiedades: completado (Empresa + Productividad, usa información personal, privacidad https://akiracloud.lat/privacidad, sitio https://akiracloud.lat, soporte soporte@akiracloud.lat).
- Clasificación por edades: cuestionario respondido (3+); falta marcar la casilla de términos IARC y mayoría de edad y Guardar (lo hace el dueño).
- Paquetes: paquete armado el 28/10/2026 en `desktop/dist-store/AkiraCloud-1.0.32.msix` (160 MB). Se arma a mano porque el `makeappx` que trae electron-builder no corre en esta PC (error de configuración en paralelo): `desktop/dist-store/stage/` = AppxManifest.xml + assets/ (de build-resources/appx) + app/ (win-unpacked), y luego `makeappx pack /o /h SHA256 /d stage /p AkiraCloud-1.0.32.msix` con el makeappx oficial de Microsoft (nuget Microsoft.Windows.SDK.BuildTools 10.0.26100.9169, copia en `herramientas-store/makeappx-microsoft`, excluida de git). Falta subirlo a mano en Partner Center → Paquetes. No se probó instalado (un MSIX sin firmar no se instala localmente sin certificado de prueba).
- Paquete subido y validado (28/10/2026), Windows 10/11 Desktop. runFullTrust requiere aprobación de Microsoft: justificación cargada en Opciones de envío.
- Descripciones de Store: textos cargados en Español (Argentina) y Español (España) (los dos idiomas salen del manifiesto del paquete). Faltan las imágenes (capturas, logo, póster) en CADA idioma, a mano.
- Opciones de envío: completado (publicar apenas supere la certificación).
- Notas para la certificación: cargadas. Falta una credencial de prueba (Información adicional sobre pruebas → Nueva credencial): una cuenta real de akiracloud.lat con trial vigente y el email ya verificado.

## Descripción
Akira Cloud convierte tu WhatsApp en un asistente de negocios que trabaja las 24 horas y te permite manejar tu emprendimiento desde la computadora.

El bot atiende a tus clientes por WhatsApp con inteligencia artificial: responde consultas, informa precios, horarios y disponibilidad, consulta tu catálogo de productos y agenda turnos sin errores ni superposiciones. Cuando una consulta necesita de una persona, te avisa para que continúes vos.

Todo lo que necesitás para gestionar tu negocio, en un solo programa:
- Agenda de turnos con recordatorios automáticos
- Catálogo de productos y servicios
- Clientes, pedidos y presupuestos
- Caja, ingresos y control de deudores
- Cobros con Mercado Pago
- Lectura y verificación de comprobantes de transferencia (captura o PDF)
- Documentos, reportes y respaldos cifrados
- Equipo, sucursales y marketing

Tus datos de gestión se guardan en tu propia computadora. Hecho en Argentina.

Probalo gratis: 7 días de uso, sin tarjeta. Más información en akiracloud.lat

## Descripción corta (270 caracteres o menos)
Bot de WhatsApp con inteligencia artificial que atiende a tus clientes las 24 horas, agenda turnos, cobra con Mercado Pago y te ayuda a gestionar tu negocio. Probalo gratis 7 días, sin tarjeta.

## Novedades de esta versión
Versión 1.0.32: mayor seguridad en las cuentas con verificación de email por código, y el bot ahora usa los productos y la información de tu negocio para responder a tus clientes.

## Característica del producto
Bot de WhatsApp con inteligencia artificial las 24 horas

## Palabras clave
bot whatsapp, chatbot, agenda de turnos, gestion de negocio

## Copyright
© 2026 Akira Cloud. Todos los derechos reservados.

## Términos de licencia
Los términos de uso de Akira Cloud están publicados en https://akiracloud.lat/terminos y la política de privacidad en https://akiracloud.lat/privacidad. Al instalar y usar el programa aceptás esos términos.

## Imágenes (en esta carpeta)
- Capturas (PNG, 1440 px de ancho): `capturas/dashboard.png`, `chats.png`, `agenda.png`, `catalogo.png`, `caja.png`
- Logo 1:1 1080x1080: `logo-1080x1080.png` (ampliado desde el ícono de 512 px)
- Póster 2:3 1440x2160: `poster-1440x2160.png`
- Las imágenes se cargan a mano en Partner Center: la página no acepta la subida automática.

## Respuestas del cuestionario IARC (para repetir si hace falta)
Tipo: "Todos los demás tipos de aplicaciones". Sí solo en "contenido en línea" (el bot genera respuestas con IA). Todo lo demás No (contenido descargado, uso compartido entre usuarios, violencia, sexualidad, lenguaje, sustancias, productos con restricción de edad, ubicación, compra de contenido digital, recompensas, navegador, informativa/educativa). Resultado: 3+.
