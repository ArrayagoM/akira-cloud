// Centro de ayuda (dentro de la app): respuestas cortas y prácticas, con pasos. Cada artículo dice DÓNDE tocar.
// Para sumar uno: agregá un objeto acá. `claves` son palabras con las que la gente lo buscaría (sin tildes no hace falta: la búsqueda las ignora).

export const CATEGORIAS = ['Primeros pasos', 'El bot', 'Turnos y clientes', 'Ventas y stock', 'Plata', 'Equipo', 'Seguridad y respaldos', 'Integraciones y celular', 'Si algo falla'];

export const ARTICULOS = [
  // ── Primeros pasos ──
  { id: 'conectar-whatsapp', cat: 'Primeros pasos', titulo: 'Conectar mi WhatsApp', claves: 'qr escanear vincular numero celular conectar whatsapp iniciar bot',
    pasos: ['En el Dashboard tocá “Iniciar bot”.', 'Aparece un código QR.', 'En tu celular: WhatsApp → Menú (⋮) → Dispositivos vinculados → Vincular un dispositivo, y escaneá el QR.', 'Cuando diga “Conectado”, el bot ya atiende ese número.'], consejo: 'Usá el número del negocio. Si querés más de un número, se agregan como “cuentas” desde el Dashboard (según tu plan).' },
  { id: 'plantilla-rubro', cat: 'Primeros pasos', titulo: 'Empezar rápido con una plantilla de mi rubro', claves: 'plantilla rubro ejemplo peluqueria consultorio gimnasio veterinaria restaurante taller servicios precios cargar',
    pasos: ['Entrá a Config y tocá “Empezar con una plantilla de mi rubro” (o usá “Primeros pasos” en el Dashboard).', 'Elegí tu rubro y mirá la vista previa de lo que se va a cargar.', 'Tocá “Aplicar plantilla”.', 'Después cambiá los precios y servicios de ejemplo por los tuyos en Catálogo.'], consejo: 'No toca el nombre de tu negocio, tus datos de cobro ni tus claves.' },
  { id: 'servicios-precios', cat: 'Primeros pasos', titulo: 'Cargar mis servicios y precios', claves: 'servicio precio duracion catalogo cargar importar excel lista de precios',
    pasos: ['Andá a Catálogo → Servicios.', 'Tocá “Agregar servicio” (o “Importar” si ya tenés una lista en Excel, PDF o una foto).', 'Poné nombre, precio y duración.', 'Tocá “Guardar cambios”: el bot ya usa estos datos.'], consejo: 'El bot siempre responde los precios que ves en el Catálogo; nunca los inventa.' },

  // ── El bot ──
  { id: 'conocimiento', cat: 'El bot', titulo: 'Enseñarle al bot lo que no sabe (preguntas frecuentes)', claves: 'conocimiento pdf preguntas frecuentes faq documento enseñar entrenar informacion politicas medios de pago direccion',
    pasos: ['Andá a Conocimiento.', 'Pegá un texto o subí un PDF, un .txt o una foto con tus preguntas frecuentes (medios de pago, cómo llegar, políticas, etc.).', 'Probalo con “Probar una pregunta”.', 'Desde ahora el bot usa ese documento para responder.'], consejo: 'Si una pregunta no está en tu documento, el bot avisa que consulta con vos en lugar de inventar.' },
  { id: 'derivar', cat: 'El bot', titulo: 'Qué pasa cuando el bot no sabe responder', claves: 'derivar persona humano no sabe consulta avisar dueño atender yo',
    pasos: ['El bot le dice al cliente que lo consulta con vos.', 'Te avisa por WhatsApp (al celular de avisos que cargaste en Config).', 'Respondé vos desde Chats o desde la ficha del cliente.'], consejo: 'Para que el bot no conteste mientras atendés vos, silenciá ese chat desde Chats.' },
  { id: 'copiloto', cat: 'El bot', titulo: 'Responder yo con ayuda (copiloto)', claves: 'copiloto sugerir respuesta borrador redactar ayuda ia mensaje responder',
    pasos: ['Abrí la ficha del cliente (Clientes → tocá el cliente).', 'En “Copiloto: responder yo” tocá “Sugerir respuesta”.', 'Revisá y editá el borrador (podés pedir “más corto”, “más cálido” o “más formal”).', 'Tocá “Enviar por WhatsApp”.'], consejo: 'El copiloto nunca manda nada solo: siempre lo revisás vos.' },
  { id: 'fotos-productos', cat: 'El bot', titulo: 'Que el bot mande fotos de mis productos', claves: 'foto imagen producto catalogo enviar mostrar',
    pasos: ['Andá a Catálogo → Productos.', 'En la columna “Foto” tocá el cuadrito de cada producto y elegí la imagen.', 'Tocá “Guardar cambios”.'], consejo: 'Cuando un cliente pregunta por ese producto, el bot le manda la foto.' },
  { id: 'fuera-de-horario', cat: 'El bot', titulo: 'Qué responde el bot fuera de horario', claves: 'fuera de horario cerrado vacaciones pausa horarios atencion',
    pasos: ['En Config cargá tus horarios de atención.', 'Fuera de ese horario el bot sigue atendiendo y aclara cuándo abrís.', 'Para vacaciones, usá “Modo pausa” en el Dashboard (o desde la app del celular).'], consejo: '' },
  { id: 'analisis', cat: 'El bot', titulo: 'Ver qué preguntan mis clientes', claves: 'analisis conversaciones que preguntan temas preguntas sin respuesta repetidas',
    pasos: ['Andá a “Qué preguntan”.', 'Elegí 7, 30 o 90 días.', 'Mirá los temas más consultados y las preguntas que el bot no supo responder.', 'Agregá esas respuestas en Conocimiento.'], consejo: 'Los datos están anonimizados (sin nombres ni teléfonos) y se borran a los 90 días. Podés borrarlos cuando quieras.' },

  // ── Turnos y clientes ──
  { id: 'no-vino', cat: 'Turnos y clientes', titulo: 'Marcar que un cliente no vino', claves: 'no vino ausente falto turno ausencia seña falta',
    pasos: ['Abrí la ficha del cliente.', 'En su historial de turnos, en el turno que ya pasó, tocá “No vino”.', 'Si falta seguido, el bot le va a pedir seña para reservar.'], consejo: 'Si el turno estaba pagado, el cobro sigue contando en la Caja (la plata ya entró).' },
  { id: 'importar-clientes', cat: 'Turnos y clientes', titulo: 'Importar mis clientes desde Excel', claves: 'importar clientes excel csv planilla agenda contactos subir',
    pasos: ['Andá a Clientes → Importar.', 'Subí tu planilla (Excel o CSV).', 'Revisá cómo se reconocieron las columnas (nombre, teléfono, email…).', 'Confirmá. Podés deshacer la importación si te equivocaste.'], consejo: 'Los clientes importados NO reciben ningún mensaje por el hecho de importarlos.' },
  { id: 'grupo', cat: 'Turnos y clientes', titulo: 'Escribirle a un grupo de clientes', claves: 'grupo difusion mensaje masivo promocion etiqueta vip inactivos baja cumpleaños reactivar',
    pasos: ['En Clientes elegí un filtro (por ejemplo VIP o Inactivos) y tocá “Escribir a un grupo”.', 'Elegí una plantilla o escribí tu mensaje.', 'Mirá a quiénes va a llegar y confirmá.', 'Akira los manda de a poco, con pausas, y respeta a quienes pidieron la baja.'], consejo: 'Hay un tope diario de mensajes para cuidar tu número de WhatsApp. Quien responde “BAJA” no recibe más.' },
  { id: 'fidelidad-resenas', cat: 'Turnos y clientes', titulo: 'Fidelidad (“a la décima, gratis”) y reseñas', claves: 'fidelidad puntos premio visitas reseña google opinion estrellas programa',
    pasos: ['En Clientes abrí “Programas con tus clientes”.', 'Activá la fidelidad y elegí cada cuántas visitas hay premio.', 'Para reseñas, pegá el enlace de Google de tu negocio y activalas.', 'Cuando alguien gane un premio lo ves en ese panel: tocá “Ya se lo entregué”.'], consejo: 'Las reseñas se piden al día siguiente; si la respuesta es mala (1 a 3) NO se le pide reseña pública y te avisamos a vos.' },
  { id: 'profesionales', cat: 'Turnos y clientes', titulo: 'Profesionales, agenda propia y comisiones', claves: 'profesional comision liquidacion peluquero empleado agenda propia sueldo porcentaje',
    pasos: ['Andá a Profesionales → “Nuevo profesional” y poné su nombre y su % de comisión.', 'En la Agenda, en cada turno confirmado elegí quién atiende.', 'En Profesionales, abajo, ves la liquidación del período y la podés exportar.'], consejo: 'Cada turno usa la comisión que tenía el profesional cuando se lo asignaste. El bot todavía no elige profesional solo: lo asignás vos en la Agenda.' },
  { id: 'sucursales', cat: 'Turnos y clientes', titulo: 'Tengo más de un local (sucursales)', claves: 'sucursal local sucursales varios locales separar plata',
    pasos: ['Andá a Sucursales y creá cada local.', 'En la Caja elegí la sucursal arriba para ver solo lo suyo; al cargar un ingreso o gasto elegís a cuál pertenece.', 'En Profesionales indicá en qué sucursal atiende cada uno: sus turnos cuentan para esa sucursal.'], consejo: 'El bot sigue siendo uno solo para todo el negocio (mismos servicios y horarios).' },

  // ── Ventas y stock ──
  { id: 'vender', cat: 'Ventas y stock', titulo: 'Vender en el mostrador (venta rápida)', claves: 'vender venta mostrador cobrar rapido stock descuento efectivo tarjeta',
    pasos: ['Andá a Vender → “Nueva venta” (también hay un botón “Vender” en la Caja).', 'Tocá los productos (o escaneá el código de barras).', 'Elegí cómo pagó y tocá “Cobrar”.', 'Se descuenta el stock y se suma el ingreso a la Caja.'], consejo: 'Si te equivocaste, en “Últimas ventas” podés anular: el stock vuelve.' },
  { id: 'stock', cat: 'Ventas y stock', titulo: 'Controlar el stock', claves: 'stock inventario cantidad poco stock agotado descontar',
    pasos: ['En Catálogo → Productos poné la cantidad en “Stock”. Dejalo vacío (∞) si no querés controlarlo.', 'Cada venta o pedido pagado descuenta solo.', 'Cuando queda poco (3 o menos) te avisamos.'], consejo: 'El bot no vende lo que está agotado.' },
  { id: 'codigo-barras', cat: 'Ventas y stock', titulo: 'Códigos de barras y etiquetas', claves: 'codigo de barras lector escaner etiqueta imprimir ean sku',
    pasos: ['En Catálogo → Productos, en la columna “Código” escaneá o escribí el código de cada producto.', 'Los que no traen código: tocá “Generar códigos” y después “Guardar cambios”.', 'Tocá “Etiquetas” para bajar un PDF con etiquetas para pegar.', 'En Vender, con el cursor en el buscador, escaneá y el producto se suma solo.'], consejo: 'Sirve cualquier lector USB: escribe el código como si fuera un teclado.' },
  { id: 'pedidos', cat: 'Ventas y stock', titulo: 'Tomar pedidos por WhatsApp', claves: 'pedidos carrito comprar envio retiro link de pago mercadopago transferencia',
    pasos: ['En Clientes → “Programas con tus clientes” activá “Pedidos por WhatsApp” (elegí retiro, envío o ambos).', 'El cliente arma el pedido charlando con el bot y recibe el total y cómo pagar.', 'Seguilo en Pedidos: cuando se paga se descuenta el stock y entra a la Caja.', 'Si pagó por transferencia o efectivo, tocá “Ya me pagó” en el pedido.'], consejo: 'Los precios y el stock salen siempre del Catálogo.' },
  { id: 'senas', cat: 'Ventas y stock', titulo: 'Cobrar solo una seña al reservar', claves: 'seña adelanto anticipo reservar porcentaje servicio mercadopago',
    pasos: ['Andá a Catálogo → Servicios.', 'En “Seña para reservar” elegí “Porcentaje” o “Monto fijo” y el valor.', 'Guardá. El bot cobra solo esa parte por MercadoPago y le avisa al cliente que el resto lo paga en el local.'], consejo: 'Sin configurar, se cobra el total (como siempre).' },

  // ── Plata ──
  { id: 'caja', cat: 'Plata', titulo: 'La Caja: ingresos y gastos', claves: 'caja ingresos gastos movimiento cargar mes balance resultado',
    pasos: ['Andá a Caja.', 'Los turnos cobrados entran solos como ingresos.', 'Cargá el resto con “+ Ingreso” y “+ Gasto” (o importá una planilla).', 'Exportá el mes a Excel o PDF para tu contador.'], consejo: 'Al registrar un comprobante que te mandó un cliente desde Documentos, también lo podés llevar a la Caja.' },
  { id: 'cierre-caja', cat: 'Plata', titulo: 'Cerrar la caja del día', claves: 'cierre cerrar caja efectivo contar diferencia sobra falta arqueo',
    pasos: ['En la Caja tocá “Cerrar caja”.', 'Mirá cuánto efectivo debería haber (lo que quedó ayer + lo cobrado − los gastos en efectivo).', 'Contá el cajón, anotá el monto y tocá “Cerrar la caja”.', 'Te dice si sobra, falta o está justa.'], consejo: 'Lo que cobrás por MercadoPago o transferencia no va al cajón: se muestra aparte.' },
  { id: 'gastos-fijos', cat: 'Plata', titulo: 'Gastos fijos y vencimientos (alquiler, monotributo…)', claves: 'gastos fijos recurrentes alquiler vencimiento recordatorio monotributo impuestos internet mensual',
    pasos: ['En la Caja abrí “Gastos fijos y vencimientos” → “Agregar gasto fijo”.', 'Poné el nombre, el monto y el día del mes.', 'Elegí si se anota solo en la Caja y cuántos días antes querés el aviso por WhatsApp.', 'Para un vencimiento sin monto (monotributo), desmarcá “Anotarlo solo en la Caja”: queda solo como recordatorio.'], consejo: 'Si borrás de la Caja un gasto que se cargó solo, no vuelve a aparecer.' },
  { id: 'metas-reportes', cat: 'Plata', titulo: 'Metas del mes y reportes', claves: 'meta objetivo facturar reportes estadisticas horas pico servicios mas pedidos clientes frecuentes evolucion exportar',
    pasos: ['En la Caja, en “Meta del mes”, tocá “Poner una meta” (cuánto querés facturar y/o cuántos turnos).', 'En Reportes elegí el período y mirá servicios más pedidos, clientes que más vienen, horas pico, ausencias y la evolución mes a mes.', 'Exportá a Excel o CSV.'], consejo: '' },
  { id: 'presupuestos', cat: 'Plata', titulo: 'Presupuestos y recibos en PDF', claves: 'presupuesto recibo pdf comprobante logo enviar cliente cotizacion',
    pasos: ['Andá a Presupuestos → “+ Presupuesto” o “Recibo”.', 'Elegí el cliente y agregá productos o servicios (o ítems sueltos).', 'Creá el comprobante, descargalo o tocá el avión para mandárselo por WhatsApp.', 'Cuando el cliente paga, en el presupuesto tocá “Ya pagó”: se genera el recibo y el cobro entra a la Caja.'], consejo: 'Subí tu logo para que salga en los PDF. No son facturas fiscales (el PDF lo aclara).' },
  { id: 'conciliar', cat: 'Plata', titulo: 'Conciliar con MercadoPago', claves: 'conciliar conciliacion mercadopago cobros cuenta diferencia comision caja cruzar',
    pasos: ['En la Caja tocá “Conciliar MercadoPago” (necesitás tener cargado tu Access Token en Config).', 'Elegí el período.', 'Mirá qué cobros entraron a tu cuenta y no están en la Caja, y cuáles están en la Caja pero no en MercadoPago.', 'Tocá “Anotarlos todos en la Caja” para registrar los que faltaban.'], consejo: 'Solo lee tus cobros: no mueve plata. También te muestra cuánto te descontó MercadoPago de comisión.' },

  // ── Equipo ──
  { id: 'perfiles', cat: 'Equipo', titulo: 'Perfiles con PIN para mis empleados', claves: 'perfil pin empleado encargado permisos roles usuarios equipo contraseña bloquear acceso',
    pasos: ['Andá a Equipo y elegí tu PIN de dueño (4 a 8 números) para activar los perfiles.', 'Tocá “Agregar” y creá el perfil de cada persona con su rol y su PIN.', 'Desde ahora Akira se abre bloqueada: cada uno entra con su PIN.', 'Para cambiar de persona, tocá su nombre abajo a la izquierda (“Cambiar”).'], consejo: 'El empleado atiende chats, clientes, agenda, pedidos y ventas, pero no ve la plata. El encargado maneja el negocio pero no la configuración. Si olvidás tu PIN: “Olvidé mi PIN” en la pantalla de bloqueo (se confirma con la contraseña de tu cuenta).' },

  // ── Seguridad y respaldos ──
  { id: 'respaldo', cat: 'Seguridad y respaldos', titulo: 'Hacer y restaurar un respaldo', claves: 'respaldo backup copia seguridad restaurar recuperar datos contraseña cifrado pc nueva',
    pasos: ['Andá a Respaldo y elegí una carpeta (mejor una sincronizada con Drive u OneDrive).', 'Poné una contraseña: el respaldo va cifrado y sin ella nadie puede leerlo.', 'Con la app abierta hace una copia por día (conserva las últimas 10); también podés tocar “Respaldar ahora”.', 'Para restaurar (por ejemplo en una PC nueva), tocá “Restaurar desde un archivo…” y poné la misma contraseña. Después volvés a cargar tus claves y vinculás WhatsApp con el QR.'], consejo: 'Anotá la contraseña en un lugar seguro: si se pierde, el respaldo no se puede abrir.' },
  { id: 'resumen-diario', cat: 'Seguridad y respaldos', titulo: 'Recibir el resumen del día por WhatsApp', claves: 'resumen del dia whatsapp aviso diario hora mensajes turnos caja deudores',
    pasos: ['En el Dashboard, en la tarjeta “Resumen del día por WhatsApp”, activalo.', 'Elegí la hora (por ejemplo 21:00).', 'Cada día recibís en tu WhatsApp cuántos mensajes y turnos hubo, lo que entró y salió y quién te debe.'], consejo: 'Necesitás tener cargado tu celular de avisos en Config.' },

  // ── Integraciones y celular ──
  { id: 'celular', cat: 'Integraciones y celular', titulo: 'La app del celular y las alertas si el bot se cae', claves: 'celular app movil alerta bot caido desconectado notificacion push email aviso monitoreo',
    pasos: ['Instalá la app de Akira en tu celular e iniciá sesión con tu cuenta.', 'Si el bot se desconecta, te avisamos por email y por notificación al celular (no por WhatsApp, porque justo no funcionaría).', 'Desde la app podés ver el estado del bot, el resumen del día y pausar o reanudar el bot.'], consejo: 'Podés elegir qué alertas recibir (email y/o celular) desde la tarjeta de alertas del Dashboard.' },
  { id: 'integraciones', cat: 'Integraciones y celular', titulo: 'Planillas en la nube y avisos a Zapier / Make', claves: 'integraciones google sheets drive onedrive dropbox planilla zapier make n8n webhook automatizar',
    pasos: ['Andá a Integraciones.', 'Planillas: elegí una carpeta (sincronizada con Drive, OneDrive o Dropbox) y activá la exportación: Caja, Clientes, Productos y Servicios quedan siempre al día.', 'Webhooks: tocá “Nuevo destino”, pegá la dirección de Zapier o Make y elegí cuándo avisar (una venta, un pedido pagado, un turno confirmado…).', 'Con “Probar” verificás que llegue.'], consejo: 'Los avisos van firmados (podés comprobar que vienen de Akira). Akira solo informa: no recibe órdenes de afuera.' },

  // ── Si algo falla ──
  { id: 'bot-no-responde', cat: 'Si algo falla', titulo: 'El bot no responde', claves: 'bot no responde no contesta callado desconectado apagado problema error silencio',
    pasos: ['Mirá el Dashboard: ¿dice “Conectado”?', 'Si dice “Desconectado”, tocá “Iniciar bot”. Si pide QR, escanealo de nuevo.', 'Revisá que la PC esté prendida, con internet y que Akira esté abierta (puede estar en la bandeja, abajo a la derecha).', 'Revisá que el chat no esté silenciado (en Chats) y que el bot no esté en “Modo pausa”.'], consejo: 'Si sigue sin responder, escribinos a soporte@akiracloud.lat contando qué ves en el Dashboard.' },
  { id: 'qr-otra-vez', cat: 'Si algo falla', titulo: 'WhatsApp me pide el QR otra vez', claves: 'qr otra vez sesion cerrada vincular desvinculado whatsapp pide qr expiro',
    pasos: ['Pasa cuando se cierra la sesión desde el celular (Dispositivos vinculados) o pasó mucho tiempo sin usar el bot.', 'En el Dashboard tocá “Iniciar bot” y escaneá el QR nuevo.', 'Tus clientes, turnos y datos no se pierden.'], consejo: '' },
  { id: 'licencia', cat: 'Si algo falla', titulo: 'Dice que la licencia venció o que el equipo no está activo', claves: 'licencia vencida suscripcion equipo no activo plan pago otro equipo dispositivo bloqueado',
    pasos: ['Entrá a Planes y revisá que tu suscripción esté vigente.', 'Si usabas Akira en otra PC y ahora querés usar esta, la app te ofrece “Usar este equipo”: confirmás y la otra se desactiva.', 'Si sin internet pasan muchos días, la app te pide conectarse una vez para renovar la licencia.'], consejo: 'Si pagaste y sigue bloqueado, escribinos a soporte@akiracloud.lat.' },
  { id: 'actualizar', cat: 'Si algo falla', titulo: 'Actualizar Akira', claves: 'actualizar actualizacion version nueva instalar descargar',
    pasos: ['Akira busca actualizaciones sola.', 'Cuando hay una lista, aparece un aviso: tocá “Reiniciar para actualizar”.', 'También podés tocar “Buscar actualización” abajo a la izquierda.'], consejo: 'Tus datos están en tu PC y se conservan al actualizar. Hacé un respaldo de vez en cuando igual.' },
];

const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const palabras = (s) => sinTildes(s).split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 2);

// Búsqueda: cada palabra buscada suma si empieza igual que una palabra del título (3), de las claves (2) o del texto (1). Todas tienen que aparecer
// en algún lado. Se compara por comienzo de palabra (así "sena" no encuentra "reseñas", pero "cobr" sí encuentra "cobrar").
export function buscar(consulta, lista = ARTICULOS) {
  const q = [...new Set(palabras(consulta))];
  if (!q.length) return lista;
  return lista.map((a) => {
    const t = palabras(a.titulo); const c = palabras(a.claves); const x = palabras([...a.pasos, a.consejo].join(' '));
    const tiene = (campo, w) => campo.some((p) => p.startsWith(w));
    let puntos = 0;
    for (const w of q) { const p = (tiene(t, w) ? 3 : 0) + (tiene(c, w) ? 2 : 0) + (tiene(x, w) ? 1 : 0); if (!p) return { a, puntos: 0 }; puntos += p; }
    return { a, puntos };
  }).filter((r) => r.puntos > 0).sort((m, n) => n.puntos - m.puntos).map((r) => r.a);
}
