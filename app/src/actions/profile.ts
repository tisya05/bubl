/**
 * Onboarding: getMe (splash decides map vs onboarding), claimHandle,
 * savePreferences. Also publicUser: how every other action shows a person
 * (their @handle, never their Google name or email).
 */

import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { User } from '../bubl/types'
import { avatarUrlFor } from '../server/avatar-url'

type ProfileRow = {
  handle?: string
  notificationsEnabled?: number | boolean
  locationEnabled?: number | boolean
  onboardedAt?: string
  avatarKey?: string
}
type HandleRow = { userId: string }

export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/
const RESERVED = new Set(['admin', 'bubl', 'support', 'help', 'moderator', 'official', 'deepspace', 'null', 'undefined'])

/** Lowercased, leading @ removed. */
export const normalizeHandle = (raw: string) => raw.trim().replace(/^@/, '').toLowerCase()

export function handleProblem(handle: string): string | undefined {
  if (!HANDLE_PATTERN.test(handle)) return 'Handles are 3 to 20 characters: lowercase letters, numbers and _'
  if (RESERVED.has(handle)) return 'That handle is taken'
  return undefined
}

async function getProfile(tools: ActionTools, userId: string): Promise<ProfileRow | undefined> {
  const res = await tools.get<ProfileRow>('profiles', userId)
  return res.success ? res.data.record.data : undefined
}

/** How a person appears to others: their handle, or a neutral name before they pick one. */
export async function publicUser(tools: ActionTools, userId: string, fallback = 'bubl user'): Promise<User> {
  const [profile, user] = await Promise.all([getProfile(tools, userId), tools.get<{ imageUrl?: string }>('users', userId)])
  const authImage = user.success ? user.data.record.data.imageUrl : undefined
  return {
    id: userId,
    name: profile?.handle ? `@${profile.handle}` : fallback,
    // Custom avatars live on profiles (users.imageUrl is system-managed by auth).
    imageUrl: profile?.avatarKey ? avatarUrlFor(userId, profile.avatarKey) : authImage || undefined,
  }
}

function toMe(userId: string, p: ProfileRow | undefined, authImageUrl?: string) {
  return {
    userId,
    handle: p?.handle ?? null,
    notificationsEnabled: Boolean(p?.notificationsEnabled),
    locationEnabled: Boolean(p?.locationEnabled),
    onboarded: Boolean(p?.handle && p?.onboardedAt),
    imageUrl: p?.avatarKey ? avatarUrlFor(userId, p.avatarKey) : authImageUrl || null,
  }
}

export const getMe: ActionHandler<Env> = async ({ userId, tools }) => {
  const [profile, user] = await Promise.all([getProfile(tools, userId), tools.get<{ imageUrl?: string }>('users', userId)])
  const authImage = user.success ? user.data.record.data.imageUrl : undefined
  return { success: true, data: toMe(userId, profile, authImage) }
}

export const claimHandle: ActionHandler<Env> = async ({ userId, params, tools }) => {
  if (typeof params.handle !== 'string') return { success: false, error: 'handle is required' }
  const handle = normalizeHandle(params.handle)
  const problem = handleProblem(handle)
  if (problem) return { success: true, data: { ok: false, reason: problem } }

  const profile = await getProfile(tools, userId)
  if (profile?.handle === handle) return { success: true, data: { ok: true, me: toMe(userId, profile) } }

  const owner = await tools.get<HandleRow>('handles', handle)
  if (owner.success && owner.data.record.data.userId !== userId) {
    return { success: true, data: { ok: false, reason: 'That handle is taken' } }
  }

  // Creating with a known recordId is an upsert: re-read to see who won a race for the same handle.
  const claimed = await tools.create('handles', { userId }, handle)
  if (!claimed.success) return claimed
  const check = await tools.get<HandleRow>('handles', handle)
  if (!check.success || check.data.record.data.userId !== userId) {
    return { success: true, data: { ok: false, reason: 'That handle is taken' } }
  }

  const next: ProfileRow = { ...profile, handle }
  const saved = await tools.create('profiles', next, userId)
  if (!saved.success) return saved
  if (profile?.handle) await tools.remove('handles', profile.handle)
  return { success: true, data: { ok: true, me: toMe(userId, next) } }
}

export const savePreferences: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const { notificationsEnabled, locationEnabled } = params
  if (typeof notificationsEnabled !== 'boolean' || typeof locationEnabled !== 'boolean') {
    return { success: false, error: 'notificationsEnabled and locationEnabled must be true or false' }
  }
  const profile = await getProfile(tools, userId)
  if (!profile?.handle) return { success: false, error: 'Pick a handle first' }
  const next: ProfileRow = {
    ...profile,
    notificationsEnabled,
    locationEnabled,
    onboardedAt: profile.onboardedAt ?? new Date().toISOString(),
  }
  const saved = await tools.create('profiles', next, userId)
  if (!saved.success) return saved
  return { success: true, data: toMe(userId, next) }
}
