// db/mongoose-lite.js
// Emulación mínima pero fiel de la superficie de Mongoose que realmente usa
// akira.bot.js / calendar.service.js / waitlist.service.js / mongo-clientes
// .service.js — no es un ODM general. Cubre exactamente: find, findOne,
// findById, create, findByIdAndUpdate, findOneAndUpdate (con upsert),
// updateMany, countDocuments; encadenables .lean() .select() .sort()
// .maxTimeMS(); operadores de query $ne $in $nin $lt $lte $gt $gte $exists
// $or $and; operadores de update $set (con paths con punto) $setOnInsert
// $inc, y objeto plano (= $set implícito, igual que Mongoose real).
//
// Documentos no-lean ("hidratados") son el mismo objeto plano con un
// método .save() agregado (no enumerable) que persiste el estado actual —
// así `entry.estado = 'x'; await entry.save()` (patrón usado en todo
// waitlist.service.js) funciona igual que con un Document real.
'use strict';

const store = require('./store');
const { nuevoId } = require('./id');

// Clona vía JSON.stringify/parse (igual que store.js) y revive las fechas
// que ese round-trip convierte en string — necesario acá también porque
// create()/findByIdAndUpdate() etc. arman el documento en memoria antes de
// pasar por store.js, y el caller (akira.bot.js) espera Date reales
// (ej. `turnoDoc.fechaInicio` con .toISOString() disponible) apenas
// create() devuelve, no solo en una lectura posterior.
function clonar(doc) {
  return doc ? store.revivirFechas(JSON.parse(JSON.stringify(doc))) : doc;
}

function getPath(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, dotted, value) {
  const partes = dotted.split('.');
  let cur = obj;
  for (let i = 0; i < partes.length - 1; i++) {
    if (typeof cur[partes[i]] !== 'object' || cur[partes[i]] === null) cur[partes[i]] = {};
    cur = cur[partes[i]];
  }
  cur[partes[partes.length - 1]] = value;
}

function igual(a, b) {
  if (a instanceof Date || b instanceof Date) {
    return new Date(a).getTime() === new Date(b).getTime();
  }
  return a === b || String(a) === String(b);
}

function valorComparable(v) {
  return v instanceof Date ? v.getTime() : v;
}

function aplicarOperador(actual, op, val) {
  switch (op) {
    case '$ne': return !igual(actual, val);
    case '$in': return Array.isArray(val) && val.some((v) => igual(actual, v));
    case '$nin': return !(Array.isArray(val) && val.some((v) => igual(actual, v)));
    case '$lt': return valorComparable(actual) < valorComparable(val);
    case '$lte': return valorComparable(actual) <= valorComparable(val);
    case '$gt': return valorComparable(actual) > valorComparable(val);
    case '$gte': return valorComparable(actual) >= valorComparable(val);
    case '$exists': return val ? actual !== undefined : actual === undefined;
    case '$regex': return typeof actual === 'string' && new RegExp(val instanceof RegExp ? val.source : String(val), val instanceof RegExp ? val.flags : (arguments[3] || '')).test(actual);
    case '$options': return true; // se consume junto con $regex
    default: return true; // operador no contemplado: no filtra (preferible a romper la query entera)
  }
}

function esObjetoDeOperadores(v) {
  return v !== null && typeof v === 'object' && !(v instanceof Date) && !(v instanceof RegExp) && !Array.isArray(v);
}

function coincide(doc, query) {
  for (const [k, v] of Object.entries(query || {})) {
    if (k === '$or') {
      if (!v.some((sub) => coincide(doc, sub))) return false;
      continue;
    }
    if (k === '$and') {
      if (!v.every((sub) => coincide(doc, sub))) return false;
      continue;
    }
    const actual = k === '_id' ? doc._id : getPath(doc, k);
    if (v instanceof RegExp) {
      if (typeof actual !== 'string' || !v.test(actual)) return false;
    } else if (esObjetoDeOperadores(v)) {
      for (const [op, val] of Object.entries(v)) {
        if (op === '$regex') {
          if (typeof actual !== 'string' || !new RegExp(val instanceof RegExp ? val.source : String(val), v.$options || '').test(actual)) return false;
        } else if (!aplicarOperador(actual, op, val)) return false;
      }
    } else if (Array.isArray(actual) && !Array.isArray(v)) {
      // igualdad contra un campo array = "contiene" (semántica de Mongo)
      if (!actual.some((x) => igual(x, v))) return false;
    } else if (!igual(actual, v)) {
      return false;
    }
  }
  return true;
}

function aplicarProyeccion(doc, proj) {
  if (!proj || typeof proj !== 'string') return doc;
  const partes = proj.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return doc;
  const esExclusion = partes.every((p) => p.startsWith('-'));
  if (esExclusion) {
    const copia = { ...doc };
    for (const p of partes) delete copia[p.slice(1)];
    return copia;
  }
  const incluir = new Set([...partes, '_id']);
  const copia = {};
  for (const k of incluir) if (k in doc) copia[k] = doc[k];
  return copia;
}

