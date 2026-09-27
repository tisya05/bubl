/**
 * Web Push subscriptions: one row per phone or browser that allowed bubl's
 * notifications. Server-only: written and read by actions (tools bypass RBAC),
 * never by clients directly, so nobody can read another user's endpoint.
 */

import type { CollectionSchema } from 'deepspace/schema'

export const pushSubscriptionsSchema: CollectionSchema = {
  name: 'pushSubscriptions',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'endpoint', storage: 'text', interpretation: 'plain', required: true },
    { name: 'p256dh', storage: 'text', interpretation: 'plain', required: true },
    { name: 'auth', storage: 'text', interpretation: 'plain', required: true },
    // The chat this phone has open right now (no message pushes for it), until activeUntil (ms).
    { name: 'activeChatId', storage: 'text', interpretation: 'plain' },
    { name: 'activeUntil', storage: 'number', interpretation: 'plain' },
  ],
  ownerField: 'userId',
  permissions: {
    viewer: { read: false, create: false, update: false, delete: false },
    member: { read: false, create: false, update: false, delete: false },
    admin: { read: false, create: false, update: false, delete: false },
  },
}
