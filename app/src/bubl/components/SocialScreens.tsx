import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowUp, Hand, Heart, LogOut, MessageCircle, Navigation, Pin, Plus, Sparkles, Trash2, Pencil, MapPin, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Link } from 'react-router-dom'
import { Postmark, WaveIllustration } from './IllustratedIcons'
import { demoEvents, useDemoEvents } from '../lib/eventDemo'
import { CATEGORY_META } from '../lib/uiCategories'
import type { ChatSummary, DroppedItem, IncomingWave, Message, PoppedItem } from '../lib/uiModels'
import { Avatar, CategoryIcon, Empty, ScreenHeader } from './MobileUI'
import type { LibraryActions } from '../lib/libraryActions'
import { result, useMobile, useOperation, waveTarget } from './MobileApp'

export function WaveScreen() {
  const { api, wave, go, user, demo, openChat, library } = useMobile()
  const { busy, run } = useOperation()
  const [sent, setSent] = useState(false)
  const [note, setNote] = useState('')
  const [matched, setMatched] = useState<string>()
  if (!wave) return null
  const name = wave.user.name || 'this local'
  async function send() { await run(async () => { const data = await result(api.sendWave({ toUserId: wave!.user.id, bubbleId: wave!.bubbleId, note: note.trim() || undefined })); setSent(true); setMatched(data.chatId) }) }
  return <section className="wave-screen screen-fill"><ScreenHeader onBack={() => go('chats')} close />
    <div className="wave-art" aria-hidden="true"><WaveIllustration /></div><h1>{matched ? 'You both waved.' : sent ? 'Wave sent.' : `A little hello to ${name}.`}</h1>
    <p className="lead">{matched ? 'A shared spot. A new connection. Your chat is now open.' : sent ? `${name} will see it next time they open bubl. The chat unlocks when they wave back.` : `This bubble brought you together. Wave at ${name}. Nobody can message anybody until you both wave.`}</p>
    <div className="wave-pair"><div><Avatar name={user.name} /><strong>You</strong><span className={`status-pill ${sent ? 'waved' : ''}`}>{sent ? 'Waved' : 'Not yet'}</span></div><CategoryIcon category={wave.category} /><div><Avatar name={name} image={wave.user.imageUrl} /><strong>{name}</strong><span className="status-pill">{matched ? 'Waved' : 'Waiting'}</span></div></div>
    <div className="pinned-card"><CategoryIcon category={wave.category} /><div><strong>{wave.placeName}</strong><p>The bubble that connected you</p></div></div>
    {!sent && <label className="wave-note">Add a note <span>(optional)</span><Textarea value={note} maxLength={280} onChange={e => setNote(e.target.value)} placeholder="Hey, I loved your little corner of the city." /><small>{note.length}/280</small></label>}
    <div className="bottom-actions">{!sent ? <Button className="bubl-primary wave-button" loading={busy} onClick={send}><Hand />Wave at {name}</Button> : <Button className="bubl-primary" onClick={() => matched ? openChat({ chat: { id: matched, participantIds: [user.id, wave.user.id], bubbleId: wave.bubbleId, unlockedAt: new Date().toISOString() }, otherUser: wave.user, unread: false }) : go('chats')}>{matched ? 'Open chat' : 'Go to chats'}</Button>}
      {!sent && <button className="text-button" onClick={() => go('walk')}>Not now</button>}
      {demo && library?.simulateWaveBack && sent && !matched && <button className="text-button" onClick={() => run(async () => { library.simulateWaveBack?.(wave.user.id, wave.bubbleId); const data = await result(api.sendWave({ toUserId: wave.user.id, bubbleId: wave.bubbleId })); setMatched(data.chatId) })}>Demo: {name} waves back</button>}
      <p className="fine-print">No pressure. If they don't wave back, nothing else happens.</p></div>
  </section>
}

/* Waved-at-you cards are shared by the Chats preview and the full "Waved at you" list
   so both stay visually identical. */
