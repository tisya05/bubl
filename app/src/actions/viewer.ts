/**
 * Per-viewer state on map previews and reopening popped notes.
 *
 * - markForViewer: flags previews the caller already popped (`popped`) or
 *   dropped (`mine`), so the map shows "Open note" instead of "Pop it", and
 *   walking mode / nearby alerts skip them.
 * - openPopped: returns a note the caller already popped (or wrote), from
 *   anywhere: they earned it by being there once. For the You tab and the
 *   "Open note" button.
 */

import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { Bubble, BubblePreview, OpenPoppedResult, Pop } from '../bubl/types'
import { loadAuthor } from './pop'

type BubbleRow = Omit<Bubble, 'id' | 'createdAt'>
type PopRow = Pick<Pop, 'userId' | 'bubbleId' | 'loved'>

const nonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

export async function markForViewer(tools: ActionTools, userId: string, previews: BubblePreview[]): Promise<BubblePreview[]> {
  if (previews.length === 0) return previews
  const [pops, mine] = await Promise.all([
    tools.query<PopRow>('pops', { where: { userId }, limit: 500 }),
    tools.query<Pick<Bubble, 'authorId'>>('bubbles', { where: { authorId: userId }, limit: 500 }),
  ])
  const popped = new Set(pops.success ? pops.data.records.map((r) => r.data.bubbleId) : [])
  const own = new Set(mine.success ? mine.data.records.map((r) => r.recordId) : [])
  return previews.map((p) => ({ ...p, ...(popped.has(p.id) && { popped: true }), ...(own.has(p.id) && { mine: true }) }))
}

export const openPopped: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const { bubbleId } = params
  if (!nonEmptyString(bubbleId)) return { success: false, error: 'bubbleId is required' }

  const got = await tools.get<BubbleRow>('bubbles', bubbleId)
  if (!got.success) return { success: false, error: 'Bubble not found' }
  const { record } = got.data

  const pop = await tools.query<PopRow>('pops', { where: { userId, bubbleId }, limit: 1 })
  const myPop = pop.success ? pop.data.records[0] : undefined
  if (!myPop && record.data.authorId !== userId) return { success: false, error: 'Pop this bubble first' }

  const bubble: Bubble = { ...record.data, id: record.recordId, createdAt: record.createdAt }
  const author = await loadAuthor(tools, bubble.authorId)
  return { success: true, data: { bubble, author, loved: Boolean(myPop?.data.loved) } satisfies OpenPoppedResult }
}
