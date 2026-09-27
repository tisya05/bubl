// Mount once inside the signed-in app (src/pages/(app)/_layout.tsx). It keeps
// the live notification feed running (new love / wave / match / message rows
// raise an alert) and unlocks sound on the first tap. Alerts become phone
// notifications (lib/alerts.ts); the mobile app runs the "drifted into a bubble" check itself.
// Screens that want the list or unread count call useNotifications() themselves.

import { useEffect } from 'react';
import { installSoundUnlock } from '../lib/sounds';
import { useNotifications } from '../hooks/useNotifications';

export function NotificationCenter() {
  useNotifications();

  useEffect(installSoundUnlock, []);

  return null;
}
