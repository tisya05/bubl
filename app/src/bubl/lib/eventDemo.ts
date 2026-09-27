import { useSyncExternalStore } from 'react'
import { LERNER_HALL } from '../config'
import { distanceM } from './geo'
import { readDemoMedia, saveDemoMedia } from './demoMedia'
import type { Bubble, EventSchedule, User } from './uiModels'

export type EventItem = Bubble & { category: 'Events'; event: EventSchedule; author: User; hearted: boolean; going: boolean; poppedAt?: string; hidden?: boolean; feedHidden?: boolean }
export type EventDraft = { title: string; text: string; placeName: string; lat: number; lng: number; event: EventSchedule; photo?: File }
const key = 'bubl.events.v1'
const listeners = new Set<() => void>()
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
const iso = (offset: number) => new Date(Date.now() + offset * 3600000).toISOString()
function seed(): EventItem[] {
  return [
    { id: 'event-awesome-sunset', title: 'Awesome Sunset', text: 'Catch the golden light from Low Steps. Stay a little longer—the sky gets even better.', placeName: 'Low Steps · Columbia University', ...LERNER_HALL, startsAt: iso(-1), endsAt: iso(3), image: 'social' },
    { id: 'event-demo-social', title: 'A little neighborhood social', text: 'A demo event for trying bubl. Meet at the pin, say hello, and swap your favorite neighborhood spots.', placeName: 'Lerner Hall · Broadway', ...LERNER_HALL, startsAt: iso(-1), endsAt: iso(3), image: 'social' },
    { id: 'event-demo-music', title: 'An afternoon of live music', text: 'A sample event, not a real listing. A little music and a new corner of the city to discover.', placeName: 'Riverside Dr & 116th St', lat: 40.8095, lng: -73.9669, startsAt: iso(24), endsAt: iso(27), image: 'music' },
  ].map(item => ({ id: item.id, title: item.title, text: item.text, placeName: item.placeName, lat: item.lat, lng: item.lng, authorId: 'demo-host', author: { id: 'demo-host', name: 'bubl demo' }, category: 'Events', event: { startsAt: item.startsAt, endsAt: item.endsAt, timeZone }, createdAt: new Date().toISOString(), language: 'en', status: 'live', moderation: 'unchecked', popRadiusM: 60, hearted: false, going: false, mediaType: 'photo', mediaUrl: `/bubl/event-${item.image}.svg` }))
}
let state: EventItem[] = seed()
try { const saved = JSON.parse(localStorage.getItem(key) ?? 'null'); if (Array.isArray(saved)) state = saved } catch { /* Keep the demo usable when storage is unavailable. */ }
if (!state.some(item => item.title === 'Awesome Sunset')) {
  const sunset = seed().find(item => item.title === 'Awesome Sunset')
  if (sunset) state = [sunset, ...state]
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const snapshot = () => state
export function useDemoEvents() { return useSyncExternalStore(subscribe, snapshot) }
function commit(next: EventItem[]) { localStorage.setItem(key, JSON.stringify(next)); state = next; listeners.forEach(listener => listener()) }
function update(id: string, change: (item: EventItem) => EventItem) { commit(state.map(item => item.id === id ? change(item) : item)) }
const urls = new Map<string, string>()
export async function eventImage(event: EventItem) {
  if (!event.mediaUrl?.startsWith('event-media:')) return event.mediaUrl
  const id = event.mediaUrl.slice(12)
  if (!urls.has(id)) { const file = await readDemoMedia(id); if (file) urls.set(id, URL.createObjectURL(file)) }
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
export const demoEvents = {
  async edit(id: string, draft: EventDraft, userId: string) {
    const existing = state.find(item => item.id === id);
    if (!existing || existing.authorId !== userId) throw new Error('Only your own events can be edited.');
    if (!draft.title.trim() || !draft.placeName.trim()) throw new Error('Add an event name and location.');
    const start = Date.parse(draft.event.startsAt), end = Date.parse(draft.event.endsAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('The end must be after the start.');
    if (!Number.isFinite(draft.lat) || !Number.isFinite(draft.lng) || Math.abs(draft.lat) > 85 || Math.abs(draft.lng) > 180) throw new Error('Choose a valid location.');
    update(id, item => ({ ...item, title: draft.title.trim(), text: draft.text.trim(), placeName: draft.placeName.trim(), lat: draft.lat, lng: draft.lng, event: draft.event }));
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
    const item: EventItem = { id, authorId: author.id, author, title: draft.title.trim(), text: draft.text.trim(), placeName: draft.placeName.trim(), lat: draft.lat, lng: draft.lng, category: 'Events', event: draft.event, createdAt: new Date().toISOString(), language: 'en', status: 'live', moderation: 'unchecked', popRadiusM: 60, hearted: false, going: false, mediaType: 'photo', mediaUrl: draft.photo ? `event-media:${id}` : '/bubl/event-social.svg' }
    commit([item, ...state]); return item
  },
  heart(id: string) { update(id, item => ({ ...item, hearted: !item.hearted })) },
  going(id: string) { update(id, item => ({ ...item, going: !item.going })) },
  async pop(id: string, location: { lat: number; lng: number } | null) {
    const item = state.find(item => item.id === id)
    if (!item) throw new Error('This event is no longer available.')
    const reason = eventAvailability(item, location)
    if (reason) throw new Error(reason)
    update(id, item => ({ ...item, poppedAt: item.poppedAt ?? new Date().toISOString(), hidden: false }))
    return { bubble: { ...item, mediaUrl: await eventImage(item) }, author: item.author, loved: item.hearted }
  },
  async saved(id: string, userId: string) {
    const item = state.find(item => item.id === id)
    if (!item || (item.authorId !== userId && (!item.poppedAt || item.hidden))) throw new Error('Pop this event first.')
    return { bubble: { ...item, mediaUrl: await eventImage(item) }, author: item.author, loved: item.hearted }
  },
  hideFromFeed(id: string) { update(id, item => ({ ...item, feedHidden: true })) },
  remove(id: string) { update(id, item => ({ ...item, hidden: true })) },
  delete(id: string, userId: string) { if (state.find(item => item.id === id)?.authorId !== userId) throw new Error('Only your own events can be deleted.'); commit(state.filter(item => item.id !== id)) },
}
