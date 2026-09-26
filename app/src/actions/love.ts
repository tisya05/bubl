/**
 * Love actions: loveBubble and lovedBy.
 *
 * Visibility rule: the author sees everyone who loved their bubble; a lover
 * sees only the author; nobody else sees anything. Lovers never see each other.
 */

import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { Bubble, Pop, User } from '../bubl/types'

type PopRow = Omit<Pop, 'id'>

const nonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

async function authorOf(tools: ActionTools, bubbleId: string): Promise<string | undefined> {
  const res = await tools.get<Pick<Bubble, 'authorId'>>('bubbles', bubbleId)
  return res.success ? res.data.record.data.authorId : undefined
}

async function findPop(tools: ActionTools, userId: string, bubbleId: string) {
  const res = await tools.query<PopRow>('pops', { where: { userId, bubbleId }, limit: 1 })
  return res.success ? res.data.records[0] : undefined
}

async function publicUser(tools: ActionTools, userId: string): Promise<User> {
  const res = await tools.get<{ name?: string; imageUrl?: string }>('users', userId)
  const data = res.success ? res.data.record.data : {}
  return { id: userId, name: data.name ?? 'bubl user', imageUrl: data.imageUrl }
}

/** Sets Pop.loved. Requires the caller's Pop; authors can't love their own bubble. */
export const loveBubble: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const { bubbleId } = params
  if (!nonEmptyString(bubbleId)) return { success: false, error: 'bubbleId is required' }

  const authorId = await authorOf(tools, bubbleId)
  if (!authorId) return { success: false, error: 'Bubble not found' }
  if (authorId === userId) return { success: false, error: "You can't love your own bubble" }

  const pop = await findPop(tools, userId, bubbleId)
  if (!pop) return { success: false, error: 'Pop this bubble before loving it' }

  if (!pop.data.loved) {
    const updated = await tools.update('pops', pop.recordId, { loved: true })
    if (!updated.success) return updated
  }
  return { success: true, data: { loved: true } }
}

/** Author: everyone who loved it. Lover: just the author. Anyone else: []. */
export const lovedBy: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const { bubbleId } = params
  if (!nonEmptyString(bubbleId)) return { success: false, error: 'bubbleId is required' }

  const authorId = await authorOf(tools, bubbleId)
  if (!authorId) return { success: false, error: 'Bubble not found' }

  if (userId === authorId) {
    const res = await tools.query<PopRow>('pops', { where: { bubbleId, loved: true }, limit: 500 })
    if (!res.success) return res
    const lovers = await Promise.all(res.data.records.map((r) => publicUser(tools, r.data.userId)))
    return { success: true, data: lovers }
  }

  const pop = await findPop(tools, userId, bubbleId)
  if (pop?.data.loved) return { success: true, data: [await publicUser(tools, authorId)] }
  return { success: true, data: [] }
}
