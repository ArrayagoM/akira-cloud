// tests/prueba-modelo.test.js — el modelo User con Mongoose real (sin conexión): las cuentas NUEVAS entran al modelo de prueba por uso y
// las cuentas VIEJAS (leídas de la base sin los campos nuevos) siguen con la regla de calendario hasta que se las migra.
'use strict';

process.env.JWT_SECRET = 'x'.repeat(40);
const User = require('../models/User');
const P = require('../lib/prueba');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }

console.log('\n[prueba · modelo User] Tests:');

(async () => {
const nuevo = new User({ nombre: 'Ana', apellido: 'Pérez', email: 'ana@example.com', password: 'Clave12345!' });
const err = await nuevo.validate().then(() => null, (e) => e); // validate() (no validateSync) es el que corre los hooks
assert(nuevo.trialModeloUso === true && nuevo.trialDiasUso === 0 && nuevo.trialUltimoDiaUso === '', 'una cuenta nueva arranca en el modelo por uso con 0 días gastados');
assert(!err || !err.errors.trialModeloUso, 'los campos nuevos no rompen la validación');
const dias = Math.round((new Date(nuevo.trialExpira) - Date.now()) / 86400000);
assert(dias >= 59 && dias <= 60, 'el tope de calendario de una cuenta nueva es de 60 días');
assert(nuevo.planVigente() === true, 'una cuenta nueva tiene la prueba vigente');

// Una cuenta vieja tal como está en Mongo hoy: sin ninguno de los campos nuevos y con trialExpira a 7 días del alta
const vieja = User.hydrate({ _id: '507f1f77bcf86cd799439011', nombre: 'Luis', apellido: 'Gómez', email: 'luis@example.com', plan: 'trial', trialExpira: new Date(Date.now() + 2 * 86400000) });
assert(vieja.trialModeloUso === undefined, 'una cuenta vieja NO pasa sola al modelo nuevo (Mongoose no le rellena el campo)');
assert(vieja.planVigente() === true && P.vigenciaTrial(vieja).modelo === 'calendario', 'sigue con la regla de calendario y vigente hasta su fecha');
const vencida = User.hydrate({ _id: '507f1f77bcf86cd799439012', nombre: 'Eva', apellido: 'Ruiz', email: 'eva@example.com', plan: 'trial', trialExpira: new Date(Date.now() - 86400000) });
assert(vencida.planVigente() === false, 'una cuenta vieja vencida sigue vencida (hasta que se la reactive)');
const pro = User.hydrate({ _id: '507f1f77bcf86cd799439013', nombre: 'Pro', apellido: 'Pago', email: 'pro@example.com', plan: 'pro', planExpira: new Date(Date.now() + 5 * 86400000) });
assert(pro.planVigente() === true, 'un plan pago no cambió');
const json = nuevo.toJSON();
assert(json.trialModeloUso === true && 'trialDiasUso' in json && 'trialUltimoDiaUso' in json && !('password' in json), 'el usuario que ve la app trae los campos nuevos y nunca la contraseña');

console.log('\n✅ Todos los tests del modelo de la prueba pasaron.\n');
})().catch((e) => { console.error(e.message, e.stack); process.exit(1); });
