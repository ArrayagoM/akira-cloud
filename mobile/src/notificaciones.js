// src/notificaciones.js — pide permiso y registra este celular para recibir avisos (el bot se cayó / volvió).
// Las notificaciones push NO funcionan en Expo Go (Android): hace falta la versión armada con EAS.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { registrarCelular } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

// → { ok: true, token } | { ok: false, motivo }
export async function activarNotificaciones() {
  if (Platform.OS === 'web') return { ok: false, motivo: 'Las notificaciones solo funcionan en la app del celular.' };
  if (!Device.isDevice) return { ok: false, motivo: 'Las notificaciones necesitan un celular real (no un emulador).' };
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('alertas', { name: 'Alertas del bot', importance: Notifications.AndroidImportance.MAX, vibrationPattern: [0, 250, 250, 250], lightColor: '#00e87b' });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return { ok: false, motivo: 'No diste permiso para las notificaciones. Podés habilitarlo desde los ajustes del celular.' };
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return { ok: false, motivo: 'Esta versión de la app todavía no está vinculada a EAS (falta el projectId).' };
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await registrarCelular({ pushToken: token, plataforma: Platform.OS, nombre: Device.deviceName || Device.modelName || '' });
    return { ok: true, token };
  } catch (e) {
    return { ok: false, motivo: e?.message || 'No se pudieron activar las notificaciones.' };
  }
}
