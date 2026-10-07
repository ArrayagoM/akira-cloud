// src/ui.js — tema y piezas visuales mínimas (mismo estilo que la app de escritorio: oscuro con verde Akira).
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';

export const C = {
  fondo: '#0a0f1a', tarjeta: '#111827', borde: '#1f2937', texto: '#f9fafb', suave: '#9ca3af', apagado: '#6b7280',
  verde: '#00e87b', rojo: '#f87171', ambar: '#fbbf24', azul: '#7dd3fc',
};
export const TONO = { ok: C.verde, error: C.rojo, aviso: C.ambar, neutro: C.suave };

export function Tarjeta({ children, estilo, borde }) {
  return <View style={[s.tarjeta, borde && { borderColor: borde }, estilo]}>{children}</View>;
}

export function Boton({ titulo, onPress, tipo = 'primario', cargando, deshabilitado, estilo }) {
  const off = cargando || deshabilitado;
  const primario = tipo === 'primario';
  return (
    <Pressable onPress={onPress} disabled={off} accessibilityRole="button" accessibilityLabel={titulo}
      style={({ pressed }) => [s.boton, primario ? s.botonPrimario : s.botonSecundario, off && { opacity: 0.5 }, pressed && { opacity: 0.8 }, estilo]}>
      {cargando ? <ActivityIndicator color={primario ? '#000' : C.texto} /> : <Text style={[s.botonTexto, { color: primario ? '#000' : C.texto }]}>{titulo}</Text>}
    </Pressable>
  );
}

export function Insignia({ texto, color }) {
  return <View style={[s.insignia, { backgroundColor: color + '22', borderColor: color + '66' }]}><Text style={[s.insigniaTexto, { color }]}>{texto}</Text></View>;
}

export function Titulo({ children }) { return <Text style={s.titulo}>{children}</Text>; }
export function Suave({ children, estilo }) { return <Text style={[s.suave, estilo]}>{children}</Text>; }

const s = StyleSheet.create({
  tarjeta: { backgroundColor: C.tarjeta, borderColor: C.borde, borderWidth: 1, borderRadius: 16, padding: 16 },
  boton: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  botonPrimario: { backgroundColor: C.verde },
  botonSecundario: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.borde },
  botonTexto: { fontSize: 15, fontWeight: '700' },
  insignia: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  insigniaTexto: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  titulo: { color: C.texto, fontSize: 22, fontWeight: '700' },
  suave: { color: C.suave, fontSize: 13, lineHeight: 19 },
});
