import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Switch, Linking, Alert, StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import { C, Tarjeta, Boton, Titulo, Suave } from '../ui';
import { leerAlertas, guardarAlertas, probarNotificacion, quitarCelular } from '../api';
import { activarNotificaciones } from '../notificaciones';

// Ajustes mínimos: avisos al celular y cerrar sesión. Todo lo demás se configura en la PC.
export default function Ajustes({ usuario, alCerrarSesion }) {
  const [push, setPush] = useState(null);
  const [token, setToken] = useState(null);
  const [msg, setMsg] = useState('');
  const [trabajando, setTrabajando] = useState('');

  useEffect(() => { leerAlertas().then((r) => setPush(r.push !== false)).catch(() => setPush(true)); }, []);

  const activar = async () => {
    setTrabajando('activar'); setMsg('');
    const r = await activarNotificaciones();
    if (r.ok) { setToken(r.token); setMsg('✅ Este celular ya recibe los avisos de tu bot.'); } else setMsg(r.motivo);
    setTrabajando('');
  };
  const cambiarPush = async (v) => {
    setPush(v);
    try { await guardarAlertas({ push: v }); } catch (e) { setPush(!v); setMsg(e.message); }
  };
  const probar = async () => {
    setTrabajando('probar'); setMsg('');
    try { const r = await probarNotificacion(); setMsg(r.ok ? 'Te mandamos una notificación de prueba.' : 'Todavía no hay ningún celular activado para recibir avisos. Tocá “Activar notificaciones”.'); }
    catch (e) { setMsg(e.message); } finally { setTrabajando(''); }
  };
  const salir = () => Alert.alert('Cerrar sesión', 'Dejarás de recibir avisos en este celular. Tu bot en la PC sigue funcionando igual.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Cerrar sesión', style: 'destructive', onPress: async () => { if (token) await quitarCelular(token).catch(() => {}); alCerrarSesion(); } },
  ]);

  return (
    <ScrollView contentContainerStyle={s.contenido}>
      <Titulo>Ajustes</Titulo>
      <Suave estilo={{ marginBottom: 18 }}>{usuario?.email || ''}</Suave>

      <Tarjeta estilo={{ marginBottom: 14 }}>
        <Text style={s.h}>Avisos en este celular</Text>
        <Suave estilo={{ marginTop: 4, marginBottom: 14 }}>Si tu bot se cae o vuelve, te llega una notificación. No puede avisarte por WhatsApp si es WhatsApp lo que falló.</Suave>
        <View style={s.fila}>
          <Text style={s.t}>Recibir notificaciones</Text>
          <Switch value={push !== false} disabled={push === null} onValueChange={cambiarPush} trackColor={{ true: C.verde, false: C.borde }} accessibilityLabel="Recibir notificaciones" />
        </View>
        <View style={{ height: 12 }} />
        <Boton titulo="Activar notificaciones en este celular" onPress={activar} cargando={trabajando === 'activar'} deshabilitado={!!trabajando} />
        <View style={{ height: 10 }} />
        <Boton titulo="Enviarme una notificación de prueba" tipo="secundario" onPress={probar} cargando={trabajando === 'probar'} deshabilitado={!!trabajando} />
        {!!msg && <Text style={s.msg} accessibilityRole="alert">{msg}</Text>}
      </Tarjeta>

      <Tarjeta estilo={{ marginBottom: 14 }}>
        <Text style={s.h}>Qué hace y qué no hace esta app</Text>
        <Suave estilo={{ marginTop: 6 }}>Es un control remoto: ves si tu bot está atendiendo, mirás unos números del negocio y podés pausarlo o ponerlo en modo vacaciones. El bot, WhatsApp y los datos de tus clientes están en tu PC y no pasan por el celular.</Suave>
      </Tarjeta>

      <Boton titulo="Cerrar sesión" tipo="secundario" onPress={salir} />
      <View style={s.pie}>
        <Text style={s.link} onPress={() => Linking.openURL('https://akiracloud.lat/privacidad')}>Privacidad</Text>
        <Text style={s.link} onPress={() => Linking.openURL('https://akiracloud.lat/terminos')}>Términos</Text>
        <Text style={s.link} onPress={() => Linking.openURL('mailto:soporte@akiracloud.lat')}>Soporte</Text>
      </View>
      <Suave estilo={{ textAlign: 'center', marginTop: 10, fontSize: 12 }}>Akira Cloud · versión {Constants.expoConfig?.version || '1.0.0'}</Suave>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  contenido: { padding: 20, paddingBottom: 40 },
  h: { color: C.texto, fontSize: 16, fontWeight: '700' },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  t: { color: C.texto, fontSize: 15 },
  msg: { color: C.suave, fontSize: 13, marginTop: 12, lineHeight: 19 },
  pie: { flexDirection: 'row', justifyContent: 'center', gap: 22, marginTop: 22 },
  link: { color: C.verde, fontSize: 13 },
});
