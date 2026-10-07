// src/almacen.js — guarda la sesión de forma segura (Keychain en iOS, Keystore en Android). En la versión web
// (solo para probar la interfaz) SecureStore no existe y se usa el almacenamiento del navegador.
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const CLAVE = 'akira_sesion';
const enWeb = Platform.OS === 'web';

export async function guardarSesion(sesion) {
  const texto = JSON.stringify(sesion);
  if (enWeb) { try { globalThis.localStorage?.setItem(CLAVE, texto); } catch { /* sin almacenamiento */ } return; }
  await SecureStore.setItemAsync(CLAVE, texto);
}

export async function leerSesion() {
  try {
    const texto = enWeb ? globalThis.localStorage?.getItem(CLAVE) : await SecureStore.getItemAsync(CLAVE);
    return texto ? JSON.parse(texto) : null;
  } catch { return null; }
}

export async function borrarSesion() {
  try { if (enWeb) globalThis.localStorage?.removeItem(CLAVE); else await SecureStore.deleteItemAsync(CLAVE); } catch { /* ya no está */ }
}
