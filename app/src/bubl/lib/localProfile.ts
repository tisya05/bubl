import type { User } from '../types'

export interface LocalProfile { name: string; username: string; imageUrl?: string }
export function loadProfile(user: User): LocalProfile {
  try {
    const value = JSON.parse(localStorage.getItem(`bubl.profile.${user.id}`) ?? 'null')
    if (value && typeof value.name === 'string' && typeof value.username === 'string') return value
  } catch { /* Private browsing can disable storage. */ }
  return { name: user.name || 'You', username: '', imageUrl: user.imageUrl ?? undefined }
}
export function saveProfile(userId: string, profile: LocalProfile) {
  localStorage.setItem(`bubl.profile.${userId}`, JSON.stringify(profile))
}

export async function profilePhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image for your profile photo.')
  if (file.size > 10 * 1024 * 1024) throw new Error('Choose a photo under 10 MB.')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image(); image.src = url; await image.decode()
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 320
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not prepare this photo.')
    const side = Math.min(image.naturalWidth, image.naturalHeight)
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 320, 320)
    return canvas.toDataURL('image/jpeg', .82)
  } finally { URL.revokeObjectURL(url) }
}
