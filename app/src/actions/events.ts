import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { scrapeEvents } from '../server/event-scraper'

export const refreshEvents: ActionHandler<Env> = async ({ tools, env }) => {
  const scraped = await scrapeEvents(fetch, env.NYC_EVENTS_API_KEY)
  const existing = await tools.query<{ externalId: string; title?: string }>('events', { limit: 500 })
  if (!existing.success) return existing
  for (const record of existing.data.records) {
    const title = record.data.title?.toLowerCase?.() ?? ''
    if (/^more on nyc\.gov$|^more languages$|^services$|^your government$|^upcoming events$/.test(title)) {
      await tools.remove('events', record.recordId)
    }
  }
  const ids = new Map(existing.data.records.map(row => [row.data.externalId, row.recordId]))
  const scrapedAt = new Date().toISOString()
  for (const event of scraped) {
    const row = { ...event, scrapedAt }
    const recordId = ids.get(event.externalId)
    const result = recordId ? await tools.update('events', recordId, row) : await tools.create('events', row)
    if (!result.success) return result
  }
  return { success: true, data: { scraped: scraped.length, scrapedAt } }
}

export const getEvents: ActionHandler<Env> = async ({ tools }) => {
  const result = await tools.query('events', { limit: 500 })
  if (!result.success) return result
  return { success: true, data: result.data.records.map(record => ({ id: record.recordId, ...record.data })) }
}
