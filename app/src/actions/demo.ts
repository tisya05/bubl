/**
 * Owner-only demo reset, run between judges (npm run demo:reset).
 *
 * Wipes every pop, love, wave, chat and message, plus bubbles dropped during
 * the demo (anything whose id doesn't start with `seed-`), their previews and
 * their media. Seed bubbles and seed media stay.
 *
 * `pruneSeedBubbles` (npm run seed:import) removes leftover seed-* test bubbles
 * that are not in the keep list from seed/bubbles.csv.
 */

import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { deleteStoredMedia } from '../server/media-routes'

const BATCH = 500
const isSeed = (id: string) => id.startsWith('seed-')
const SEED_ID = /^seed-[A-Za-z0-9_-]{1,60}$/

type UploadRow = { storageKey: string; bubbleId?: string }
type PopRow = { bubbleId: string }
type WaveRow = { bubbleId: string }

/** Removes every record in `collection` that `keep` doesn't protect. Returns how many were removed. */
async function removeAll<T extends Record<string, unknown>>(
  tools: ActionTools,
  collection: string,
  keep: (recordId: string, data: T) => boolean = () => false,
  onRemove?: (data: T) => Promise<void>,
): Promise<number> {
  let removed = 0
  for (;;) {
    const res = await tools.query<T>(collection, { limit: BATCH })
    if (!res.success) throw new Error(`${collection}: ${res.error}`)
    const doomed = res.data.records.filter((r) => !keep(r.recordId, r.data))
    for (const r of doomed) {
      if (onRemove) await onRemove(r.data)
      const gone = await tools.remove(collection, r.recordId)
      if (!gone.success) throw new Error(`${collection}: ${gone.error}`)
    }
    removed += doomed.length
    if (doomed.length === 0 || res.data.records.length < BATCH) return removed
  }
}

export const resetDemo: ActionHandler<Env> = async ({ userId, tools, env }) => {
  if (userId !== env.OWNER_USER_ID) return { success: false, error: 'Forbidden: owner only' }

  try {
    const counts = {
      messages: await removeAll(tools, 'messages'),
      chatReads: await removeAll(tools, 'chat_reads'),
      chats: await removeAll(tools, 'chats'),
      waves: await removeAll(tools, 'waves'),
      pops: await removeAll(tools, 'pops'),
      droppedBubbles: await removeAll(tools, 'bubbles', (id) => isSeed(id)),
      droppedPreviews: await removeAll(tools, 'bubble_previews', (id) => isSeed(id)),
      droppedMedia: await removeAll<UploadRow>(
        tools,
        'media_uploads',
        (_, u) => u.bubbleId !== undefined && isSeed(u.bubbleId),
        (u) => deleteStoredMedia(env, u.storageKey),
      ),
    }
    return { success: true, data: counts }
  } catch (err) {
    return { success: false, error: `Reset stopped partway: ${(err as Error).message}` }
  }
}

/**
 * Owner only: delete seed-* bubbles (and their previews, pops, waves, media)
 * whose ids are not in `keepIds`. Non-seed drops are left alone.
 * Params: `{ keepIds: string[] }` — the ids from the current seed/bubbles.csv.
 */
export const pruneSeedBubbles: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  if (userId !== env.OWNER_USER_ID) return { success: false, error: 'Forbidden: owner only' }

  const keepIds = params.keepIds
  if (!Array.isArray(keepIds) || keepIds.length === 0) {
    return { success: false, error: 'keepIds must be a non-empty array of seed ids' }
  }
  if (keepIds.length > 100) return { success: false, error: 'At most 100 keepIds' }
  const bad = keepIds.find((id) => typeof id !== 'string' || !SEED_ID.test(id))
  if (bad !== undefined) return { success: false, error: `keepIds must look like seed-<name> (got ${String(bad)})` }

  const keep = new Set(keepIds as string[])
  const keepSeed = (id: string) => !isSeed(id) || keep.has(id)
  const keepSeedRef = (bubbleId: string) => !isSeed(bubbleId) || keep.has(bubbleId)

  try {
    const counts = {
      waves: await removeAll<WaveRow>(tools, 'waves', (_, w) => keepSeedRef(w.bubbleId)),
      pops: await removeAll<PopRow>(tools, 'pops', (_, p) => keepSeedRef(p.bubbleId)),
      bubbles: await removeAll(tools, 'bubbles', (id) => keepSeed(id)),
      previews: await removeAll(tools, 'bubble_previews', (id) => keepSeed(id)),
      media: await removeAll<UploadRow>(
        tools,
        'media_uploads',
        (_, u) => u.bubbleId !== undefined && keepSeedRef(u.bubbleId),
        (u) => deleteStoredMedia(env, u.storageKey),
      ),
    }
    return { success: true, data: counts }
  } catch (err) {
    return { success: false, error: `Prune stopped partway: ${(err as Error).message}` }
  }
}

const DEMO_PROFILES = [
  { userId: 'sYL8FvOhT463FM0ZH9ajemFvfXqu7XGo', handle: 'maya' },
  { userId: 'OHHViJa9Fu4tyKzF8ZnRO7OqDgvTm3qx', handle: 'dev' },
  { userId: 'GN08sDkS4Kj0h9JXL6pB2x4OFQBLXQiW', handle: 'sam' },
] as const

/** Keep in sync with DEMO_ACCOUNTS.userId in demo-auth-routes.ts. */

/** Owner-only: gives Maya, Dev and Sam handles and finished onboarding, so demo sign-in lands on the map. */
export const setupDemoProfiles: ActionHandler<Env> = async ({ userId, tools, env }) => {
  if (userId !== env.OWNER_USER_ID) return { success: false, error: 'Forbidden: owner only' }
  for (const { userId: id, handle } of DEMO_PROFILES) {
    const claimed = await tools.create('handles', { userId: id }, handle)
    if (!claimed.success) return claimed
    const existing = await tools.get<{ avatarKey?: string; onboardedAt?: string }>('profiles', id)
    const prior = existing.success ? existing.data.record.data : undefined
    const saved = await tools.create(
      'profiles',
      {
        ...prior,
        handle,
        notificationsEnabled: true,
        locationEnabled: true,
        onboardedAt: prior?.onboardedAt ?? new Date().toISOString(),
      },
      id,
    )
    if (!saved.success) return saved
  }
  return { success: true, data: { profiles: DEMO_PROFILES.map((p) => `@${p.handle}`) } }
}
