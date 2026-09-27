import { useSyncExternalStore } from 'react'
import { LERNER_HALL } from '../config'
import type { BackendEvent } from '../types/api'
import { distanceM } from './geo'
import { readDemoMedia, saveDemoMedia } from './demoMedia'
import { JUDGE_MEETUP_ID, judgeMeetupBackend } from './judgeMeetup'
import type { Bubble, EventSchedule, User } from './uiModels'

export type EventPrice = 'Free' | '$' | '$$' | '$$$'
export type EventItem = Bubble & {
  category: 'Events'
  event: EventSchedule
  author: User
  hearted: boolean
  going: boolean
  price: EventPrice
  sourceUrl?: string
  poppedAt?: string
  hidden?: boolean
  feedHidden?: boolean
  /** True for scraped / API feed events (not user-created or local seeds). */
  remote?: boolean
}
export type EventDraft = { title: string; text: string; placeName: string; lat: number; lng: number; event: EventSchedule; price?: EventPrice; photo?: File }

const key = 'bubl.events.v1'
const listeners = new Set<() => void>()
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
const iso = (offset: number) => new Date(Date.now() + offset * 3600000).toISOString()
const FEED_AUTHOR: User = { id: 'event-feed', name: 'bubl events' }
const isRemote = (item: EventItem) => item.remote === true || item.authorId === FEED_AUTHOR.id

function seed(): EventItem[] {
  const judge = judgeMeetupBackend()
  return [
    { id: JUDGE_MEETUP_ID, title: judge.title, text: judge.description ?? '', placeName: judge.placeName, lat: judge.lat!, lng: judge.lng!, startsAt: judge.startsAt, endsAt: judge.endsAt, image: 'social', price: 'Free' as EventPrice },
    { id: 'event-awesome-sunset', title: 'Awesome Sunset', text: 'Catch the golden light from Low Steps. Stay a little longer—the sky gets even better.', placeName: 'Low Steps · Columbia University', ...LERNER_HALL, startsAt: iso(-1), endsAt: iso(3), image: 'social', price: 'Free' as EventPrice },
    { id: 'event-demo-social', title: 'A little neighborhood social', text: 'A demo event for trying bubl. Meet at the pin, say hello, and swap your favorite neighborhood spots.', placeName: 'Lerner Hall · Broadway', ...LERNER_HALL, startsAt: iso(-1), endsAt: iso(3), image: 'social', price: '$' as EventPrice },
    { id: 'event-demo-music', title: 'An afternoon of live music', text: 'A sample event, not a real listing. A little music and a new corner of the city to discover.', placeName: 'Riverside Dr & 116th St', lat: 40.8095, lng: -73.9669, startsAt: iso(24), endsAt: iso(27), image: 'music', price: '$$' as EventPrice },
  ].map(item => ({
    id: item.id,
    title: item.title,
    text: item.text,
    placeName: item.placeName,
    lat: item.lat,
    lng: item.lng,
    authorId: item.id === JUDGE_MEETUP_ID ? 'event-feed' : 'demo-host',
    author: item.id === JUDGE_MEETUP_ID ? FEED_AUTHOR : { id: 'demo-host', name: 'bubl demo' },
    category: 'Events' as const,
    event: { startsAt: item.startsAt, endsAt: item.endsAt, timeZone },
    createdAt: new Date().toISOString(),
    language: 'en',
    status: 'live' as const,
    moderation: item.id === JUDGE_MEETUP_ID ? 'passed' as const : 'unchecked' as const,
    popRadiusM: 60,
    hearted: false,
    going: false,
    price: item.price,
    mediaType: 'photo' as const,
    mediaUrl: `/bubl/event-${item.image}.svg`,
    ...(item.id === JUDGE_MEETUP_ID ? { remote: true as const, sourceUrl: 'bubl://judge-meetup' } : {}),
  }))
}

