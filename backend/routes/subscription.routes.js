// routes/subscription.routes.js
'use strict';

const router  = require('express').Router();
const https   = require('https');
const crypto  = require('crypto');
const User    = require('../models/User');
const Log     = require('../models/Log');
const { requireAuth } = require('../middleware/auth');
const logger  = require('../config/logger');

// ── Planes ────────────────────────────────────────────────────
const PLANES = {
  basico_mensual:  { key:'basico', nombre:'Básico',  periodo:'mensual', precio:15000, meses:1  },
  basico_anual:    { key:'basico', nombre:'Básico',  periodo:'anual',   precio:144000,meses:12 },
  pro_mensual:     { key:'pro',    nombre:'Pro',     periodo:'mensual', precio:35000, meses:1  },
  pro_anual:       { key:'pro',    nombre:'Pro',     periodo:'anual',   precio:336000,meses:12 },
  agencia_mensual: { key:'agencia',nombre:'Agencia', periodo:'mensual', precio:80000, meses:1  },
  agencia_anual:   { key:'agencia',nombre:'Agencia', periodo:'anual',   precio:768000,meses:12 },
};

const LIMITES = {
  trial:   { mensajes:100,      bots:1,  calendar:false, mp:false, audio:false },
  basico:  { mensajes:500,      bots:1,  calendar:false, mp:false, audio:false },
  pro:     { mensajes:Infinity, bots:1,  calendar:true,  mp:true,  audio:true  },
  agencia: { mensajes:Infinity, bots:5,  calendar:true,  mp:true,  audio:true  },
  admin:   { mensajes:Infinity, bots:99, calendar:true,  mp:true,  audio:true  },
};

