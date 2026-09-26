/**
 * In-app notifications: someone loved your bubble, waved at you, matched with
 * you, or messaged you. Written only by server actions (notify()); each user
 * reads only their own rows, live, and can only flip `read`.
 */

import type { CollectionSchema } from 'deepspace/schema'

const KINDS = ['love', 'wave', 'match', 'message']

export const notificationsSchema: CollectionSchema = {
  name: 'notifications',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'kind', storage: 'text', interpretation: { kind: 'select', options: KINDS }, required: true, immutable: true },
    { name: 'title', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'body', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'bubbleId', storage: 'text', interpretation: 'plain', immutable: true },
    { name: 'chatId', storage: 'text', interpretation: 'plain', immutable: true },
    { name: 'fromUserId', storage: 'text', interpretation: 'plain', immutable: true },
    { name: 'read', storage: 'number', interpretation: { kind: 'boolean' }, default: 0 },
  ],
  ownerField: 'userId',
  permissions: {
    viewer: { read: false, create: false, update: false, delete: false },
    member: { read: 'own', create: false, update: 'own', delete: 'own', writableFields: ['read'] },
    admin: { read: 'own', create: false, update: 'own', delete: 'own', writableFields: ['read'] },
  },
}
