// tests/pedidos.test.js — carrito de pedidos por WhatsApp (parte pura): buscar producto, agregar/quitar con stock,
// totales y re-validación contra el catálogo (los precios y el stock NUNCA salen de lo que diga la IA).
'use strict';
const ped = require('../main/bot-engine/services/bot/pedidos.service');

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); console.log('  ✅ ' + m); }
console.log('\n[pedidos] Tests:');

const CAT = [
  { nombre: 'Shampoo reparador 500 ml', precio: 8500, stock: 12, disponible: true },
  { nombre: 'Shampoo sin sulfatos', precio: 9200, stock: -1, disponible: true },
  { nombre: 'Cera modeladora', precio: 6200, stock: 3, disponible: true },
  { nombre: 'Aceite para barba', precio: 7000, stock: 0, disponible: true },
  { nombre: 'Peine de madera', precio: 3500.5, stock: -1, disponible: true },
  { nombre: 'Producto discontinuado', precio: 100, stock: 5, disponible: false },
  { nombre: 'Muestra gratis', precio: 0, stock: 5, disponible: true },
];

// ── buscar ──
assert(ped.buscarProducto(CAT, 'cera modeladora').producto.nombre === 'Cera modeladora', 'encuentra por nombre exacto (sin importar mayúsculas)');
assert(ped.buscarProducto(CAT, 'la cera').producto?.nombre === 'Cera modeladora' || ped.buscarProducto(CAT, 'cera').producto?.nombre === 'Cera modeladora', 'encuentra por una parte del nombre');
assert(ped.buscarProducto(CAT, 'aceite para barba').producto.nombre === 'Aceite para barba', 'incluso con productos sin stock (después se avisa)');
let r = ped.buscarProducto(CAT, 'shampoo');
assert(!r.ok && r.motivo === 'ambiguo' && r.opciones.length === 2, 'si hay dos que coinciden ("shampoo") pide que elija entre las opciones');
assert(ped.buscarProducto(CAT, 'shampoo reparador').producto.precio === 8500, 'con más detalle se resuelve ("shampoo reparador")');
r = ped.buscarProducto(CAT, 'peines de madera');
assert(r.ok && r.producto.nombre === 'Peine de madera', 'tolera plurales ("peines")');
r = ped.buscarProducto(CAT, 'tarjeta de regalo');
assert(!r.ok && r.motivo === 'no-encontrado' && r.opciones.length > 0, 'lo que no existe se informa y ofrece lo que sí hay');
assert(!ped.buscarProducto(CAT, 'producto discontinuado').ok && !ped.buscarProducto(CAT, 'muestra gratis').ok, 'no vende productos no disponibles ni los de precio 0');
assert(!ped.buscarProducto(CAT, '   ').ok && !ped.buscarProducto([], 'cera').ok && !ped.buscarProducto(null, 'cera').ok, 'búsquedas vacías o sin catálogo no rompen');

// ── agregar / quitar ──
const cera = CAT[2];
let c = ped.agregar([], cera, 2);
assert(c.carrito.length === 1 && c.carrito[0].cantidad === 2 && c.carrito[0].precio === 6200, 'agrega 2 ceras');
c = ped.agregar(c.carrito, cera, 1);
assert(c.carrito[0].cantidad === 3 && !c.error, 'sumar el mismo producto aumenta la cantidad (no duplica la línea)');
c = ped.agregar(c.carrito, cera, 1);
assert(c.error && /Solo nos quedan 3/.test(c.error) && c.carrito[0].cantidad === 3, 'no deja pasar el stock (hay 3) y lo explica');
assert(/no tenemos stock/.test(ped.agregar([], CAT[3], 1).error), 'sin stock → avisa');
assert(ped.agregar([], CAT[1], 40).carrito[0].cantidad === 40, 'stock sin control (-1) → no hay tope de stock');
assert(/hasta 50/.test(ped.agregar([], CAT[1], 51).error) && ped.agregar([], CAT[1], 0).error && ped.agregar([], CAT[1], -2).error && ped.agregar([], CAT[1], 'mucho').error, 'valida la cantidad (1 a 50)');
assert(ped.agregar([], CAT[1], 2.7).carrito[0].cantidad === 2, 'las cantidades decimales se redondean hacia abajo');
let grande = []; for (let i = 0; i < 15; i++) grande = ped.agregar(grande, { nombre: `P${i}`, precio: 10, stock: -1 }, 1).carrito;
assert(/hasta 15 productos/.test(ped.agregar(grande, { nombre: 'Otro', precio: 10, stock: -1 }, 1).error), 'máximo 15 productos distintos por pedido');
const dos = ped.agregar(ped.agregar([], CAT[0], 1).carrito, CAT[4], 2).carrito;
c = ped.quitar(dos, 'Peine de madera', 1);
assert(c.carrito.find((i) => i.nombre === 'Peine de madera').cantidad === 1, 'quitar 1 unidad deja el resto');
c = ped.quitar(dos, 'peine de madera');
assert(!c.carrito.some((i) => i.nombre === 'Peine de madera') && c.carrito.length === 1, 'quitar sin cantidad saca la línea entera');
assert(ped.quitar(dos, 'inexistente').error && ped.quitar(dos, 'Peine de madera', 0).error, 'quitar algo que no está, o cantidad inválida → error claro');

// ── totales y texto ──
assert(ped.subtotal(dos) === 8500 + 7001 && ped.unidades(dos) === 3, 'subtotal y cantidad de unidades (con decimales bien redondeados)');
const t = ped.resumenTexto(dos, { envio: 1500 });
assert(/1 × Shampoo reparador 500 ml — \$8\.500/.test(t) && /Envío: \$1\.500/.test(t) && /\*Total: \$17\.001\*/.test(t), 'el resumen lista cada línea, el envío y el total');
assert(ped.resumenTexto([]) === 'Tu pedido está vacío.' && !/Envío/.test(ped.resumenTexto(dos)), 'pedido vacío / sin envío');

// ── revalidar contra el catálogo (el precio lo manda el catálogo, no el carrito) ──
const trucho = [{ nombre: 'Cera modeladora', precio: 1, cantidad: 2 }, { nombre: 'Shampoo sin sulfatos', precio: 1, cantidad: 1 }];
let v = ped.revalidar(trucho, CAT);
assert(v.ok && v.subtotal === 6200 * 2 + 9200 && v.items[0].precio === 6200, 'si el carrito trae un precio adulterado, se recalcula con el del catálogo');
v = ped.revalidar([{ nombre: 'Cera modeladora', precio: 6200, cantidad: 5 }], CAT);
assert(!v.ok && /solo quedan 3/.test(v.problemas[0]), 'si bajó el stock desde que se agregó, lo detecta');
v = ped.revalidar([{ nombre: 'Producto discontinuado', precio: 100, cantidad: 1 }, { nombre: 'Cera modeladora', precio: 1, cantidad: 1 }], CAT);
assert(!v.ok && /ya no está disponible/.test(v.problemas[0]) && v.items.length === 1, 'si un producto ya no se vende, avisa cuál');
assert(!ped.revalidar([], CAT).ok, 'un carrito vacío no se puede confirmar');

console.log('\n✅ Todos los tests de pedidos pasaron.\n');
