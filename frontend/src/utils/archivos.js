import api from '../services/api';

// Descarga un Blob como archivo (sirve para exportaciones que llegan con el token de sesión).
export function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Pide un archivo a la API local (con sesión) y lo baja; usa el nombre que sugiere el servidor.
export async function bajarArchivo(ruta, nombreFallback) {
  const r = await api.get(ruta, { responseType: 'blob', timeout: 60000 });
  const cd = r.headers['content-disposition'] || '';
  const nombre = (cd.match(/filename="([^"]+)"/) || [])[1] || nombreFallback;
  descargar(r.data, nombre);
}

export const aBase64 = (file) => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(String(fr.result).split(',')[1] || '');
  fr.onerror = () => rej(new Error('No se pudo leer el archivo'));
  fr.readAsDataURL(file);
});

// $1.500 (sin decimales si es entero) o $8.200,50 (siempre 2 decimales si no lo es)
export const pesos = (n) => {
  const v = Number(n || 0);
  return `$${v.toLocaleString('es-AR', Number.isInteger(v) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
