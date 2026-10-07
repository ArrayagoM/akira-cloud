import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, Linking, Pressable, Image } from 'react-native';
import { C, Boton, Suave } from '../ui';
import { iniciarSesion } from '../api';

export default function Login({ alIngresar }) {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const entrar = async () => {
    setError(''); setCargando(true);
    try { await iniciarSesion(email, pass); alIngresar(); }
    catch (e) { setError(e.status === 401 ? 'Email o contraseña incorrectos.' : e.message); }
    finally { setCargando(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.pantalla}>
      <Image source={require('../../assets/icon.png')} style={s.logo} accessibilityLabel="Akira" />
      <Text style={s.marca}>Akira <Text style={{ color: C.verde }}>Cloud</Text></Text>
      <Suave estilo={{ textAlign: 'center', marginBottom: 28 }}>Mirá cómo está tu bot desde el celular.</Suave>

      <TextInput style={s.campo} placeholder="Email" placeholderTextColor={C.apagado} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" value={email} onChangeText={setEmail} accessibilityLabel="Email" />
      <TextInput style={s.campo} placeholder="Contraseña" placeholderTextColor={C.apagado} secureTextEntry textContentType="password" value={pass} onChangeText={setPass} onSubmitEditing={entrar} accessibilityLabel="Contraseña" />
      {!!error && <Text style={s.error} accessibilityRole="alert">{error}</Text>}
      <Boton titulo="Ingresar" onPress={entrar} cargando={cargando} deshabilitado={!email || !pass} estilo={{ marginTop: 6 }} />

      <Pressable onPress={() => Linking.openURL('https://akiracloud.lat/forgot-password')} style={{ marginTop: 18 }}><Text style={s.link}>¿Olvidaste tu contraseña?</Text></Pressable>
      <Suave estilo={{ textAlign: 'center', marginTop: 26, fontSize: 12 }}>¿Entrás con Google? Creá una contraseña desde “Olvidé mi contraseña” con el mismo email.</Suave>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: C.fondo, padding: 24, justifyContent: 'center' },
  logo: { alignSelf: 'center', width: 72, height: 72, borderRadius: 20, marginBottom: 14 },
  marca: { color: C.texto, fontSize: 28, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  campo: { backgroundColor: C.tarjeta, borderColor: C.borde, borderWidth: 1, borderRadius: 12, color: C.texto, paddingHorizontal: 14, height: 50, marginBottom: 12, fontSize: 16 },
  error: { color: C.rojo, fontSize: 13, marginBottom: 8 },
  link: { color: C.verde, textAlign: 'center', fontSize: 14 },
});
