// main/plantillas-rubro.js
// Plantillas por rubro: al elegir "peluquería", "consultorio", "alquiler"… se precargan servicios con precios de
// EJEMPLO, horarios típicos y el estilo con el que habla el bot, para que responda bien desde el primer día.
// Los precios son orientativos: el dueño los edita. Aplicar una plantilla NUNCA toca: nombre del negocio, datos de
// cobro (alias/CBU/MercadoPago), claves, celular de avisos, catálogo, días bloqueados ni el modo pausa.
'use strict';

const sem = (inicio, fin, { sab = null, dom = null, lunes = true } = {}) => ({
  lunes: { activo: lunes, inicio, fin }, martes: { activo: true, inicio, fin }, miercoles: { activo: true, inicio, fin }, jueves: { activo: true, inicio, fin }, viernes: { activo: true, inicio, fin },
  sabado: sab ? { activo: true, inicio: sab[0], fin: sab[1] } : { activo: false, inicio, fin },
  domingo: dom ? { activo: true, inicio: dom[0], fin: dom[1] } : { activo: false, inicio, fin },
});
const partido = (m1, m2, t1, t2, { sab = null } = {}) => {
  const d = { activo: true, franjas: [{ inicio: m1, fin: m2 }, { inicio: t1, fin: t2 }] };
  return { lunes: d, martes: d, miercoles: d, jueves: d, viernes: d, sabado: sab ? { activo: true, franjas: [{ inicio: sab[0], fin: sab[1] }] } : { activo: false, franjas: [{ inicio: m1, fin: m2 }] }, domingo: { activo: false, franjas: [{ inicio: m1, fin: m2 }] } };
};

