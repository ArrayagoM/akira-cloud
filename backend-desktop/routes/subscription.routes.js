// routes/subscription.routes.js
'use strict';

const router  = require('express').Router();
const https   = require('https');
const crypto  = require('crypto');
const User     = require('../models/User');
const Referido = require('../models/Referido');
const Log     = require('../models/Log');
const Pago    = require('../models/Pago');
const { requireAuth } = require('../middleware/auth');
const logger  = require('../config/logger');

// ── Planes ────────────────────────────────────────────────────
// Precios en lib/cobro.js (una sola fuente). El anual es 12 meses con 20 % de descuento sobre el mensual.
const cobro = require('../lib/cobro');
const PLANES = cobro.armarPlanes();

const LIMITES = {
  trial:   { mensajes:100,      bots:1,  calendar:false, mp:false, audio:false },
  basico:  { mensajes:500,      bots:1,  calendar:false, mp:false, audio:false },
  pro:     { mensajes:Infinity, bots:1,  calendar:true,  mp:true,  audio:true  },
  agencia: { mensajes:Infinity, bots:5,  calendar:true,  mp:true,  audio:true  },
  admin:   { mensajes:Infinity, bots:99, calendar:true,  mp:true,  audio:true  },
};

// ── Helper MP ─────────────────────────────────────────────────
const seg = require('../lib/mp-seguridad');
const MP_TIMEOUT_MS = 8000; // sin tope, una respuesta colgada de MP dejaba la función esperando hasta que Vercel la corta

