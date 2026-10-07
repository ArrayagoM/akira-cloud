# Akira Cloud — Hoja de ruta completa (ordenada por dependencias)

Regla de oro: **no se rompe nada de lo que ya funciona.** Cada tarea es *aditiva*, lleva sus tests, y
se publica solo después de pasar la suite, el verificador del instalador (`npm run release:build`) y
una revisión visual. Las funciones nuevas que envían mensajes a clientes son **opt-in** (apagadas por
defecto) y siempre con confirmación del dueño.

**Impacto:** 🔴 crítico · 🟠 alto · 🟡 medio · ⚪ bajo.  **Esfuerzo:** `S` horas · `M` 1–3 días · `L` 1–2 semanas.
**Estado:** ✅ hecho · 🔧 en curso · ⬜ pendiente.  **👤** = necesita algo tuyo (cuenta, pago, decisión).

## Por qué este orden

* El bot vive en la PC y habla por WhatsApp: **si WhatsApp se cae, no puede avisar por ahí**. Los avisos de
  “algo se rompió” van por un canal aparte: nube + email, y después push en el celular (app nativa).
* Lo que otras funciones usan va antes: **Ficha 360** antes de segmentos, reactivación y fidelidad;
  **Stock** antes de Ventas rápidas y del Carrito; **Presupuestos/Recibos** antes de **Facturación ARCA**;
  **Usuarios y roles** antes de Profesionales, Sucursales y la API pública.
* Lo que protege el negocio del cliente (respaldo) va antes que lo que lo hace crecer.

```
E1  Canal de estado PC → nube + alertas por email ........ ✅ (falta el “reloj” 1.3)
E2  Datos protegidos y avisos al dueño
E3  App móvil nativa Android + iOS (monitoreo + push) y PWA
E4  Clientes: ficha 360, fidelización y reseñas
E5  Bot e IA: rubros, conocimiento propio, pedidos ........ ✅
E6  Dinero y operación: stock, ventas, reportes, facturación
E7  Equipo: usuarios, profesionales, sucursales
E8  Integraciones
E9  Plataforma: ayuda, estadísticas, firma, Linux/Mac
E10 Landing + SEO/GEO (al final, describiendo lo que ya funciona)
```

---

## E1 — Canal de estado PC → nube y alertas por email

| # | Tarea | Imp. | Esf. | Estado |
|---|-------|:----:|:----:|:------:|
| 1.1 | La PC informa el estado real del bot a la nube (al instante cuando cambia) | 🟠 | M | ✅ 1.0.16 |
| 1.2 | **Alerta si el bot se desconecta**: email al dueño (1 por incidente) + aviso de “volvió” | 🟠 | S | ✅ 1.0.16 |
| 1.3 | Alerta si la **PC entera** deja de dar señales (apagada / sin internet) — necesita un “reloj” externo cada 5 min | 🟠 | M | ⬜ 👤 elegir reloj |
| 1.4 | Interruptor para apagar/encender las alertas por email | 🟡 | S | ✅ 1.0.16 |
| 1.5 | Aviso de Windows en la PC cuando el bot se cae | 🟡 | S | ✅ 1.0.16 |

## E2 — Datos protegidos y avisos al dueño

| # | Tarea | Imp. | Esf. | Estado |
|---|-------|:----:|:----:|:------:|
| 2.1 | **Respaldo automático y restauración**: copia cifrada diaria de la base local en una carpeta elegida (puede ser la de Google Drive/OneDrive/pendrive) + botón “Restaurar” | 🔴 | M | ✅ 1.0.17 |
| 2.1b | Subida directa a tu Google Drive (sin depender de la app de escritorio de Drive) | 🟡 | M | ⬜ 👤 |
| 2.2 | **Resumen del día** al dueño a la hora elegida (turnos de hoy, cuánto entró, quién debe, documentos sin revisar) por WhatsApp. Si WhatsApp está caído se reintenta; el push del celular (E3) lo cubre | 🟠 | S | ✅ 1.0.17 |
| 2.3 | **Derivar a una persona**: si el cliente está molesto o pide algo raro, avisa al dueño con el resumen de la charla y el bot deja de responder ese chat | 🟡 | S | ✅ 1.0.17 |
| 2.4 | **Respuestas fuera de horario** distintas (“te respondemos mañana a las 9”) | 🟡 | S | ✅ 1.0.17 |
| 2.5 | **Tutorial interactivo**: lista de “Primeros pasos” que se tilda sola según lo configurado | 🟠 | S | ✅ 1.0.17 |
| 2.6 | **Recordatorio de vencimientos** del dueño (monotributo, alquiler, impuestos) — se hace junto con 6.3 (gastos recurrentes): es la misma función | 🟡 | S | ✅ 1.0.21 |

