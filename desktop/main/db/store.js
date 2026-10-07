// db/store.js
// Motor de almacenamiento: cada "colección" es una tabla SQLite que guarda
// documentos completos como JSON en una columna `data` — no mapeamos cada
// campo a una columna relacional. Esto es deliberado: akira.bot.js y
// calendar.service.js hacen ~30 llamados Mongoose distintos (find/findOne/
// findById/findByIdAndUpdate/findOneAndUpdate/create/updateMany) con formas
// de documento variadas; traducir eso a SQL relacional término a término es
// mucho más riesgo de bugs sutiles que mantener el documento tal cual y
// filtrar/actualizar en JS (con volumen de datos de un solo negocio —
// cientos/miles de filas — el filtrado en JS es instantáneo).
//
// La ÚNICA razón para columnas extra por fuera de `data` es reproducir un
// índice único (o único parcial) de Mongo que SQLite pueda hacer cumplir de
// verdad — eso si importa para la integridad de los datos (anti doble-
// reserva de turnos, anti-duplicado de cliente). Ver ensureCollection().
'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let db = null;

function abrir(dbPath) {
  if (db) return db;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL'); // más resistente a cortes de luz que el modo por defecto
  return db;
}

function requireDb() {
  if (!db) throw new Error('[db/store] abrir(dbPath) no fue llamado todavía');
  return db;
}

// extraColumns: [{ name, path }] — path es la ruta dentro del documento
// (ej. 'userId', 'pago.monto') que se copia a una columna real para poder
// indexarla. uniqueIndex: { columns: [...], where?: 'estado IN (...)' }.
function ensureCollection(name, { extraColumns = [], uniqueIndex = null } = {}) {
  const d = requireDb();
  const table = `col_${name}`;

  const cols = extraColumns.map((c) => `"${c.name}" TEXT`).join(', ');
  d.exec(`
    CREATE TABLE IF NOT EXISTS "${table}" (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
      ${cols ? ', ' + cols : ''}
    );
  `);

  if (uniqueIndex) {
    const idxCols = uniqueIndex.columns.map((c) => `"${c}"`).join(', ');
    const where = uniqueIndex.where ? ` WHERE ${uniqueIndex.where}` : '';
    d.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_${table}_unique"
      ON "${table}" (${idxCols})${where};
    `);
  }

  return table;
}

function getPath(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// Error con la misma forma que el que tira Mongoose ante una violación de
// índice único (code 11000) — así el código que hace `if (e.code === 11000)`
// (registrarNuevo en mongo-clientes.service.js) sigue funcionando igual.
function errorDuplicado(mensajeOriginal) {
  const err = new Error(mensajeOriginal);
  err.code = 11000;
  return err;
}

// JSON.stringify convierte cualquier Date en su string ISO — al leer de
// vuelta necesitamos "revivirlas" a Date real, porque el código del bot
// llama .toISOString()/comparaciones de fecha asumiendo que son Date (igual
// que el driver real de Mongo, que sí devuelve Date nativos). Se detecta por
// forma exacta (la que products JSON.stringify(new Date()) siempre genera)
// — no hay otro campo en este dominio (jids, nombres, teléfonos) que calce
// esa forma por casualidad.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function revivirFechas(valor) {
  if (Array.isArray(valor)) return valor.map(revivirFechas);
  if (valor && typeof valor === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(valor)) out[k] = revivirFechas(v);
    return out;
  }
  if (typeof valor === 'string' && ISO_DATE_RE.test(valor)) return new Date(valor);
  return valor;
}

function filaAJson(fila) {
  if (!fila) return null;
  return revivirFechas(JSON.parse(fila.data));
}

function insertar(table, doc, extraColumns = []) {
  const d = requireDb();
  const now = new Date().toISOString();
  doc.createdAt = doc.createdAt || now;
  doc.updatedAt = now;

  const cols = ['id', 'data', 'createdAt', 'updatedAt', ...extraColumns.map((c) => c.name)];
  const vals = [
    doc._id,
    JSON.stringify(doc),
    doc.createdAt,
    doc.updatedAt,
    ...extraColumns.map((c) => stringifyExtra(getPath(doc, c.path))),
  ];
  const placeholders = cols.map(() => '?').join(', ');

  try {
    d.prepare(`INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`).run(...vals);
  } catch (e) {
    if (String(e.message).includes('UNIQUE constraint failed')) {
      throw errorDuplicado(`E11000 duplicate key en ${table}: ${e.message}`);
    }
    throw e;
  }
  return doc;
}

function stringifyExtra(v) {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function actualizar(table, id, doc, extraColumns = []) {
  const d = requireDb();
  doc.updatedAt = new Date().toISOString();

  const sets = ['data = ?', 'updatedAt = ?', ...extraColumns.map((c) => `"${c.name}" = ?`)];
  const vals = [
    JSON.stringify(doc),
    doc.updatedAt,
    ...extraColumns.map((c) => stringifyExtra(getPath(doc, c.path))),
    id,
  ];

  try {
    d.prepare(`UPDATE "${table}" SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  } catch (e) {
    if (String(e.message).includes('UNIQUE constraint failed')) {
      throw errorDuplicado(`E11000 duplicate key en ${table}: ${e.message}`);
    }
    throw e;
  }
  return doc;
}

function eliminar(table, id) {
  requireDb().prepare(`DELETE FROM "${table}" WHERE id = ?`).run(id);
}

function obtenerPorId(table, id) {
  const fila = requireDb().prepare(`SELECT data FROM "${table}" WHERE id = ?`).get(id);
  return filaAJson(fila);
}

function obtenerTodos(table) {
  const filas = requireDb().prepare(`SELECT data FROM "${table}"`).all();
  return filas.map(filaAJson);
}

// Copia consistente de la base mientras la app sigue funcionando (API de backup de SQLite).
async function respaldarA(destino) {
  await requireDb().backup(destino);
}

function cerrar() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  abrir,
  ensureCollection,
  insertar,
  actualizar,
  eliminar,
  obtenerPorId,
  obtenerTodos,
  respaldarA,
  cerrar,
  errorDuplicado,
  revivirFechas,
};