function IncomingWaveCard({ wave, onWave }: { wave: IncomingWave; onWave: () => void }) {
  return <div className="incoming-wave"><Avatar name={wave.from.name} image={wave.from.imageUrl} /><div><p className="wave-person"><strong>{wave.from.name}</strong><span className="wave-action-text"> waved at you</span></p><Button className="wave-button" onClick={onWave}><Hand />Wave</Button><p className="eyebrow">{wave.placeName} · {wave.category}</p>{wave.note && <p className="wave-message">{wave.note}</p>}</div></div>
}

/* Only the fields the card renders, so both the library helper's shape and the server's
   OutgoingWave type fit without depending on either. */
type SentWave = { to: IncomingWave['from']; bubbleId: string; placeName: string; note?: string }

function OutgoingWaveCard({ wave }: { wave: SentWave }) {
  return <div className="incoming-wave outgoing-wave"><Avatar name={wave.to.name} image={wave.to.imageUrl} /><div><strong>{wave.to.name}</strong><p className="eyebrow">{wave.placeName}</p>{wave.note && <p className="wave-message">{wave.note}</p>}<small>Waiting for a wave back</small></div><Hand className="pending-wave-icon" aria-hidden="true" /></div>
}

/* The Chats screen only previews this many waves per section; the rest live behind "See all". */
const WAVE_PREVIEW_LIMIT = 2

function SeeAllWaves({ onClick }: { onClick: () => void }) {
  return <button className="see-all-waves" onClick={onClick}>See all<ChevronRight aria-hidden="true" /></button>
}

/* Full-list screens behind "See all" — one per direction, sharing the Chats card styling. */
export function WavesScreen() {
  const { api, waveAt, go } = useMobile()
  const [waves, setWaves] = useState<IncomingWave[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    function load() {
      result(api.incomingWaves()).then(w => { if (active) { setWaves(w); setError('') } }).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    }
    load(); const timer = setInterval(load, 15000)
    return () => { active = false; clearInterval(timer) }
  }, [api, retry])
  return <section className="social-screen chats-screen waves-screen screen-fill"><ScreenHeader title="Waved at you" onBack={() => go('chats')} />
    <div className="waves-list">
      {loading && <p className="loading-copy" role="status">Checking for a little hello…</p>}
      {error && <div className="inline-error" role="alert"><p>{error}</p><Button variant="outline" onClick={() => setRetry(retry + 1)}>Try again</Button></div>}
      {waves.length > 0 && <p className="eyebrow section-label">{waves.length} {waves.length === 1 ? 'person' : 'people'} waved at you</p>}
      {waves.map(wave => <IncomingWaveCard key={`${wave.from.id}:${wave.bubbleId}`} wave={wave} onWave={() => waveAt(waveTarget(wave))} />)}
      {!loading && !error && !waves.length && <Empty icon={<Hand />} title="No waves waiting.">When a local waves at you, they'll show up here.</Empty>}
    </div>
  </section>
}

/* Prefers the `api.outgoingWaves` server action when the api provides it, else the library helper. */
function loadSentWaves(api: unknown, library: ReturnType<typeof useMobile>['library']): Promise<SentWave[]> {
  const fromServer = (api as { outgoingWaves?: () => Parameters<typeof result<SentWave[]>>[0] }).outgoingWaves
  return fromServer ? result(fromServer.call(api)) : library?.outgoingWaves?.() ?? Promise.resolve([])
}

export function SentWavesScreen() {
  const { api, go, library } = useMobile()
  const [waves, setWaves] = useState<SentWave[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    function load() {
      loadSentWaves(api, library).then(w => { if (active) { setWaves(w); setError('') } }).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    }
    load(); const timer = setInterval(load, 15000)
    return () => { active = false; clearInterval(timer) }
  }, [api, library, retry])
  return <section className="social-screen chats-screen waves-screen screen-fill"><ScreenHeader title="You waved to" onBack={() => go('chats')} />
    <div className="waves-list">
      {loading && <p className="loading-copy" role="status">Checking for a little hello…</p>}
      {error && <div className="inline-error" role="alert"><p>{error}</p><Button variant="outline" onClick={() => setRetry(retry + 1)}>Try again</Button></div>}
      {waves.length > 0 && <p className="eyebrow section-label">{waves.length} {waves.length === 1 ? 'wave' : 'waves'} waiting for a wave back</p>}
      {waves.map(wave => <OutgoingWaveCard key={`${wave.to.id}:${wave.bubbleId}`} wave={wave} />)}
      {!loading && !error && !waves.length && <Empty icon={<Hand />} title="No waves sent yet.">Pop a bubble you love and wave at the local who left it.</Empty>}
    </div>
  </section>
}