## E3 — App móvil nativa (Android + iOS) — *solo monitoreo y ajustes mínimos*

El bot, la sesión de WhatsApp y los datos **siguen en la PC**. El celular es control remoto + alertas.
Tecnología: **Expo (React Native)**: un código para Android e iOS, builds en la nube (EAS, sin Mac),
push con Expo Push. Requiere cuenta Expo (gratis) 👤.

| # | Tarea | Imp. | Esf. | Estado |
|---|-------|:----:|:----:|:------:|
| 3.1 | Backend: registro de celulares + tokens push, sesiones revocables | 🟠 | M | ✅ 1.0.18 |
| 3.2 | **Push** cuando el bot se cae / vuelve / la PC no da señales (se suma al email de E1) | 🟠 | M | ✅ 1.0.18 |
| 3.3 | Cola de **comandos mínimos** (pausar/reanudar bot, modo vacaciones), con vencimiento y firma | 🟠 | M | ✅ 1.0.18 |
| 3.4 | App: login, pantalla *Estado* (PC en línea, WhatsApp conectado, última actividad) | 🟠 | M | ✅ código listo |
| 3.5 | App: pantalla *Resumen* y *Ajustes mínimos* | 🟡 | S | ✅ código listo |
| 3.6 | **PWA**: la web instalable en el celular con el resumen del negocio | 🟡 | S | ⬜ |
| 3.7 | App de prueba instalable (APK / TestFlight) | 🟡 | S | ⬜ 👤 |
| 3.8 | Publicación en Google Play (US$25) y App Store (US$99/año) | 🟠 | L | ⬜ 👤 |

> **Estado de la app móvil:** el código está en `mobile/` (Expo), probado en el navegador contra la lógica real del
> servidor (ingreso, estado, pausar/reanudar, vacaciones, resumen, ajustes). Para instalarla en un celular falta
> armarla con EAS (cuenta gratis de Expo + credencial de Firebase para Android): pasos en `mobile/README.md`.
> Las notificaciones push no se pueden probar en Expo Go ni en el navegador, solo en la versión armada.

## E4 — Clientes: ficha 360, fidelización y reseñas

| # | Tarea | Imp. | Esf. | Estado |
|---|-------|:----:|:----:|:------:|
| 4.1 | **Importar clientes desde Excel/CSV** (nuevo tipo en el asistente de importación) | 🟠 | S | ✅ 1.0.19 |
| 4.2 | **Ficha 360 del cliente**: turnos, deuda, documentos, notas y etiquetas en un solo lugar | 🟠 | M | ✅ 1.0.19 |
| 4.3 | **Etiquetas y segmentos** para enviar promociones solo a quienes corresponde | 🟡 | M | ✅ 1.0.19 |
| 4.4 | **Puntaje de ausencias**: a quien falta seguido, el bot le pide seña | 🟡 | S | ✅ 1.0.19 |
| 4.5 | **Reseñas después del servicio**: al día siguiente “¿cómo te fue?” y, si responde bien, el enlace de Google | 🟠 | S | ✅ 1.0.19 |
| 4.6 | **Reactivar clientes inactivos** con un mensaje suave, siempre con tu confirmación | 🟠 | M | ✅ 1.0.19 |
| 4.7 | **Cumpleaños y fechas** con saludo y descuento | 🟡 | S | ✅ 1.0.19 |
| 4.8 | **Puntos / tarjeta de fidelidad** (“a la décima visita, una gratis”) | 🟡 | M | ✅ 1.0.19 |

## E5 — Bot e inteligencia artificial

| # | Tarea | Imp. | Esf. | Estado |
|---|-------|:----:|:----:|:------:|
| 5.1 | **Plantillas por rubro** (peluquería, consultorio, gimnasio, alquileres…): servicios, horarios, estilo del bot y textos de ejemplo | 🟠 | M | ✅ 1.0.20 |
| 5.2 | **Base de conocimiento propia**: el dueño sube su PDF de preguntas frecuentes y el bot lo usa | 🟠 | M | ✅ 1.0.20 |
| 5.3 | **Enviar fotos del catálogo** cuando el cliente pregunta por un producto | 🟡 | S | ✅ 1.0.20 |
| 5.4 | **Tomar pedidos con carrito**: suma productos, calcula el total y genera el link de pago (usa Stock de E6) | 🟠 | M | ✅ 1.0.20 |
| 5.5 | **Análisis de conversaciones**: qué preguntan más y qué no supo responder el bot | 🟡 | M | ✅ 1.0.20 |
| 5.6 | **Copiloto**: sugiere una respuesta al dueño cuando atiende él mismo | 🟡 | M | ✅ 1.0.20 |

## E6 — Dinero y operación

