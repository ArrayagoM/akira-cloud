// Pantalla "sin conexión" (offline.html). Va en un archivo aparte porque la política de seguridad del sitio (CSP: script-src 'self') no deja scripts dentro de la página.
// Hace tres cosas: el botón "Reintentar", recargar sola cuando vuelve internet y, si la app del celular guardó el último estado de tu bot, mostrarlo
// con la hora y el rótulo "sin conexión". Lo guardado es solo el nombre de la PC y cómo estaba el bot: nunca números del negocio ni datos de clientes.
// (Misma clave y formato que instantaneaOffline en frontend/src/lib/estadoMovil.js.)
(function () {
  var CLAVE = 'akira.celular.ultimoEstado';
  var VIDA_MS = 7 * 24 * 3600 * 1000; // más viejo que esto ya no sirve de nada y confunde
  var COLORES = { ok: '#00e87b', aviso: '#f59e0b', error: '#f43f5e', neutro: '#94a3b8' };

  function dos(n) { return (n < 10 ? '0' : '') + n; }
  function hora(ms) {
    var d = new Date(ms); var h = dos(d.getHours()) + ':' + dos(d.getMinutes());
    return d.toDateString() === new Date().toDateString() ? 'hoy a las ' + h : dos(d.getDate()) + '/' + dos(d.getMonth() + 1) + ' a las ' + h;
  }
  function hace(iso) {
    var t = iso ? new Date(iso).getTime() : NaN; if (!isFinite(t)) return 'nunca';
    var s = Math.max(0, Math.round((Date.now() - t) / 1000)); if (s < 60) return 'hace instantes';
    var m = Math.floor(s / 60); if (m < 60) return 'hace ' + m + ' min';
    var h = Math.floor(m / 60); if (h < 24) return 'hace ' + h + (h === 1 ? ' hora' : ' horas');
    var d = Math.floor(h / 24); return 'hace ' + d + (d === 1 ? ' día' : ' días');
  }
  function el(tag, texto, estilo) { var e = document.createElement(tag); if (texto) e.textContent = texto; if (estilo) e.style.cssText = estilo; return e; }

  var boton = document.getElementById('reintentar');
  if (boton) boton.addEventListener('click', function () { location.reload(); });
  window.addEventListener('online', function () { location.reload(); });

  var cont = document.getElementById('ultimo');
  if (!cont) return;
  var snap = null;
  try { snap = JSON.parse(localStorage.getItem(CLAVE) || 'null'); } catch (e) { snap = null; }
  if (!snap || snap.v !== 1 || !isFinite(snap.en) || !Array.isArray(snap.pcs) || !snap.pcs.length) return;
  if (Date.now() - snap.en > VIDA_MS || snap.en - Date.now() > 60000) return;

  cont.appendChild(el('p', 'SIN CONEXIÓN · último estado conocido', 'margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:.04em;color:#f59e0b'));
  cont.appendChild(el('p', 'Guardado ' + hora(snap.en) + '. Puede haber cambiado: ahora no hay conexión para verificarlo.', 'margin:0 0 12px;font-size:12px;color:#9ca3af'));
  snap.pcs.slice(0, 5).forEach(function (pc) {
    var tarjeta = el('div', '', 'text-align:left;border:1px solid #1e2a3a;border-radius:12px;padding:12px 14px;margin:0 0 10px;background:#0c131c');
    var color = COLORES[pc.tono] || COLORES.neutro;
    tarjeta.appendChild(el('p', String(pc.nombre || 'Mi PC'), 'margin:0 0 6px;font-size:14px;font-weight:700;color:#e5e7eb'));
    tarjeta.appendChild(el('span', String(pc.titulo || '').toUpperCase(), 'display:inline-block;font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;color:' + color + ';background:' + color + '22'));
    tarjeta.appendChild(el('p', String(pc.detalle || ''), 'margin:8px 0 0;font-size:13px;color:#cbd5e1'));
    tarjeta.appendChild(el('p', 'Última señal de la PC: ' + hace(pc.ultimoHeartbeat) + '.', 'margin:6px 0 0;font-size:12px;color:#9ca3af'));
    cont.appendChild(tarjeta);
  });
  cont.hidden = false;
})();