export function ChatsScreen() {
  const { api, waveAt, openChat, go, library } = useMobile()
  const [outgoing, setOutgoing] = useState<Awaited<ReturnType<NonNullable<LibraryActions['outgoingWaves']>>>>([])
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [waves, setWaves] = useState<IncomingWave[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    function load() {
      Promise.all([result(api.myChats()), result(api.incomingWaves()), library?.outgoingWaves?.() ?? Promise.resolve([])]).then(([c, w, sent]) => { if (active) { setChats(c); setWaves(w); setOutgoing(sent); setError('') } }).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    }
    load(); const timer = setInterval(load, 15000)
    return () => { active = false; clearInterval(timer) }
  }, [api, library, retry])
  return <section className="social-screen chats-screen"><h1>Chats</h1>
    {loading && <p className="loading-copy" role="status">Checking for a little hello…</p>}
    {error && <div className="inline-error" role="alert"><p>{error}</p><Button variant="outline" onClick={() => setRetry(retry + 1)}>Try again</Button></div>}
    {outgoing.length > 0 && <><p className="eyebrow section-label">You Waved To · {outgoing.length}</p>{outgoing.slice(0, WAVE_PREVIEW_LIMIT).map(wave => <OutgoingWaveCard key={`${wave.to.id}:${wave.bubbleId}`} wave={wave} />)}{outgoing.length > WAVE_PREVIEW_LIMIT && <SeeAllWaves onClick={() => go('sent-waves')} />}</>}
    {waves.length > 0 && <><p className="eyebrow section-label">Waved At You · {waves.length}</p>{waves.slice(0, WAVE_PREVIEW_LIMIT).map(wave => <IncomingWaveCard key={`${wave.from.id}:${wave.bubbleId}`} wave={wave} onWave={() => waveAt(waveTarget(wave))} />)}{waves.length > WAVE_PREVIEW_LIMIT && <SeeAllWaves onClick={() => go('waves')} />}</>}
    {chats.length > 0 && <><p className="eyebrow section-label">Chats</p>{chats.map(chat => <button className={`chat-row ${chat.unread ? 'unread' : ''}`} key={chat.chat.id} onClick={() => openChat(chat)}><Avatar name={chat.otherUser.name} image={chat.otherUser.imageUrl} /><span><strong>{chat.otherUser.name}</strong><span>{chat.lastMessage?.text ?? 'You both waved. Say hello!'}</span></span>{chat.unread && <i className="unread-dot" aria-label="Unread messages" />}</button>)}</>}
    {!loading && !error && !chats.length && !waves.length && !outgoing.length && <><Empty icon={<MessageCircle />} title="Good things start with a wave.">Pop a bubble, love the spot, and wave at the local who left it.</Empty><Button className="bubl-outline find-next-bubble" onClick={() => go('walk')}>Find your next bubble</Button></>}
  </section>
}