// ── Helper MP ─────────────────────────────────────────────────
function mpRequest(path, method='GET', body=null){
  const token = process.env.MP_PLATFORM_ACCESS_TOKEN;
  if(!token) throw new Error('MP_PLATFORM_ACCESS_TOKEN no configurado en .env');
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
    const vigente = esAdmin ? true
      : base==='trial' ? new Date(user.trialExpira)>new Date()
      : user.planExpira ? new Date(user.planExpira)>new Date() : false;

    res.json({
      plan:user.plan, planBase:base, status:user.status,
      trialExpira:user.trialExpira, planExpira:user.planExpira,
      planVigente:vigente, limites, esAdmin,
      diasRestantes: esAdmin ? 99999 : (() => {
        const exp = base==='trial' ? new Date(user.trialExpira) : new Date(user.planExpira||0);
        return Math.max(0,Math.ceil((exp-new Date())/86400000));
      })(),
    });
  }catch(err){ res.status(500).json({ error:err.message }); }
});

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

    // MercadoPago REQUIERE back_urls con protocolo HTTP/HTTPS válido.
    // Si el frontend es localhost, usamos el backend (ngrok) que tiene el endpoint /return
    // que redirige al frontend local.
    const usarReturnEndpoint = frontendUrl.includes('localhost') || frontendUrl.includes('127.0.0.1');

    const successUrl = usarReturnEndpoint
      ? `${backendUrl}/api/subscriptions/return?status=ok&plan=${plan.key}`
      : `${frontendUrl}/planes?suscripcion=ok&plan=${plan.key}`;

    const failureUrl = usarReturnEndpoint
      ? `${backendUrl}/api/subscriptions/return?status=failed`
      : `${frontendUrl}/planes?error=pago_fallido`;

    const pendingUrl = usarReturnEndpoint
      ? `${backendUrl}/api/subscriptions/return?status=pending`
      : `${frontendUrl}/planes?status=pendiente`;

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
    logger.info(`[SUB] Creando preferencia MP para plan ${planId} | precio $${plan.precio}`);

    const pref = await mpRequest('/checkout/preferences','POST',{
      items:[{
        id:          planId,
        title:       `Akira Cloud — Plan ${plan.nombre} ${plan.periodo}`,
        quantity:    1,
        unit_price:  plan.precio,
        currency_id: 'ARS',
        description: `Suscripción ${plan.periodo} — Akira Cloud`,
      }],
      payer:              { email:req.user.email, name:req.user.nombre||req.user.email },
      external_reference: `${req.user._id}|${plan.key}|${plan.periodo}`,
      back_urls:{
        success: successUrl,
        failure: failureUrl,
        pending: pendingUrl,
      },
      auto_return:        'approved',
      notification_url:   webhookUrl,
      expires:            true,
      expiration_date_to: new Date(Date.now()+60*60*1000).toISOString(),
      statement_descriptor: 'AKIRACLOUD',
    });

    logger.info(`[SUB] ✅ Preferencia creada | id:${pref.id} | init_point:${pref.init_point?.slice(0,60)}...`);
    await Log.registrar({ userId:req.user._id, tipo:'config_update', mensaje:`Checkout iniciado: ${planId} | $${plan.precio}` });

    res.json({ ok:true, init_point:pref.init_point, planId, precio:plan.precio });

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
  if ((status === 'approved' || status === 'ok') && paymentId && extRef) {
    try {
      const pago = await mpRequest(`/v1/payments/${paymentId}`);
      logger.info(`[SUB Return] Pago ${pago.id} | status:${pago.status} | monto:$${pago.transaction_amount}`);

      if (pago.status === 'approved') {
        const parts    = (pago.external_reference || '').split('|');
        const userId   = parts[0];
        const planKey  = parts[1];
        const periodo  = parts[2] || 'mensual';
        const fullId   = `${planKey}_${periodo}`;
        const planInfo = PLANES[fullId] || PLANES[`${planKey}_mensual`];

        if (userId && planKey && planInfo) {
          const expira = new Date();
          expira.setMonth(expira.getMonth() + planInfo.meses);

          await User.findByIdAndUpdate(userId, {
            plan:        planKey,
            planPeriodo: periodo,
            planExpira:  expira,
            status:      'activo',
          });

          await Log.registrar({ userId, tipo: 'bot_payment', nivel: 'info',
            mensaje: `Plan ${planKey} activado vía /return | MP ID:${pago.id} | $${pago.transaction_amount} ARS` });

          logger.info(`[SUB Return] ✅ Plan ${planKey} activado para ${userId} — expira ${expira.toLocaleDateString('es-AR')}`);

          if (global.io) {
            global.io.to(`user:${userId}`).emit('suscripcion:activada', {
              plan: planKey, planBase: planKey, expira,
              mensaje: `¡Plan ${planInfo.nombre} activado!`,
            });
          }
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
//  POST /api/subscriptions/webhook — notificaciones de MP
// ─────────────────────────────────────────────────────────────
router.post('/webhook', async(req,res)=>{
  // Verificar firma
  if(process.env.MP_PLATFORM_WEBHOOK_SECRET){
    try{
      const xSig=req.headers['x-signature']||'';
      const xId=req.headers['x-request-id']||'';
      const dId=req.query?.['data.id']||req.body?.data?.id||'';
      const p=Object.fromEntries(xSig.split(',').map(x=>x.split('=')));
      const ts=p['ts']||'',v1r=p['v1']||'';
      if(v1r){
        const m=`id:${dId};request-id:${xId};ts:${ts};`;
        const v1c=crypto.createHmac('sha256',process.env.MP_PLATFORM_WEBHOOK_SECRET).update(m).digest('hex');
        if(v1c.length===v1r.length&&!crypto.timingSafeEqual(Buffer.from(v1c),Buffer.from(v1r))){
          logger.warn('[SUB Webhook] Firma inválida');
          return res.sendStatus(401);
        }
      }
    }catch(e){ logger.warn('[SUB Webhook] Error firma:',e.message); }
  }

  res.sendStatus(200);
  const payload=req.body;
  logger.info(`[SUB Webhook] type:${payload.type} | data:${JSON.stringify(payload.data)}`);

  if(payload.type!=='payment'||!payload.data?.id) return;

  try{
    const pago=await mpRequest(`/v1/payments/${payload.data.id}`);
    logger.info(`[SUB Webhook] Pago ${pago.id} | status:${pago.status} | ref:${pago.external_reference} | monto:$${pago.transaction_amount}`);

    if(pago.status!=='approved') return;

    const parts=(pago.external_reference||'').split('|');
    const userId=parts[0], planKey=parts[1], periodo=parts[2];
    if(!userId||!planKey) return;

    const fullPlanId=`${planKey}_${periodo||'mensual'}`;
    const planInfo=PLANES[fullPlanId]||PLANES[`${planKey}_mensual`];
    if(!planInfo){ logger.warn('[SUB Webhook] Plan no encontrado:',fullPlanId); return; }

    const expira=new Date();
    expira.setMonth(expira.getMonth()+planInfo.meses);

    // Guardamos planKey limpio ('pro') + periodo por separado ('mensual'/'anual')
    await User.findByIdAndUpdate(userId,{
      plan:        planKey,          // 'pro', 'basico', 'agencia' — NO 'pro_mensual'
      planPeriodo: periodo||'mensual',
      planExpira:  expira,
      status:      'activo',
    });

    await Log.registrar({ userId, tipo:'bot_payment', nivel:'info',
      mensaje:`Plan ${fullPlanId} activado | MP ID:${pago.id} | $${pago.transaction_amount} ARS` });

    logger.info(`[SUB] ✅ Plan ${fullPlanId} activado para ${userId} — expira ${expira.toLocaleDateString('es-AR')}`);

    if(global.io){
      global.io.to(`user:${userId}`).emit('suscripcion:activada',{
        plan:fullPlanId, planBase:planKey, expira,
        mensaje:`¡Plan ${planInfo.nombre} activado!`,
      });
    }
  }catch(err){
    logger.error('[SUB Webhook] Error:',err.message);
  }
});

module.exports = router;
