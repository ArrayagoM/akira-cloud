import { useState, useRef, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, Switch, ActivityIndicator, StyleSheet } from 'react-native';
import { C, TONO, Tarjeta, Boton, Insignia, Titulo, Suave } from '../ui';
import { describirBot, hace, accionesDisponibles, ETIQUETAS } from '../estado';
import { enviarComando, leerComando } from '../api';

// Pantalla principal: ¿mi bot está atendiendo? Y los dos ajustes mínimos: pausar/reanudar y modo vacaciones.
function PC({ pc, alCambiar }) {
  const info = describirBot(pc);
  const color = TONO[info.tono];
  const acc = accionesDisponibles(pc);
  const [trabajando, setTrabajando] = useState(null); // tipo de comando en curso
  const [nota, setNota] = useState('');
  const vivo = useRef(true);
  useEffect(() => () => { vivo.current = false; }, []);

  const ejecutar = async (tipo) => {
    setNota(''); setTrabajando(tipo);
    try {
      const { comando } = await enviarComando(pc.deviceId, tipo);
      setNota('Enviado. Esperando a tu PC (puede tardar hasta 1 minuto)…');
      for (let i = 0; i < 30 && vivo.current; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const c = await leerComando(comando.id, pc.deviceId).catch(() => null);
        if (c?.estado === 'hecho') { setNota('✅ Listo: ' + ETIQUETAS[tipo].toLowerCase() + '.'); alCambiar(); return; }
        if (c && ['fallo', 'vencido', 'cancelado'].includes(c.estado)) { setNota(c.estado === 'vencido' ? 'La PC no respondió a tiempo, así que no se hizo nada. Probá de nuevo.' : 'No se pudo completar. Probá de nuevo.'); return; }
      }
      if (vivo.current) setNota('Tu PC todavía no respondió. Si sigue sin hacerlo, la orden vence sola en unos minutos.');
    } catch (e) {
      setNota(e.codigo === 'CELULAR_DESACTIVADO' ? 'Primero activalo en Akira (PC) → Inicio → “Controlar desde la app del celular”.' : e.message);
    } finally { if (vivo.current) setTrabajando(null); }
  };

  return (
    <Tarjeta borde={color + '55'} estilo={{ marginBottom: 14 }}>
      <View style={s.fila}><Text style={s.pcNombre}>{pc.nombre}</Text><Text style={s.version}>{pc.version ? `v${pc.version}` : ''}</Text></View>
      <View style={{ marginTop: 10, marginBottom: 8 }}><Insignia texto={info.titulo.toUpperCase()} color={color} /></View>
      <Text style={s.detalle}>{info.detalle}</Text>
      <Suave estilo={{ marginTop: 8 }}>Última señal de la PC: {hace(pc.ultimoHeartbeat)}</Suave>

      {!pc.controlRemoto && pc.online && (
        <Suave estilo={{ marginTop: 14, color: C.ambar }}>Para pausar o reanudar desde acá, activá “Controlar desde la app del celular” en Akira (PC) → Inicio.</Suave>
      )}
      {pc.controlRemoto && (
        <View style={{ marginTop: 16 }}>
          {acc.puedePausar && <Boton titulo="Pausar el bot" tipo="secundario" onPress={() => ejecutar('bot-pausar')} cargando={trabajando === 'bot-pausar'} deshabilitado={!!trabajando} />}
          {acc.puedeReanudar && <Boton titulo="Reanudar el bot" onPress={() => ejecutar('bot-reanudar')} cargando={trabajando === 'bot-reanudar'} deshabilitado={!!trabajando} />}
          {pc.online && (
            <View style={[s.fila, s.vac]}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={s.vacTitulo}>Modo vacaciones</Text>
                <Suave>El bot avisa que no toma reservas por ahora.</Suave>
              </View>
              <Switch value={!!pc.vacaciones} disabled={!!trabajando} onValueChange={(v) => ejecutar(v ? 'vacaciones-on' : 'vacaciones-off')} trackColor={{ true: C.verde, false: C.borde }} accessibilityLabel="Modo vacaciones" />
            </View>
          )}
        </View>
      )}
      {!!nota && <Text style={s.nota} accessibilityRole="alert">{nota}</Text>}
    </Tarjeta>
  );
}

export default function Estado({ estado, cargando, error, recargar, usuario }) {
  const pcs = estado?.pcs || [];
  return (
    <ScrollView contentContainerStyle={s.contenido} refreshControl={<RefreshControl refreshing={cargando} onRefresh={recargar} tintColor={C.verde} />}>
      <Titulo>Hola{usuario?.nombre ? `, ${usuario.nombre.split(' ')[0]}` : ''} 👋</Titulo>
      <Suave estilo={{ marginBottom: 18 }}>Así está tu negocio ahora. Tirá hacia abajo para actualizar.</Suave>
      {!!error && <Tarjeta borde={C.rojo + '66'} estilo={{ marginBottom: 14 }}><Text style={{ color: C.rojo }} accessibilityRole="alert">{error}</Text></Tarjeta>}
      {!estado && cargando && !error && <ActivityIndicator color={C.verde} style={{ marginTop: 40 }} />}
      {!error && !cargando && estado && pcs.length === 0 && (
        <Tarjeta><Text style={s.pcNombre}>Todavía no hay ninguna PC</Text><Suave estilo={{ marginTop: 6 }}>Instalá Akira en tu computadora con Windows (akiracloud.lat/descargar) e iniciá sesión con esta misma cuenta. Después vas a verla acá.</Suave></Tarjeta>
      )}
      {pcs.map((pc) => <PC key={pc.deviceId} pc={pc} alCambiar={recargar} />)}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  contenido: { padding: 20, paddingBottom: 40 },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pcNombre: { color: C.texto, fontSize: 17, fontWeight: '700' },
  version: { color: C.apagado, fontSize: 12 },
  detalle: { color: C.texto, fontSize: 15, lineHeight: 22 },
  vac: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.borde },
  vacTitulo: { color: C.texto, fontSize: 15, fontWeight: '600', marginBottom: 2 },
  nota: { color: C.suave, fontSize: 13, marginTop: 12, lineHeight: 19 },
});
