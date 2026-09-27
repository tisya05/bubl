/**
 * Bubble server actions: saveBubble (server-only), importSeedBubbles (owner-only),
 * nearbyBubbles (any signed-in user).
 *
 * Actions run with RBAC off (see src/server/action-routes.ts), so every check
 * that matters happens here.
 */

import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { DEFAULT_POP_RADIUS_M, MAX_NEARBY_RADIUS_M } from '../bubl/config'
import { distanceM } from '../bubl/lib/geo'
import { isExpired } from '../bubl/lib/pop'
import { uploadIdFromMediaUrl } from '../server/media-routes'
import { CATEGORIES, type Bubble, type BubblePreview, type Category } from '../bubl/types'
import { markForViewer } from './viewer'

type BubbleRow = Omit<Bubble, 'id' | 'createdAt'>
type PreviewRow = Omit<BubblePreview, 'id'> & { expiresAt?: string }

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const nonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
/**
 * The one DeepSpace write for bubbles, used by the seed import and dropBubble.
 * Writes the sealed row, then (for live bubbles) the public preview under the
 * same recordId. Pass `id` to upsert a known bubble (re-running the seed import).
 */
export async function saveBubble(
  tools: ActionTools,
  bubble: BubbleRow & { id?: string },
): Promise<ActionResult<Bubble>> {
  const { id, ...row } = bubble
  const created = await tools.create('bubbles', row, id)
  if (!created.success) return created
  const recordId = created.data.recordId

  const uploadId = uploadIdFromMediaUrl(row.mediaUrl)
  if (uploadId) {
    const linked = await tools.update('media_uploads', uploadId, { bubbleId: recordId })
    if (!linked.success) return linked
  }

  if (row.status === 'live') {
    const preview: PreviewRow = {
      lat: row.lat,
      lng: row.lng,
      placeName: row.placeName,
      category: row.category,
      popRadiusM: row.popRadiusM,
      expiresAt: row.expiresAt,
    }
    const previewed = await tools.create('bubble_previews', preview, recordId)
    if (!previewed.success) return previewed
  }

  const saved = await tools.get<BubbleRow>('bubbles', recordId)
  if (!saved.success) return saved
  const { record } = saved.data
  return { success: true, data: { ...record.data, id: record.recordId, createdAt: record.createdAt } }
}

type SeedRow = Partial<BubbleRow> & { id?: string }

// Seed ids are namespaced so an import can never overwrite a user's drop.
const SEED_ID = /^seed-[A-Za-z0-9_-]{1,60}$/

function canImportSeeds(userId: string, env: Env): boolean {
  if (userId === env.OWNER_USER_ID) return true
  const allowed = (env.SEED_IMPORTERS ?? '').split(',').map((id) => id.trim())
  return allowed.includes(userId)
}

function toSeedBubble(row: SeedRow, index: number): (BubbleRow & { id?: string }) | string {
  const where = `row ${index + 1}`
  if (typeof row.id !== 'string' || !SEED_ID.test(row.id)) return `${where}: id must look like seed-<name>`
  if (!nonEmptyString(row.authorId)) return `${where}: authorId is required`
  if (!nonEmptyString(row.title)) return `${where}: title is required`
  if (row.text !== undefined && typeof row.text !== 'string') return `${where}: text must be a string`
  if (!nonEmptyString(row.text) && !nonEmptyString(row.mediaUrl)) return `${where}: text is required when there is no media`
  if (!nonEmptyString(row.placeName)) return `${where}: placeName is required`
  if (!CATEGORIES.includes(row.category as Category)) return `${where}: category must be one of ${CATEGORIES.join(', ')}`
  if (!isFiniteNumber(row.lat) || Math.abs(row.lat) > 90) return `${where}: lat is invalid`
  if (!isFiniteNumber(row.lng) || Math.abs(row.lng) > 180) return `${where}: lng is invalid`
  if (row.popRadiusM !== undefined && (!isFiniteNumber(row.popRadiusM) || row.popRadiusM <= 0)) {
    return `${where}: popRadiusM is invalid`
  }
  if (row.mediaType !== undefined && !['photo', 'video', 'audio'].includes(row.mediaType)) {
    return `${where}: mediaType must be photo, video or audio`
  }

  return {
    id: row.id,
    authorId: row.authorId,
    lat: row.lat,
    lng: row.lng,
    placeName: row.placeName.trim(),
    category: row.category as Category,
    title: row.title.trim(),
    text: (row.text ?? '').trim(),
    mediaUrl: row.mediaUrl,
    mediaType: row.mediaType,
    language: nonEmptyString(row.language) ? row.language : 'en',
    popRadiusM: row.popRadiusM ?? DEFAULT_POP_RADIUS_M,
    expiresAt: row.expiresAt,
    status: 'live',
    moderation: 'passed',
  }
}

/**
 * Owner or SEED_IMPORTERS only: import seed bubbles. Params: `{ bubbles: SeedRow[] }`.
 * Every row is validated before anything is written. Every row needs a stable
 * `id` like 'seed-lerner-steps'; re-running the import updates instead of duplicating.
 */
export const importSeedBubbles: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  if (!canImportSeeds(userId, env)) return { success: false, error: 'Forbidden: seed importers only' }

  const rows = params.bubbles
  if (!Array.isArray(rows) || rows.length === 0) return { success: false, error: 'bubbles must be a non-empty array' }
  if (rows.length > 100) return { success: false, error: 'At most 100 bubbles per import' }

  const parsed = rows.map((row, i) => toSeedBubble((row ?? {}) as SeedRow, i))
  const errors = parsed.filter((p): p is string => typeof p === 'string')
  if (errors.length > 0) return { success: false, error: errors.join('; ') }

  const ids: string[] = []
  for (const bubble of parsed as (BubbleRow & { id?: string })[]) {
    const saved = await saveBubble(tools, bubble)
    if (!saved.success) return { success: false, error: `Saved ${ids.length} before failing: ${saved.error}` }
    ids.push(saved.data.id)
  }
  return { success: true, data: { imported: ids.length, ids } }
}

/** Previews of live, unexpired bubbles within radiusM (capped at MAX_NEARBY_RADIUS_M). */
export const nearbyBubbles: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const { lat, lng, radiusM } = params
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng) || !isFiniteNumber(radiusM) || radiusM <= 0) {
    return { success: false, error: 'lat, lng and a positive radiusM are required' }
  }
  const radius = Math.min(radiusM, MAX_NEARBY_RADIUS_M)

  const result = await tools.query<PreviewRow>('bubble_previews', { limit: 500 })
  if (!result.success) return result

  const nearby: BubblePreview[] = result.data.records
    .filter((r) => !isExpired(r.data.expiresAt) && distanceM({ lat, lng }, r.data) <= radius)
    .map((r) => ({
      id: r.recordId,
      lat: r.data.lat,
      lng: r.data.lng,
      placeName: r.data.placeName,
      category: r.data.category,
      popRadiusM: r.data.popRadiusM,
    }))
  return { success: true, data: await markForViewer(tools, userId, nearby) }
}
