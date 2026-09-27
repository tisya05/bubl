import { LERNER_HALL } from '../config'
import type { BackendEvent } from '../types/api'

/** Fixed id so demo, mock, and live getEvents can upsert the same judge pin. */
export const JUDGE_MEETUP_ID = 'event-judge-meetup'
export const JUDGE_MEETUP_EXTERNAL_ID = 'bubl:judge-meetup'

/** Happening now at Lerner (60 m pop) for indoor judging. */
export function judgeMeetupBackend(now = Date.now()): BackendEvent {
  return {
    id: JUDGE_MEETUP_ID,
    title: 'Judge meetup',
    description: 'DivHacks judging meetup at Lerner. Walk to the pin, pop within 60 m, and say hi — seeded for the demo.',
    imageUrl: '/bubl/event-social.svg',
    sourceUrl: 'bubl://judge-meetup',
    placeName: 'Lerner Hall · Broadway',
    lat: LERNER_HALL.lat,
    lng: LERNER_HALL.lng,
    startsAt: new Date(now - 1 * 3600000).toISOString(),
    endsAt: new Date(now + 6 * 3600000).toISOString(),
    price: 'Free',
    authorId: 'event-feed',
    source: 'bubl',
    moderation: 'passed',
  }
}

export function judgeMeetupRow(now = Date.now()) {
  const event = judgeMeetupBackend(now)
  return {
    source: 'bubl' as const,
    sourceUrl: event.sourceUrl!,
    externalId: JUDGE_MEETUP_EXTERNAL_ID,
    authorId: undefined as string | undefined,
    title: event.title,
    description: event.description,
    imageUrl: event.imageUrl,
    placeName: event.placeName,
    lat: event.lat,
    lng: event.lng,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    price: event.price,
    scrapedAt: new Date(now).toISOString(),
    moderation: 'passed' as const,
  }
}
