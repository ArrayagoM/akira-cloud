// lib/regex-seguro.js
// Texto escrito por una persona que se usa dentro de una expresión regular (búsquedas del panel de admin): se escapan los símbolos
// especiales para que "a.*" o "(" se busquen tal cual y no puedan armar una regex enorme, inválida o muy lenta.
'use strict';

const escaparRegex = (texto, max = 100) => String(texto == null ? '' : texto).slice(0, max).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { escaparRegex };
