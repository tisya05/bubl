/**
 * Bubble media: POST /api/media/upload and GET /api/media/:uploadId.
 *
 * Why not the SDK's /api/files directly: 'self' files are readable only by the
 * uploader, and 'app' files can be listed by any signed-in user, which would
 * leak sealed bubble media (and who uploaded it) before anyone pops it. So
 * uploads go through here: metadata is stripped, then the file is stored in
 * the private per-user space of an internal account nobody can sign in as,
 * and served only to the uploader or to someone who popped its bubble.
 */

import type { Hono } from 'hono'
import { platformWorkerFetch, resolveSessionReadAuth } from 'deepspace/worker'
import type { ActionTools, VerifyResult } from 'deepspace/worker'
import type { AppContext, Env } from '../../worker.js'
import { createActionTools } from './action-routes.js'
import { detectMedia, stripJpeg, stripPng, stripVideo, stripWebp } from './media-strip.js'

const MEDIA_OWNER_ID = 'bubl-media-store'
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const MAX_VIDEO_BYTES = 12 * 1024 * 1024
const MAX_VIDEO_SECONDS = 15.5 // 15 s plus encoder rounding

type ResolveAuth = (req: Request, env: Env) => Promise<VerifyResult | null>
type UploadRow = { ownerId: string; storageKey: string; mediaType: 'photo' | 'video'; contentType: string; bubbleId?: string }

export const mediaUrlFor = (uploadId: string) => `/api/media/${uploadId}`
const UPLOAD_ID_IN_URL = /^\/api\/media\/([A-Za-z0-9_-]+)$/
export const uploadIdFromMediaUrl = (mediaUrl?: string) => mediaUrl?.match(UPLOAD_ID_IN_URL)?.[1]

function storageHeaders(env: Env): Headers {
  const headers = new Headers({ 'x-user-id': MEDIA_OWNER_ID })
  if (env.APP_IDENTITY_TOKEN) {
    headers.set('x-app-identity-token', env.APP_IDENTITY_TOKEN)
    headers.set('x-app-id', env.DEEPSPACE_APP_ID)
  }
  return headers
}

const fail = (error: string) => ({ success: false as const, error })

async function canView(tools: ActionTools, userId: string, upload: UploadRow): Promise<boolean> {
  if (upload.ownerId === userId) return true
  if (!upload.bubbleId) return false
  const pop = await tools.query('pops', { where: { userId, bubbleId: upload.bubbleId }, limit: 1 })
  if (pop.success && pop.data.records.length > 0) return true
  const bubble = await tools.get<{ authorId: string }>('bubbles', upload.bubbleId)
  return bubble.success && bubble.data.record.data.authorId === userId
}

export function registerMediaRoutes(app: Hono<AppContext>, resolveAuth: ResolveAuth): void {
  app.post('/api/media/upload', async (c) => {
    const auth = await resolveAuth(c.req.raw, c.env)
    if (!auth) return c.json({ error: 'Unauthorized' }, 401)

    const form = await c.req.formData().catch(() => undefined)
    const file = form?.get('file')
    if (!file || typeof file === 'string') return c.json(fail('Send the file as multipart field "file"'))
    if (file.size > MAX_VIDEO_BYTES) return c.json(fail('File is too large'))

    const raw = new Uint8Array(await file.arrayBuffer())
    const kind = detectMedia(raw)
    if (!kind) return c.json(fail('Only JPEG, PNG, WebP photos and MP4/MOV videos are supported'))
    if (kind.mediaType === 'photo' && raw.length > MAX_PHOTO_BYTES) return c.json(fail('Photos must be at most 5 MB'))

    let clean: Uint8Array
    try {
      if (kind.contentType === 'image/jpeg') clean = stripJpeg(raw)
      else if (kind.contentType === 'image/png') clean = stripPng(raw)
      else if (kind.contentType === 'image/webp') clean = stripWebp(raw)
      else {
        const video = stripVideo(raw)
        if (video.durationS > MAX_VIDEO_SECONDS) return c.json(fail('Videos must be 15 seconds or shorter'))
        clean = video.bytes
      }
    } catch {
      return c.json(fail('Could not read this file'))
    }

    const body = new FormData()
    body.append('file', new Blob([new Uint8Array(clean)], { type: kind.contentType }), 'media')
    const stored = await platformWorkerFetch(
      c.env,
      new Request(new URL('/internal/files/upload?scope=self', c.req.url), { method: 'POST', headers: storageHeaders(c.env), body }),
    )
    const storedBody = (await stored.json().catch(() => ({}))) as { success?: boolean; key?: string }
    if (!stored.ok || !storedBody.key) {
      console.error(`[media] storage upload failed status=${stored.status}`)
      return c.json(fail('Upload failed, try again'))
    }

    const tools = createActionTools(c.env, auth.userId, '')
    const row: UploadRow = { ownerId: auth.userId, storageKey: storedBody.key, ...kind }
    const created = await tools.create('media_uploads', row)
    if (!created.success) return c.json(fail('Upload failed, try again'))
    return c.json({ success: true, data: { uploadId: created.data.recordId, mediaType: kind.mediaType } })
  })

  app.get('/api/media/:uploadId', async (c) => {
    // Cookie fallback so a plain <img>/<video src> works for the signed-in user.
    const auth = (await resolveAuth(c.req.raw, c.env)) ?? (await resolveSessionReadAuth(c.req.raw, c.env))
    if (!auth) return c.json({ error: 'Unauthorized' }, 401)

    const tools = createActionTools(c.env, auth.userId, '')
    const got = await tools.get<UploadRow>('media_uploads', c.req.param('uploadId'))
    if (!got.success || !(await canView(tools, auth.userId, got.data.record.data))) {
      return c.json({ error: 'Not found' }, 404)
    }
    const upload = got.data.record.data

    const file = await platformWorkerFetch(
      c.env,
      new Request(new URL(`/internal/files/${upload.storageKey}?scope=self`, c.req.url), { headers: storageHeaders(c.env) }),
    )
    if (!file.ok || !file.body) return c.json({ error: 'Not found' }, 404)
    return new Response(file.body, {
      headers: {
        'Content-Type': upload.contentType,
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  })
}

/** Deletes a stored file; used by the demo reset. A missing file is not an error. */
export async function deleteStoredMedia(env: Env, storageKey: string): Promise<void> {
  const res = await platformWorkerFetch(env, `/internal/files/${storageKey}?scope=self`, {
    method: 'DELETE',
    headers: storageHeaders(env),
  })
  if (!res.ok && res.status !== 404) console.error(`[media] delete failed status=${res.status}`)
}

/**
 * For dropBubble: checks the caller owns an unused upload and returns the
 * fields to put on the bubble. saveBubble links it to the bubble afterwards.
 */
export async function mediaForDrop(
  tools: ActionTools,
  userId: string,
  uploadId: string,
): Promise<{ ok: true; mediaUrl: string; mediaType: 'photo' | 'video' } | { ok: false; error: string }> {
  const got = await tools.get<UploadRow>('media_uploads', uploadId)
  if (!got.success || got.data.record.data.ownerId !== userId) return { ok: false, error: 'Upload not found' }
  if (got.data.record.data.bubbleId) return { ok: false, error: 'That upload is already attached to a bubble' }
  return { ok: true, mediaUrl: mediaUrlFor(uploadId), mediaType: got.data.record.data.mediaType }
}