function ordenar(docs, sort) {
  const entradas = Object.entries(sort || {});
  if (entradas.length === 0) return docs;
  return [...docs].sort((a, b) => {
    for (const [campo, dir] of entradas) {
      const av = valorComparable(getPath(a, campo));
      const bv = valorComparable(getPath(b, campo));
      if (av < bv) return dir >= 0 ? -1 : 1;
      if (av > bv) return dir >= 0 ? 1 : -1;
    }
    return 0;
  });
}

function aplicarSet(obj, campos) {
  for (const [k, v] of Object.entries(campos || {})) setPath(obj, k, v);
}

// esInsert: si estamos creando el documento vía upsert (aplica $setOnInsert
// además de $set) o actualizando uno existente (ignora $setOnInsert, igual
// que Mongo real).
function aplicarActualizacion(doc, update, esInsert) {
  const out = { ...doc };
  const claves = Object.keys(update || {});
  const usaOperadores = claves.some((k) => k.startsWith('$'));

  if (!usaOperadores) {
    // Objeto plano sin operadores = $set implícito de todos sus campos
    // (comportamiento real de findOneAndUpdate/findByIdAndUpdate de
    // Mongoose) — y ese $set (implícito o explícito) interpreta claves con
    // punto como paths anidados (`'pago.monto'`), igual que Mongo real:
    // usar setPath, no Object.assign (que trataría 'pago.monto' como un
    // único nombre de campo plano con un punto literal en el nombre).
    aplicarSet(out, update);
    return out;
  }

  if (update.$set) aplicarSet(out, update.$set);
  if (update.$push) {
    for (const [k, v] of Object.entries(update.$push)) {
      const arr = Array.isArray(getPath(out, k)) ? [...getPath(out, k)] : [];
      arr.push(v);
      setPath(out, k, arr);
    }
  }
  if (update.$addToSet) {
    for (const [k, v] of Object.entries(update.$addToSet)) {
      const arr = Array.isArray(getPath(out, k)) ? [...getPath(out, k)] : [];
      if (!arr.some((x) => igual(x, v))) arr.push(v);
      setPath(out, k, arr);
    }
  }
  if (update.$pull) {
    for (const [k, v] of Object.entries(update.$pull)) {
      const arr = Array.isArray(getPath(out, k)) ? getPath(out, k) : [];
      setPath(out, k, arr.filter((x) => (esObjetoDeOperadores(v) && typeof x === 'object' ? !coincide(x, v) : !igual(x, v))));
    }
  }
  if (esInsert && update.$setOnInsert) aplicarSet(out, update.$setOnInsert);
  if (update.$inc) {
    for (const [k, v] of Object.entries(update.$inc)) {
      setPath(out, k, (getPath(out, k) || 0) + v);
    }
  }
  return out;
}

// Semilla del documento nuevo en un upsert: copia las igualdades simples de
// la query (Mongo hace esto — ej. findOneAndUpdate({userId,jid}, {$setOnInsert:...},
// {upsert:true}) siembra userId+jid en el doc nuevo aunque no estén en el update).
function baseDeQuery(query) {
  const base = {};
  for (const [k, v] of Object.entries(query || {})) {
    if (k.startsWith('$')) continue;
    if (esObjetoDeOperadores(v)) continue;
    base[k] = v;
  }
  return base;
}

class Query {
  constructor(runner, mode, arg1, arg2) {
    this._runner = runner;
    this.mode = mode; // 'find' | 'findOne' | 'findById'
    this.query = arg1;
    this.projection = arg2 || null;
    this._lean = false;
    this._sort = null;
    this._skip = 0;
    this._limit = 0;
    this._promise = null;
  }
  lean() { this._lean = true; return this; }
  skip(n) { this._skip = n; return this; }
  limit(n) { this._limit = n; return this; }
  select(p) { this.projection = p; return this; }
  sort(s) { this._sort = s; return this; }
  maxTimeMS() { return this; } // no-op — no hay latencia de red local que limitar
  populate() { return this; } // no-op — no usado en queries reales de este dominio
  _ejecutar() { return this._runner(this); }
  then(resolve, reject) {
    if (!this._promise) this._promise = Promise.resolve().then(() => this._ejecutar());
    return this._promise.then(resolve, reject);
  }
  catch(reject) {
    if (!this._promise) this._promise = Promise.resolve().then(() => this._ejecutar());
    return this._promise.catch(reject);
  }
}

