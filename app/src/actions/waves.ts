/**
 * Wave actions: sendWave and incomingWaves.
 *
 * A wave is only between a bubble's author and someone who popped and loved
 * it; either side may wave first. When both have waved about the same bubble,
 * the pair's one chat is created (or reused), pinned to the first bubble.
 */

import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { Bubble, BubblePreview, IncomingWave, Pop, User, Wave } from '../bubl/types'
import { publicUser } from './profile'
import { matchNotice, waveNotice } from '../bubl/lib/notifications'
import { notify } from './notify'

const MAX_NOTE_CHARS = 280

type PopRow = Omit<Pop, 'id'>
type WaveRow = Omit<Wave, 'createdAt'> & { userIds: string[] }
type ChatRow = { userIds: string[]; pairKey: string; bubbleId: string }

const nonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

const pairKeyOf = (a: string, b: string) => [a, b].sort().join(':')

// Waves only show the day they were sent, not the exact time.
const toDay = (iso: string) => `${iso.slice(0, 10)}T00:00:00.000Z`

async function hasLoved(tools: ActionTools, userId: string, bubbleId: string): Promise<boolean> {
  const res = await tools.query<PopRow>('pops', { where: { userId, bubbleId }, limit: 1 })
  return res.success && Boolean(res.data.records[0]?.data.loved)
}

async function findWave(tools: ActionTools, fromUserId: string, toUserId: string, bubbleId: string) {
  const res = await tools.query<WaveRow>('waves', { where: { fromUserId, toUserId, bubbleId }, limit: 1 })
  return res.success ? res.data.records[0] : undefined
}

async function chatFor(tools: ActionTools, a: string, b: string, bubbleId: string) {
  const pairKey = pairKeyOf(a, b)
  const existing = await tools.query<ChatRow>('chats', { where: { pairKey }, limit: 1 })
  if (existing.success && existing.data.records[0]) return { success: true as const, chatId: existing.data.records[0].recordId }

  const created = await tools.create('chats', { userIds: [a, b], pairKey, bubbleId })
  if (!created.success) return created
  return { success: true as const, chatId: created.data.recordId }
}

/** Params: `{ toUserId, bubbleId, note? }`. Returns `{ matched, chatId? }`. */
export const sendWave: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const { toUserId, bubbleId, note } = params
  if (!nonEmptyString(toUserId) || !nonEmptyString(bubbleId)) {
    return { success: false, error: 'toUserId and bubbleId are required' }
  }
  if (toUserId === userId) return { success: false, error: "You can't wave at yourself" }
  if (note !== undefined && typeof note !== 'string') return { success: false, error: 'note must be text' }
  const cleanNote = typeof note === 'string' ? note.trim() : ''
  if (cleanNote.length > MAX_NOTE_CHARS) return { success: false, error: `note must be at most ${MAX_NOTE_CHARS} characters` }

  const bubble = await tools.get<Pick<Bubble, 'authorId' | 'placeName'>>('bubbles', bubbleId)
  if (!bubble.success) return { success: false, error: 'Bubble not found' }
  const authorId = bubble.data.record.data.authorId

  const lover = userId === authorId ? toUserId : toUserId === authorId ? userId : undefined
  if (!lover || !(await hasLoved(tools, lover, bubbleId))) {
    return { success: false, error: 'Waves are only between a bubble’s author and someone who loved it' }
  }

  const placeName = bubble.data.record.data.placeName ?? ''
  let newWave = false
  if (!(await findWave(tools, userId, toUserId, bubbleId))) {
    const wave: WaveRow = { fromUserId: userId, toUserId, bubbleId, userIds: [userId, toUserId] }
    if (cleanNote) wave.note = cleanNote
    const created = await tools.create('waves', wave)
    if (!created.success) return created
    newWave = true
  }

  const me = newWave ? await publicUser(tools, userId, 'Someone') : undefined
  if (!(await findWave(tools, toUserId, userId, bubbleId))) {
    if (me) await notify(tools, toUserId, waveNotice(me, { id: bubbleId, placeName }, cleanNote || undefined), env)
    return { success: true, data: { matched: false } }
  }

  const chat = await chatFor(tools, userId, toUserId, bubbleId)
  if (!chat.success) return chat
  // The wave back that unlocks the chat: tell both people (feed + phone).
  if (me) {
    const them = await publicUser(tools, toUserId, 'Someone')
    await Promise.all([
      notify(tools, toUserId, matchNotice(me, chat.chatId, bubbleId), env),
      notify(tools, userId, matchNotice(them, chat.chatId, bubbleId), env),
    ])
  }
  return { success: true, data: { matched: true, chatId: chat.chatId } }
}

/** Waves sent to the caller that they haven't waved back yet. */
export const incomingWaves: ActionHandler<Env> = async ({ userId, tools }) => {
  const received = await tools.query<WaveRow>('waves', { where: { toUserId: userId }, limit: 500 })
  if (!received.success) return received
  const sent = await tools.query<WaveRow>('waves', { where: { fromUserId: userId }, limit: 500 })
  if (!sent.success) return sent
  const wavedBack = new Set(sent.data.records.map((r) => `${r.data.toUserId}:${r.data.bubbleId}`))

  const pending = received.data.records.filter((r) => !wavedBack.has(`${r.data.fromUserId}:${r.data.bubbleId}`))
  const items = await Promise.all(
    pending.map(async (r): Promise<IncomingWave> => {
      const [from, preview] = await Promise.all([
        publicUser(tools, r.data.fromUserId),
        tools.get<Omit<BubblePreview, 'id'>>('bubble_previews', r.data.bubbleId),
      ])
      const place = preview.success ? preview.data.record.data : undefined
      return {
        from,
        bubbleId: r.data.bubbleId,
        placeName: place?.placeName ?? '',
        category: place?.category ?? 'Misc',
        note: r.data.note,
        createdAt: toDay(r.createdAt),
      }
    }),
  )
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return { success: true, data: items }
}
