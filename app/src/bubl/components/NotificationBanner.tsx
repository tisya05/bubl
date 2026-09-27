// In-app notifications: while bubl is open, a banner slides down from the top
// (the phone's own notifications are only for when bubl is closed). Tapping it
// goes where it's about: the chat (message, match), Waves, You (a love on your
// bubble), or the bubble you drifted into.

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { subscribeAlerts, type BublAlert } from '../lib/alerts'
import { result, useMobile } from './MobileApp'

const SHOW_MS = 5000

export function NotificationBanner() {
  const { api, go, openChat } = useMobile()
  const [shown, setShown] = useState<(BublAlert & { key: number }) | null>(null)

  // Your own pops aren't news: the screen already shows them.
  useEffect(() => subscribeAlerts(a => { if (a.kind !== 'pop' && !a.quiet) setShown({ ...a, key: Date.now() }) }), [])
  useEffect(() => {
    if (!shown) return
    const timer = setTimeout(() => setShown(null), SHOW_MS)
    return () => clearTimeout(timer)
  }, [shown])
  if (!shown) return null

  async function openIt(a: BublAlert) {
    setShown(null)
    if (a.chatId) {
      const chats = await result(api.myChats()).catch(() => [])
      const chat = chats.find(c => c.chat.id === a.chatId)
      if (chat) openChat(chat)
      else go('chats')
      return
    }
    if (a.kind === 'wave') go('waves')
    else if (a.kind === 'love') go('you')
    else if (a.bubbleId) go('walk', a.bubbleId)
  }

  return <div className="bubl-banner" role="status" key={shown.key}>
    <button className="bubl-banner-body" onClick={() => void openIt(shown)}>
      <img src="/bubl/icons/icon-192.png" alt="" />
      <span><strong>{shown.title}</strong>{shown.body && <small>{shown.body}</small>}</span>
    </button>
    <button className="bubl-banner-close" aria-label="Dismiss notification" onClick={() => setShown(null)}><X size={18} /></button>
  </div>
}
