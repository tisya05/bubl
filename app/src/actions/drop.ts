/**
 * dropBubble: leave a bubble at the caller's location.
 *
 * Order: validate -> PII pre-check (no Gemini needed) -> Gemini moderation ->
 * saveBubble. A rejected drop is never saved. If Gemini is unavailable the
 * bubble is saved as moderation: 'unchecked' so a demo never breaks.
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { DEFAULT_POP_RADIUS_M } from '../bubl/config'
import { expiresAtFor, fallbackTitle, findPii } from '../bubl/lib/moderation'
import { CATEGORIES, type Category, type DropBubbleInput, type DropBubbleResult } from '../bubl/types'
import { saveBubble } from './bubbles'
import { checkBubble } from './moderation'
import { mediaForDrop, readStoredMediaBase64 } from '../server/media-routes'

const MAX_TEXT_CHARS = 1000
const MAX_TITLE_CHARS = 60
const MAX_FRAMES = 2
const MAX_FRAME_CHARS = 2_000_000 // ~1.5 MB of JPEG as base64
const FLOATS_FOR = ['1w', '1m', 'forever'] as const

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const nonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

function parseInput(params: Record<string, unknown>): DropBubbleInput | string {
  const { title, text, category, lat, lng, placeName, uploadId, frameBase64, floatsFor } = params

  if (text !== undefined && typeof text !== 'string') return 'text must be a string'
  if (!nonEmptyString(text) && !nonEmptyString(uploadId)) return 'text is required when there is no photo, video or voice note'
  if (typeof text === 'string' && text.length > MAX_TEXT_CHARS) return `text must be at most ${MAX_TEXT_CHARS} characters`
  if (title !== undefined && (typeof title !== 'string' || title.length > MAX_TITLE_CHARS)) {
    return `title must be at most ${MAX_TITLE_CHARS} characters`
  }
  if (category !== undefined && !CATEGORIES.includes(category as Category)) {
    return `category must be one of ${CATEGORIES.join(', ')}`
  }
  if (!isFiniteNumber(lat) || Math.abs(lat) > 90 || !isFiniteNumber(lng) || Math.abs(lng) > 180) {
    return 'lat and lng are required'
  }
  if (!nonEmptyString(placeName)) return 'placeName is required'
  if (!FLOATS_FOR.includes(floatsFor as DropBubbleInput['floatsFor'])) return 'floatsFor must be 1w, 1m or forever'
  if (uploadId !== undefined && !nonEmptyString(uploadId)) return 'uploadId must be a string'
  if (frameBase64 !== undefined) {
    if (!Array.isArray(frameBase64) || frameBase64.length > MAX_FRAMES) return `frameBase64 takes at most ${MAX_FRAMES} images`
    if (!frameBase64.every((f) => typeof f === 'string' && f.length <= MAX_FRAME_CHARS)) return 'frameBase64 images are too large'
  }

  return {
    title: nonEmptyString(title) ? title.trim() : undefined,
    text: typeof text === 'string' ? text.trim() : '',
    category: category as Category | undefined,
    lat,
    lng,
    placeName: placeName.trim(),
    uploadId: uploadId as string | undefined,
    frameBase64: frameBase64 as string[] | undefined,
    floatsFor: floatsFor as DropBubbleInput['floatsFor'],
  }
}

const rejected = (reasons: string[]) => ({ success: true as const, data: { ok: false, reasons } satisfies DropBubbleResult })

export const dropBubble: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const input = parseInput(params)
  if (typeof input === 'string') return { success: false, error: input }

  const pii = findPii(`${input.title ?? ''}\n${input.text}`)
  if (pii.length > 0) return rejected(pii)

  const media = input.uploadId ? await mediaForDrop(tools, userId, input.uploadId) : undefined
  if (media && !media.ok) return { success: false, error: media.error }

  const frames = input.frameBase64?.map((base64) => ({ mimeType: base64.startsWith('data:image/png') ? 'image/png' : 'image/jpeg', base64 }))
  // A voice note has no frames: Gemini listens to the stored file itself.
  let voiceNote: { mimeType: string; base64: string } | undefined
  if (media?.ok && media.mediaType === 'audio') {
    const base64 = await readStoredMediaBase64(env, media.storageKey)
    if (!base64) return { success: false, error: 'Could not read the voice note, try again' }
    voiceNote = { mimeType: media.contentType, base64 }
  }

  const verdict = await checkBubble(env, {
    title: input.title,
    text: input.text,
    media: [...(frames ?? []), ...(voiceNote ? [voiceNote] : [])],
  })
  if (verdict && !verdict.allowed) return rejected(verdict.reasons)

  const saved = await saveBubble(tools, {
    authorId: userId,
    lat: input.lat,
    lng: input.lng,
    placeName: input.placeName,
    category: input.category ?? verdict?.suggestedCategory ?? 'Misc',
    title: input.title ?? (verdict?.suggestedTitle || fallbackTitle(input.text) || (media?.ok ? { photo: 'a photo', video: 'a video', audio: 'a voice note' }[media.mediaType] : 'a note')),
    text: input.text,
    ...(media?.ok ? { mediaUrl: media.mediaUrl, mediaType: media.mediaType } : {}),
    language: verdict?.language ?? 'en',
    popRadiusM: DEFAULT_POP_RADIUS_M,
    expiresAt: expiresAtFor(input.floatsFor),
    status: 'live',
    moderation: verdict ? 'passed' : 'unchecked',
  })
  if (!saved.success) return saved
  return { success: true, data: { ok: true, bubble: saved.data } satisfies DropBubbleResult }
}