const RUBROS = [
  {
    id: 'peluqueria', nombre: 'Peluquería / barbería', icono: '💈', tipoNegocio: 'turnos',
    descripcion: 'Cortes, color, barba y peinados.',
    serviciosTexto: 'cortes de pelo, barba, color y peinados',
    servicios: [{ nombre: 'Corte de pelo', precio: 9000, duracion: 30 }, { nombre: 'Corte + barba', precio: 13000, duracion: 45 }, { nombre: 'Barba', precio: 6000, duracion: 20 }, { nombre: 'Color completo', precio: 35000, duracion: 120 }, { nombre: 'Peinado', precio: 12000, duracion: 45 }],
    horarios: sem('09:00', '19:00', { sab: ['09:00', '14:00'], lunes: false }), precioTurno: 9000, horasCancelacion: 12,
    prompt: 'Hablá cercano y relajado, como en una peluquería de barrio. Si el cliente no sabe qué servicio elegir, preguntale qué se quiere hacer y recomendale uno. Recordale llegar 5 minutos antes.',
  },
  {
    id: 'estetica', nombre: 'Estética / uñas', icono: '💅', tipoNegocio: 'turnos',
    descripcion: 'Manicuría, pedicuría, depilación y tratamientos faciales.',
    serviciosTexto: 'uñas, depilación y tratamientos de estética',
    servicios: [{ nombre: 'Manicuría semipermanente', precio: 14000, duracion: 75 }, { nombre: 'Pedicuría', precio: 15000, duracion: 60 }, { nombre: 'Limpieza facial', precio: 22000, duracion: 75 }, { nombre: 'Depilación definitiva (zona)', precio: 18000, duracion: 30 }, { nombre: 'Perfilado de cejas', precio: 6000, duracion: 20 }],
    horarios: sem('09:30', '19:00', { sab: ['09:30', '15:00'] }), precioTurno: 14000, horasCancelacion: 24,
    prompt: 'Hablá cálida y delicada. Preguntá si es la primera vez o si tiene alguna alergia o condición de piel antes de confirmar tratamientos. Pedí seña para reservar.',
  },
  {
    id: 'consultorio', nombre: 'Consultorio (salud / psicología / kinesiología)', icono: '🩺', tipoNegocio: 'turnos',
    descripcion: 'Consultas por turno con primera consulta y seguimiento.',
    serviciosTexto: 'consultas profesionales',
    servicios: [{ nombre: 'Primera consulta', precio: 30000, duracion: 60 }, { nombre: 'Consulta de seguimiento', precio: 25000, duracion: 45 }, { nombre: 'Consulta online', precio: 22000, duracion: 45 }],
    horarios: partido('09:00', '13:00', '15:00', '19:00'), precioTurno: 25000, horasCancelacion: 24,
    prompt: 'Hablá con calidez y respeto, de manera profesional. NUNCA des diagnósticos, indicaciones médicas ni opines sobre tratamientos: solo agendás turnos y respondés dudas administrativas (horarios, valores, cómo llegar, cómo cancelar). Si hay una urgencia, indicá que se comunique con una guardia o llame al 107.',
  },
  {
    id: 'odontologia', nombre: 'Odontología', icono: '🦷', tipoNegocio: 'turnos',
    descripcion: 'Consultas, limpiezas y tratamientos.',
    serviciosTexto: 'consultas odontológicas, limpiezas y tratamientos',
    servicios: [{ nombre: 'Consulta y diagnóstico', precio: 20000, duracion: 30 }, { nombre: 'Limpieza dental', precio: 28000, duracion: 45 }, { nombre: 'Arreglo de caries', precio: 35000, duracion: 45 }, { nombre: 'Blanqueamiento', precio: 90000, duracion: 90 }],
    horarios: partido('09:00', '13:00', '15:00', '19:00'), precioTurno: 20000, horasCancelacion: 24,
    prompt: 'Hablá con calidez y tranquilidad (a mucha gente le da miedo ir al dentista). No hagas diagnósticos ni indiques medicación. Si hay dolor fuerte o inflamación, ofrecé el primer turno disponible o el contacto del consultorio para urgencias.',
  },
  {
    id: 'veterinaria', nombre: 'Veterinaria', icono: '🐾', tipoNegocio: 'servicios',
    descripcion: 'Consultas, vacunas y peluquería canina.',
    serviciosTexto: 'consultas veterinarias, vacunas y peluquería canina',
    servicios: [{ nombre: 'Consulta clínica', precio: 15000, duracion: 30 }, { nombre: 'Vacunación', precio: 12000, duracion: 20 }, { nombre: 'Baño y corte', precio: 18000, duracion: 90 }, { nombre: 'Desparasitación', precio: 9000, duracion: 15 }],
    horarios: partido('09:00', '13:00', '16:00', '20:00', { sab: ['09:00', '13:00'] }), precioTurno: 15000, horasCancelacion: 12,
    prompt: 'Hablá amable y cariñoso con las mascotas y sus dueños. Preguntá siempre el nombre y la especie/raza de la mascota. No des diagnósticos: si hay una urgencia, indicá que vengan o llamen de inmediato.',
  },
  {
    id: 'masajes', nombre: 'Masajes / spa', icono: '🧖', tipoNegocio: 'turnos',
    descripcion: 'Masajes y sesiones de relajación.',
    serviciosTexto: 'masajes y tratamientos de relax',
    servicios: [{ nombre: 'Masaje relajante (60 min)', precio: 25000, duracion: 60 }, { nombre: 'Masaje descontracturante', precio: 28000, duracion: 60 }, { nombre: 'Drenaje linfático', precio: 30000, duracion: 60 }, { nombre: 'Masaje en pareja', precio: 55000, duracion: 60 }],
    horarios: sem('10:00', '20:00', { sab: ['10:00', '18:00'] }), precioTurno: 25000, horasCancelacion: 24,
    prompt: 'Hablá tranquila y serena. Preguntá si tiene alguna lesión, embarazo o condición a tener en cuenta antes de recomendar un masaje.',
  },
  {
    id: 'gimnasio', nombre: 'Gimnasio / entrenador personal', icono: '🏋️', tipoNegocio: 'turnos',
    descripcion: 'Clases, planes y entrenamiento personalizado.',
    serviciosTexto: 'clases, planes mensuales y entrenamiento personalizado',
    servicios: [{ nombre: 'Clase de prueba', precio: 0, duracion: 60 }, { nombre: 'Entrenamiento personal (sesión)', precio: 15000, duracion: 60 }, { nombre: 'Plan mensual 3 veces por semana', precio: 40000, duracion: 60 }, { nombre: 'Plan mensual libre', precio: 55000, duracion: 60 }],
    horarios: sem('07:00', '21:00', { sab: ['09:00', '13:00'] }), precioTurno: 15000, horasCancelacion: 6,
    prompt: 'Hablá motivador y con energía. Si el cliente es nuevo, ofrecele la clase de prueba. Preguntá su objetivo (bajar de peso, ganar músculo, salud) para recomendar un plan.',
  },
  {
    id: 'taller', nombre: 'Taller mecánico', icono: '🔧', tipoNegocio: 'servicios',
    descripcion: 'Service, frenos, alineación y diagnóstico.',
    serviciosTexto: 'service, frenos, alineación y reparaciones',
    servicios: [{ nombre: 'Cambio de aceite y filtros', precio: 45000, duracion: 60 }, { nombre: 'Alineación y balanceo', precio: 30000, duracion: 60 }, { nombre: 'Revisión de frenos', precio: 20000, duracion: 60 }, { nombre: 'Diagnóstico general', precio: 15000, duracion: 60 }],
    horarios: sem('08:30', '17:30', { sab: ['08:30', '12:30'] }), precioTurno: 15000, horasCancelacion: 12,
    prompt: 'Hablá claro y directo, sin tecnicismos. Pedí siempre marca, modelo, año y patente del vehículo y qué problema nota. No des presupuestos finales: solo valores de referencia y aclará que el precio exacto se confirma tras revisar el vehículo.',
  },
  {
    id: 'restaurante', nombre: 'Restaurante / bar / café', icono: '🍽️', tipoNegocio: 'turnos',
    descripcion: 'Reservas de mesa por cantidad de personas.',
    serviciosTexto: 'reservas de mesa',
    servicios: [{ nombre: 'Reserva de mesa', precio: 0, duracion: 90 }],
    horarios: sem('12:00', '23:30', { sab: ['12:00', '23:59'], dom: ['12:00', '17:00'] }), precioTurno: 0, horasCancelacion: 3,
    prompt: 'Hablá simpático y servicial. Para reservar preguntá siempre: cantidad de personas, día, horario y si hay alguna alergia o celebración. Si es un grupo grande (más de 8), avisá que el dueño confirma personalmente.',
  },
  {
    id: 'alquiler', nombre: 'Alquiler turístico / alojamiento', icono: '🏡', tipoNegocio: 'alojamiento',
    descripcion: 'Cabañas, departamentos o habitaciones por noche.',
    serviciosTexto: 'alquiler temporario por noche',
    servicios: [], horarios: null, precioTurno: 0, horasCancelacion: 72, checkInHora: '14:00', checkOutHora: '10:00', minimaEstadia: 2,
    unidades: [{ nombre: 'Departamento (editá nombre y precio)', capacidad: 4, precioPorNoche: 60000, amenidades: 'Wi-Fi, cocina equipada, aire acondicionado', descripcion: 'Editá esta unidad con los datos reales de tu alojamiento.' }],
    prompt: 'Hablá hospitalario y amable, como un anfitrión. Preguntá siempre fechas de entrada y salida y cantidad de huéspedes. Avisá el horario de check-in y check-out y la estadía mínima. No confirmes sin que la reserva esté paga.',
  },
];

