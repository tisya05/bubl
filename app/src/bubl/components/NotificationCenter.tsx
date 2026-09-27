// Mount once inside the signed-in app (src/pages/(app)/_layout.tsx). It keeps
// the live notification feed running (new love / wave / match / message rows
// raise an alert) and unlocks sound on the first tap. The mobile app shows
// alerts as banners and runs the "drifted into a bubble" check itself.
// Screens that want the list or unread count call useNotifications() themselves.

import { useEffect } from 'react';
import { unlockSounds } from '../lib/sounds';
import { useNotifications } from '../hooks/useNotifications';

export function NotificationCenter() {
  useNotifications();

  useEffect(() => {
    const unlock = () => unlockSounds();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  return null;
}
