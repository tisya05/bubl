import { EVENT_SOURCES, parseEventPage, parseInstagramCaption, type ScrapedEvent } from '../bubl/lib/eventScraper'

export async function scrapeEvents(fetcher: typeof fetch = fetch): Promise<ScrapedEvent[]> {
  const output: ScrapedEvent[] = []
  for (const [source, url] of Object.entries(EVENT_SOURCES) as Array<[Exclude<ScrapedEvent['source'], 'instagram'>, string]>) {
    try {
      const response = await fetcher(url, { headers: { accept: 'text/html,application/xhtml+xml' } })
      if (response.ok) output.push(...parseEventPage(await response.text(), url, source))
    } catch { /* one source being unavailable should not stop the daily refresh */ }
  }
  // Instagram captions are supplied by the approved Instagram integration. The
  // worker accepts newline-delimited `url\tcaption` records from that service.
  const captions = (globalThis as unknown as { INSTAGRAM_EVENT_CAPTIONS?: string }).INSTAGRAM_EVENT_CAPTIONS
  for (const row of captions?.split('\n') ?? []) {
    const [url, ...parts] = row.split('\t'); const event = url && parts.length ? parseInstagramCaption(parts.join('\t'), url) : null
    if (event) output.push(event)
  }
  return [...new Map(output.map(event => [`${event.title}|${event.startsAt.slice(0, 10)}|${event.placeName}`, event])).values()]
}
