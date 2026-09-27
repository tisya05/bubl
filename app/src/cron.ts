/**
 * Cron task definitions — registered into the AppCronRoom DO at construction
 * time (worker.ts). The DO alarm fires `runTask(name, env)` on the schedule
 * declared here; the DO itself records executions, tracks history, and
 * pushes status to admin clients via the `/ws/cron/:roomId` WebSocket.
 *
 * Each task declares EITHER `intervalMinutes` (run every N minutes) OR
 * `schedule` + `timezone` (5-field cron expression). CronRoom validates
 * the config at construction time and throws on ambiguous declarations.
 *
 * Example:
 *
 *   import type { CronTask } from 'deepspace/worker'
 *   import { buildCronContext } from 'deepspace/worker'
 *
 *   export const tasks: CronTask[] = [
 *     { name: 'heartbeat', intervalMinutes: 1 },
 *     { name: 'daily-report', schedule: '0 9 * * *', timezone: 'America/New_York' },
 *   ]
 *
 *   export async function runTask(name: string, env: Env): Promise<void> {
 *     const ctx = buildCronContext(env, env.OWNER_USER_ID, `app:${env.DEEPSPACE_APP_ID}`)
 *     if (name === 'heartbeat') {
 *       // …
 *     }
 *   }
 */

import { buildCronContext, type CronTask } from 'deepspace/worker'
import type { Env } from '../worker'
import { scrapeEvents } from './server/event-scraper'

export const tasks: CronTask[] = [{ name: 'scrape-events', schedule: '0 6 * * *', timezone: 'America/New_York' }]

export async function runTask(name: string, env: Env): Promise<void> {
  if (name === 'scrape-events') {
    const context = buildCronContext(env, env.OWNER_USER_ID, `app:${env.DEEPSPACE_APP_ID}`)
    const events = await scrapeEvents(fetch, env.NYC_EVENTS_API_KEY)
    const existing = await context.records.query('events', { limit: 500 }) as Array<{ recordId?: string; data?: { externalId?: string; source?: string; authorId?: string } }>
    const byExternalId = new Map(existing.flatMap(row => {
      if (!row.data?.externalId || !row.recordId) return []
      if (row.data.source === 'bubl' || row.data.authorId) return []
      return [[row.data.externalId, row.recordId] as const]
    }))
    for (const event of events) {
      const row = { ...event, scrapedAt: new Date().toISOString() }
      const recordId = byExternalId.get(event.externalId)
      if (recordId) await context.records.update('events', recordId, row)
      else await context.records.create('events', row)
    }
  }
}