let state: EventItem[] = seed()
try {
  const saved = JSON.parse(localStorage.getItem(key) ?? 'null')
  if (Array.isArray(saved)) {
    state = saved.map((item: EventItem) => isRemote(item) ? { ...item, remote: true } : item)
  }
} catch { /* Keep the demo usable when storage is unavailable. */ }
// Always keep Awesome Sunset + a fresh Judge meetup window (stale localStorage times would break the demo).
{
  const fresh = seed()
  for (const keep of ['Awesome Sunset', 'Judge meetup'] as const) {
    const next = fresh.find(item => item.title === keep)
    if (!next) continue
    const index = state.findIndex(item => item.id === next.id || item.title === keep)
    if (index < 0) state = [next, ...state]
    else if (keep === 'Judge meetup') {
      const prev = state[index]
      state = state.map((item, i) => i === index ? { ...next, ...viewerFields(prev) } : item)
    }
  }
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const snapshot = () => state
export function useDemoEvents() { return useSyncExternalStore(subscribe, snapshot) }

function commit(next: EventItem[]) {
  localStorage.setItem(key, JSON.stringify(next))
  state = next
  listeners.forEach(listener => listener())
}

function update(id: string, change: (item: EventItem) => EventItem) {
  if (!state.some(item => item.id === id)) return
  commit(state.map(item => item.id === id ? change(item) : item))
}

const urls = new Map<string, string>()
export async function eventImage(event: EventItem) {
  if (!event.mediaUrl?.startsWith('event-media:')) return event.mediaUrl
  const id = event.mediaUrl.slice(12)
  if (!urls.has(id)) {
    const file = await readDemoMedia(id)
    if (file) urls.set(id, URL.createObjectURL(file))
  }
  return urls.get(id)
}

export function eventAvailability(event: Pick<EventItem, 'lat' | 'lng' | 'popRadiusM' | 'event'>, location: { lat: number; lng: number } | null, now = Date.now()) {
  const start = Date.parse(event.event.startsAt), end = Date.parse(event.event.endsAt)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 'Event time unavailable'
  if (now < Date.parse(event.event.startsAt)) return 'Opens when the event starts'
  if (now >= Date.parse(event.event.endsAt)) return 'This event has ended'
  if (!location) return 'Waiting for your location'
  const meters = distanceM(location, event)
  if (meters > event.popRadiusM) return `Get closer · ${Math.round(meters)} m away`
  return null
}

/** Map a scraped / API event into the shared EventItem shape. */
export function toEventItem(item: BackendEvent): EventItem {
  const authorId = item.authorId ?? FEED_AUTHOR.id
  const authored = Boolean(item.authorId)
  return {
    id: item.id,
    title: item.title,
    text: item.description ?? '',
    sourceUrl: item.sourceUrl,
    placeName: item.placeName,
    lat: item.lat ?? LERNER_HALL.lat,
    lng: item.lng ?? LERNER_HALL.lng,
    authorId,
    author: authored ? { id: authorId, name: 'Local host' } : FEED_AUTHOR,
    category: 'Events',
    event: { startsAt: item.startsAt, endsAt: item.endsAt, timeZone: 'America/New_York' },
    createdAt: new Date().toISOString(),
    language: 'en',
    status: 'live',
    moderation: item.moderation ?? 'passed',
    popRadiusM: 60,
    hearted: false,
    going: false,
    price: item.price,
    mediaType: 'photo',
    mediaUrl: item.imageUrl ?? '/bubl/event-social.svg',
    remote: true,
  }
}

function viewerFields(item: EventItem) {
  return {
    hearted: item.hearted,
    going: item.going,
    poppedAt: item.poppedAt,
    hidden: item.hidden,
    feedHidden: item.feedHidden,
  }
}

export const demoEvents = {
  /** Upsert scraped feed events while keeping local seeds, user drops, and viewer state. */
  syncRemote(remote: EventItem[]) {
    // Never drop the Judge meetup pin — keep a fresh window if the API omitted it.
    let feed = remote
    if (!feed.some(item => item.id === JUDGE_MEETUP_ID || item.title === 'Judge meetup')) {
      feed = [toEventItem(judgeMeetupBackend()), ...feed]
    }
    const locals = state.filter(item => !isRemote(item))
    const previous = new Map(state.map(item => [item.id, item]))
    const incomingIds = new Set(feed.map(item => item.id))
    const merged = feed.map(item => {
      const prev = previous.get(item.id)
      const base = { ...item, remote: true as const }
      return prev ? { ...base, ...viewerFields(prev) } : base
    })
    // Keep popped remote events that left the feed so You-tab reopen still works.
    const retained = state.filter(item => isRemote(item) && item.poppedAt && !incomingIds.has(item.id))
    commit([...locals, ...merged, ...retained])
  },

  async edit(id: string, draft: EventDraft, userId: string) {
    const existing = state.find(item => item.id === id)
    if (!existing || existing.authorId !== userId || isRemote(existing)) throw new Error('Only your own events can be edited.')
    if (!draft.title.trim() || !draft.placeName.trim()) throw new Error('Add an event name and location.')
    const start = Date.parse(draft.event.startsAt), end = Date.parse(draft.event.endsAt)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('The end must be after the start.')
    if (!Number.isFinite(draft.lat) || !Number.isFinite(draft.lng) || Math.abs(draft.lat) > 85 || Math.abs(draft.lng) > 180) throw new Error('Choose a valid location.')
    update(id, item => ({ ...item, title: draft.title.trim(), text: draft.text.trim(), placeName: draft.placeName.trim(), lat: draft.lat, lng: draft.lng, event: draft.event }))
  },

  async create(draft: EventDraft, author: User) {
    if (!draft.title.trim() || !draft.placeName.trim()) throw new Error('Add an event name and location.')
    const start = Date.parse(draft.event.startsAt), end = Date.parse(draft.event.endsAt)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('The end must be after the start.')
    if (end <= Date.now()) throw new Error('Choose an event that has not ended.')
    if (!Number.isFinite(draft.lat) || !Number.isFinite(draft.lng) || Math.abs(draft.lat) > 85 || Math.abs(draft.lng) > 180) throw new Error('Choose a valid location on the map.')
    const id = `event-${Date.now()}-${Math.random().toString(36).slice(2)}`
    if (draft.photo) {
      if (!draft.photo.type.startsWith('image/') || draft.photo.size > 20 * 1024 * 1024) throw new Error('Choose an image under 20 MB.')
      await saveDemoMedia(id, draft.photo)
    }
    const item: EventItem = {
      id,
      authorId: author.id,
      author,
      title: draft.title.trim(),
      text: draft.text.trim(),
      placeName: draft.placeName.trim(),
      lat: draft.lat,
      lng: draft.lng,
      category: 'Events',
      event: draft.event,
      price: draft.price ?? 'Free',
      createdAt: new Date().toISOString(),
      language: 'en',
      status: 'live',
      moderation: 'unchecked',
      popRadiusM: 60,
      hearted: false,
      going: false,
      mediaType: 'photo',
      mediaUrl: draft.photo ? `event-media:${id}` : '/bubl/event-social.svg',
    }
    commit([item, ...state])
    return item
  },

  heart(id: string) { update(id, item => ({ ...item, hearted: !item.hearted })) },
  going(id: string) { update(id, item => ({ ...item, going: !item.going })) },

  async pop(id: string, location: { lat: number; lng: number } | null) {
    const item = state.find(item => item.id === id)
    if (!item) throw new Error('This event is no longer available.')
    const reason = eventAvailability(item, location)
    if (reason) throw new Error(reason)
    update(id, current => ({ ...current, poppedAt: current.poppedAt ?? new Date().toISOString(), hidden: false }))
    const latest = state.find(entry => entry.id === id) ?? item
    return { bubble: { ...latest, mediaUrl: await eventImage(latest) }, author: latest.author, loved: latest.hearted }
  },

  async saved(id: string, userId: string) {
    const item = state.find(item => item.id === id)
    if (!item || (item.authorId !== userId && (!item.poppedAt || item.hidden))) throw new Error('Pop this event first.')
    return { bubble: { ...item, mediaUrl: await eventImage(item) }, author: item.author, loved: item.hearted }
  },

  /** Hide from this device's feed only — does not delete scraped rows for everyone. */
  hideFromFeed(id: string) { update(id, item => ({ ...item, feedHidden: true })) },
  remove(id: string) { update(id, item => ({ ...item, hidden: true })) },
  removeRemote(id: string) { commit(state.filter(entry => entry.id !== id)) },
  delete(id: string, userId: string) {
    const item = state.find(entry => entry.id === id)
    if (!item || item.authorId !== userId || isRemote(item)) throw new Error('Only your own events can be deleted.')
    commit(state.filter(entry => entry.id !== id))
  },
}
