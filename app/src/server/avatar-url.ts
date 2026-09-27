/** Public path for a user's custom avatar (any signed-in user can GET it). */
export const avatarUrlFor = (userId: string, avatarKey?: string) =>
  `/api/media/profile/${userId}?v=${avatarKey ? avatarKey.slice(-12) : Date.now()}`

export const isAvatarPath = (url?: string | null) =>
  Boolean(url?.startsWith('/api/media/profile/') || url?.startsWith('/api/avatars/'))
