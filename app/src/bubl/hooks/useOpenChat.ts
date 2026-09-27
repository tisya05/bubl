// While a chat thread is on screen, its new messages don't notify you: no pop,
// and (with push on) the server skips pushing them to this phone. Refreshed every
// minute; the server forgets it 90 s after the last refresh, so a closed app
// never mutes a chat for long.

import { useEffect } from 'react';
import { setOpenChat } from '../lib/alerts';
import { reportOpenChat } from '../lib/push';

const REFRESH_MS = 60_000;

export function useOpenChat(chatId: string | null) {
  useEffect(() => {
    if (!chatId) return;
    const update = () => {
      const open = document.visibilityState === 'visible' ? chatId : null;
      setOpenChat(open);
      reportOpenChat(open);
    };
    update();
    const timer = setInterval(update, REFRESH_MS);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
      setOpenChat(null);
      reportOpenChat(null);
    };
  }, [chatId]);
}
