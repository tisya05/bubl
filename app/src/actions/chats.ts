/**
 * Chat actions: myChats, getMessages, sendMessage.
 *
 * Chats are created only by sendWave after a mutual wave. Only a chat's two
 * users can list, read or write it; everyone else gets "Chat not found".
 */

import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { Bubble, Chat, ChatBubble, ChatSummary, Message, Wave } from '../bubl/types'
import { messageNotice } from '../bubl/lib/notifications'
import { notify } from './notify'
import { publicUser } from './profile'

const MAX_MESSAGE_CHARS = 1000
const MESSAGE_PAGE = 200

type ChatRow = { userIds: string[]; pairKey: string; bubbleId: string }
type MessageRow = Omit<Message, never> & { userIds: string[] }
type WaveRow = Omit<Wave, 'createdAt'> & { userIds: string[] }
type ChatReadRow = { userId: string; chatId: string; readAt: string }

const nonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

const toChat = (recordId: string, row: ChatRow, createdAt: string): Chat => ({
  id: recordId,
  participantIds: [row.userIds[0], row.userIds[1]],
  bubbleId: row.bubbleId,
  unlockedAt: createdAt,
})

const toMessage = (row: MessageRow): Message => ({
  chatId: row.chatId,
  senderId: row.senderId,
  text: row.text,
  sentAt: row.sentAt,
})

/** Stable recordId so opening a thread can upsert without a prior query. */
const chatReadId = (userId: string, chatId: string) => `${userId}:${chatId}`

async function chatForMember(tools: ActionTools, userId: string, chatId: unknown) {
  if (!nonEmptyString(chatId)) return undefined
  const res = await tools.get<ChatRow>('chats', chatId)
  if (!res.success || !res.data.record.data.userIds.includes(userId)) return undefined
  return res.data.record
}

async function markChatRead(tools: ActionTools, userId: string, chatId: string) {
  const row: ChatReadRow = { userId, chatId, readAt: new Date().toISOString() }
  await tools.create('chat_reads', row, chatReadId(userId, chatId))
}

/**
 * The caller's chats, most recent activity first. `unread` when the other
 * person sent something after the caller last opened the thread (getMessages).
 */
export const myChats: ActionHandler<Env> = async ({ userId, tools }) => {
  const res = await tools.query<ChatRow>('chats', { limit: 500 })
  if (!res.success) return res
  const mine = res.data.records.filter((r) => r.data.userIds.includes(userId))

  const summaries = await Promise.all(
    mine.map(async (r): Promise<ChatSummary> => {
      const otherId = r.data.userIds.find((id) => id !== userId) ?? userId
      const [otherUser, last, read] = await Promise.all([
        publicUser(tools, otherId),
        tools.query<MessageRow>('messages', { where: { chatId: r.recordId }, orderBy: 'sentAt', orderDir: 'desc', limit: 1 }),
        tools.get<ChatReadRow>('chat_reads', chatReadId(userId, r.recordId)),
      ])
      const lastRow = last.success ? last.data.records[0]?.data : undefined
      const readAt = read.success ? read.data.record.data.readAt : ''
      return {
        chat: toChat(r.recordId, r.data, r.createdAt),
        otherUser,
        lastMessage: lastRow ? toMessage(lastRow) : undefined,
        unread: lastRow !== undefined && lastRow.senderId !== userId && lastRow.sentAt > readAt,
      }
    }),
  )
  const activity = (s: ChatSummary) => s.lastMessage?.sentAt ?? s.chat.unlockedAt
  summaries.sort((a, b) => activity(b).localeCompare(activity(a)))
  return { success: true, data: summaries }
}

/** The latest messages in a chat, oldest first. Params: `{ chatId }`. Marks the chat read. */
export const getMessages: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const chat = await chatForMember(tools, userId, params.chatId)
  if (!chat) return { success: false, error: 'Chat not found' }

  const res = await tools.query<MessageRow>('messages', {
    where: { chatId: chat.recordId },
    orderBy: 'sentAt',
    orderDir: 'desc',
    limit: MESSAGE_PAGE,
  })
  if (!res.success) return res
  await markChatRead(tools, userId, chat.recordId)
  return { success: true, data: res.data.records.map((r) => toMessage(r.data)).reverse() }
}

/** The pinned bubble's title, place, and mutual-wave notes. Params: `{ chatId }`. */
export const chatBubble: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const chat = await chatForMember(tools, userId, params.chatId)
  if (!chat) return { success: false, error: 'Chat not found' }

  const bubble = await tools.get<Pick<Bubble, 'title' | 'placeName' | 'category'>>('bubbles', chat.data.bubbleId)
  if (!bubble.success) return { success: false, error: 'Bubble not found' }
  const pinned = bubble.data.record.data
  const [a, b] = chat.data.userIds

  // Notes from either side's waves at the other (any connecting bubble). Prefer the
  // pinned bubble's notes first, then older ones — one chat per pair can cover several.
  const [ab, ba] = await Promise.all([
    tools.query<WaveRow>('waves', { where: { fromUserId: a, toUserId: b }, limit: 50 }),
    tools.query<WaveRow>('waves', { where: { fromUserId: b, toUserId: a }, limit: 50 }),
  ])
  const rows = [
    ...(ab.success ? ab.data.records : []),
    ...(ba.success ? ba.data.records : []),
  ]
  rows.sort((x, y) => {
    const pin = (r: (typeof rows)[number]) => (r.data.bubbleId === chat.data.bubbleId ? 0 : 1)
    const byPin = pin(x) - pin(y)
    if (byPin !== 0) return byPin
    return x.createdAt.localeCompare(y.createdAt)
  })
  const waveNotes = rows.flatMap((r) => {
    const note = r.data.note?.trim()
    return note ? [{ fromUserId: r.data.fromUserId, note }] : []
  })

  const data: ChatBubble = {
    bubbleId: chat.data.bubbleId,
    title: pinned.title,
    placeName: pinned.placeName,
    category: pinned.category,
    ...(waveNotes.length ? { waveNotes } : {}),
  }
  return { success: true, data }
}

/** Params: `{ chatId, text }` (1 to 1000 characters). */
export const sendMessage: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const chat = await chatForMember(tools, userId, params.chatId)
  if (!chat) return { success: false, error: 'Chat not found' }

  const text = typeof params.text === 'string' ? params.text.trim() : ''
  if (!text) return { success: false, error: 'text is required' }
  if (text.length > MAX_MESSAGE_CHARS) return { success: false, error: `text must be at most ${MAX_MESSAGE_CHARS} characters` }

  const message: MessageRow = {
    chatId: chat.recordId,
    senderId: userId,
    text,
    sentAt: new Date().toISOString(),
    userIds: chat.data.userIds,
  }
  const created = await tools.create('messages', message)
  if (!created.success) return created
  const otherId = chat.data.userIds.find((id) => id !== userId)
  if (otherId) {
    const from = await publicUser(tools, userId)
    await notify(tools, otherId, messageNotice({ id: userId, name: from.name }, chat.recordId, text), env)
  }
  return { success: true, data: toMessage(message) }
}