export function ThreadScreen() {
  const { api, thread, user, go, library, open } = useMobile()
  const { busy, run } = useOperation()
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [sharedTitle, setSharedTitle] = useState('The spot that brought you together')
  useEffect(() => {
    let active = true
    if (thread && library) library.getSavedBubble(thread.chat.bubbleId).then(saved => { if (active) setSharedTitle(saved.bubble.title) }).catch(() => {})
    return () => { active = false }
  }, [thread, library])
  const bottom = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!thread) return
    let active = true
    function load() { result(api.getMessages({ chatId: thread!.chat.id })).then(data => { if (active) { setMessages(data); setError('') } }).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) }) }
    load(); const timer = setInterval(load, 5000)
    return () => { active = false; clearInterval(timer) }
  }, [api, thread, retry])
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }) }, [messages.length])
  if (!thread) return null
  const username = `@${(thread.otherUser.name || 'user').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`
  return <section className="thread-screen screen-fill"><ScreenHeader onBack={() => go('chats')} title={<span className="chat-header-person"><Avatar name={thread.otherUser.name} image={thread.otherUser.imageUrl} /><span><strong>{thread.otherUser.name || 'Your new connection'}</strong><small>{username}</small></span></span>}><button className="round-button" aria-label="Delete chat" disabled={!library} onClick={() => setConfirmDelete(true)}><Trash2 /></button></ScreenHeader>
    {confirmDelete && <div className="delete-confirm" role="alert"><strong>Delete this chat?</strong><p>This removes the conversation from this device.</p><div><Button variant="outline" onClick={() => setConfirmDelete(false)}>Keep chat</Button><Button variant="destructive" loading={busy} onClick={() => run(async () => { await library!.deleteChat(thread.chat.id); go('chats') })}>Delete chat</Button></div></div>}
    <button type="button" className="thread-pin" disabled={busy} onClick={() => { if (!library) { go('walk', thread.chat.bubbleId); return } void run(async () => open({ ...await library.getSavedBubble(thread.chat.bubbleId), fromChat: true })) }}><Pin size={22} /><span><strong>Your first shared bubble</strong><span className="thread-pin-caption">{sharedTitle}</span></span></button><p className="eyebrow mutual-label"><Hand size={14} />You both waved</p>
    <div className="message-list" aria-live="polite">{loading && <p className="loading-copy">Loading your conversation…</p>}{error && <div className="inline-error"><p>{error}</p><Button onClick={() => setRetry(retry + 1)}>Retry</Button></div>}{!loading && !error && !messages.length && <Empty icon={<Hand />} title="You're in each other's orbit.">Say hello. You already have a spot in common.</Empty>}{messages.map((message, index) => <div className={`message ${message.senderId === user.id ? 'mine' : ''}`} key={`${message.sentAt}:${index}`}><p>{message.text}</p><time dateTime={message.sentAt}>{new Date(message.sentAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time></div>)}<div ref={bottom} /></div>
    <form className="message-composer" onSubmit={event => { event.preventDefault(); if (!text.trim()) return; void run(async () => { const message = await result(api.sendMessage({ chatId: thread.chat.id, text: text.trim() })); setMessages(previous => [...previous, message]); setText('') }) }}><Input aria-label={`Message ${thread.otherUser.name}`} placeholder={`Message ${thread.otherUser.name || 'your connection'}`} value={text} maxLength={2000} onChange={e => setText(e.target.value)} /><Button type="submit" className="send-message" aria-label="Send message" disabled={!text.trim() || busy}><ArrowUp /></Button></form>
  </section>
}

function stampAge(date: string) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86400000))
  return days === 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 7 ? `${days} days` : `${Math.floor(days / 7)} wk`
}
const STAMP_COLORS = { Food: '#F5CDBF', Cafe: '#DDD3C4', Park: '#C8E5C7', Street: '#C1D8EA', Misc: '#D4C9EA', Events: '#F7D4E5' }

