/**
 * Owner-only demo reset, run between judges (npm run demo:reset).
 *
 * Wipes every pop, love, wave, chat and message, plus bubbles dropped during
 * the demo (anything whose id doesn't start with `seed-`), their previews and
 * their media. Seed bubbles and seed media stay.
 */

import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { deleteStoredMedia } from '../server/media-routes'

const BATCH = 500
const isSeed = (id: string) => id.startsWith('seed-')

type UploadRow = { storageKey: string; bubbleId?: string }

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
