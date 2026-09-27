// One pipeline for everything bubl tells you about: the pop sound + vibration,
// plus a real system notification (the phone's own notification banner) once
// notification permission was given. There are no in-app banners.
//
// Anyone can raise one: alert({ kind: 'pop', title: 'pop.', body: bubble.title })

import { playPop } from './sounds';

export type AlertKind = 'pop' | 'nearby' | 'love' | 'wave' | 'match' | 'message';

export interface BublAlert {
  kind: AlertKind;
  title: string;
  body?: string;
  bubbleId?: string;
  chatId?: string;
  quiet?: boolean; // sound + vibration only: the screen already shows it (e.g. the pop animation)
}

type Listener = (alert: BublAlert) => void;
const listeners = new Set<Listener>();

export function subscribeAlerts(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Registers public/sw.js, which phones need before they show system notifications. */
export function registerNotificationWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// Where tapping the notification takes you.
function urlFor(a: BublAlert): string {
  if (a.chatId) return '/home?view=chats';
  if (a.bubbleId) return `/home?bubble=${encodeURIComponent(a.bubbleId)}`;
  return '/home';
}

async function systemNotification(a: BublAlert) {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return;
  const options: NotificationOptions = {
    body: a.body,
    tag: a.bubbleId ?? a.chatId ?? a.kind,
    icon: '/bubl/icons/icon-192.png',
    badge: '/bubl/icons/icon-192.png',
    data: { url: urlFor(a) },
    // While bubl is open we play our own pop, so the phone stays quiet; in the background the phone's sound plays.
    silent: document.visibilityState === 'visible',
  };
  try {
    // Phones only show notifications through a service worker; desktop browsers accept either.
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) await registration.showNotification(a.title, options);
    else new Notification(a.title, options);
  } catch {
    // Not supported here (e.g. iPhone Safari outside the Home Screen app).
  }
}

export function alert(a: BublAlert) {
  playPop();
  if (typeof navigator !== 'undefined') navigator.vibrate?.(a.kind === 'pop' ? [30, 40, 80] : 120);
  listeners.forEach((l) => l(a));
  if (!a.quiet) void systemNotification(a);
}

/** Ask for system notifications. Call it from a tap (e.g. a settings toggle). */
export async function enableSystemNotifications(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  registerNotificationWorker();
  if (Notification.permission === 'granted') return true;
  return (await Notification.requestPermission()) === 'granted';
}
