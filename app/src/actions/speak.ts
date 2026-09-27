/**
 * speak: a bubble read aloud by an ElevenLabs voice, for walking mode.
 * speakLine: a fixed line in the same voice ("This bubble also has a photo…").
 *
 * Only for someone who popped the bubble (or its author), so the audio can't
 * leak sealed content. Generated once through DeepSpace's ElevenLabs
 * integration (billed to the app owner), cached on the bubble's audioUrl, and
 * reused for everyone after that.
 */

import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { Bubble, SpeakResult } from '../bubl/types'

type BubbleRow = Omit<Bubble, 'id' | 'createdAt'>
type TtsResult = { audioUrl: string }

// Small, voice-quality MP3 (~4 KB per second) so the cached data URL stays light.
const TTS = { model_id: 'eleven_flash_v2_5', output_format: 'mp3_22050_32' } as const
const MAX_TTS_CHARS = 1200

const nonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

async function hasPopped(tools: ActionTools, userId: string, bubbleId: string): Promise<boolean> {
  const res = await tools.query('pops', { where: { userId, bubbleId }, limit: 1 })
  return res.success && res.data.records.length > 0
}

/** Fixed lines walking mode says after a note, in the same voice. */
export const SPOKEN_LINES = {
  photo: 'This bubble also has a photo. Open bubl to see it.',
  video: 'This bubble also has a video. Open bubl to watch it.',
} as const
type SpokenLine = keyof typeof SPOKEN_LINES
// The lines never change, so each Worker instance generates them at most once.
const lineCache = new Map<SpokenLine, string>()

/** What the voice says: the title, a pause, then the note. */
export const spokenText = (title: string, text: string) => `${title.trim()}. ${text.trim()}`.slice(0, MAX_TTS_CHARS)

export const speak: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const { bubbleId } = params
  if (!nonEmptyString(bubbleId)) return { success: false, error: 'bubbleId is required' }

  const got = await tools.get<BubbleRow>('bubbles', bubbleId)
  if (!got.success) return { success: false, error: 'Bubble not found' }
  const bubble = got.data.record.data
  if (bubble.authorId !== userId && !(await hasPopped(tools, userId, bubbleId))) {
    return { success: false, error: 'Pop this bubble first' }
  }

  // A voice-note bubble plays the author's own recording instead of a generated voice.
  if (bubble.mediaType === 'audio' && bubble.mediaUrl) {
    return { success: true, data: { audioUrl: bubble.mediaUrl } satisfies SpeakResult }
  }
  if (bubble.audioUrl) return { success: true, data: { audioUrl: bubble.audioUrl } satisfies SpeakResult }

  const tts = await tools.integration<TtsResult>('elevenlabs/generate-speech', {
    text: spokenText(bubble.title, bubble.text),
    ...TTS,
  })
  if (!tts.success) return { success: false, error: `Read-aloud is unavailable right now (${tts.error})` }
  const audioUrl = tts.data?.audioUrl
  if (typeof audioUrl !== 'string' || !audioUrl.startsWith('data:audio/')) {
    return { success: false, error: 'Read-aloud is unavailable right now' }
  }

  // Cache for everyone. If the write fails, still return the audio this time.
  await tools.update('bubbles', bubbleId, { audioUrl })
  return { success: true, data: { audioUrl } satisfies SpeakResult }
}

/** Params: `{ line: 'photo' | 'video' }`. A fixed line read aloud (no bubble content), e.g. after a note with a photo. */
export const speakLine: ActionHandler<Env> = async ({ params, tools }) => {
  const line = params.line as SpokenLine
  if (!Object.hasOwn(SPOKEN_LINES, line)) return { success: false, error: 'line must be photo or video' }
  const cached = lineCache.get(line)
  if (cached) return { success: true, data: { audioUrl: cached } satisfies SpeakResult }

  const tts = await tools.integration<TtsResult>('elevenlabs/generate-speech', { text: SPOKEN_LINES[line], ...TTS })
  const audioUrl = tts.success ? tts.data?.audioUrl : undefined
  if (typeof audioUrl !== 'string' || !audioUrl.startsWith('data:audio/')) return { success: false, error: 'Read-aloud is unavailable right now' }
  lineCache.set(line, audioUrl)
  return { success: true, data: { audioUrl } satisfies SpeakResult }
}
