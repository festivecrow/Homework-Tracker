import { supabase } from './supabase-client.js';

// Same key pair generated for this project — the public half is safe to
// ship in client code, it's what identifies your app to the browser's push
// service, not a secret.
export const VAPID_PUBLIC_KEY = 'BFj8fxdQ_Pi5KINFPBSjNJUR_4imqi53cHpRRM2mcEjwM9soXdntmjsxwT4ISPNQb-UG4VEDPaL6QtBcXGsITEk';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

export async function getNotificationPermissionState() {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission; // 'granted' | 'denied' | 'default'
}

export async function enablePushForThisDevice(userId) {
  if (!pushSupported()) throw new Error('Push notifications aren\'t supported on this browser.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = subscription.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  }, { onConflict: 'endpoint' });
  if (error) throw error;

  return true;
}

export async function disablePushForThisDevice(userId) {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint).eq('user_id', userId);
    await subscription.unsubscribe();
  }
}

export async function isPushEnabledForThisDevice() {
  if (!pushSupported()) return false;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return !!subscription;
}
