/**
 * Onboarding state, written only by server actions (profile.ts) and avatar
 * routes. DeepSpace `users.imageUrl` is system-managed (auth provider), so a
 * custom photo lives on `profiles.avatarKey` and is served at
 * `/api/avatars/<userId>`.
 *
 * `profiles`: recordId is the userId. `handles`: recordId is the lowercase
 * handle, so a handle can belong to one user only. Nobody reads either
 * directly; other users only ever see a handle through server actions.
 */

import type { CollectionSchema } from 'deepspace/schema'

const noAccess = { read: false, create: false, update: false, delete: false } as const

export const profilesSchema: CollectionSchema = {
  name: 'profiles',
  columns: [
    { name: 'handle', storage: 'text', interpretation: 'plain' },
    { name: 'notificationsEnabled', storage: 'number', interpretation: { kind: 'boolean' }, default: 0 },
    { name: 'locationEnabled', storage: 'number', interpretation: { kind: 'boolean' }, default: 0 },
    { name: 'onboardedAt', storage: 'text', interpretation: { kind: 'datetime' } },
    { name: 'avatarKey', storage: 'text', interpretation: 'plain' },
  ],
  permissions: { viewer: noAccess, member: noAccess, admin: noAccess },
}

export const handlesSchema: CollectionSchema = {
  name: 'handles',
  columns: [{ name: 'userId', storage: 'text', interpretation: 'plain', required: true }],
  permissions: { viewer: noAccess, member: noAccess, admin: noAccess },
}
