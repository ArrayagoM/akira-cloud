// local-api/routes/conocimiento.routes.js
// Base de conocimiento propia: se sube un PDF / texto / foto con las preguntas frecuentes del negocio y el bot lo usa.
'use strict';

const express = require('express');
const Conocimiento = require('../../bot-engine/models/Conocimiento');
const svc = require('../../bot-engine/services/bot/conocimiento.service');

const texto = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

module.exports = function crearRouter({ requerirSesion }) {
  const router = express.Router();
  router.use(requerirSesion);

  const resumen = (d) => ({ _id: String(d._id), titulo: d.titulo, origen: d.origen, caracteres: d.caracteres, fragmentos: (d.fragmentos || []).length, creado: d.createdAt, vista: String(d.fragmentos?.[0] || '').slice(0, 160) });

  async function guardar(uid, titulo, textoCompleto, origen) {
    const t = String(textoCompleto || '').replace(/\u0000/g, '').trim();
    if (t.length < 20) throw Object.assign(new Error('No encontré texto para guardar. Si es un PDF escaneado o una foto, probá con una imagen más nítida o pegá el texto.'), { status: 422 });
    if (t.length > svc.LIMITES.maxCaracteresPorDoc) throw Object.assign(new Error('El documento es demasiado largo (máximo unas 50 páginas). Dividilo en partes.'), { status: 413 });
    const existentes = await Conocimiento.find({ userId: uid }).lean();
    if (existentes.length >= svc.LIMITES.maxDocumentos) throw Object.assign(new Error(`Ya tenés ${svc.LIMITES.maxDocumentos} documentos: borrá alguno para sumar otro.`), { status: 409 });
    if (existentes.reduce((s, d) => s + (d.caracteres || 0), 0) + t.length > svc.LIMITES.maxCaracteresTotal) throw Object.assign(new Error('Con este documento se supera el espacio total de la base de conocimiento. Borrá alguno viejo.'), { status: 409 });
    return Conocimiento.create({ userId: uid, titulo: texto(titulo, 80) || 'Documento sin título', origen, caracteres: t.length, fragmentos: svc.fragmentar(t) });
  }

  router.get('/', async (req, res) => {
    const docs = await Conocimiento.find({ userId: String(req.user._id) }).lean();
    res.json({ documentos: docs.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).map(resumen), limites: svc.LIMITES });
  });

  router.post('/texto', async (req, res) => {
    try { const d = await guardar(String(req.user._id), req.body?.titulo, req.body?.texto, 'texto'); res.json({ ok: true, documento: resumen(d) }); }
    catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });

  // Archivo: PDF (con texto), TXT/MD/CSV o imagen (se lee con OCR).
  router.post('/archivo', express.json({ limit: '25mb' }), async (req, res) => {
    try {
      const { nombre = '', base64 } = req.body || {};
      if (!base64 || typeof base64 !== 'string') return res.status(400).json({ error: 'Falta el archivo' });
      const buf = Buffer.from(base64, 'base64');
      if (buf.length > 15 * 1024 * 1024) return res.status(413).json({ error: 'El archivo es muy grande (máximo 15 MB).' });
      const ext = (String(nombre).match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';
      let t = ''; let origen = ext || 'archivo';
      if (ext === 'pdf' || buf.subarray(0, 4).toString() === '%PDF') t = await require('../../gestion/pdf-texto').textoDePdf(buf);
      else if (['txt', 'md', 'csv', 'text'].includes(ext)) t = buf.toString('utf8');
      else if (['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(ext)) { t = await require('../../bot-engine/services/bot/ocr.service').leerTexto(buf); origen = 'foto (OCR)'; }
      else return res.status(415).json({ error: 'Formato no admitido. Subí un PDF, un archivo de texto (.txt) o una foto.' });
      const d = await guardar(String(req.user._id), req.body?.titulo || String(nombre).replace(/\.[^.]+$/, ''), t, origen);
      res.json({ ok: true, documento: resumen(d) });
    } catch (e) { res.status(e.status || 500).json({ error: e.status ? e.message : 'No se pudo leer el archivo: ' + e.message }); }
  });

  router.delete('/:id', async (req, res) => {
    const r = await Conocimiento.deleteOne({ _id: req.params.id, userId: String(req.user._id) });
    res.json({ ok: true, borrados: r?.deletedCount ?? 1 });
  });

  // "¿Qué le respondería el bot?" — muestra los fragmentos que usaría para esa pregunta.
  router.post('/probar', async (req, res) => {
    const pregunta = texto(req.body?.pregunta, 300);
    if (pregunta.length < 3) return res.status(400).json({ error: 'Escribí una pregunta.' });
    const docs = await Conocimiento.find({ userId: String(req.user._id) }).lean();
    res.json({ fragmentos: svc.buscar(docs, pregunta, { k: 3 }).map((f) => ({ titulo: f.titulo, texto: f.texto, puntaje: f.puntaje })), hayDocumentos: docs.length > 0 });
  });

  return router;
};
