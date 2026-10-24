# Plan de TikTok pago para Akira Cloud

Fecha: 14/10/2026. Objetivo del negocio: vender el programa. Objetivo de esta campaña: **que personas con un negocio instalen Akira y la prueben**, no sumar vistas.

## 1. Punto de partida (datos reales del panel de admin)

- 15 cuentas, ninguna paga. De esas, unas 8 son personas reales registradas desde el 19/8.
- Solo hay 2 equipos registrados en total: casi nadie que se registró llegó a instalar.
- Los dos videos publicados perdieron a la mayoría de la gente antes de los 3 segundos.
- El programa es **solo para Windows**. Quien ve un anuncio de TikTok está casi siempre en el celular y no puede instalarlo ahí.

Conclusión: las vistas no son el cuello de botella. Pagar por más vistas sin arreglar lo que pasa **después** del clic es tirar plata. Por eso el plan tiene una fase 0 sin gasto.

## 2. Fase 0 — antes de gastar un peso (3 a 5 días)

| # | Qué | Quién | Estado |
|---|-----|-------|--------|
| 1 | Publicar el contador de descargas y la pestaña Ingresos (ya están hechos en el código, falta desplegar) | Autorización de despliegue | pendiente |
| 2 | **Pasaje del celular a la PC**: si alguien entra desde el celular a /descargar, mostrar "Este programa se instala en una computadora con Windows" y un botón "Mandame el enlace por email". Además, un email de bienvenida al registrarse con el botón de descarga y los 3 pasos | Claude (se construye) | por hacer |
| 3 | **Medir de dónde vienen los registros**: guardar el `?r=` del enlace al crear la cuenta, para saber cuántos registros trae TikTok y no solo cuántas descargas | Claude (se construye) | por hacer |
| 4 | Probar la instalación completa en una PC limpia (aviso "Windows protegió su PC", inicio de sesión, QR) y anotar dónde se traba | Juan Martín | por hacer |
| 5 | Escribir a las 8 personas registradas reales: "¿pudiste instalarlo? ¿qué pasó?" | Juan Martín (Claude redacta) | por hacer |
| 6 | Cuenta de **TikTok for Business** creada y vinculada a la cuenta de Akira | Juan Martín | por hacer |

Sin los puntos 2 y 3, el anuncio manda gente a un lugar donde no puede hacer lo que queremos.

## 3. Cuánto cuesta empezar

