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

- **Medición del 29/10 (3 días) de los tres videos del 26/10 (TikTok Studio, retención abierta):**

  | Video (26/10) | Duración | Vistas | Me gusta | Guardados | Seguidores nuevos | Tiempo promedio | % completo | Dónde se van |
  |---|---|---|---|---|---|---|---|---|
  | #ecommerce #akiracloud (23:14) | 21 s | 27 mil | 50 | 19 | 5 | 3,76 s | 2,3 % | segundo 0:01 |
  | #emprendedores #softwareengineer (23:12) | 18 s | 16 mil | 16 | 2 | 1 | 4,51 s | 3,1 % | segundo 0:02 |
  | #emprendimiento #botwhatsapp (23:04) | 17 s | 27 mil | 29 | 5 | 2 | 3,16 s | 2,9 % | segundo 0:01 |
  | Referencia: "¿Cuántos clientes perdés mientras dormís?" (14/10) | 57 s | 30 mil | 1.613 | 91 | 86 | 3,73 s | 0,9 % | segundo 0:01 |

  Lectura: (1) el alcance sí llegó (más de 70 mil vistas en total, 97 % desde "Para ti"): TikTok los probó con gente fría; (2) la retención es la misma en los cuatro: se van en el segundo 1 o 2, aun con titular desde el cuadro 0, así que el titular quieto no alcanza; (3) lo que separa al del 14/10 no es la retención sino la reacción de quien se queda: 5,4 % de me gusta contra 0,1 a 0,2 % de los cortos nuevos, 91 guardados y 86 seguidores contra 8 seguidores en total. Hipótesis (sin confirmar): el del 14/10 plantea una pregunta que se siente propia ("¿cuántos clientes perdés?") y promete enseñar todo, mientras que los cortos de 17 a 21 s son una lista de funciones; (4) las búsquedas que traen gente son "akiracloud", "comprobante de pago con el negro de WhatsApp" y "Vende por mensajes automático wsp": hay interés por comprobantes y por vender por WhatsApp. (5) Los comentarios siguen en 0 a 3 por video: no hay pregunta que invite a responder.
- **Lo negativo que se anota para no repetir:** arrancar con una escena quieta (aunque tenga titular); hablar de funciones en vez de un dolor propio; cerrar sin una razón para guardar o seguir; llamar a la acción con tres cosas a la vez.
- **Lo positivo que se repite:** pregunta en primera persona, un dolor que el dueño de un negocio reconoce al instante, promesa de mostrar todo, cuenta con números que se pueden rehacer, 90 % de público argentino (el idioma y el precio en pesos filtran bien).

- **Preparado el 29/10/2026 (motor mejorado, ya producidos en `salidas/`, sin publicar):** `vender.mp4` (19 s), `lunes.mp4` (22 s) y `tienda.mp4` (16 s). Orden de publicación para las próximas corridas: primero `vender` (responde a lo que la gente busca: vender por WhatsApp y cobrar con Mercado Pago), después `lunes`, y `tienda` cuando haga falta recordar la tienda. No hace falta volver a producirlos (solo si cambia el guion). Una sola variable nueva respecto del 26/10: el **gancho enorme al centro con movimiento detrás** (más palabra activa con pastilla y golpe de zoom por trozo, que son del mismo paquete de retención); si al medirlos a las 72 h la gente sigue yéndose en el segundo 1, la próxima prueba es video con pantalla real en movimiento. Los textos de las publicaciones ya traen una pregunta para comentar y las búsquedas reales.
- **Motor `fabrica.py` (29/10):** (1) titular grande al centro 1,3 s y luego arriba; (2) pastilla verde en la palabra que se dice; (3) golpe de zoom en cada trozo y zoom lento; (4) tic de sonido por trozo; (5) escena animada `tienda`; (6) insignia y frase final de Microsoft Store según `estado-tienda.txt` (hoy: `proximamente`). Copia del motor anterior: `../fabrica-backup-29oct.py`.

- **Preparado el 31/10/2026:** Akira Cloud quedó publicada en Microsoft Store (https://apps.microsoft.com/detail/9PM7BL2V6W22). El dueño pidió un video: `salidas/disponible.mp4` (19 s, gancho "Tu bot de WhatsApp ya está en Microsoft Store", animación de Obtener/Instalando/Instalado, chat de turno, "7 días gratis", cierre con la insignia "Ya en Microsoft Store"). `estado-tienda.txt` pasó a `disponible`. Es el primero en publicarse (lo pidió el dueño); después `vender`, `lunes`. `tienda.mp4` (dice "está por llegar") **ya no sirve: no publicarlo**.

## Comentarios y preguntas de la gente (para que las responda el dueño)

- (ninguno todavía)
