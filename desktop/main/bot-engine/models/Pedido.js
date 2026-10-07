// models/Pedido.js — pedidos de productos hechos por WhatsApp (o cargados a mano): carrito → pendiente de pago → pagado → entregado.
// Viven en la PC del dueño. numero = correlativo por negocio (Pedido #12).
'use strict';

const { crearColeccion } = require('../../db/mongoose-lite');

module.exports = crearColeccion('pedidos');
