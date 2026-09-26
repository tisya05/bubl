/**
 * Pops, waves, chats and messages.
 *
 * Every collection here is written only by server actions (canPop, loveBubble,
 * sendWave, sendMessage), which enforce the product rules. Reads are scoped
 * server-side: a pop to its user, a wave / chat / message to its two users
 * (via the `userIds` collaborators column and read: 'shared').
 *
 * Admins get the same row access as members: the app owner's own client must
 * not receive other people's pops, waves or messages.
 */

import type { CollectionSchema } from 'deepspace/schema'

const serverWritten = { create: false, update: false, delete: false } as const
const noAccess = { read: false, ...serverWritten } as const
const ownRows = { read: 'own', ...serverWritten } as const
const participantRows = { read: 'shared', ...serverWritten } as const

const userIdsColumn = {
  name: 'userIds',
  storage: 'text',
  interpretation: { kind: 'json' },
  required: true,
  immutable: true,
} as const

export const popsSchema: CollectionSchema = {
  name: 'pops',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'bubbleId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'poppedAt', storage: 'text', interpretation: { kind: 'datetime' }, required: true },
    { name: 'loved', storage: 'number', interpretation: { kind: 'boolean' }, default: 0 },
  ],
  uniqueOn: ['userId', 'bubbleId'],
  ownerField: 'userId',
  permissions: { viewer: noAccess, member: ownRows, admin: ownRows },
}

export const wavesSchema: CollectionSchema = {
  name: 'waves',
  columns: [
    { name: 'fromUserId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'toUserId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'bubbleId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    // Optional note from the waver; sendWave caps it at 280 characters.
    { name: 'note', storage: 'text', interpretation: 'plain', immutable: true },
    userIdsColumn,
  ],
  uniqueOn: ['fromUserId', 'toUserId', 'bubbleId'],
  collaboratorsField: 'userIds',
  permissions: { viewer: noAccess, member: participantRows, admin: participantRows },
}

export const chatsSchema: CollectionSchema = {
  name: 'chats',
  columns: [
    userIdsColumn,
    // Sorted "a:b" of the two user ids, so a pair can only ever have one chat.
    { name: 'pairKey', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'bubbleId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
  ],
  uniqueOn: ['pairKey'],
  collaboratorsField: 'userIds',
  permissions: { viewer: noAccess, member: participantRows, admin: participantRows },
}

export const messagesSchema: CollectionSchema = {
  name: 'messages',
  columns: [
    { name: 'chatId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'senderId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'text', storage: 'text', interpretation: 'plain', required: true },
    { name: 'sentAt', storage: 'text', interpretation: { kind: 'datetime' }, required: true },
    userIdsColumn,
  ],
  collaboratorsField: 'userIds',
  permissions: { viewer: noAccess, member: participantRows, admin: participantRows },
}
