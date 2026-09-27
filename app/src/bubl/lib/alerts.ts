// One pipeline for everything bubl tells you about: sound + vibration + an
// in-app banner (NotificationCenter turns alerts into toasts), plus a system
// notification when the app is in the background and permission was given.
//
// Anyone can raise one: alert({ kind: 'pop', title: 'pop.', body: bubble.title })

import { playChime, playPop } from './sounds';

export type AlertKind = 'pop' | 'nearby' | 'love' | 'wave' | 'match' | 'message';

export interface BublAlert {
  kind: AlertKind;
  title: string;
  body?: string;
  bubbleId?: string;
  chatId?: string;
}

type Listener = (alert: BublAlert) => void;
const listeners = new Set<Listener>();

export function subscribeAlerts(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function systemNotification(a: BublAlert) {
  if (typeof document === 'undefined' || document.visibilityState === 'visible') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const options = { body: a.body, tag: a.bubbleId ?? a.chatId ?? a.kind, icon: '/bubl/icons/icon-192.png' };
  try {
    // Android only shows notifications through a service worker; iOS and desktop accept either.
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) await registration.showNotification(a.title, options);
    else new Notification(a.title, options);
  } catch {
    // Not supported here: the in-app banner is enough.
  }
}

export function alert(a: BublAlert) {
  if (a.kind === 'pop') playPop();
  else playChime();
  if (typeof navigator !== 'undefined') navigator.vibrate?.(a.kind === 'pop' ? [30, 40, 80] : 120);
  listeners.forEach((l) => l(a));
  void systemNotification(a);
}

/** Ask for system notifications. Call it from a tap (e.g. a settings toggle). */
export async function enableSystemNotifications(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  return (await Notification.requestPermission()) === 'granted';
}
