// lib/referidos.js — programa de afiliados: cuenta de cobro (alias o CVU/CBU), resumen para el usuario y vista de pagos del admin.
// Funciones puras (sin Mongo) para poder probarlas; las rutas las usan en routes/auth.routes.js y routes/admin.routes.js.
'use strict';

const COMISION = 5000; // ARS por cada referido que paga su primer plan (ver routes/subscription.routes.js)

// Alias bancario: 6 a 20 caracteres, letras, números, punto y guion. CVU/CBU: 22 dígitos.
function validarCuentaCobro(entrada) {
  const crudo = String(entrada == null ? '' : entrada).trim();
  if (!crudo) return { ok: false, error: 'Escribí tu alias o tu CVU/CBU.' };
  if (crudo.includes('@')) return { ok: false, error: 'Eso parece un correo. Necesito el alias (por ejemplo, tu.nombre.mp) o los 22 números del CVU/CBU.' };

  const soloNumeros = crudo.replace(/[\s-]/g, '');
  if (/^\d+$/.test(soloNumeros)) {
    if (soloNumeros.length !== 22) return { ok: false, error: `El CVU/CBU tiene 22 números y escribiste ${soloNumeros.length}. Revisalo.` };
    return { ok: true, tipo: 'cvu', valor: soloNumeros };
  }

  const alias = crudo.toUpperCase();
  if (!/^[A-Z0-9.-]{6,20}$/.test(alias)) return { ok: false, error: 'El alias tiene entre 6 y 20 caracteres: letras, números, punto o guion, sin espacios.' };
  if (/^[.-]|[.-]$/.test(alias)) return { ok: false, error: 'El alias no puede empezar ni terminar con punto o guion.' };
  return { ok: true, tipo: 'alias', valor: alias };
}

// Para mostrarle al dueño de la cuenta qué quedó guardado sin exponer el número entero en pantallas compartidas.
function enmascarar(cuenta) {
  if (!cuenta || !cuenta.valor) return '';
  if (cuenta.tipo === 'cvu') return `••••${cuenta.valor.slice(-4)}`;
  return cuenta.valor;
}

const pago = (r) => r.estado === 'activo' || r.estado === 'pagado'; // el referido ya pagó su primer plan

// Lo que ve cada usuario: cuántas personas se registraron con su código, cuántas pagaron y cuánto lleva ganado.
function resumirReferidos(filas) {
  const lista = Array.isArray(filas) ? filas : [];
  const pagaron = lista.filter(pago);
  const cobradas = pagaron.filter((r) => r.comisionPagada);
  const porCobrar = pagaron.filter((r) => !r.comisionPagada);
  const suma = (a) => a.reduce((t, r) => t + (r.comisionPendiente || 0), 0);
  return {
    registrados: lista.length,
    pagaron: pagaron.length,
    sinPagar: lista.length - pagaron.length,
    porCobrar: suma(porCobrar),
    cobrado: suma(cobradas),
    total: suma(pagaron),
  };
}

// Plan pago vigente hoy (no prueba, no vencido). Sirve para que el admin vea si el referido sigue pagando al momento de transferir.
function suscripcionPagaVigente(u, ahora = new Date()) {
  if (!u) return false;
  if (u.esTester || u.plan === 'trial' || u.plan === 'admin' || u.plan === 'free') return false;
  return !!(u.planExpira && new Date(u.planExpira) > ahora);
}

// Lo que ve el admin: una fila por referente con su cuenta de cobro, cuántos pagaron y cuánto se le debe.
// `referidos` vienen con `referente` y `referido` poblados.
function agruparPorReferente(referidos, ahora = new Date()) {
  const grupos = new Map();
  for (const r of referidos || []) {
    if (!r.referente || !r.referente._id) continue;
    const id = String(r.referente._id);
    if (!grupos.has(id)) {
      const c = r.referente.cuentaCobro || {};
      grupos.set(id, {
        referenteId: id, nombre: r.referente.nombre || '', email: r.referente.email || '',
        cuenta: c.valor ? { tipo: c.tipo, valor: c.valor, actualizadoEn: c.actualizadoEn || null } : null,
        registrados: 0, pagaron: 0, vigentes: 0, porCobrar: 0, cobrado: 0, pendientes: [],
      });
    }
    const g = grupos.get(id);
    g.registrados += 1;
    if (!pago(r)) continue;
    g.pagaron += 1;
    const vigente = suscripcionPagaVigente(r.referido, ahora);
    if (vigente) g.vigentes += 1;
    if (r.comisionPagada) g.cobrado += r.comisionPendiente || 0;
    else {
      g.porCobrar += r.comisionPendiente || 0;
      g.pendientes.push({ id: String(r._id), referido: (r.referido && (r.referido.nombre || r.referido.email)) || '', monto: r.comisionPendiente || 0, vigente });
    }
  }
  return [...grupos.values()].sort((a, b) => b.porCobrar - a.porCobrar || b.pagaron - a.pagaron);
}

module.exports = { COMISION, validarCuentaCobro, enmascarar, resumirReferidos, suscripcionPagaVigente, agruparPorReferente };
