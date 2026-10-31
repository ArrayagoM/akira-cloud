# Ciclo de análisis y publicación de videos (TikTok y Facebook)

Lo ejecuta una tarea programada (`akira-videos-ciclo`) a las 09:07 y a las 21:07 (hora de Argentina). Cada corrida arranca sin memoria: **todo lo que necesita saber está en este archivo, en `registro-ciclos.md` y en `aprendizajes.md`**.

## Objetivo
Crecer en **TikTok (@tinchotech)** y en la **página de Facebook "Akira Cloud"** con un solo mensaje: *probá Akira Cloud gratis en akiracloud.lat* (7 días de uso, sin tarjeta). Cada video mejora al anterior según lo que muestran las estadísticas.

## Autorización del dueño (Juan Martín Arrayago)
El dueño pidió expresamente (14/10/2026): analizar las estadísticas cada cierto tiempo, mejorar y **publicar otro video** en TikTok y Facebook para ir creciendo. Eso autoriza **publicar los videos de este ciclo** en esas dos cuentas, con los límites de abajo. No autoriza nada más.

## Límites duros (no se negocian)
- **TikTok:** máximo 2 videos por día, separados al menos 8 horas. **Facebook:** máximo 1 video por día (solo en la corrida de las 21:07). No publicar entre las 00:00 y las 07:00.
- **No** responder comentarios ni mensajes (es hablar en nombre del dueño: se anotan en el registro para que los responda él). **No** gastar plata (nada de promocionar/impulsar). **No** crear cuentas ni tocar contraseñas. **No** cambiar ajustes de las cuentas: si aparece un diálogo de ajustes (revisiones automáticas, permisos, novedades), se cierra con "Cancelar" / "Entendido" / "Omitir".
- Si una plataforma muestra una advertencia, restricción o infracción: **no publicar más** y avisar al dueño en el resumen.
- **Microsoft Store:** el archivo `estado-tienda.txt` dice `disponible` (desde el 31/10/2026; antes `proximamente`; también puede ser `oculto`). Solo el dueño lo cambia; el motor pone la insignia y la frase final según ese archivo. Nunca afirmar que ya está en la tienda si no dice `disponible`.
- Si el dueño dice "pará": se deshabilita la tarea (`update_scheduled_task`, enabled=false).
- Contenido: español rioplatense (voseo), **sin emojis**, **nada inventado** (ni cifras, ni clientes, ni testimonios), solo funciones que el programa hace hoy (versión 1.0.32). Las cuentas de ejemplo se dicen "de ejemplo". Sin logos de otras marcas.

