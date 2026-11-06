// boot-check.js — arranque de la web de Akira (no se usa en el programa de Windows).
// 1) Carga la tipografía SIN bloquear la pantalla (antes era una hoja de estilos de Google que dejaba todo en blanco si la red tardaba).
// 2) Si la aplicación no logra iniciar (pantalla en blanco), muestra por qué y ofrece repararla.
// Está escrito en JavaScript viejo (ES5) a propósito: tiene que correr aunque el navegador sea antiguo o el resto de la app falle.
(function () {
  var errores = [];
  var desde = new Date().getTime();
  var aviso = null;

  function guardar(m) { if (errores.length < 6) errores.push(String(m).slice(0, 240)); }

  window.addEventListener('error', function (e) {
    var t = e && e.target;
    if (t && t !== window && (t.src || t.href)) guardar('No cargó: ' + String(t.src || t.href).replace(/^https?:\/\/[^/]+/, ''));
    else guardar((e && e.message ? e.message : 'error') + (e && e.filename ? ' (' + String(e.filename).split('/').pop() + ':' + e.lineno + ')' : ''));
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    guardar('Promesa rechazada: ' + (r && r.message ? r.message : r));
  });

  function fuente() {
    try {
      var l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap';
      document.head.appendChild(l);
    } catch (x) { /* sin la tipografía la app se ve igual con la del sistema */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fuente); else fuente();

  function vacio() { var r = document.getElementById('root'); return !r || r.childNodes.length === 0; }

  // Borra el service worker y la memoria del sitio y vuelve a cargar: arregla una versión vieja trabada.
  function reparar() {
    var fin = function () { try { window.location.reload(); } catch (x) { window.location.href = '/celular'; } };
    try {
      var p = [];
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) p.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); }));
      if (window.caches && caches.keys) p.push(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }));
      Promise.all(p).then(fin, fin);
      setTimeout(fin, 2500);
    } catch (x) { fin(); }
  }

  function mostrar() {
    if (aviso) return;
    var info = 'Navegador: ' + navigator.userAgent + '\nPágina: ' + window.location.href + '\nDetalle: ' + (errores.length ? errores.join(' | ') : 'sin errores registrados (la aplicación no llegó a ejecutarse)');
    aviso = document.createElement('div');
    aviso.setAttribute('role', 'alert');
    aviso.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;background:#070b10;color:#e8f0f8;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;padding:max(24px,env(safe-area-inset-top)) 22px 24px;overflow:auto;text-align:center';
    aviso.innerHTML =
      '<div style="max-width:420px;margin:40px auto 0">' +
      '<div style="font-size:20px;font-weight:700;margin-bottom:10px">Akira no pudo abrir</div>' +
      '<p style="font-size:15px;line-height:1.5;color:#9aa8b8;margin:0 0 18px">Puede ser tu conexión o una versión vieja guardada en este celular. Tocá <b style="color:#e8f0f8">Reparar</b> y se vuelve a cargar limpia.</p>' +
      '<button id="akira-reparar" style="width:100%;padding:14px;border:0;border-radius:12px;background:#00e87b;color:#04140c;font-weight:700;font-size:16px">Reparar y reintentar</button>' +
      '<p style="font-size:13px;line-height:1.5;color:#9aa8b8;margin:22px 0 8px">Si sigue igual, mandanos este detalle y lo resolvemos:</p>' +
      '<pre id="akira-info" style="text-align:left;white-space:pre-wrap;word-break:break-all;background:#0e1520;border:1px solid #1e2a3a;border-radius:10px;padding:12px;font-size:11px;color:#9aa8b8;margin:0 0 12px"></pre>' +
      '<a id="akira-soporte" style="display:block;padding:12px;border:1px solid #1e2a3a;border-radius:12px;color:#00e87b;text-decoration:none;font-size:14px">Enviar a soporte</a>' +
      '</div>';
    document.body.appendChild(aviso);
    document.getElementById('akira-info').textContent = info;
    document.getElementById('akira-soporte').href = 'mailto:soporte@akiracloud.lat?subject=' + encodeURIComponent('Akira no abre en mi celular') + '&body=' + encodeURIComponent(info);
    document.getElementById('akira-reparar').onclick = reparar;
  }

  // Cada segundo: si pasaron 8 s y la pantalla sigue vacía, se muestra el aviso; si la app aparece (conexión lenta), el aviso se saca solo.
  var vueltas = 0;
  var t = setInterval(function () {
    vueltas++;
    var vacia = vacio();
    if (vacia && new Date().getTime() - desde >= 8000) mostrar();
    if (!vacia && aviso) { try { aviso.parentNode.removeChild(aviso); } catch (x) { /* ya no está */ } aviso = null; }
    if (vueltas > 180) clearInterval(t);
  }, 1000);
})();
