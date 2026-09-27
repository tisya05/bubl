// What the phone has actually allowed, and asking for it. The welcome screen's
// switches and the start-up check (PermissionSheet) both use this, so they always
// show the real state instead of a saved guess.
// Requests must run inside a tap: iPhones only show the notification prompt then.

import { enableSystemNotifications } from './alerts';
import { disablePush } from './push';
import { setLocationSource } from '../hooks/useUserLocation';

export type PermissionState = 'granted' | 'prompt' | 'denied' | 'unsupported';

export async function locationPermission(): Promise<PermissionState> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return 'unsupported';
  try {
    const status = await navigator.permissions?.query({ name: 'geolocation' });
    if (status) return status.state;
  } catch {
    // No Permissions API here: we can't tell until we ask.
  }
  return 'prompt';
}

// Needs a service worker too: an iPhone only has notifications for bubl on the Home Screen.
export function notificationPermission(): PermissionState {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  return Notification.permission === 'default' ? 'prompt' : Notification.permission;
}

/** Asks for location (shows the phone's prompt if it hasn't been answered) and switches the app to GPS. */
export function requestLocation(): Promise<PermissionState> {
  if (!('geolocation' in navigator)) return Promise.resolve('unsupported');
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => {
        setLocationSource('gps');
        resolve('granted');
      },
      // Code 1 = the user said no. A timeout or no fix still means we're allowed to ask for GPS.
      (err) => {
        if (err.code === 1) resolve('denied');
        else {
          setLocationSource('gps');
          resolve('granted');
        }
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  });
}

/** Asks for notifications (and subscribes this phone to push once allowed). */
export async function requestNotifications(): Promise<PermissionState> {
  try {
    await enableSystemNotifications();
  } catch {
    // Not supported here.
  }
  return notificationPermission();
}

/** Notifications switched off in bubl: stop pushes to this phone (the phone's own permission stays as it is). */
export async function turnOffNotifications() {
  await disablePush();
}

/** Where to turn a blocked permission back on. */
export const SETTINGS_HINT = {
  location: 'Location is blocked. Turn it on in your iPhone Settings › Privacy & Security › Location Services.',
  notifications: 'Notifications are blocked. Turn them on in your iPhone Settings › Notifications › bubl.',
} as const;
