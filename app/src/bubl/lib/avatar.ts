import { getAuthToken } from 'deepspace'
import type { ActionResult } from 'deepspace/worker'
import { preparePhoto } from '../api/prepare-photo'
import { profilePhoto } from './localProfile'

/** Upload a custom avatar (live app). Demo mode should keep using local data URLs. */
export async function uploadAvatar(file: File): Promise<ActionResult<{ imageUrl: string }>> {
  const body = new FormData()
  body.append('file', await preparePhoto(file))
  const res = await fetch('/api/media/profile', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await getAuthToken()}` },
    body,
  })
  const json = (await res.json().catch(() => ({}))) as ActionResult<{ imageUrl: string }>
  if (!res.ok) return { success: false, error: json.success === false ? json.error : `Upload failed (${res.status})` }
  return json
}

export async function clearAvatar(): Promise<ActionResult<{ imageUrl: null }>> {
  const res = await fetch('/api/media/profile', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${await getAuthToken()}` },
  })
  if (!res.ok) return { success: false, error: `Could not remove photo (${res.status})` }
  return res.json() as Promise<ActionResult<{ imageUrl: null }>>
}

/** Demo: local JPEG data URL. Live: upload and return the public avatar path. */
export async function saveProfilePhoto(file: File, demo: boolean): Promise<string> {
  if (demo) return profilePhoto(file)
  const res = await uploadAvatar(file)
  if (!res.success) throw new Error(typeof res.error === 'string' ? res.error : 'Could not upload photo.')
  return res.data.imageUrl
}
