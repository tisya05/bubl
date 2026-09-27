export type EventPrice = 'Free' | '$' | '$$' | '$$$'
export type ScrapedEvent = {
  source: 'nyc' | 'eventbrite' | 'nycforfree' | 'instagram'
  sourceUrl: string
  externalId: string
  title: string
  description?: string
  imageUrl?: string
  placeName: string
  startsAt: string
  endsAt: string
  price: EventPrice
}

export const EVENT_SOURCES = {
  nyc: 'https://www.nyc.gov/main/events/',
  eventbrite: 'https://www.eventbrite.com/d/ny--new-york/events/',
  nycforfree: 'https://www.nycforfree.co/events',
} as const

export function parsePrice(text: string): EventPrice {
  const value = text.toLowerCase()
  if (/free|no charge|pay what you wish|pay-what-you-wish/.test(value)) return 'Free'
  const dollars = (text.match(/\$/g) ?? []).length
  return dollars >= 3 ? '$$$' : dollars === 2 ? '$$' : dollars === 1 ? '$' : 'Free'
}

function clean(value: unknown) { return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '' }
function jsonLd(html: string): unknown[] {
  const values: unknown[] = []
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const parsed = JSON.parse(match[1]); values.push(...(Array.isArray(parsed) ? parsed : [parsed])) } catch { /* ignore malformed cards */ }
  }
  return values.flatMap(value => value && typeof value === 'object' && '@graph' in value && Array.isArray((value as { '@graph': unknown[] })['@graph']) ? (value as { '@graph': unknown[] })['@graph'] : [value])
}

export function parseEventPage(html: string, sourceUrl: string, source: ScrapedEvent['source']): ScrapedEvent[] {
  const now = new Date(); const records: ScrapedEvent[] = []
  for (const value of jsonLd(html)) {
    if (!value || typeof value !== 'object' || !('name' in value)) continue
    const item = value as Record<string, unknown>; const startsAt = clean(item.startDate); if (!startsAt || !Date.parse(startsAt)) continue
    const location = item.location && typeof item.location === 'object' ? item.location as Record<string, unknown> : {}
    const placeName = clean(location.name) || clean(location.address) || 'New York City'
    const offers = item.offers && typeof item.offers === 'object' ? JSON.stringify(item.offers) : ''
    records.push({ source, sourceUrl, externalId: clean(item.url) || `${source}:${clean(item.name)}:${startsAt}`, title: clean(item.name) || 'New York event', description: clean(item.description), imageUrl: clean(item.image), placeName, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(clean(item.endDate) && Date.parse(clean(item.endDate)) ? clean(item.endDate) : Date.parse(startsAt) + 2 * 3600000).toISOString(), price: parsePrice(`${offers} ${clean(item.description)}`) })
  }
  return dedupeEvents(records)
}

export function parseInstagramCaption(caption: string, postUrl: string): ScrapedEvent | null {
  const lines = caption.split(/\r?\n/).map(clean).filter(Boolean); if (!lines.length) return null
  const dateText = caption.match(/(?:📅|date[:\s]+)([^\n]+)/i)?.[1] ?? ''
  const startsAt = Date.parse(dateText) || Date.now() + 86400000
  const placeName = caption.match(/(?:📍|location[:\s]+)([^\n]+)/i)?.[1] ?? 'New York City'
  return { source: 'instagram', sourceUrl: postUrl, externalId: postUrl, title: lines[0].replace(/^#\w+\s*/, ''), description: lines.slice(1).join(' '), placeName, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(startsAt + 2 * 3600000).toISOString(), price: parsePrice(caption) }
}

export function dedupeEvents(events: ScrapedEvent[]) { return [...new Map(events.map(event => [`${event.title.toLowerCase()}|${event.startsAt.slice(0, 10)}|${event.placeName.toLowerCase()}`, event])).values()] }