| # | Tarea | Imp. | Esf. | Estado |
|---|-------|:----:|:----:|:------:|
| 6.1 | **Stock y ventas rápidas**: “vender” en dos toques, descuenta stock, suma a la Caja y avisa cuando queda poco | 🟠 | M | ✅ 1.0.21 |
| 6.2 | **Señas configurables por servicio** | 🟡 | S | ✅ 1.0.21 |
| 6.3 | **Gastos recurrentes** (alquiler, internet) que se cargan solos cada mes | 🟡 | S | ✅ 1.0.21 |
| 6.4 | **Cierre de caja diario** con diferencias contra lo que dice el sistema | 🟡 | S | ✅ 1.0.21 |
| 6.5 | **Metas del mes** con barra de progreso | ⚪ | S | ✅ 1.0.21 |
| 6.6 | **Reportes**: servicios más pedidos, clientes frecuentes, horas pico, ausencias, evolución mes a mes, con exportación | 🟠 | M | ⬜ |
| 6.7 | **Presupuestos y recibos en PDF** con tu logo, enviados por WhatsApp | 🟠 | M | ✅ 1.0.22 |
| 6.8 | **Conciliación con MercadoPago**: traer los movimientos de la cuenta y cruzarlos con la Caja | 🟠 | M | ✅ 1.0.22 |
| 6.9 | **Facturación electrónica ARCA** (Factura C / ticket desde un cobro), con proveedor intermediario | 🔴 | L | ⬜ 👤 |
| 6.10 | **Códigos de barras** para el inventario | 🟡 | M | ✅ 1.0.22 |

## E7 — Equipo y operación

| # | Tarea | Imp. | Esf. | Estado |
|---|-------|:----:|:----:|:------:|
| 7.1 | **Varios usuarios con roles** (el empleado ve la agenda pero no la Caja) | 🟠 | L | ⬜ |
| 7.2 | **Profesionales con agenda propia y comisiones** | 🟠 | L | ⬜ |
| 7.3 | **Sucursales** | 🟡 | L | ⬜ |

## E8 — Integraciones

| # | Tarea | Imp. | Esf. | Estado |
|---|-------|:----:|:----:|:------:|
| 8.1 | **Google Sheets**: la Caja y los clientes se reflejan en una planilla | 🟡 | M | ⬜ |
| 8.2 | **Webhooks y API** para Zapier / Make (usa los roles de 7.1) | 🟡 | M | ⬜ |
| 8.3 | **Tienda Nube / Mercado Libre**: stock y ventas sincronizados | 🟠 | L | ⬜ |
| 8.4 | **Instagram y Messenger**: el mismo bot atiende esos mensajes | 🟠 | L | ⬜ |
| 8.5 | **Mercado Pago Point** (posnet): cobros con tarjeta que entran solos a la Caja | 🟡 | L | ⬜ |

## E9 — La plataforma en sí

| # | Tarea | Imp. | Esf. | Estado |
|---|-------|:----:|:----:|:------:|
| 9.1 | **Estadísticas de uso** de tus propios usuarios (qué funciones usan; sin datos de sus clientes) | 🟡 | S | ⬜ |
| 9.2 | **Centro de ayuda** con búsqueda y videos cortos | 🟡 | M | ⬜ |
| 9.3 | **Instalador firmado** (Microsoft Store/MSIX ≈ US$19 u OV) | 🟠 | M | ⬜ 👤 |
| 9.4 | **Versión para Linux y Mac** | 🟠 | L | ⬜ |

## E10 — Landing, SEO y recomendación por IAs (**al final**)

Se hace cuando todo lo anterior funcione, para describir solo lo que existe de verdad. Hay **borradores
guardados** en `docs/borradores/` (secciones de la landing, JSON-LD, FAQ, textos para crawlers).
Incluye: corregir el SEO desactualizado (todavía habla del SaaS en Render / macOS / Linux), `llms.txt`,
JSON-LD, sitemap, `og-image.png` real, guías orientadas a preguntas que se le hacen a una IA,
Search Console/Bing (👤 verificar dominio por DNS), testimonios reales (👤) y enlaces a las tiendas.

---

## Lo que necesito de vos (👤), en el orden en que lo voy a necesitar

1. **1.3:** elegir el “reloj” gratuito (cron-job.org o GitHub Actions) — te guío paso a paso.
2. **2.1 (segunda parte):** conectar tu Google Drive para el respaldo en la nube (autorizás una vez).
3. **3.7:** cuenta gratuita de Expo para armar la app de prueba; **3.8:** Google Play y Apple Developer.
4. **6.9:** elegir el proveedor de facturación ARCA y tener CUIT/certificado de prueba.
5. **9.3:** cuenta de Partner Center para firmar el instalador.
6. **E10:** verificar el dominio en Search Console y pasarme testimonios reales.
