// config/db.js
'use strict';

const mongoose = require('mongoose');
const logger   = require('./logger');

async function connectDB() {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    logger.info(`\x1b[32m✅ MongoDB conectado: ${conn.connection.host}\x1b[0m`);
  } catch (err) {
    logger.error(`❌ MongoDB error: ${err.message}`);
    throw err;
  }
}

mongoose.connection.on('disconnected', () => {
  logger.warn('[MongoDB] Desconectado — reintentando...');
});

mongoose.connection.on('reconnected', () => {
  logger.info('[MongoDB] Reconectado');
});

module.exports = connectDB;
