# Registro de ciclos

Se completa en cada corrida de la tarea `akira-videos-ciclo` (ver `PLAYBOOK-CICLO.md`). Una fila por video y plataforma, y debajo de cada ciclo, qué se decidió.

## Videos publicados

| Fecha y hora (AR) | Plataforma | Video | Duración | Estado | Link o referencia |
|---|---|---|---|---|---|
| 2026-10-14 02:23 | Facebook (Akira Cloud) | Largo 3:21, "¿Cuántos clientes perdiste esta semana sin enterarte?" | 3:21 | Publicado (como Reel) | Biblioteca de contenido |
| 2026-10-14 ~02:50 | TikTok (@tinchotech) | Corto 57 s, "¿Cuántos clientes perdés mientras dormís?" | 0:57 | En revisión, "Solo yo" | TikTok Studio → Publicaciones |

## Estadísticas

| Fecha y hora de la medición | Plataforma | Video | Horas desde la publicación | Vistas | Me gusta | Comentarios | Tiempo promedio | % que lo termina | Notas |
|---|---|---|---|---|---|---|---|---|---|
| 2026-10-14 ~09:20 | TikTok | Corto 57 s | ~7 h | 84 | 1 | 0 | 4,2 s (de 57 s) | 2,1 % | Público. 0 seguidores nuevos, 0 compartidos. Retención: la mayoría se va en el segundo 0:01. Fuente de tráfico: aún sin datos (hacen falta 100 vistas). |
| 2026-10-14 ~09:20 | Facebook | Largo 3:21 (salió como Reel) | ~7 h | 13 (11 espectadores) | 0 | 0 | 4 s | 0 vistas de 1 minuto; solo 3 vistas de 3 s o más | Tiempo total 54 s. Además Facebook creó solo una Historia con el video (2:30, 0 vistas). |
| (referencia) 2026-05-15 | TikTok | Video anterior de Akira: "¿Todavía perdés horas contestando WhatsApp..." | 7 días | 212 | 6 | 0 | 11,8 s | 0,5 % | 78,6 % vino de "Para ti"; 0 seguidores nuevos. |

## Decisiones y mejoras

- **Preparado el 14/10/2026 (antes del primer ciclo):** `salidas/horas.mp4` (17 s, "Contestar WhatsApp te roba 35 horas al mes") es el primer candidato "más obvio": un solo mensaje, titular fijo arriba, 17 segundos, termina con la prueba gratis. Mejoras respecto del primer corto (57 s): mucho más corto, el dolor concreto en el primer segundo y una cuenta que se puede rehacer.

- **Medición del 14/10 (~7 h):** el problema está en el primer segundo. En TikTok el tiempo promedio es 4,2 s de un video de 57 s y en Facebook 4 s; en los dos casos la gente se va antes de los 3 segundos. El arranque (reloj 03:12 sin titular y sin promesa) no engancha, y el video es largo para una cuenta chica. Mejoras para el próximo (una por vez no alcanza acá, hay que cambiar el arranque y el largo a la vez porque ambos apuntan a lo mismo): titular fijo desde el primer cuadro con la promesa concreta, pregunta numérica en el primer segundo y 17 s de duración (`horas.mp4`).
- **Medición del 22/10 (8 días) del video "¿Cuántos clientes perdés mientras dormís?" (TikTok, 14/10):** 30 mil vistas (27 mil personas, 90,3 % de Argentina, 98 % nuevas), tiempo promedio 3,73 s sobre 57 s, lo vio completo el 0,9 %, 86 seguidores nuevos, 2 comentarios, 4 compartidos, 91 guardados. 89 % vino de "Para ti": el algoritmo lo mostró a mucha gente (picos el 18 y 19/10) pero la mayoría se fue en el segundo 1. Edades repartidas sin foco (55+ 29 %, 18-24 23 %, 25-34 22 %): el video no filtra a quien tiene un negocio. Causa en el primer cuadro: reloj "03:12" con "0 mensajes sin responder" (cero de todo), sin promesa ni dolor concreto y con la marca arriba; el título recién aparece a los 3 s. El video corto del 14/10 repite lo mismo.
- **Arreglo del 23/10 en el motor (`fabrica.py`):** el titular entraba con un fundido desde transparente, así que el cuadro 0 quedaba vacío (también la portada). Ahora el titular y la escena aparecen completos desde el cuadro 0. Titular de `horas` cambiado a una frase condicional y verdadera: "Si contestás 40 consultas por día, perdés 35 horas al mes" (antes lo afirmaba como hecho; es una cuenta de ejemplo). La voz no cambió. El anterior quedó en `salidas/horas-v1.mp4`.
- **Reglas para los próximos videos (primeros 3 s):** (1) la promesa o el dolor concreto en pantalla desde el cuadro 0, en letra grande; (2) que se identifique a quién le habla ("si tenés un negocio"); (3) la voz arranca en el segundo 0; (4) nada de reloj ni logo ocupando el inicio; (5) una sola idea y menos de 20 s.
- **Facebook publica Historias por defecto:** al publicar el Reel, Facebook creó también una Historia con el mismo video. Para los próximos, desmarcar "Compartir en historia" si aparece.

## Comentarios y preguntas de la gente (para que las responda el dueño)

- (ninguno todavía)
