/**
 * canPop: the only way sealed bubble content reaches a client.
 *
 * Loads the sealed bubble, checks the caller's distance on the server, records
 * the caller's pop (once per user and bubble), and only then returns the
 * content plus the author. Actions run with RBAC off, so every check is here.
 */

import { RECORD_NOT_FOUND, type ActionHandler, type ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { checkPop } from '../bubl/lib/pop'
import type { Bubble, CanPopResult, Pop, User } from '../bubl/types'

type BubbleRow = Omit<Bubble, 'id' | 'createdAt'>
type UserRow = { name?: string; imageUrl?: string }
type PopRow = Pick<Pop, 'userId' | 'bubbleId'>

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const nonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

// Seed authors may not have an account yet, so fall back to a neutral name.
async function loadAuthor(tools: ActionTools, authorId: string): Promise<User> {
  const res = await tools.get<UserRow>('users', authorId)
  if (!res.success) return { id: authorId, name: 'A local' }
  const { name, imageUrl } = res.data.record.data
  return { id: authorId, name: name || 'A local', imageUrl }
}

// Idempotent: popping the same bubble again keeps the first pop (and its loved flag).
async function recordPop(tools: ActionTools, userId: string, bubbleId: string) {
  const existing = await tools.query<PopRow>('pops', { where: { userId, bubbleId }, limit: 1 })
  if (!existing.success) return existing
  if (existing.data.records.length > 0) return { success: true as const, data: null }
  return tools.create('pops', { userId, bubbleId, poppedAt: new Date().toISOString() })
}

export const canPop: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const { userLat, userLng, bubbleId } = params
  if (!isFiniteNumber(userLat) || !isFiniteNumber(userLng) || !nonEmptyString(bubbleId)) {
    return { success: false, error: 'userLat, userLng and bubbleId are required' }
  }

  const got = await tools.get<BubbleRow>('bubbles', bubbleId)
  if (!got.success) {
    if (got.error === RECORD_NOT_FOUND) {
      return { success: true, data: { ok: false, reason: 'not_found' } satisfies CanPopResult }
    }
    return got
  }
  const { record } = got.data

  const check = checkPop(record.data, { lat: userLat, lng: userLng })
  if (!check.ok) return { success: true, data: check satisfies CanPopResult }

  const popped = await recordPop(tools, userId, bubbleId)
  if (!popped.success) return popped

  const bubble: Bubble = { ...record.data, id: record.recordId, createdAt: record.createdAt }
  const author = await loadAuthor(tools, bubble.authorId)
  return { success: true, data: { ok: true, bubble, author } satisfies CanPopResult }
}
