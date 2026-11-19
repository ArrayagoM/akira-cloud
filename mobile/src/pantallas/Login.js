import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, Linking, Pressable, Image } from 'react-native';
import { C, Boton, Suave } from '../ui';
import { iniciarSesion, iniciarConGoogle } from '../api';

export default function Login({ alIngresar }) {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [cargandoGoogle, setCargandoGoogle] = useState(false);

  const entrar = async () => {
    setError(''); setCargando(true);
    try { await iniciarSesion(email, pass); alIngresar(); }
    catch (e) { setError(e.status === 401 ? (/OAuth/i.test(e.message) ? 'Esta cuenta entra con Google. Tocá “Continuar con Google”.' : 'Email o contraseña incorrectos.') : e.message); }
    finally { setCargando(false); }
  };

  const entrarConGoogle = async () => {
    setError(''); setCargandoGoogle(true);
    try { const ok = await iniciarConGoogle(); if (ok) alIngresar(); }
    catch (e) { setError(e.message || 'No se pudo ingresar con Google. Probá de nuevo.'); }
    finally { setCargandoGoogle(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.pantalla}>
      <Image source={require('../../assets/icon.png')} style={s.logo} accessibilityLabel="Akira" />
      <Text style={s.marca}>Akira <Text style={{ color: C.verde }}>Cloud</Text></Text>
      <Suave estilo={{ textAlign: 'center', marginBottom: 28 }}>Mirá cómo está tu bot desde el celular.</Suave>

      <TextInput style={s.campo} placeholder="Email" placeholderTextColor={C.apagado} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" value={email} onChangeText={setEmail} accessibilityLabel="Email" />
      <TextInput style={s.campo} placeholder="Contraseña" placeholderTextColor={C.apagado} secureTextEntry textContentType="password" value={pass} onChangeText={setPass} onSubmitEditing={entrar} accessibilityLabel="Contraseña" />
      {!!error && <Text style={s.error} accessibilityRole="alert">{error}</Text>}
      <Boton titulo="Ingresar" onPress={entrar} cargando={cargando} deshabilitado={!email || !pass || cargandoGoogle} estilo={{ marginTop: 6 }} />

      <View style={s.separador}><View style={s.linea} /><Text style={s.o}>o</Text><View style={s.linea} /></View>
      <Boton titulo="Continuar con Google" tipo="secundario" onPress={entrarConGoogle} cargando={cargandoGoogle} deshabilitado={cargando} />

      <Pressable onPress={() => Linking.openURL('https://akiracloud.lat/forgot-password')} style={{ marginTop: 18 }}><Text style={s.link}>¿Olvidaste tu contraseña?</Text></Pressable>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: C.fondo, padding: 24, justifyContent: 'center' },
  logo: { alignSelf: 'center', width: 72, height: 72, borderRadius: 20, marginBottom: 14 },
  marca: { color: C.texto, fontSize: 28, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  campo: { backgroundColor: C.tarjeta, borderColor: C.borde, borderWidth: 1, borderRadius: 12, color: C.texto, paddingHorizontal: 14, height: 50, marginBottom: 12, fontSize: 16 },
  error: { color: C.rojo, fontSize: 13, marginBottom: 8 },
  separador: { flexDirection: 'row', alignItems: 'center', marginVertical: 16 },
  linea: { flex: 1, height: 1, backgroundColor: C.borde },
  o: { color: C.apagado, marginHorizontal: 12, fontSize: 13 },
  link: { color: C.verde, textAlign: 'center', fontSize: 14 },
});