function mpRequest(path, method='GET', body=null){
  const token = process.env.MP_PLATFORM_ACCESS_TOKEN;
  if(!token) throw new Error('MP_PLATFORM_ACCESS_TOKEN no configurado en .env');
  // Solo las dos rutas que usa Akira (consultar un pago y crear la preferencia): un id raro nunca arma otra consulta.
  if(!seg.rutaMpPermitida(path)) throw new Error('Ruta de Mercado Pago no permitida');
  return new Promise((resolve, reject)=>{
    const req = https.request({
      hostname:'api.mercadopago.com', path, method,
      headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
    },(res)=>{
      let data='';
      res.on('data',c=>data+=c);
      res.on('end',()=>{
        try{
          const p=JSON.parse(data);
          if(res.statusCode>=400){
            const e=new Error(p.message||p.error||`MP ${res.statusCode}`);
            e.mpResponse=p; e.status=res.statusCode; return reject(e);
          }
          resolve(p);
        }catch(e){ reject(new Error('MP parse error: '+data.slice(0,200))); }
      });
    });
    req.on('error',reject);
    req.setTimeout(MP_TIMEOUT_MS, ()=>req.destroy(new Error('Mercado Pago no respondió a tiempo')));
    if(body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────
//  GET /api/subscriptions/planes
// ─────────────────────────────────────────────────────────────
router.get('/planes',(_req,res)=>res.json({ planes:PLANES, limites:LIMITES }));

// ─────────────────────────────────────────────────────────────
//  GET /api/subscriptions/limites
// ─────────────────────────────────────────────────────────────
router.get('/limites', requireAuth, (req,res)=>{
  const base = (req.user.plan||'trial').replace(/_mensual|_anual/g,'');
  res.json({ plan:req.user.plan, planBase:base, limites:LIMITES[base]||LIMITES.trial });
});

// ─────────────────────────────────────────────────────────────
//  GET /api/subscriptions/mi-suscripcion
// ─────────────────────────────────────────────────────────────
router.get('/mi-suscripcion', requireAuth, async(req,res)=>{
  try{
    const user    = await User.findById(req.user._id).lean();
    const base    = (user.plan||'trial').replace(/_mensual|_anual/g,'');
    const limites = LIMITES[base]||LIMITES.trial;
    const esAdmin = user.rol==='admin'||user.plan==='admin';
    const vt = base==='trial' && !esAdmin ? require('../lib/prueba').vigenciaTrial(user) : null; // la prueba cuenta días de USO
    const vigente = esAdmin ? true
      : vt ? vt.vigente
      : user.planExpira ? new Date(user.planExpira)>new Date() : false;

    res.json({
      plan:user.plan, planBase:base, status:user.status,
      trialExpira:user.trialExpira, planExpira:user.planExpira,
      planVigente:vigente, limites, esAdmin,
      trial: vt ? { modelo:vt.modelo, diasUso:vt.diasUso, diasMax:vt.diasMax, diasRestantes:vt.diasRestantes, hoyContado:vt.hoyContado, topeExpira:vt.expira } : null,
      diasRestantes: esAdmin ? 99999 : vt ? vt.diasRestantes : (() => {
        const exp = new Date(user.planExpira||0);
        return Math.max(0,Math.ceil((exp-new Date())/86400000));
      })(),
    });
  }catch(err){ res.status(500).json({ error:err.message }); }
});

// ── Funciones puras del sistema de referidos — separadas para poder
// testearlas sin Mongo real (mismo criterio que quota.service.js).

// Calcula cuánto se cobra realmente en el checkout aplicando el
// descuento de referido disponible. Clamp defensivo: nunca deja el
// precio en $0 o negativo, aunque el descuento configurado fuera mayor
// al precio del plan.
function calcularPrecioConDescuento(precioLista, descuentoDisponible) {
  const descuentoAplicado = Math.max(0, Math.min(descuentoDisponible || 0, precioLista - 1));
  return { descuentoAplicado, precioFinal: precioLista - descuentoAplicado };
}

// Parsea el external_reference armado en /checkout:
// "userId|planKey|periodo|descuentoAplicado"
function parsearExternalReference(ref) {
  const parts = String(ref || '').split('|');
  return {
    userId: parts[0] || '',
    planKey: parts[1] || '',
    periodo: parts[2] || 'mensual',
    descuentoAplicado: parseInt(parts[3], 10) || 0,
  };
}

// ─────────────────────────────────────────────────────────────
//  Activa el plan pago y, si corresponde, procesa el referido:
//  acredita al referente y consume el descuento del referido.
//  Se llama desde los 3 caminos de confirmación de pago (/return,
//  /verificar-pago, /webhook) para no triplicar esta lógica.
//
//  IMPORTANTE: el descuento/crédito de referidos es UNA SOLA VEZ —
//  se aplica en el primer pago del referido, nunca en renovaciones.
//  Por eso "descuentoAplicado" viaja en el external_reference (lo que
//  MP realmente cobró), no se vuelve a leer de User en este punto: si
//  lo leyéramos de nuevo acá, una renovación posterior (con
//  descuentoReferido ya en 0) simplemente no aplicaría nada — pero
//  preferimos confiar en lo que se cobró de verdad en esa transacción
//  puntual antes que en el estado actual del usuario.
// ─────────────────────────────────────────────────────────────
async function activarPlanYProcesarReferido({ userId, planKey, periodo, planInfo, descuentoAplicado, pago }) {
  // 1) ¿El pago alcanza para este plan? (antes se activaba con solo estar "approved", sin mirar cuánto se pagó)
  const monto = cobro.verificarMonto({ pago, planInfo, descuentoAplicado });
  if (!monto.ok) {
    logger.warn(`[SUB] Pago ${pago && pago.id} NO activa el plan ${planKey} (${userId}): ${monto.detalle}`);
    await Log.registrar({ userId, tipo: 'bot_payment', nivel: 'warn', mensaje: `Pago ${pago && pago.id} aprobado pero no activó el plan ${planKey}: ${monto.detalle}` }).catch(() => {});
    return { activado: false, motivo: 'monto', detalle: monto.detalle };
  }

  // 2) Un pago activa el plan UNA sola vez: antes, repetir el mismo payment_id (el /return, /verificar-pago o el webhook) renovaba
  //    el plan gratis cada vez. Reclamar el pago y activar el plan es UNA sola escritura: si falla, no queda reclamado sin plan
  //    (antes eran dos escrituras y un corte en el medio dejaba al cliente con el pago "ya procesado" y sin plan).
  //    Renovar antes de que venza suma meses al tiempo que le quedaba (antes se perdían los días restantes).
  //    La escritura solo vale si el vencimiento sigue siendo el que se leyó (dos pagos distintos a la vez no se pisan: el segundo relee).
  const idPago = String(pago.id);
  let previo = null; let expira = null;
  for (let intento = 0; intento < 3 && !previo; intento++) {
    const leido = await User.findById(userId).select('plan planExpira email +pagosMpProcesados').lean();
    if (!leido || (leido.pagosMpProcesados || []).includes(idPago)) {
      logger.info(`[SUB] Pago ${pago.id} ya estaba procesado (o el usuario ${userId} no existe): no se vuelve a activar`);
      return { activado: false, motivo: 'ya_procesado' };
    }
    const vence = cobro.nuevaExpiracion({ planExpiraActual: leido.planExpira, planActual: leido.plan, planKey, meses: planInfo.meses });
    const hecho = await User.findOneAndUpdate(
      { _id: userId, pagosMpProcesados: { $ne: idPago }, planExpira: leido.planExpira || null },
      {
        $push: { pagosMpProcesados: { $each: [idPago], $slice: -100 } },
        $set: { plan: planKey, planPeriodo: periodo, planExpira: vence, status: 'activo' },
      },
      { new: false },
    ).select('plan planExpira email');
    if (hecho) { previo = hecho; expira = vence; }
  }
  if (!previo) {
    // Otro cobro del mismo usuario cambió el vencimiento tres veces seguidas: no se descarta el pago en silencio, se reintenta después.
    throw new Error(`No se pudo activar el pago ${pago.id} por cambios simultáneos en la cuenta ${userId}`);
  }

  // Queda asentado para el panel de ingresos del administrador (si falla, el plan ya está activo: no se corta nada)
  await Pago.create({ userId, email: previo.email || '', mpPagoId: String(pago.id), plan: planKey, periodo, monto: Number(pago.transaction_amount) || 0, descuentoReferido: descuentoAplicado || 0 })
    .catch((e) => logger.warn(`[SUB] No se pudo registrar el pago ${pago.id} en ingresos: ${e.message}`));

  await Log.registrar({ userId, tipo: 'bot_payment', nivel: 'info',
    mensaje: `Plan ${planKey} activado | MP ID:${pago.id} | $${pago.transaction_amount} ARS${descuentoAplicado ? ` (con $${descuentoAplicado} de descuento por referido)` : ''}` });

  if (global.io) {
    global.io.to(`user:${userId}`).emit('suscripcion:activada', {
      plan: planKey, planBase: planKey, expira,
      mensaje: `¡Plan ${planInfo.nombre} activado!`,
    });
  }

  // ── Referido: acreditar al referente SOLO si hubo descuento real
  // cobrado en esta transacción y todavía no se procesó (idempotente
  // ante reintentos del webhook o doble confirmación return+webhook).
  if (descuentoAplicado > 0) {
    try {
      // El descuento es de un solo uso: se consume acá pase lo que pase
      // con el Referido de abajo, para que una renovación futura de
      // este mismo usuario jamás vuelva a aplicarlo.
      await User.findByIdAndUpdate(userId, { descuentoReferido: 0 });

      const ref = await Referido.findOne({ referido: userId, estado: 'pendiente' });
      if (ref) {
        ref.estado = 'activo';
        ref.pagoMpId = String(pago.id);
        await ref.save();

        await User.findByIdAndUpdate(ref.referente, {
          $inc: { creditoReferidos: ref.comisionPendiente || 0 },
        });

        await Log.registrar({
          userId: ref.referente, tipo: 'config_update', nivel: 'info',
          mensaje: `Crédito de $${ref.comisionPendiente} acreditado por referido (${userId} pagó su primer plan) | MP ID:${pago.id}`,
        });

        logger.info(`[SUB] ✅ Referido acreditado: referente ${ref.referente} +$${ref.comisionPendiente} por pago de ${userId}`);
      }
    } catch (e) {
      // Un fallo acá NUNCA debe tumbar la activación del plan, que ya
      // se hizo arriba — solo lo logueamos para revisarlo a mano.
      logger.error(`[SUB] Error procesando crédito de referido para ${userId}: ${e.message}`);
    }
  }
  return { activado: true, expira };
}

// ─────────────────────────────────────────────────────────────
//  POST /api/subscriptions/checkout
// ─────────────────────────────────────────────────────────────
router.post('/checkout', requireAuth, async(req,res)=>{
  try{
    const planId = req.body.plan || req.body.planId;

    // ── Log de diagnóstico ─────────────────────────────────────
    logger.info(`[SUB] Checkout request | user:${req.user.email} | planId:${planId}`);
    logger.info(`[SUB] ENV | BACKEND_URL="${process.env.BACKEND_URL}" | FRONTEND_URL="${process.env.FRONTEND_URL}"`);
    logger.info(`[SUB] ENV | MP_TOKEN=${process.env.MP_PLATFORM_ACCESS_TOKEN ? 'OK ('+process.env.MP_PLATFORM_ACCESS_TOKEN.slice(0,20)+'...)' : 'FALTA'}`);

    if(!planId)          return res.status(400).json({ error:'Falta el campo plan' });
    if(!PLANES[planId])  return res.status(400).json({ error:`Plan inválido. Opciones: ${Object.keys(PLANES).join(', ')}` });
    if(!process.env.MP_PLATFORM_ACCESS_TOKEN) return res.status(503).json({ error:'Credenciales de MercadoPago no configuradas. Agregá MP_PLATFORM_ACCESS_TOKEN en .env' });

    const plan = PLANES[planId];

    // ── Descuento por referido — de un solo uso, se consume recién
    // cuando el pago se confirma (ver activarPlanYProcesarReferido).
    // Acá solo lo leemos para armar el precio del checkout.
    const { descuentoAplicado: descuentoReferido, precioFinal } = calcularPrecioConDescuento(plan.precio, req.user.descuentoReferido);
    if (descuentoReferido > 0) {
      logger.info(`[SUB] Aplicando descuento por referido: $${descuentoReferido} | precio final: $${precioFinal}`);
    }

    // ── Construir y validar URLs ───────────────────────────────
    const backendUrl  = (process.env.BACKEND_URL||'').trim().replace(/\/+$/,'');  // quitar / final
    const frontendUrl = (process.env.FRONTEND_URL||'http://localhost:3000').trim().replace(/\/+$/,'');

    logger.info(`[SUB] URLs | backend="${backendUrl}" | frontend="${frontendUrl}"`);

    // Verificar que BACKEND_URL sea pública (HTTPS, no localhost)
    const backendOk = backendUrl &&
      backendUrl.startsWith('https://') &&
      !backendUrl.includes('localhost') &&
      !backendUrl.includes('127.0.0.1');

    if(!backendOk){
      logger.error(`[SUB] BACKEND_URL inválida: "${backendUrl}"`);
      return res.status(503).json({
        error: `BACKEND_URL inválida ("${backendUrl}"). ` +
               'Debe ser una URL pública HTTPS de ngrok. ' +
               'Ejemplo: BACKEND_URL=https://abc123.ngrok-free.app',
      });
    }

    // SIEMPRE usamos el endpoint /return del backend como intermediario.
    // Esto garantiza que el plan se active sincrónicamente al volver del pago,
    // sin importar si el frontend es localhost o producción.
    // /return verifica el pago con MP, activa el plan en DB y redirige al frontend.
    const successUrl = `${backendUrl}/api/subscriptions/return`;
    const failureUrl = `${backendUrl}/api/subscriptions/return?status=failed`;
    const pendingUrl = `${backendUrl}/api/subscriptions/return?status=pending`;

    const webhookUrl = `${backendUrl}/api/subscriptions/webhook`;

    logger.info(`[SUB] Back URLs | success="${successUrl}"`);
    logger.info(`[SUB] Back URLs | failure="${failureUrl}"`);
    logger.info(`[SUB] Webhook   | url="${webhookUrl}"`);

    // Validar que todas las URLs sean absolutas y válidas
    for(const [nombre, url] of [['success',successUrl],['failure',failureUrl],['pending',pendingUrl],['webhook',webhookUrl]]){
      try{ new URL(url); }
      catch(e){
        logger.error(`[SUB] URL inválida para ${nombre}: "${url}"`);
        return res.status(500).json({ error:`URL inválida para ${nombre}: "${url}". Verificá BACKEND_URL en .env` });
      }
    }

    // ── Crear preferencia de pago en MP ────────────────────────
    logger.info(`[SUB] Creando preferencia MP para plan ${planId} | precio $${precioFinal}${descuentoReferido ? ` (con descuento de $${descuentoReferido})` : ''}`);

    const pref = await mpRequest('/checkout/preferences','POST',{
      items:[{
        id:          planId,
        title:       descuentoReferido
          ? `Akira Cloud — Plan ${plan.nombre} ${plan.periodo} (con $${descuentoReferido} de descuento por referido)`
          : `Akira Cloud — Plan ${plan.nombre} ${plan.periodo}`,
        quantity:    1,
        unit_price:  precioFinal,
        currency_id: 'ARS',
        description: `Suscripción ${plan.periodo} — Akira Cloud`,
      }],
      payer:              { email:req.user.email, name:req.user.nombre||req.user.email },
      // 4to campo = descuento de referido REALMENTE cobrado en esta
      // transacción puntual — se usa para acreditar al referente al
      // confirmar el pago, sin depender del estado actual del usuario.
      external_reference: `${req.user._id}|${plan.key}|${plan.periodo}|${descuentoReferido}`,
      // El precio que corresponde cobrar viaja en la metadata (la armamos nosotros): al confirmar se comprueba que el pago lo alcance.
      metadata:           { precio_esperado: precioFinal, plan_id: planId },
      back_urls:{
        success: successUrl,
        failure: failureUrl,
        pending: pendingUrl,
      },
      auto_return:        'approved',
      notification_url:   webhookUrl,
      expires:            true,
      expiration_date_to: cobro.aFechaMercadoPago(new Date(Date.now()+60*60*1000)), // con -03:00: con "Z" el link puede quedar vencido de entrada (botón Pagar en gris)
      statement_descriptor: 'AKIRACLOUD',
    });

    logger.info(`[SUB] ✅ Preferencia creada | id:${pref.id} | init_point:${pref.init_point?.slice(0,60)}...`);
    await Log.registrar({ userId:req.user._id, tipo:'config_update', mensaje:`Checkout iniciado: ${planId} | $${plan.precio}` });

    res.json({ ok:true, init_point:pref.init_point, planId, precio:precioFinal, precioLista:plan.precio, descuentoReferido });

  }catch(err){
    logger.error(`[SUB] ❌ Error checkout: ${err.message}`);
    if(err.mpResponse) logger.error('[SUB] MP Response:', JSON.stringify(err.mpResponse));
    res.status(500).json({
      error: process.env.NODE_ENV==='production'
        ? 'Error al generar el pago. Intentá de nuevo.'
        : err.message,
    });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/subscriptions/return
//  MP redirige aquí tras el pago.
//  Verificamos el pago AHORA (no esperamos el webhook) para activar
//  el plan en el mismo instante en que el usuario regresa al sitio.
// ─────────────────────────────────────────────────────────────
router.get('/return', async (req, res) => {
  const status    = req.query.status || req.query.collection_status || 'ok';
  const paymentId = req.query.payment_id || req.query.collection_id || '';
  const extRef    = req.query.external_reference || '';
  const frontend  = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');

  logger.info(`[SUB Return] status=${status} | paymentId=${paymentId} | extRef=${extRef}`);

  // Si el pago fue aprobado, verificar y activar el plan inmediatamente
  // (el webhook puede llegar tarde o fallar; esto garantiza la activación)
  if ((status === 'approved' || status === 'ok') && paymentId && extRef && seg.idPagoValido(paymentId)) {
    try {
      const pago = await mpRequest(`/v1/payments/${paymentId}`);
      logger.info(`[SUB Return] Pago ${pago.id} | status:${pago.status} | monto:$${pago.transaction_amount}`);

      if (pago.status === 'approved') {
        const { userId, planKey, periodo, descuentoAplicado } = parsearExternalReference(pago.external_reference);
        const fullId   = `${planKey}_${periodo}`;
        const planInfo = PLANES[fullId] || PLANES[`${planKey}_mensual`];

        if (seg.userIdValido(userId) && planKey && planInfo) {
          await activarPlanYProcesarReferido({ userId, planKey, periodo, planInfo, descuentoAplicado, pago });
          logger.info(`[SUB Return] ✅ Plan ${planKey} activado para ${userId}`);
        }
      }
    } catch (e) {
      logger.error('[SUB Return] Error verificando pago:', e.message);
      // No bloqueamos la redirección aunque falle — el webhook es el backup
    }
  }

  const planParam = extRef ? (extRef.split('|')[1] || '') : (req.query.plan || '');
  const destinos  = {
    approved: `/planes?suscripcion=ok${planParam ? '&plan=' + planParam : ''}`,
    ok:       `/planes?suscripcion=ok${planParam ? '&plan=' + planParam : ''}`,
    failed:   '/planes?error=pago_fallido',
    rejected: '/planes?error=pago_fallido',
    pending:  '/planes?status=pendiente',
  };
  const destino = frontend + (destinos[status] || `/planes?suscripcion=ok${planParam ? '&plan=' + planParam : ''}`);
  logger.info(`[SUB Return] → Redirigiendo a ${destino}`);
  res.redirect(302, destino);
});

// ─────────────────────────────────────────────────────────────
//  POST /api/subscriptions/verificar-pago
//  Fallback: el frontend llama a este endpoint con payment_id
//  para activar el plan si el /return falló por algún motivo.
// ─────────────────────────────────────────────────────────────
router.post('/verificar-pago', requireAuth, async(req,res)=>{
  try {
    const paymentId = req.body.payment_id || req.body.collection_id || '';
    if (!paymentId) return res.status(400).json({ error: 'Falta payment_id' });
    if (!seg.idPagoValido(paymentId)) return res.status(400).json({ error: 'payment_id no válido' });

    const pago = await mpRequest(`/v1/payments/${paymentId}`);
    if (pago.status !== 'approved') {
      return res.json({ ok: false, msg: `Pago no aprobado: ${pago.status}` });
    }

    const { userId, planKey, periodo, descuentoAplicado } = parsearExternalReference(pago.external_reference);

    // Verificar que el pago pertenece al usuario autenticado
    if (String(userId) !== String(req.user._id)) {
      return res.status(403).json({ error: 'El pago no pertenece a tu cuenta' });
    }

    const fullId   = `${planKey}_${periodo}`;
    const planInfo = PLANES[fullId] || PLANES[`${planKey}_mensual`];
    if (!planInfo) return res.status(400).json({ error: `Plan desconocido: ${planKey}` });

    const r = await activarPlanYProcesarReferido({ userId, planKey, periodo, planInfo, descuentoAplicado, pago });
    if (!r.activado && r.motivo === 'monto') return res.status(409).json({ ok: false, msg: 'El pago no alcanza para ese plan. Escribinos y lo revisamos.' });
    if (!r.activado) { // ya estaba procesado: el plan ya quedó activo la primera vez
      const u = await User.findById(userId).select('plan planExpira').lean();
      return res.json({ ok: true, plan: u && u.plan, expira: u && u.planExpira, msg: `Plan ${planInfo.nombre} ya estaba activado` });
    }
    logger.info(`[SUB Verificar] ✅ Plan ${planKey} activado para ${userId}`);
    res.json({ ok: true, plan: planKey, expira: r.expira, msg: `Plan ${planInfo.nombre} activado` });
  } catch(err) {
    logger.error('[SUB Verificar] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/subscriptions/webhook/:userId — webhook por usuario
//  MercadoPago llama a esta URL cuando el cliente del negocio paga
//  con el bot como intermediario. El userId identifica qué bot procesa.
// ─────────────────────────────────────────────────────────────
router.post('/webhook/:userId', async(req,res)=>{
  // Reutilizar la misma lógica que el webhook genérico — el userId está en params
  // pero en las notificaciones de bot-client el external_reference ya incluye el userId.
  // Respondemos 200 inmediatamente (requisito de MP) y procesamos en background.
  res.sendStatus(200);
  const payload = req.body || {};
  const ownerId = req.params.userId; // userId del negocio dueño del bot
  if (!seg.userIdValido(ownerId)) return; // un id cualquiera de la URL nunca arma una sala de eventos
  logger.info(`[SUB Webhook/:userId] ownerId=${ownerId} type:${payload.type} | data:${JSON.stringify(payload.data)}`);
  // Por ahora, forward al flujo estándar — el bot-engine de ese usuario
  // puede suscribirse en el futuro para procesar pagos de sus clientes.
  if (global.io && payload.type === 'payment' && payload.data?.id) {
    global.io.to(`user:${ownerId}`).emit('mp:payment-notification', {
      paymentId: payload.data.id,
      type: payload.type,
    });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/subscriptions/webhook — notificaciones de MP (plataforma Akira)
// ─────────────────────────────────────────────────────────────
let avisoFirmaDado = false; // el aviso de "avisos sin firma" se deja una vez por arranque, no en cada pago
router.post('/webhook', async(req,res)=>{
  const payload=req.body||{};
  const dataId=req.query?.['data.id']||payload.data?.id||'';

  // Firma: sin secreto o sin cabecera pasa con aviso (el manifiesto nunca se probó en producción: no se rechazan cobros reales);
  // una firma presente y mala se rechaza. MP_WEBHOOK_FIRMA_ESTRICTA=1 exige firma válida.
  const firma=seg.verificarFirmaMp({
    secreto:process.env.MP_PLATFORM_WEBHOOK_SECRET, xSignature:req.headers['x-signature'], xRequestId:req.headers['x-request-id'],
    dataId:String(dataId), estricta:process.env.MP_WEBHOOK_FIRMA_ESTRICTA==='1',
  });
  if(!firma.ok){ logger.warn(`[SUB Webhook] Aviso rechazado: ${firma.motivo}`); return res.sendStatus(401); }
  if(firma.advertencia && !avisoFirmaDado){ avisoFirmaDado=true; logger.warn(`[SUB Webhook] Aviso sin verificar a fondo (${firma.motivo}). Configurá MP_PLATFORM_WEBHOOK_SECRET y MP_WEBHOOK_FIRMA_ESTRICTA=1 cuando se compruebe con un aviso real.`); }

  logger.info(`[SUB Webhook] type:${payload.type} | data:${JSON.stringify(payload.data)}`);
  if(payload.type!=='payment'||!payload.data?.id) return res.sendStatus(200);
  if(!seg.idPagoValido(payload.data.id)){ logger.warn('[SUB Webhook] id de pago no válido: se ignora'); return res.sendStatus(200); }

  // Se procesa ANTES de responder: si algo falla (MP no contesta, la base se corta) se responde 500 y Mercado Pago reintenta.
  // Antes se respondía 200 primero y el trabajo quedaba a medias sin que nadie se enterara (en Vercel la función puede congelarse al responder).
  // Lo que no tiene arreglo reintentando (no aprobado, plan desconocido, monto corto, ya procesado) se responde 200.
  try{
    const pago=await mpRequest(`/v1/payments/${payload.data.id}`);
    logger.info(`[SUB Webhook] Pago ${pago.id} | status:${pago.status} | ref:${pago.external_reference} | monto:$${pago.transaction_amount}`);

    if(pago.status!=='approved') return res.sendStatus(200);

    const { userId, planKey, periodo, descuentoAplicado } = parsearExternalReference(pago.external_reference);
    if(!seg.userIdValido(userId)||!planKey) return res.sendStatus(200);

    const fullPlanId=`${planKey}_${periodo}`;
    const planInfo=PLANES[fullPlanId]||PLANES[`${planKey}_mensual`];
    if(!planInfo){ logger.warn('[SUB Webhook] Plan no encontrado:',fullPlanId); return res.sendStatus(200); }

    const r=await activarPlanYProcesarReferido({ userId, planKey, periodo, planInfo, descuentoAplicado, pago });
    if(r.activado) logger.info(`[SUB] ✅ Plan ${fullPlanId} activado para ${userId}`);
    res.sendStatus(200);
  }catch(err){
    logger.error('[SUB Webhook] Error (se responde 500 para que Mercado Pago reintente):',err.message);
    res.sendStatus(500);
  }
});

// Funciones puras expuestas solo para tests (ver tests/referidos.test.js)
router.calcularPrecioConDescuento = calcularPrecioConDescuento;
router.parsearExternalReference   = parsearExternalReference;
router.activarPlanYProcesarReferido = activarPlanYProcesarReferido;
router.PLANES = PLANES;

module.exports = router;
