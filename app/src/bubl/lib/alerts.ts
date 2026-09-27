// One pipeline for everything bubl tells you about: vibration (plus the pop sound
// when you pop a bubble), and a real system notification (the phone's own notification banner) once
// notification permission was given. There are no in-app banners.
//
// Anyone can raise one: alert({ kind: 'pop', title: 'pop.', body: bubble.title })

import { playPop } from './sounds';
import { pushActive, setupPush } from './push';

export type AlertKind = 'pop' | 'nearby' | 'love' | 'wave' | 'match' | 'message';

export interface BublAlert {
  kind: AlertKind;
  title: string;
  body?: string;
  bubbleId?: string;
  chatId?: string;
  quiet?: boolean; // sound + vibration only: the screen already shows it (e.g. the pop animation)
}

// The chat on screen right now: its new messages make no sound and no notification.
let openChatId: string | null = null;
export function setOpenChat(chatId: string | null) {
  openChatId = chatId;
}

type Listener = (alert: BublAlert) => void;
const listeners = new Set<Listener>();

export function subscribeAlerts(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Registers public/sw.js (phones need it for notifications) and, if allowed, subscribes this phone to push. */
export function registerNotificationWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.register('/sw.js').then(() => setupPush()).catch(() => {});
}

// Where tapping the notification takes you.
function urlFor(a: BublAlert): string {
  if (a.chatId) return '/home?view=chats';
  if (a.bubbleId) return `/home?bubble=${encodeURIComponent(a.bubbleId)}`;
  return '/home';
}

async function systemNotification(a: BublAlert) {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return;
  // With push on, the server sends nearby / love / wave / match / message notifications itself.
  if (pushActive() && a.kind !== 'pop') return;
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
  // The pop sound is only for popping a bubble. Notifications (drift, love, wave, match,
  // message) make no sound in the app; the phone's notification handles them.
  const onScreen = typeof document !== 'undefined' && document.visibilityState === 'visible';
  if (a.kind === 'message' && onScreen && a.chatId && a.chatId === openChatId) return;
  if (a.kind === 'pop') playPop();
  if (typeof navigator !== 'undefined') navigator.vibrate?.(a.kind === 'pop' ? [30, 40, 80] : 120);
  listeners.forEach((l) => l(a));
  if (!a.quiet) void systemNotification(a);
}

/** Ask for system notifications. Call it from a tap (e.g. a settings toggle). */
export async function enableSystemNotifications(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  const granted = Notification.permission === 'granted' || (await Notification.requestPermission()) === 'granted';
  if (granted) registerNotificationWorker();
  return granted;
}