- Según la [ayuda oficial de TikTok](https://ads.tiktok.com/help/article/budget?lang=es), en Ads Manager el presupuesto diario mínimo es de más de 50 USD por campaña o de más de 20 USD por grupo de anuncios (según dónde se configure), expresado en dólares.
- **Prueba mínima sugerida:** un grupo de anuncios con 20 USD por día durante 7 días = unos 140 USD en total. Confirmá la moneda y el monto que te muestra tu cuenta antes de aceptar.
- "Promote" (impulsar un video desde la app) puede tener otro mínimo en Argentina: no pude confirmarlo. Se ve en la pantalla de compra antes de pagar.
- El pago lo cargás vos en TikTok. Yo no puedo ingresar datos de tarjeta ni confirmar pagos.

## 4. Cómo se configura la campaña

- **Objetivo: Tráfico (clics al sitio)**, no "Conversiones". Con 20 USD por día no se juntan los eventos que el algoritmo necesita para optimizar conversiones, y todavía no tenemos pixel instalado.
- **Destino:** `https://akiracloud.lat/descargar?r=tiktok` (cuando esté hecho el punto 2 de la fase 0, la web detecta el celular y ofrece mandar el enlace por email). El enlace directo al instalador, para quien ya está en una PC: `https://akiracloud.lat/api/desktop/download?r=tiktok`.
- **Público:** Argentina únicamente (tu Mercado Pago es argentino y el cobro es en pesos), 25 a 54 años, intereses de emprendimiento, negocios y herramientas para comercios. Dejar la segmentación amplia al principio; el video hace el filtrado.
- **Ubicación:** solo TikTok, sin la red de socios.
- **Formato:** Spark Ads sobre videos publicados desde la cuenta de Akira (conservan comentarios y "me gusta"), 9:16, 15 a 25 segundos.

## 5. Los videos (lo que ya medimos)

El problema medido es la apertura: la gente se va antes de los 3 segundos. Reglas para los videos pagos:

1. **Titular en pantalla desde el segundo 0**, en texto grande, con una frase que describa un dolor concreto de quien tiene un negocio. Ejemplo de ángulos para probar (los tres con el mismo cuerpo del video):
   - A: "Contestar WhatsApp te come las horas"
   - B: "Un cliente te manda el comprobante: ¿es real?"
   - C: "Tu negocio atendiendo mientras dormís"
2. Una sola idea por video, en un lenguaje rioplatense y sin promesas que no podamos cumplir (nada de "ganá plata" ni cifras inventadas; no hay testimonios, así que no se muestran).
3. Pantallas reales del programa, no ilustraciones.
4. Cierre con una sola acción: "Probalo gratis, el enlace está abajo".
5. `horas.mp4` (17 s) ya está listo y sin publicar: es el candidato para el ángulo A. Para B conviene un video corto sobre la verificación de comprobantes.

## 6. Cómo se mide y cuándo se corta

Lo que se mira, en este orden:

| Métrica | Dónde se ve | Para qué sirve |
|---|---|---|
| Porcentaje que pasa los primeros 2 y 6 segundos | TikTok Ads Manager | ¿Funciona la apertura? |
| Clics y costo por clic | TikTok Ads Manager | ¿El mensaje convence? |
| Descargas con origen `tiktok` | Admin, pestaña Descargas | ¿Cuántos clics llegan a descargar? |
| Registros con origen `tiktok` | por construir (punto 3) | ¿Cuántos crean la cuenta? |
| Equipos nuevos registrados | Admin, pestaña Descargas (embudo) | ¿Cuántos instalan y entran? |
| **Costo por equipo instalado** | gasto ÷ equipos nuevos | La cifra que decide todo |

Reglas de decisión (reglas prácticas, no datos de TikTok):
- A los 3 días, apagar la variante con la mitad de clics que la mejor, siempre que cada una tenga unos 1.000 impresiones como mínimo.
- **No subir el presupuesto** hasta tener al menos algunos equipos instalados con origen TikTok y haber visto qué hacen en la primera semana.
- Si pasan los 7 días y los clics no llegan a descargas, el problema está en la página de destino o en el pasaje celular → PC, no en el video: se arregla eso antes de gastar más.
- Tope duro: no pasar de lo aprobado por vos para cada etapa.

## 7. Calendario

| Cuándo | Qué |
|---|---|
| Esta semana | Fase 0 (puntos 1 a 6). Se sigue publicando orgánico con el calendario que termina el 21/10. |
| Cuando la fase 0 esté lista | Subir 3 videos con los ángulos A, B y C y arrancar los 7 días de prueba (unos 140 USD). |
| Día 3 | Primera lectura y corte de la peor variante. |
| Día 7 | Lectura completa: costo por equipo instalado y decisión (seguir, cambiar el mensaje o frenar). |

## 8. Riesgos

- Los anuncios de TikTok pasan por revisión: los textos no pueden prometer resultados garantizados.
- Si el instalador sigue sin firma digital, el aviso de Windows va a frenar a parte de la gente que sí descargó.
- El riesgo de que WhatsApp bloquee un número por usar una conexión no oficial no lo resuelve ninguna campaña: antes de traer mucha gente conviene tener definido qué se les dice.
- Con 20 USD por día se aprende, pero no se garantiza ninguna venta.

Fuentes: [ayuda oficial de TikTok Ads sobre presupuestos](https://ads.tiktok.com/help/article/budget?lang=es), [guía de integración de Promote con Ads Manager](https://ads.tiktok.com/resources/help/article/how-to-integrate-promote-with-tiktok-ads-manager).
