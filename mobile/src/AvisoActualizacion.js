import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Pressable, Linking, Platform, AppState, StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { C, Boton } from './ui';
import { leerUltimaVersionApp, URL_BASE } from './api';
import { versionInstalada, decidir, textoAviso, tocaConsultar, descargaValida, ERRORES } from './actualizar';

const PAGINA_DESCARGA = 'https://akiracloud.lat/descargar';

// Baja el .apk nuevo de nuestro servidor y abre el instalador de Android (que pide confirmar). Solo Android.
async function descargarEInstalar(url, alProgreso) {
  const destino = FileSystem.cacheDirectory + 'Akira-actualizacion.apk';
  try { await FileSystem.deleteAsync(destino, { idempotent: true }); } catch { /* no había */ }
  let r;
  try {
    const bajada = FileSystem.createDownloadResumable(url, destino, {}, (p) => { if (p.totalBytesExpectedToWrite > 0) alProgreso(p.totalBytesWritten / p.totalBytesExpectedToWrite); });
    r = await bajada.downloadAsync();
  } catch { throw new Error(ERRORES.descarga); }
  const info = await FileSystem.getInfoAsync(destino);
  if (!r || !descargaValida({ status: r.status, size: info.exists ? info.size : 0 })) { try { await FileSystem.deleteAsync(destino, { idempotent: true }); } catch { /* ya no está */ } throw new Error(r && r.status === 200 ? ERRORES.incompleta : ERRORES.descarga); }
  try {
    const contenido = await FileSystem.getContentUriAsync(destino);
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', { data: contenido, flags: 1, type: 'application/vnd.android.package-archive' });
  } catch { throw new Error(ERRORES.instalar); }
}

// Aviso de "hay una versión nueva" (solo Android). Consulta al abrir la app y al volver a primer plano, como mucho cada 30 minutos.
// Si falla la consulta, no muestra nada: la app sigue como siempre.
export default function AvisoActualizacion() {
  const [decision, setDecision] = useState(null);
  const [oculto, setOculto] = useState(false);
  const [progreso, setProgreso] = useState(null); // null = sin descargar; 0..1 = bajando
  const [error, setError] = useState('');
  const ultima = useRef(0);
  const vivo = useRef(true);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);

  const consultar = useCallback(async () => {
    if (Platform.OS !== 'android' || !tocaConsultar(ultima.current)) return;
    ultima.current = Date.now();
    try {
      const u = await leerUltimaVersionApp();
      const d = decidir({ instalada: versionInstalada(Constants.expoConfig), ultima: u, plataforma: Platform.OS });
      if (vivo.current) setDecision(d);
    } catch { /* sin conexión o servidor caído: no se muestra nada */ }
  }, []);

  useEffect(() => {
    consultar();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') consultar(); });
    return () => sub.remove();
  }, [consultar]);

  const texto = textoAviso(decision);
  if (!texto || oculto) return null;

  const accion = async () => {
    setError('');
    if (decision.estado === 'reinstalar') { Linking.openURL(PAGINA_DESCARGA); return; }
    setProgreso(0);
    try { await descargarEInstalar(decision.url || `${URL_BASE.replace(/\/api$/, '')}/api/desktop/download-android`, (p) => { if (vivo.current) setProgreso(p); }); }
    catch (e) { if (vivo.current) setError(e.message); }
    finally { if (vivo.current) setProgreso(null); }
  };

  return (
    <View style={s.caja} accessibilityRole="alert">
      <Text style={s.titulo}>{texto.titulo}</Text>
      <Text style={s.detalle}>{texto.detalle}</Text>
      {!!error && <Text style={s.error}>{error}</Text>}
      <View style={s.botones}>
        <View style={{ flex: 1 }}><Boton titulo={progreso === null ? texto.boton : `Descargando… ${Math.round(progreso * 100)}%`} onPress={accion} deshabilitado={progreso !== null} /></View>
        {progreso === null && <Pressable onPress={() => setOculto(true)} style={s.luego} accessibilityRole="button" accessibilityLabel="Más tarde"><Text style={s.luegoTexto}>Más tarde</Text></Pressable>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  caja: { backgroundColor: C.tarjeta, borderColor: C.verde, borderWidth: 1, borderRadius: 14, margin: 12, marginBottom: 0, padding: 14 },
  titulo: { color: C.texto, fontSize: 15, fontWeight: '800' },
  detalle: { color: C.suave, fontSize: 13, lineHeight: 19, marginTop: 4, marginBottom: 10 },
  error: { color: C.rojo, fontSize: 13, marginBottom: 8 },
  botones: { flexDirection: 'row', alignItems: 'center' },
  luego: { paddingHorizontal: 14, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  luegoTexto: { color: C.suave, fontSize: 14, fontWeight: '600' },
});