function crearColeccion(nombre, { extraColumns = [], uniqueIndex = null, mixin = null } = {}) {
  const table = store.ensureCollection(nombre, { extraColumns, uniqueIndex });
  function hidratar(doc) {
    if (!doc) return null;
    Object.defineProperty(doc, 'save', {
      value: async function () {
        // Copia plana: JSON.stringify(this) invocaría toJSON(), que en Config
        // oculta los campos cifrados — y se perderían las API keys al guardar.
        store.actualizar(table, this._id, { ...this }, extraColumns);
        return this;
      },
      enumerable: false,
      configurable: true,
    });
    Object.defineProperty(doc, 'toObject', {
      value: function () { const c = { ...this }; return c; },
      enumerable: false,
      configurable: true,
    });
    Object.defineProperty(doc, 'toJSON', {
      value: function () { const c = { ...this }; delete c.save; delete c.toJSON; return c; },
      enumerable: false,
      configurable: true,
    });
    if (mixin) mixin(doc);
    return doc;
  }

  function todos() {
    return store.obtenerTodos(table);
  }

  function ejecutarQuery(q) {
    let docs;
    if (q.mode === 'findById') {
      const d = store.obtenerPorId(table, q.query);
      docs = d ? [d] : [];
    } else {
      docs = todos().filter((d) => coincide(d, q.query || {}));
    }
    if (q._sort) docs = ordenar(docs, q._sort);
    if (q._skip) docs = docs.slice(q._skip);
    if (q._limit) docs = docs.slice(0, q._limit);

    if (q.mode === 'find') {
      const proyectados = docs.map((d) => aplicarProyeccion(clonar(d), q.projection));
      return q._lean ? proyectados : proyectados.map(hidratar);
    }
    const uno = docs[0] || null;
    if (!uno) return null;
    const proyectado = aplicarProyeccion(clonar(uno), q.projection);
    return q._lean ? proyectado : hidratar(proyectado);
  }

  async function actualizarUno(query, update, opts, knownId) {
    const docs = todos();
    const idx = docs.findIndex((d) => (knownId != null ? d._id === knownId : coincide(d, query)));

    if (idx === -1) {
      if (!opts.upsert) return null;
      const base = { ...baseDeQuery(knownId != null ? { _id: knownId } : query) };
      const nuevo = aplicarActualizacion({ _id: base._id || nuevoId(), ...base }, update, true);
      nuevo._id = nuevo._id || nuevoId();
      store.insertar(table, nuevo, extraColumns);
      return opts.new === false ? null : hidratar(clonar(nuevo));
    }

    const original = clonar(docs[idx]);
    const actualizado = aplicarActualizacion(clonar(docs[idx]), update, false);
    store.actualizar(table, actualizado._id, actualizado, extraColumns);
    const devolver = opts.new ? actualizado : original;
    return hidratar(aplicarProyeccion(clonar(devolver), opts.select));
  }

  return {
    find(query) { return new Query(ejecutarQuery, 'find', query); },
    findOne(query, projection) { return new Query(ejecutarQuery, 'findOne', query, projection); },
    findById(id, projection) { return new Query(ejecutarQuery, 'findById', id, projection); },

    async create(data) {
      const doc = { ...data, _id: data._id || nuevoId() };
      store.insertar(table, doc, extraColumns);
      return hidratar(clonar(doc));
    },

    findByIdAndUpdate(id, update, opts = {}) {
      return actualizarUno(null, update, opts, id);
    },
    findOneAndUpdate(query, update, opts = {}) {
      return actualizarUno(query, update, opts, null);
    },

    async updateMany(query, update) {
      const docs = todos();
      let modificados = 0;
      for (const d of docs) {
        if (coincide(d, query)) {
          const actualizado = aplicarActualizacion(clonar(d), update, false);
          store.actualizar(table, actualizado._id, actualizado, extraColumns);
          modificados++;
        }
      }
      return { modifiedCount: modificados };
    },

    async countDocuments(query = {}) {
      return todos().filter((d) => coincide(d, query)).length;
    },

    async deleteOne(query) {
      const d = todos().find((x) => coincide(x, query));
      if (d) store.eliminar(table, d._id);
      return { deletedCount: d ? 1 : 0 };
    },

    async deleteMany(query) {
      const docs = todos().filter((x) => coincide(x, query));
      for (const d of docs) store.eliminar(table, d._id);
      return { deletedCount: docs.length };
    },

    async findByIdAndDelete(id) {
      const d = store.obtenerPorId(table, id);
      if (d) store.eliminar(table, id);
      return d ? hidratar(d) : null;
    },

    async findOneAndDelete(query) {
      const d = todos().find((x) => coincide(x, query));
      if (d) store.eliminar(table, d._id);
      return d ? hidratar(d) : null;
    },

    async exists(query) {
      return todos().some((d) => coincide(d, query)) ? { _id: 'x' } : null;
    },
  };
}

module.exports = { crearColeccion };
