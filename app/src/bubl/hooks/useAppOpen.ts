// Tells the server when bubl is on screen on this phone, so it doesn't push there
// (the in-app banner shows instead). Refreshed every 30 s while open; the server
// forgets it 60 s after the last refresh, so a closed or crashed app gets pushes again.

import { useEffect } from 'react';
import { reportAppOpen } from '../lib/push';

const REFRESH_MS = 30_000;

export function useAppOpen() {
  useEffect(() => {
    const update = () => reportAppOpen(document.visibilityState === 'visible');
    const closing = () => reportAppOpen(false);
    update();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') reportAppOpen(true); }, REFRESH_MS);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('pagehide', closing);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('pagehide', closing);
      reportAppOpen(false);
    };
  }, []);
}