const publico = (r) => ({ id: r.id, nombre: r.nombre, icono: r.icono, descripcion: r.descripcion, tipoNegocio: r.tipoNegocio, servicios: r.servicios, unidades: r.unidades || [], horarios: r.horarios, prompt: r.prompt });
const listar = () => RUBROS.map(publico);
const obtener = (id) => RUBROS.find((r) => r.id === id) || null;

const DEFECTO = { servicios: 'turnos y reservas', precioTurno: 1000, tipoNegocio: 'turnos', horasCancelacion: 24 };
const HORARIOS_DEFECTO = JSON.stringify({ lunes: { activo: true, inicio: '09:00', fin: '18:00' }, martes: { activo: true, inicio: '09:00', fin: '18:00' }, miercoles: { activo: true, inicio: '09:00', fin: '18:00' }, jueves: { activo: true, inicio: '09:00', fin: '18:00' }, viernes: { activo: true, inicio: '09:00', fin: '18:00' }, sabado: { activo: true, inicio: '09:00', fin: '13:00' }, domingo: { activo: false, inicio: '09:00', fin: '18:00' } });

// Qué cambiaría aplicar la plantilla `r` sobre la configuración actual `cfg`.
//   modo 'completar': solo llena lo que está vacío o sigue como venía de fábrica.   modo 'reemplazar': pisa servicios, horarios y estilo.
// → { cambios: {campo: valor}, resumen: ['Servicios: 5 cargados', …] }
function planificar(cfg = {}, r, modo = 'completar') {
  if (!r) throw new Error('Plantilla inexistente');
  const todo = modo === 'reemplazar';
  const cambios = {}; const resumen = [];
  const sinServicios = !Array.isArray(cfg.serviciosList) || cfg.serviciosList.length === 0;
  if (r.servicios.length && (todo || sinServicios)) { cambios.serviciosList = r.servicios.map((s) => ({ ...s, intervaloRecordatorioDias: 0, mensajeRecordatorio: '' })); resumen.push(`Servicios: ${r.servicios.length} de ejemplo (${r.servicios.map((s) => s.nombre).slice(0, 3).join(', ')}…)`); }
  if (r.horarios && (todo || !cfg.horariosAtencion || JSON.stringify(cfg.horariosAtencion) === HORARIOS_DEFECTO)) { cambios.horariosAtencion = r.horarios; resumen.push('Horarios de atención típicos del rubro'); }
  if (r.prompt && (todo || !String(cfg.promptPersonalizado || '').trim())) { cambios.promptPersonalizado = r.prompt; resumen.push('Estilo del bot: cómo habla y qué pregunta'); }
  if (r.serviciosTexto && (todo || !cfg.servicios || cfg.servicios === DEFECTO.servicios)) cambios.servicios = r.serviciosTexto;
  if (todo || cfg.tipoNegocio === undefined || (cfg.tipoNegocio === DEFECTO.tipoNegocio && sinServicios)) { if (r.tipoNegocio !== cfg.tipoNegocio) { cambios.tipoNegocio = r.tipoNegocio; resumen.push(`Tipo de negocio: ${r.tipoNegocio === 'alojamiento' ? 'alojamiento (reservas por noche)' : r.tipoNegocio === 'servicios' ? 'servicios' : 'turnos'}`); } }
  if (r.precioTurno != null && (todo || cfg.precioTurno === undefined || cfg.precioTurno === DEFECTO.precioTurno)) cambios.precioTurno = r.precioTurno;
  if (r.horasCancelacion != null && (todo || cfg.horasCancelacion === undefined || cfg.horasCancelacion === DEFECTO.horasCancelacion)) cambios.horasCancelacion = r.horasCancelacion;
  if (r.tipoNegocio === 'alojamiento') {
    if (r.checkInHora && (todo || !cfg.checkInHora || cfg.checkInHora === '14:00')) cambios.checkInHora = r.checkInHora;
    if (r.checkOutHora && (todo || !cfg.checkOutHora || cfg.checkOutHora === '10:00')) cambios.checkOutHora = r.checkOutHora;
    if (r.minimaEstadia && (todo || !cfg.minimaEstadia || cfg.minimaEstadia === 1)) cambios.minimaEstadia = r.minimaEstadia;
    if (r.unidades?.length && (!Array.isArray(cfg.unidadesAlojamiento) || cfg.unidadesAlojamiento.length === 0)) { cambios.unidadesAlojamiento = r.unidades; resumen.push('Una unidad de ejemplo para que edites con tus datos'); }
  }
  return { cambios, resumen };
}

module.exports = { RUBROS, listar, obtener, planificar };
