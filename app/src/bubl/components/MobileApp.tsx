import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { UserRound, MessageSquare, Compass, X } from 'lucide-react'
import { EventsScreen } from './EventsScreen'
import { DropIcon, BalloonsIcon } from './AppIcons'
import { useAppViewport } from '../hooks/useAppViewport'
import { useBubbleNearby } from '../hooks/useBubbleNearby'
import { subscribeAlerts } from '../lib/alerts'
import { unlockSounds } from '../lib/sounds'
import type { ActionResult } from 'deepspace/worker'
import type { Api, Bubble, User, ChatSummary, IncomingWave } from '../lib/uiModels'
import { WalkScreen, NoteScreen } from './WalkScreens'
import { DropScreen } from './DropScreen'
import { ChatsScreen, ThreadScreen, WaveScreen, YouScreen } from './SocialScreens'
import { ProfileScreen } from './ProfileScreen'
import { loadProfile, saveProfile, type LocalProfile } from '../lib/localProfile'
import type { LibraryActions } from '../lib/libraryActions'
import '../mobile.css'

export interface OpenedBubble { bubble: Bubble; author: User; loved?: boolean; fromLibrary?: boolean; fromEvents?: boolean }
export interface WaveTarget { user: User; bubbleId: string; category: Bubble['category']; placeName: string }
type View = 'walk' | 'drop' | 'chats' | 'you' | 'note' | 'wave' | 'thread' | 'profile' | 'events'
interface MobileContextValue {
  api: Api; demo: boolean; user: User; opened: OpenedBubble | null; wave: WaveTarget | null; thread: ChatSummary | null;
  go: (view: View, bubbleId?: string) => void; open: (value: OpenedBubble) => void; waveAt: (value: WaveTarget) => void;
  openChat: (value: ChatSummary) => void; notify: (message: string) => void; onSignOut?: () => void;
  library?: LibraryActions; profile: LocalProfile; updateProfile: (profile: LocalProfile) => void;
}
const MobileContext = createContext<MobileContextValue | null>(null)
export function useMobile() { const value = useContext(MobileContext); if (!value) throw new Error('Mobile app provider missing'); return value }
export async function result<T>(request: Promise<ActionResult<T>>): Promise<T> {
  const response = await request
  if (!response.success) throw new Error(typeof response.error === 'string' ? response.error : 'Something went wrong. Please try again.')
  return response.data as T
}
export function useOperation() {
  const { notify } = useMobile()
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return
    lock.current = true; setBusy(true)
    try { await action() } catch (error) { notify(error instanceof Error ? error.message : 'Could not connect. Please try again.') }
    finally { lock.current = false; setBusy(false) }
  }
  return { busy, run }
}
export function MobileApp({ api, demo = false, user: originalUser, onSignOut, library }: { api: Api; demo?: boolean; user: User; onSignOut?: () => void; library?: LibraryActions }) {
  const [profile, setProfile] = useState(() => loadProfile(originalUser))
  const viewportRef = useAppViewport()
  const user = { ...originalUser, name: profile.name, imageUrl: profile.imageUrl }
  function updateProfile(next: LocalProfile) {
    saveProfile(originalUser.id, next)
    setProfile(next)
    library?.updateProfile({ ...originalUser, name: next.name, imageUrl: next.imageUrl })
  }
  const [params, setParams] = useSearchParams()
  const requested = params.get('view') ?? 'walk'
  const [opened, setOpened] = useState<OpenedBubble | null>(null)
  const [wave, setWave] = useState<WaveTarget | null>(null)
  const [thread, setThread] = useState<ChatSummary | null>(null)
  const [message, setMessage] = useState('')
  const view: View = requested === 'note' && opened ? 'note' : requested === 'wave' && wave ? 'wave' : requested === 'thread' && thread ? 'thread' : ['drop', 'chats', 'you', 'profile', 'events'].includes(requested) ? requested as View : 'walk'
  function go(next: View, bubbleId?: string) { setParams(bubbleId ? { view: next, bubble: bubbleId } : { view: next }); setMessage('') }
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 6500); return () => clearTimeout(timer) }, [message])
  // Alerts (drifted into a bubble, love, wave, match, message) show in this app's toast.
  useEffect(() => subscribeAlerts(alert => { if (!alert.quiet) setMessage(alert.body ? `${alert.title} · ${alert.body}` : alert.title) }), [])
  useEffect(() => { window.addEventListener('pointerdown', unlockSounds, { once: true }); return () => window.removeEventListener('pointerdown', unlockSounds) }, [])
  useBubbleNearby(api)
  const context: MobileContextValue = { api, demo, user, opened, wave, thread, onSignOut, go, notify: setMessage, library, profile, updateProfile,
    open(value) { setOpened(value); go('note') }, waveAt(value) { setWave(value); go('wave') }, openChat(value) { setThread(value); go('thread') } }
  const screens: Record<View, ReactNode> = { walk: <WalkScreen />, drop: <DropScreen />, chats: <ChatsScreen />, you: <YouScreen />, note: <NoteScreen />, wave: <WaveScreen />, thread: <ThreadScreen />, profile: <ProfileScreen />, events: <EventsScreen /> }
  const showNav = ['walk', 'chats', 'you', 'events'].includes(view)
  return <MobileContext.Provider value={context}><main ref={viewportRef} className={`bubl-app mobile-shell view-${view}`}>
    <div className="mobile-content" key={view}>{screens[view]}</div>
    {showNav && <nav className="bottom-nav" aria-label="Main navigation">{([
      ['walk', 'Walk', Compass], ['drop', 'Drop', DropIcon], ['events', 'Events', BalloonsIcon], ['chats', 'Chats', MessageSquare], ['you', 'You', UserRound],
    ] as const).map(([tab, label, Icon]) => <button key={tab} aria-current={view === tab ? 'page' : undefined} onClick={() => go(tab)}><Icon /><span>{label}</span><i /></button>)}</nav>}
    {message && <div className="bubl-toast" role="status"><span>{message}</span><button aria-label="Dismiss message" onClick={() => setMessage('')}><X size={18} /></button></div>}
  </main></MobileContext.Provider>
}

export function waveTarget(wave: IncomingWave): WaveTarget { return { user: wave.from, bubbleId: wave.bubbleId, category: wave.category, placeName: wave.placeName } }
