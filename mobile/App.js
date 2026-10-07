import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Pressable, ActivityIndicator, AppState, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { C } from './src/ui';
import { restaurarSesion, cerrarSesion, leerEstado, alVencerSesion } from './src/api';
import Login from './src/pantallas/Login';
import Estado from './src/pantallas/Estado';
import Resumen from './src/pantallas/Resumen';
import Ajustes from './src/pantallas/Ajustes';

const PESTANAS = [
  { id: 'estado', etiqueta: 'Estado', icono: '🟢' },
  { id: 'resumen', etiqueta: 'Resumen', icono: '📊' },
  { id: 'ajustes', etiqueta: 'Ajustes', icono: '⚙️' },
];
const CADA_MS = 30 * 1000;

export default function App() {
  const [sesion, setSesion] = useState(undefined); // undefined = cargando, null = sin sesión
  const [tab, setTab] = useState('estado');
  const [estado, setEstado] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const vivo = useRef(true);

  useEffect(() => { vivo.current = true; restaurarSesion().then((s) => vivo.current && setSesion(s)); alVencerSesion(() => { setSesion(null); setEstado(null); }); return () => { vivo.current = false; }; }, []);

  const recargar = useCallback(async () => {
    setCargando(true);
    try { const e = await leerEstado(); if (vivo.current) { setEstado(e); setError(''); } }
    catch (e) { if (vivo.current && e.status !== 401) setError(e.message); }
    finally { if (vivo.current) setCargando(false); }
  }, []);

  // Actualiza solo mientras la app está abierta (cada 30 s) y al volver a primer plano.
  useEffect(() => {
    if (!sesion) return undefined;
    recargar();
    const t = setInterval(() => { if (AppState.currentState === 'active') recargar(); }, CADA_MS);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') recargar(); });
    return () => { clearInterval(t); sub.remove(); };
  }, [sesion, recargar]);

  if (sesion === undefined) return <View style={s.centro}><ActivityIndicator color={C.verde} /></View>;
  if (!sesion) return (<SafeAreaProvider><StatusBar style="light" /><Login alIngresar={() => restaurarSesion().then(setSesion)} /></SafeAreaProvider>);

  const salir = async () => { await cerrarSesion(); setSesion(null); setEstado(null); setTab('estado'); };
  return (
    <SafeAreaProvider>
    <SafeAreaView style={s.raiz}>
      <StatusBar style="light" />
      <View style={{ flex: 1 }}>
        {tab === 'estado' && <Estado estado={estado} cargando={cargando} error={error} recargar={recargar} usuario={sesion} />}
        {tab === 'resumen' && <Resumen estado={estado} cargando={cargando} recargar={recargar} />}
        {tab === 'ajustes' && <Ajustes usuario={sesion} alCerrarSesion={salir} />}
      </View>
      <View style={s.barra} accessibilityRole="tablist">
        {PESTANAS.map((p) => (
          <Pressable key={p.id} onPress={() => setTab(p.id)} style={s.pestana} accessibilityRole="tab" accessibilityState={{ selected: tab === p.id }} accessibilityLabel={p.etiqueta}>
            <Text style={{ fontSize: 20, opacity: tab === p.id ? 1 : 0.5 }}>{p.icono}</Text>
            <Text style={[s.etq, tab === p.id && { color: C.verde }]}>{p.etiqueta}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: C.fondo },
  centro: { flex: 1, backgroundColor: C.fondo, alignItems: 'center', justifyContent: 'center' },
  barra: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.borde, backgroundColor: C.tarjeta },
  pestana: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  etq: { color: C.apagado, fontSize: 11, marginTop: 2, fontWeight: '600' },
});
