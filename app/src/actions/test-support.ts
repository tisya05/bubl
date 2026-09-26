/**
 * Test-only helpers. Refuse to run unless ALLOW_DEBUG_ROUTES=true (local dev
 * and `deepspace test` only; deployments leave it off) and the caller is the
 * app owner.
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { Pop } from '../bubl/types'

type PopRow = Omit<Pop, 'id'>

const nonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

/** Records a Pop for `userId` on `bubbleId`, standing in for canPop in tests. */
export const testRecordPop: ActionHandler<Env> = async ({ userId: caller, params, tools, env }) => {
  if (env.ALLOW_DEBUG_ROUTES !== 'true' || caller !== env.OWNER_USER_ID) {
    return { success: false, error: 'Forbidden' }
  }
  const { userId, bubbleId } = params
  if (!nonEmptyString(userId) || !nonEmptyString(bubbleId)) {
    return { success: false, error: 'userId and bubbleId are required' }
  }

  const existing = await tools.query<PopRow>('pops', { where: { userId, bubbleId }, limit: 1 })
  if (existing.success && existing.data.records.length > 0) return { success: true, data: { created: false } }

  const pop: PopRow = { userId, bubbleId, poppedAt: new Date().toISOString(), loved: false }
  const created = await tools.create('pops', pop)
  if (!created.success) return created
  return { success: true, data: { created: true } }
}
