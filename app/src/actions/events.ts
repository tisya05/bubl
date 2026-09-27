import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { findPii } from '../bubl/lib/moderation'
import { JUDGE_MEETUP_EXTERNAL_ID, JUDGE_MEETUP_ID, judgeMeetupRow } from '../bubl/lib/judgeMeetup'
import type { DropEventInput, DropEventResult, EventPrice } from '../bubl/types'
import { scrapeEvents } from '../server/event-scraper'
import { mediaForDrop } from '../server/media-routes'
import { checkBubble } from './moderation'

const MAX_TEXT_CHARS = 1000
const MAX_TITLE_CHARS = 100
const PRICES: EventPrice[] = ['Free', '$', '$$', '$$$']

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const nonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

function parseDropInput(params: Record<string, unknown>): DropEventInput | string {
  const { title, text, placeName, lat, lng, startsAt, endsAt, price, uploadId } = params
  if (!nonEmptyString(title) || title.trim().length > MAX_TITLE_CHARS) return `title is required (max ${MAX_TITLE_CHARS} characters)`
  if (text !== undefined && typeof text !== 'string') return 'text must be a string'
  if (typeof text === 'string' && text.length > MAX_TEXT_CHARS) return `text must be at most ${MAX_TEXT_CHARS} characters`
  if (!nonEmptyString(placeName)) return 'placeName is required'
  if (!isFiniteNumber(lat) || Math.abs(lat) > 90 || !isFiniteNumber(lng) || Math.abs(lng) > 180) return 'lat and lng are required'
  if (!nonEmptyString(startsAt) || !Date.parse(startsAt)) return 'startsAt must be a valid date'
  if (!nonEmptyString(endsAt) || !Date.parse(endsAt)) return 'endsAt must be a valid date'
  if (Date.parse(endsAt) <= Date.parse(startsAt)) return 'endsAt must be after startsAt'
  if (Date.parse(endsAt) <= Date.now()) return 'Choose an event that has not ended'
  if (price !== undefined && !PRICES.includes(price as EventPrice)) return 'price must be Free, $, $$ or $$$'
  if (uploadId !== undefined && !nonEmptyString(uploadId)) return 'uploadId must be a string'
  return {
    title: title.trim(),
    text: typeof text === 'string' ? text.trim() : '',
    placeName: placeName.trim(),
    lat,
    lng,
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(endsAt).toISOString(),
    price: (price as EventPrice | undefined) ?? 'Free',
    uploadId: uploadId as string | undefined,
  }
}

const rejected = (reasons: string[]) => ({ success: true as const, data: { ok: false, reasons } satisfies DropEventResult })

export const dropEvent: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const input = parseDropInput(params)
  if (typeof input === 'string') return { success: false, error: input }

  const pii = findPii(`${input.title}\n${input.text}`)
  if (pii.length > 0) return rejected(pii)

  const media = input.uploadId ? await mediaForDrop(tools, userId, input.uploadId) : undefined
  if (media && !media.ok) return { success: false, error: media.error }
  if (media?.ok && media.mediaType !== 'photo') return { success: false, error: 'Events only accept a photo for now.' }

  const verdict = await checkBubble(env, { title: input.title, text: input.text ?? '' })
  if (verdict && !verdict.allowed) return rejected(verdict.reasons)

  const scrapedAt = new Date().toISOString()
  const externalId = `bubl:${userId}:${scrapedAt}`
  const price = input.price ?? 'Free'
  const row = {
    source: 'bubl' as const,
    sourceUrl: 'bubl://drop',
    externalId,
    authorId: userId,
    title: input.title,
    description: input.text || undefined,
    ...(media?.ok ? { imageUrl: media.mediaUrl } : {}),
    placeName: input.placeName,
    lat: input.lat,
    lng: input.lng,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    price,
    scrapedAt,
    moderation: verdict ? 'passed' as const : 'unchecked' as const,
  }

  const created = await tools.create('events', row)
  if (!created.success) return created
  const recordId = created.data.recordId as string

  if (media?.ok) {
    // Reuse media_uploads.bubbleId as the attachment pointer so /api/media can authorize event covers.
    await tools.update('media_uploads', input.uploadId!, { bubbleId: recordId })
  }

  return {
    success: true,
    data: {
      ok: true,
      event: {
        id: recordId,
        title: row.title,
        description: row.description,
        imageUrl: row.imageUrl,
        sourceUrl: row.sourceUrl,
        placeName: row.placeName,
        lat: row.lat,
        lng: row.lng,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        price,
        authorId: userId,
        source: 'bubl',
        moderation: row.moderation,
      },
    } satisfies DropEventResult,
  }
}

export const refreshEvents: ActionHandler<Env> = async ({ tools, env }) => {
  const scraped = await scrapeEvents(fetch, env.NYC_EVENTS_API_KEY)
  const existing = await tools.query<{ externalId: string; title?: string; source?: string; authorId?: string }>('events', { limit: 500 })
  if (!existing.success) return existing
  for (const record of existing.data.records) {
    const title = record.data.title?.toLowerCase?.() ?? ''
    if (/^more on nyc\.gov$|^more languages$|^services$|^your government$|^upcoming events$/.test(title)) {
      await tools.remove('events', record.recordId)
    }
  }
  // Only upsert scraped rows — never overwrite user-created bubl events.
  const scrapedRows = existing.data.records.filter(row => row.data.source !== 'bubl' && !row.data.authorId)
  const ids = new Map(scrapedRows.map(row => [row.data.externalId, row.recordId]))
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
  // Keep a live Judge meetup at Lerner so demos work even before a scrape/drop.
  const existing = await tools.query<{ externalId?: string }>('events', { limit: 500 })
  if (existing.success) {
    const row = judgeMeetupRow()
    const match = existing.data.records.find(record => record.data.externalId === JUDGE_MEETUP_EXTERNAL_ID || record.recordId === JUDGE_MEETUP_ID)
    if (match) {
      // Immutable: source, sourceUrl, externalId, authorId — only refresh the live window.
      await tools.update('events', match.recordId, {
        title: row.title,
        description: row.description,
        imageUrl: row.imageUrl,
        placeName: row.placeName,
        lat: row.lat,
        lng: row.lng,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        price: row.price,
        scrapedAt: row.scrapedAt,
        moderation: row.moderation,
      })
    } else {
      await tools.create('events', row, JUDGE_MEETUP_ID)
    }
  }
  const result = await tools.query('events', { limit: 500 })
  if (!result.success) return result
  return { success: true, data: result.data.records.map(record => ({ id: record.recordId, ...record.data })) }
}

export const deleteEvent: ActionHandler<Env> = async ({ tools, params, userId }) => {
  const id = typeof params?.id === 'string' ? params.id : ''
  if (!id) return { success: false, error: 'Event id is required.' }
  const got = await tools.get<{ authorId?: string; source?: string }>('events', id)
  if (!got.success) return got
  const row = got.data.record.data
  if (row.authorId !== userId) return { success: false, error: 'Only your own events can be deleted.' }
  return tools.remove('events', id)
}
