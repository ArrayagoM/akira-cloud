// services/prueba-admin.service.js
// Pasa las pruebas gratis al modelo "por uso" (ver lib/prueba.js) y le devuelve la prueba a quien se le venció SIN haber llegado a usar
// el programa. Lo corre el dueño desde el panel de administración (POST /api/admin/prueba/migrar), primero en modo simulación (cuenta,
// no toca nada) y después con confirmar:true. Es idempotente: las cuentas ya migradas no se vuelven a tocar.
//
// "Sin uso" = ninguna señal de que el bot haya funcionado: el programa nunca informó el estado del bot, nunca conectó WhatsApp y no hay
// mensajes contados. (Si alguien se equivoca de lado —usó el programa en una versión vieja que no informaba nada— solo recibe días de
// uso extra, que es inofensivo.) Probado en tests/prueba-uso.test.js.
'use strict';

const { vigenciaTrial, TOPE_DIAS, DIA_MS } = require('../lib/prueba');

const CAMPOS = 'plan rol esTester status trialExpira trialModeloUso trialDiasUso mensajesMes botActivo botConectado createdAt novedadesActivas';

function señalesDeUso(user, dispositivos = []) {
  return { instalo: dispositivos.length > 0, botInformo: dispositivos.some((d) => d.estadoBotEn), conecto: user.botConectado === true || user.botActivo === true, mensajes: Number(user.mensajesMes) > 0 };
}
const huboUso = (s) => s.botInformo || s.conecto || s.mensajes;

// → 'ignorar' (admin, tester, bloqueado o ya migrado) | 'vigente' | 'reactivar' | 'vencido-con-uso'
function clasificar(user, dispositivos, ahora = new Date()) {
  if (user.plan !== 'trial' || user.esTester || user.rol === 'admin' || user.status !== 'activo' || user.trialModeloUso === true) return 'ignorar';
  if (vigenciaTrial({ ...user, trialModeloUso: false }, ahora).vigente) return 'vigente';
  return huboUso(señalesDeUso(user, dispositivos)) ? 'vencido-con-uso' : 'reactivar';
}

async function cargar({ User, Device }) {
  const usuarios = await User.find({ plan: 'trial' }).select(CAMPOS).lean();
  const ids = usuarios.map((u) => u._id);
  const dispositivos = ids.length ? await Device.find({ userId: { $in: ids } }).select('userId estadoBotEn').lean() : [];
  const porUsuario = new Map();
  for (const d of dispositivos) { const k = String(d.userId); if (!porUsuario.has(k)) porUsuario.set(k, []); porUsuario.get(k).push(d); }
  return { usuarios, dispositivosDe: (u) => porUsuario.get(String(u._id)) || [] };
}

// Solo cuenta (sin datos personales)
async function resumen({ User, Device, ahora = new Date() }) {
  const { usuarios, dispositivosDe } = await cargar({ User, Device });
  const cuenta = { total: usuarios.length, vigentes: 0, reactivar: 0, vencidosConUso: 0, ignorados: 0, yaMigrados: 0, sinInstalarNunca: 0, instalaronSinBot: 0 };
  for (const u of usuarios) {
    const c = clasificar(u, dispositivosDe(u), ahora);
    if (u.trialModeloUso === true) cuenta.yaMigrados++;
    if (c === 'vigente') cuenta.vigentes++; else if (c === 'reactivar') { cuenta.reactivar++; if (dispositivosDe(u).length) cuenta.instalaronSinBot++; else cuenta.sinInstalarNunca++; }
    else if (c === 'vencido-con-uso') cuenta.vencidosConUso++; else cuenta.ignorados++;
  }
  return cuenta;
}

// confirmar:false → solo cuenta lo que haría. confirmar:true → lo hace.
async function migrar({ User, Device, ahora = new Date(), confirmar = false }) {
  const { usuarios, dispositivosDe } = await cargar({ User, Device });
  const operaciones = []; const r = { vigentesMigrados: 0, reactivados: 0, vencidosConUsoSinTocar: 0, ignorados: 0 };
  for (const u of usuarios) {
    const c = clasificar(u, dispositivosDe(u), ahora);
    if (c === 'vigente') {
      // Sigue en prueba: pasa al modelo por uso con 0 días gastados y el tope de calendario desde el alta (como mínimo, 14 días más desde hoy).
      const tope = new Date(Math.max(new Date(u.createdAt || ahora).getTime() + TOPE_DIAS * DIA_MS, ahora.getTime() + 14 * DIA_MS));
      operaciones.push({ updateOne: { filter: { _id: u._id, trialModeloUso: { $ne: true } }, update: { $set: { trialModeloUso: true, trialDiasUso: 0, trialUltimoDiaUso: '', trialExpira: tope } } } });
      r.vigentesMigrados++;
    } else if (c === 'reactivar') {
      operaciones.push({ updateOne: { filter: { _id: u._id, trialModeloUso: { $ne: true } }, update: { $set: { trialModeloUso: true, trialDiasUso: 0, trialUltimoDiaUso: '', trialExpira: new Date(ahora.getTime() + TOPE_DIAS * DIA_MS), trialReactivado: ahora } } } });
      r.reactivados++;
    } else if (c === 'vencido-con-uso') r.vencidosConUsoSinTocar++; else r.ignorados++;
  }
  if (confirmar && operaciones.length) await User.bulkWrite(operaciones, { ordered: false });
  return { ...r, aplicado: confirmar === true };
}

module.exports = { clasificar, señalesDeUso, resumen, migrar };
