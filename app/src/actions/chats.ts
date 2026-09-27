/**
 * Chat actions: myChats, getMessages, sendMessage.
 *
 * Chats are created only by sendWave after a mutual wave. Only a chat's two
 * users can list, read or write it; everyone else gets "Chat not found".
 */

import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { Chat, ChatSummary, Message, User } from '../bubl/types'
import { publicUser } from './profile'

const MAX_MESSAGE_CHARS = 1000
const MESSAGE_PAGE = 200

type ChatRow = { userIds: string[]; pairKey: string; bubbleId: string }
type MessageRow = Omit<Message, never> & { userIds: string[] }

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

async function chatForMember(tools: ActionTools, userId: string, chatId: unknown) {
  if (!nonEmptyString(chatId)) return undefined
  const res = await tools.get<ChatRow>('chats', chatId)
  if (!res.success || !res.data.record.data.userIds.includes(userId)) return undefined
  return res.data.record
}


/**
 * The caller's chats, most recent activity first. With no read receipts,
 * `unread` means the other person sent the last message.
 */
export const myChats: ActionHandler<Env> = async ({ userId, tools }) => {
  const res = await tools.query<ChatRow>('chats', { limit: 500 })
  if (!res.success) return res
  const mine = res.data.records.filter((r) => r.data.userIds.includes(userId))

  const summaries = await Promise.all(
    mine.map(async (r): Promise<ChatSummary> => {
      const otherId = r.data.userIds.find((id) => id !== userId) ?? userId
      const [otherUser, last] = await Promise.all([
        publicUser(tools, otherId),
        tools.query<MessageRow>('messages', { where: { chatId: r.recordId }, orderBy: 'sentAt', orderDir: 'desc', limit: 1 }),
      ])
      const lastRow = last.success ? last.data.records[0]?.data : undefined
      return {
        chat: toChat(r.recordId, r.data, r.createdAt),
        otherUser,
        lastMessage: lastRow ? toMessage(lastRow) : undefined,
        unread: lastRow !== undefined && lastRow.senderId !== userId,
      }
    }),
  )
  const activity = (s: ChatSummary) => s.lastMessage?.sentAt ?? s.chat.unlockedAt
  summaries.sort((a, b) => activity(b).localeCompare(activity(a)))
  return { success: true, data: summaries }
}

/** The latest messages in a chat, oldest first. Params: `{ chatId }`. */
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
  return { success: true, data: res.data.records.map((r) => toMessage(r.data)).reverse() }
}

/** Params: `{ chatId, text }` (1 to 1000 characters). */
export const sendMessage: ActionHandler<Env> = async ({ userId, params, tools }) => {
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
  return { success: true, data: toMessage(message) }
}
