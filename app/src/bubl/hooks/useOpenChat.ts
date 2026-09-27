// While a chat thread is on screen, its new messages don't notify you: no banner,
// no pop. (With bubl open, nothing is pushed to the phone anyway: see useAppOpen.)

import { useEffect } from 'react';
import { setOpenChat } from '../lib/alerts';

export function useOpenChat(chatId: string | null) {
  useEffect(() => {
    setOpenChat(chatId);
    return () => setOpenChat(null);
  }, [chatId]);
}
