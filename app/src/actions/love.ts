/**
 * Love actions: loveBubble and lovedBy.
 *
 * Visibility rule: only the author sees who loved their bubble. Lovers never
 * see each other.
 */

import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { Bubble, Pop, User } from '../bubl/types'
import { publicUser } from './profile'
import { loveNotice } from '../bubl/lib/notifications'
import { notify } from './notify'

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

/** Sets Pop.loved. Requires the caller's Pop; authors can't love their own bubble. */
export const loveBubble: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
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
    // First love only: tell the author (feed + phone).
    const [from, bubble] = await Promise.all([publicUser(tools, userId, 'Someone'), tools.get<Pick<Bubble, 'placeName'>>('bubbles', bubbleId)])
    const placeName = bubble.success ? bubble.data.record.data.placeName : ''
    await notify(tools, authorId, loveNotice(from, { id: bubbleId, placeName }), env)
  }
  return { success: true, data: { loved: true } }
}

/** Author: everyone who loved it. Anyone else: [] (a lover gets the author from canPop). */
export const lovedBy: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const { bubbleId } = params
  if (!nonEmptyString(bubbleId)) return { success: false, error: 'bubbleId is required' }

  const authorId = await authorOf(tools, bubbleId)
  if (!authorId) return { success: false, error: 'Bubble not found' }

  if (userId !== authorId) return { success: true, data: [] }

  // `loved` is stored as 0/1, so filter here rather than in `where`.
  const res = await tools.query<PopRow>('pops', { where: { bubbleId }, limit: 500 })
  if (!res.success) return res
  const loverPops = res.data.records.filter((r) => Boolean(r.data.loved))
  const lovers = await Promise.all(loverPops.map((r) => publicUser(tools, r.data.userId)))
  return { success: true, data: lovers }
}