export function YouScreen() {
  const { api, go, onSignOut, user, library, open, profile, demo } = useMobile()
  const { busy, run } = useOperation()
  const [tab, setTab] = useState<'popped' | 'dropped'>('popped')
  const [popped, setPopped] = useState<PoppedItem[]>([])
  const [dropped, setDropped] = useState<DroppedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [deleting, setDeleting] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    Promise.all([result(api.myPopped()), result(api.myDropped())]).then(([p, d]) => { if (active) { setPopped(p); setDropped(d); setError('') } }).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [api, library, retry])
  const events = useDemoEvents()
  const eventItems = (demo ? events : []).filter(item => tab === 'popped' ? item.poppedAt && !item.hidden : item.authorId === user.id).map(item => ({ bubbleId: item.id, title: item.title, category: item.category, placeName: item.placeName, poppedAt: item.poppedAt ?? item.createdAt, loved: item.hearted }))
  const items = [...(tab === 'popped' ? popped : dropped), ...eventItems]
  const poppedCount = popped.length + (demo ? events.filter(item => item.poppedAt && !item.hidden).length : 0)
  const droppedCount = dropped.length + (demo ? events.filter(item => item.authorId === user.id).length : 0)
  return <section className="social-screen passport-screen"><div className="profile-summary"><Avatar name={user.name} image={user.imageUrl} /><div><strong>{user.name}</strong>{profile.username && <p>@{profile.username}</p>}</div><button className="round-button" aria-label="Edit profile" onClick={() => go('profile')}><Pencil /></button>{onSignOut && <button className="round-button" aria-label="Sign out" onClick={onSignOut}><LogOut /></button>}</div><div className="you-heading"><h1>Your bubbles</h1></div>
    <div className="segmented"><button aria-pressed={tab === 'popped'} onClick={() => setTab('popped')}>Popped · {poppedCount}</button><button aria-pressed={tab === 'dropped'} onClick={() => setTab('dropped')}>Dropped · {droppedCount}</button></div>
    {loading ? <p className="loading-copy">Gathering your little discoveries…</p> : error ? <div className="inline-error"><p>{error}</p><Button onClick={() => setRetry(retry + 1)}>Retry</Button></div> : <div className="bubble-grid">{items.map(item => <article className="collection-card" key={item.bubbleId} style={{ '--tint': STAMP_COLORS[item.category], '--category': CATEGORY_META[item.category].color } as CSSProperties}>
      <button className="collection-open" aria-label={`Open ${item.title}`} disabled={busy || !library} onClick={() => run(async () => { const saved = await (item.category === 'Events' ? demoEvents.saved(item.bubbleId, user.id) : library!.getSavedBubble(item.bubbleId)); open({ ...saved, fromLibrary: true }) })}><CategoryIcon category={item.category} /><h2>{item.title}</h2><span className="collection-tag"><i />{item.category} · {stampAge('poppedAt' in item ? item.poppedAt : item.createdAt)}</span><Postmark date={'poppedAt' in item ? item.poppedAt : item.createdAt} /></button>
      {deleting === item.bubbleId ? <div className="card-confirm"><p>{tab === 'popped' ? 'Remove from your list?' : 'Delete this bubble?'}</p><button disabled={busy} onClick={() => run(async () => { if (item.category === 'Events') { if (tab === 'popped') demoEvents.remove(item.bubbleId); else demoEvents.delete(item.bubbleId, user.id); setDeleting(null); return } if (tab === 'popped') { await library!.removePopped(item.bubbleId); setPopped(items => items.filter(i => i.bubbleId !== item.bubbleId)) } else { await library!.deleteDropped(item.bubbleId); setDropped(items => items.filter(i => i.bubbleId !== item.bubbleId)); setPopped(items => items.filter(i => i.bubbleId !== item.bubbleId)) } setDeleting(null) })}>{tab === 'popped' ? 'Remove' : 'Delete'}</button><button onClick={() => setDeleting(null)}>Cancel</button></div> : <button className="collection-delete" disabled={!library} aria-label={`${tab === 'popped' ? 'Remove' : 'Delete'} ${item.title}`} onClick={() => setDeleting(item.bubbleId)}><Trash2 size={15} />{tab === 'popped' ? 'Remove' : 'Delete'}</button>}
    </article>)}<button className="next-bubble" onClick={() => go(tab === 'popped' ? 'walk' : 'drop')}>{tab === 'popped' ? <Navigation /> : <Plus />}<strong>{tab === 'popped' ? 'Next bubble' : 'Drop a bubble'}</strong><span className="eyebrow">A little more city awaits</span></button></div>}
    {!loading && !error && !items.length && <Empty icon={tab === 'popped' ? <Sparkles /> : <Heart />} title={tab === 'popped' ? 'Your city, one bubble at a time.' : 'Leave a little something.'}>{tab === 'popped' ? 'The spots you discover will collect here.' : 'Your local knowledge could make someone’s day.'}</Empty>}
    <div className="passport-settings"><p className="eyebrow">Settings</p><Link to="/welcome"><MapPin className="settings-pin" /><span><strong>Location & Notifications</strong><small>Manage permissions</small></span><ChevronRight size={18} /></Link></div>
  </section>
}