## Pasos de cada corrida
1. **Leer** `registro-ciclos.md` (qué se publicó, qué se midió, qué se decidió) y `aprendizajes.md` (la regla de tres tiempos: gancho, retención, llamado a la acción; lo negativo a evitar y lo positivo a repetir). Hoy es otro día: tomá la fecha/hora real del sistema.
2. **Chrome:** abrir una pestaña con `tabs_context_mcp` (createIfEmpty). Comprobar con JavaScript que `document.visibilityState` sea `visible`. Si es `hidden`, **la ventana está detrás de otras**: no se puede subir nada (TikTok no procesa el archivo y Facebook no dibuja). En ese caso: hacer solo el análisis posible, **no publicar**, y decirlo claramente en el resumen ("traé Chrome al frente").
3. **Medir** (solo lectura):
   - TikTok Studio → Publicaciones (https://www.tiktok.com/tiktokstudio/content): vistas, me gusta, comentarios de cada video nuestro. Con `javascript_tool` se sacan los ids de los links `a[href*="/video/"]` y se abre `https://www.tiktok.com/tiktokstudio/analytics/<id>` de cada video propio (esperar 5 s y `get_page_text`). Anotar: vistas, tiempo promedio de visualización, % que lo termina, de dónde viene la gente, clics si los hay. Anotar el estado ("en revisión", "solo yo", "público").
   - Facebook → https://www.facebook.com/professional_dashboard/content/content_library : vistas, espectadores, interacción de cada video; abrir sus estadísticas para el tiempo de reproducción si se puede.
4. **Registrar** en `registro-ciclos.md` una fila con fecha, video, plataforma, horas desde que se publicó y las cifras.
5. **Diagnosticar** con estas reglas (cambiar UNA cosa por vez para saber qué funcionó):
   | Qué se ve | Qué probar en el próximo video |
   |---|---|
   | Menos de ~100 vistas a las 12 h y estado "público" | El primer segundo no engancha: otro tema o otra pregunta de apertura, titular más corto |
   | Retención baja al inicio (se van en los primeros 3 s) | Abrir con el número o el dolor más concreto ("40 consultas por día"), sin presentación |
   | Se van a la mitad | Acortar el video (apuntar a 15–25 s) y mover la parte más fuerte antes |
   | Muchas vistas y pocos me gusta/comentarios | El tema no resuena: pasar a otro dolor del backlog |
   | Muchas vistas (más de 10 mil) y menos de 1 % de me gusta | El gancho atrae pero el contenido es una lista de funciones: rehacerlo como un dolor propio con una cuenta o una historia, y cerrar con una pregunta para comentar |
| La gente se va igual en el segundo 1 o 2 con titular desde el cuadro 0 | Probar una sola técnica de movimiento nueva de la lista de `aprendizajes.md` (no un titular más grande) |
| Buenas cifras | Repetir la fórmula con otro tema parecido; no cambiar nada más |
   | Comentarios con preguntas | No responder: anotar la pregunta en el registro y proponer el próximo video que la conteste |
6. **Elegir el próximo video:** el siguiente tema de `backlog.json` que no figure en el registro (todos los videos nuevos deben cumplir la regla de tres tiempos y llevar en el texto de la publicación una de las búsquedas reales de `aprendizajes.md`), o una variante mejorada del que mejor anduvo (editar el guion en `backlog.json` o crear un spec nuevo en `salidas/`). Máximo **una** mejora concreta respecto del anterior; anotarla en el registro.
7. **Producir:** `cd C:\Users\jmarr\OneDrive\Desktop\akira-cloud\marketing\video\fabrica` y `python fabrica.py backlog:<id>` (usa la clave de Rime guardada en `%USERPROFILE%\.akira-marketing\rime.key`; tarda unos 3 a 6 minutos). Verlo: sacar 5 cuadros con ffmpeg y mirarlos (texto cortado, superposiciones, voz que se corta). Si algo está mal, corregir y volver a producir. Salida: `salidas/<id>.mp4` (menos de 10 MB, es el límite del tool de subida).
8. **Publicar** (si Chrome está visible y se cumplen los límites):
   - **TikTok:** ir a https://www.tiktok.com/tiktokstudio/upload → con `find` buscar el `input type=file` y `file_upload` con el mp4 → esperar a que cargue ("Cargado") → hacer clic **dentro del texto** de la descripción, `ctrl+a`, y escribir el `caption` del backlog + los `hashtags` (ver que el cursor esté en el campo: una captura antes de escribir) → "Ahora" y "Todo el mundo" → **Publicar**. Si pide revisiones automáticas: Cancelar. Verificar en Publicaciones que apareció.
   - **Facebook (solo 21:07):** https://www.facebook.com/professional_dashboard → "Crear una publicación" → "Publicación" (la identidad tiene que ser **Akira Cloud**) → escribir el `caption` (con el link https://akiracloud.lat) → subir el mp4 al input de "Foto/video" → Siguiente → Siguiente → Publicar. Verificar en la Biblioteca de contenido.
   - Las capturas de pantalla cambian de tamaño de marco: usar siempre las coordenadas del marco que informa la última captura. Si un clic no hace lo esperado, tomar otra captura antes de reintentar.
9. **Cerrar:** completar `registro-ciclos.md` (qué se publicó, link/ID, qué se mejoró y por qué) y `aprendizajes.md` (cada resultado a las 72 h pasa a "negativo" o "positivo" con su cifra, y la fila de "Registro de pruebas"), cerrar las pestañas propias y escribir un **resumen corto** para el dueño: cifras del último video, qué cambió, qué se publicó, qué falló y qué necesita de él.

## Notas
- El backlog tiene 12 temas (`disponible`, `horas`, `comprobantes`, `celular`, `marketing`, `ausencias`, `deudores`, `datos`, `gratis`, `vender`, `lunes`, `tienda`; `tienda` quedó obsoleto, no publicar). Los últimos se hicieron el 29/10 con el motor mejorado (gancho enorme que sube, palabra activa con pastilla, golpe de zoom por trozo, insignia de la tienda). Cuando se acaban, rehacer variantes del ganador (otro gancho, otra duración) en vez de repetir el mismo video.
- Los videos largos y el plan general están en `..\PLAN-VIDEO-VIRAL.md`.
- La clave de Rime la pegó el dueño en un chat: si deja de andar, avisarle para que la rote y actualice `rime.key`.
