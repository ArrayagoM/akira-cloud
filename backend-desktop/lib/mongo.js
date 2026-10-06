// lib/mongo.js
// Conexión a Mongo cacheada en `global` — imprescindible en serverless: cada
// invocación fría de una función Vercel ejecuta este módulo de nuevo, y sin
// cachear la conexión se abre una conexión nueva a Atlas por invocación,
// agotando el free tier (M0 admite ~500 conexiones) con tráfico moderado.
'use strict';

const mongoose = require('mongoose');

let cached = global.__akiraMongoConn;
if (!cached) {
  cached = global.__akiraMongoConn = { conn: null, promise: null };
}

async function connectMongo() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error('MONGO_URI no configurada');

    cached.promise = mongoose
      .connect(uri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        bufferCommands: false,
      })
      .then((m) => m);
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null; // permitir reintentar en la próxima invocación
    throw err;
  }

  return cached.conn;
}

module.exports = connectMongo;
