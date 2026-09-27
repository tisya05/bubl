// Mount once inside the signed-in app (src/pages/(app)/_layout.tsx). It turns
// every alert into a banner, keeps the live notification feed and the
// "drifted into a bubble" check running, and unlocks sound on the first tap.
// Screens that want the list or unread count call useNotifications() themselves.

import { useEffect } from 'react';
import { useToast } from '@/components/ui';
import { subscribeAlerts, type AlertKind } from '../lib/alerts';
import { unlockSounds } from '../lib/sounds';
import { useBubbleNearby } from '../hooks/useBubbleNearby';
import { useNotifications } from '../hooks/useNotifications';

const TOAST_TYPE: Record<AlertKind, 'success' | 'info'> = {
  pop: 'success',
  nearby: 'info',
  love: 'success',
  wave: 'info',
  match: 'success',
  message: 'info',
};

export function NotificationCenter() {
  const { toast } = useToast();
  useNotifications();
  useBubbleNearby();

  useEffect(() => subscribeAlerts((a) => toast({ type: TOAST_TYPE[a.kind], title: a.title, description: a.body, duration: 5000 })), [toast]);

  useEffect(() => {
    const unlock = () => unlockSounds();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  return null;
}
