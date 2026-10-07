// tests/email-webhook.test.js — verificación de la firma de los avisos de entrega (Svix/Resend).
'use strict';
const crypto = require('crypto');
const { verificarFirma, estadoDeEvento, TOLERANCIA_S } = require('../lib/email-webhook');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
console.log('\n[email-webhook] Tests:');

const clave = crypto.randomBytes(24);
const secreto = 'whsec_' + clave.toString('base64');
const cuerpo = JSON.stringify({ type: 'email.delivered', data: { to: ['ana@ejemplo.com'], subject: 'Hola' } });
const ahora = 1_800_000_000_000;
const ts = String(Math.floor(ahora / 1000));
const firmar = (id, t, c) => 'v1,' + crypto.createHmac('sha256', clave).update(`${id}.${t}.${c}`).digest('base64');

assert(verificarFirma({ cuerpo, id: 'msg_1', timestamp: ts, firma: firmar('msg_1', ts, cuerpo), secreto, ahora }), 'acepta un aviso con firma correcta');
assert(!verificarFirma({ cuerpo: cuerpo + ' ', id: 'msg_1', timestamp: ts, firma: firmar('msg_1', ts, cuerpo), secreto, ahora }), 'rechaza un aviso cuyo contenido fue alterado');
assert(!verificarFirma({ cuerpo, id: 'msg_2', timestamp: ts, firma: firmar('msg_1', ts, cuerpo), secreto, ahora }), 'rechaza si el id del mensaje no coincide con la firma');
assert(!verificarFirma({ cuerpo, id: 'msg_1', timestamp: ts, firma: firmar('msg_1', ts, cuerpo), secreto: 'whsec_' + crypto.randomBytes(24).toString('base64'), ahora }), 'rechaza una firma hecha con otro secreto');
const viejo = String(Math.floor(ahora / 1000) - TOLERANCIA_S - 5);
assert(!verificarFirma({ cuerpo, id: 'msg_1', timestamp: viejo, firma: firmar('msg_1', viejo, cuerpo), secreto, ahora }), 'rechaza un aviso viejo (anti-repetición, más de 5 minutos)');
assert(verificarFirma({ cuerpo, id: 'msg_1', timestamp: ts, firma: `v1,aaaa ${firmar('msg_1', ts, cuerpo)}`, secreto, ahora }), 'acepta si entre varias firmas hay una válida (rotación de secretos)');
assert(!verificarFirma({ cuerpo, id: 'msg_1', timestamp: ts, firma: firmar('msg_1', ts, cuerpo).replace('v1,', 'v2,'), secreto, ahora }), 'ignora versiones de firma desconocidas');
assert(!verificarFirma({ cuerpo, id: 'msg_1', timestamp: 'x', firma: 'v1,zzz', secreto, ahora }) && !verificarFirma({}) && !verificarFirma({ cuerpo, id: 'a', timestamp: ts, firma: 'v1,aa', secreto: '', ahora }), 'datos incompletos o inválidos se rechazan sin romper');

assert(estadoDeEvento('email.delivered') === 'entregado' && estadoDeEvento('email.bounced') === 'rebotado' && estadoDeEvento('email.complained') === 'spam', 'traduce entregado, rebotado y spam');
assert(estadoDeEvento('email.opened') === null && estadoDeEvento('email.clicked') === null && estadoDeEvento('email.sent') === null, 'no registra aperturas ni clics (no se rastrea al destinatario)');

console.log('\n✅ Todos los tests de email-webhook pasaron.\n');
