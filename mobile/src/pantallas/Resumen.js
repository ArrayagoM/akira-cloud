import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { C, Tarjeta, Titulo, Suave } from '../ui';
import { lineasResumen, hace } from '../estado';

// Contadores del negocio (solo números). Solo aparecen si el usuario activó "Ver tu negocio desde el celular" en la PC.
export default function Resumen({ estado, cargando, recargar }) {
  const pcs = estado?.pcs || [];
  const conResumen = pcs.filter((p) => lineasResumen(p.resumen).length > 0);
  return (
    <ScrollView contentContainerStyle={s.contenido} refreshControl={<RefreshControl refreshing={cargando} onRefresh={recargar} tintColor={C.verde} />}>
      <Titulo>Resumen del negocio</Titulo>
      <Suave estilo={{ marginBottom: 18 }}>Solo números: nunca ves ni se envían nombres, chats ni documentos de tus clientes.</Suave>

      {conResumen.length === 0 && (
        <Tarjeta>
          <Text style={s.vacioTitulo}>Todavía no hay datos para mostrar</Text>
          <Suave estilo={{ marginTop: 6 }}>Activá “Ver tu negocio desde el celular” en Akira (PC) → Inicio. Es opcional y lo podés apagar cuando quieras.</Suave>
        </Tarjeta>
      )}

      {conResumen.map((pc) => (
        <View key={pc.deviceId} style={{ marginBottom: 18 }}>
          {pcs.length > 1 && <Text style={s.pc}>{pc.nombre}</Text>}
          <View style={s.grilla}>
            {lineasResumen(pc.resumen).map((l) => (
              <View key={l.clave} style={s.celda}><Tarjeta><Text style={s.valor} numberOfLines={1} adjustsFontSizeToFit>{l.valor}</Text><Text style={s.etiqueta}>{l.etiqueta}</Text></Tarjeta></View>
            ))}
          </View>
          <Suave estilo={{ marginTop: 8 }}>Actualizado {hace(pc.resumenEn)}</Suave>
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  contenido: { padding: 20, paddingBottom: 40 },
  vacioTitulo: { color: C.texto, fontSize: 16, fontWeight: '700' },
  pc: { color: C.suave, fontSize: 13, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 },
  grilla: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  celda: { width: '50%', padding: 5 },
  valor: { color: C.verde, fontSize: 24, fontWeight: '800' },
  etiqueta: { color: C.suave, fontSize: 12, marginTop: 4 },
});
