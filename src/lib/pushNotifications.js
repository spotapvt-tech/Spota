import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from './supabaseClient';

// Registers this device for Safe Trek overdue pushes. Native Android only;
// failures are swallowed so starting a trek never depends on push.
export async function registerPushToken(userId) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt') perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return;

    await PushNotifications.removeAllListeners();
    await PushNotifications.addListener('registration', async ({ value }) => {
      const { error } = await supabase
        .from('device_tokens')
        .upsert({ user_id: userId, token: value, platform: 'android' }, { onConflict: 'token' });
      if (error) console.error('Saving push token failed:', error);
    });
    await PushNotifications.register();
  } catch (err) {
    console.error('Push registration failed:', err);
  }
}
