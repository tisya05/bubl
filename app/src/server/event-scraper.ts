import { EVENT_SOURCES, parseEventPage, parseInstagramCaption, type ScrapedEvent } from '../bubl/lib/eventScraper'

export async function scrapeEvents(fetcher: typeof fetch = fetch, nycApiKey?: string): Promise<ScrapedEvent[]> {
  const output: ScrapedEvent[] = []
  if (nycApiKey) {
    output.push(...await scrapeNycApi(nycApiKey, fetcher))
  }
  const pages = await Promise.all(Object.entries(EVENT_SOURCES).map(async ([source, url]) => {
    try {
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 8000)
      const response = await fetcher(url, { headers: { accept: 'text/html,application/xhtml+xml' }, signal: controller.signal }); clearTimeout(timeout)
      return response.ok ? parseEventPage(await response.text(), url, source as Exclude<ScrapedEvent['source'], 'instagram'>) : []
    } catch { return [] }
  }))
  output.push(...pages.flat())
  // Instagram captions are supplied by the approved Instagram integration. The
  // worker accepts newline-delimited `url\tcaption` records from that service.
  const captions = (globalThis as unknown as { INSTAGRAM_EVENT_CAPTIONS?: string }).INSTAGRAM_EVENT_CAPTIONS
  for (const row of captions?.split('\n') ?? []) {
    const [url, ...parts] = row.split('\t'); const event = url && parts.length ? parseInstagramCaption(parts.join('\t'), url) : null
    if (event) output.push(event)
  }
  return [...new Map(output.map(event => [`${event.title}|${event.startsAt.slice(0, 10)}|${event.placeName}`, event])).values()]
}

export async function scrapeNycApi(apiKey: string, fetcher: typeof fetch = fetch): Promise<ScrapedEvent[]> {
  const start = new Date(); const end = new Date(Date.now() + 30 * 86400000)
  const url = `https://api.nyc.gov/calendar/search?acronym=nyc_gov&startDate=${start.toISOString().slice(0, 10)}&endDate=${end.toISOString().slice(0, 10)}&limit=100`
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 8000)
  const response = await fetcher(url, { headers: { accept: 'application/json', 'Ocp-Apim-Subscription-Key': apiKey }, signal: controller.signal }); clearTimeout(timeout)
  if (!response.ok) throw new Error(`NYC Event Calendar API returned ${response.status}`)
  const payload = await response.json() as { events?: Array<Record<string, unknown>>; data?: Array<Record<string, unknown>> }
  const rows = payload.events ?? payload.data ?? []
  return rows.flatMap((row, index) => {
    const title = String(row.name ?? row.title ?? '').trim(); const startsAt = String(row.startDateTime ?? row.startDate ?? row.start ?? '')
    if (!title || !Date.parse(startsAt)) return []
    const endsAt = String(row.endDateTime ?? row.endDate ?? '')
    return [{ source: 'nyc' as const, sourceUrl: url, externalId: String(row.id ?? `nyc-api:${index}:${title}`), title, description: String(row.description ?? row.details ?? ''), imageUrl: typeof row.imageUrl === 'string' ? row.imageUrl : undefined, placeName: String(row.location ?? row.venue ?? 'New York City'), startsAt: new Date(startsAt).toISOString(), endsAt: new Date(Date.parse(endsAt) || Date.parse(startsAt) + 2 * 3600000).toISOString(), price: /free|no cost/i.test(JSON.stringify(row)) ? 'Free' as const : '$' as const }]
  })
}
