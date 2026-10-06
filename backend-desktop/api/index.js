// api/index.js — entry point para Vercel.
// El runtime Node de Vercel invoca el export como handler (req, res) de
// Node; una app de Express es exactamente eso, no hace falta wrapper.
// (serverless-http es para el formato de eventos de AWS Lambda y deja la
// petición colgada acá.)
'use strict';

require('dotenv').config();
module.exports = require('../app');
