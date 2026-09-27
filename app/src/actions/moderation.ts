/**
 * checkBubble: Gemini moderation for a drop. Server-only helper, not an
 * action: the client can't call it, so moderation can't be skipped.
 *
 * Uses the Gemini Interactions API with a JSON schema response format
 * (https://ai.google.dev/api/interactions-api).
 * - Rate limits (429) and overloads (5xx) are retried twice; the free tier hits
 *   them often, and each miss would otherwise save a drop unmoderated.
 * - No key, or still failing after retries / 10 s: returns null, and dropBubble
 *   saves the bubble as moderation: 'unchecked' so a demo never breaks.
 * - A 2xx with no usable verdict most likely means Gemini's own safety filter
 *   blocked the note, so that is treated as a rejection, never as unchecked.
 */

import type { Env } from '../../worker'
import {
  MODERATION_INSTRUCTIONS,
  MODERATION_SCHEMA,
  mediaContentBlock,
  parseVerdict,
  type ModerationMedia,
  type ModerationVerdict,
} from '../bubl/lib/moderation'

const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions'
// Flash-Lite: all live checks pass at ~1 s each, and it hits free-tier limits less than 3.8 Flash.
const DEFAULT_MODEL = 'gemini-3.5-flash-lite'
const TIMEOUT_MS = 10_000
const VIDEO_TIMEOUT_MS = 25_000 // Gemini watches and listens to the whole clip
const RETRY_DELAYS_MS = [700, 1500]
const isRetryable = (status: number) => status === 429 || status >= 500

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type InteractionResponse = {
  status?: string
  steps?: { type?: string; content?: { type?: string; text?: string }[] }[]
}

const UNVERIFIABLE: ModerationVerdict = {
  allowed: false,
  reasons: ['We couldn’t check this note. Try rewording it.'],
  suggestedCategory: 'Misc',
  suggestedTitle: '',
  language: 'en',
}

function outputText(body: InteractionResponse): string | undefined {
  for (const step of body.steps ?? []) {
    if (step.type !== 'model_output') continue
    const text = step.content?.find((c) => c.type === 'text')?.text
    if (text) return text
  }
  return undefined
}

function parseOutput(text: string | undefined): ModerationVerdict | null {
  if (!text) return null
  try {
    return parseVerdict(JSON.parse(text))
  } catch {
    return null
  }
}

export async function checkBubble(
  env: Env,
  input: { title?: string; text: string; media?: ModerationMedia[] },
  retryDelaysMs: number[] = RETRY_DELAYS_MS,
): Promise<ModerationVerdict | null> {
  if (!env.GEMINI_API_KEY) return null

  const note = input.text || '(no note, media only)'
  const noteText = input.title ? `Title: ${input.title}\n\nNote: ${note}` : `Note: ${note}`
  const mediaBlocks = (input.media ?? []).map(mediaContentBlock)
  // A photo or video Gemini can't take can't be checked, so it can't go live.
  if (mediaBlocks.some((b) => b === null)) return UNVERIFIABLE
  const content = [{ type: 'text', text: noteText }, ...mediaBlocks]
  const hasVideo = mediaBlocks.some((b) => b?.type === 'video' || b?.type === 'audio')

  const request = JSON.stringify({
    model: env.GEMINI_MODEL || DEFAULT_MODEL,
    system_instruction: MODERATION_INSTRUCTIONS,
    input: content,
    response_format: { type: 'text', mime_type: 'application/json', schema: MODERATION_SCHEMA },
    store: false,
  })
  const deadline = AbortSignal.timeout(hasVideo ? VIDEO_TIMEOUT_MS : TIMEOUT_MS)

  let res: Response | undefined
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
    if (attempt > 0) await sleep(retryDelaysMs[attempt - 1])
    try {
      res = await fetch(GEMINI_INTERACTIONS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: request,
        signal: deadline,
      })
    } catch (err) {
      const name = err instanceof Error ? err.name : 'unknown error'
      console.warn(`[moderation] Gemini unavailable: ${name}`)
      if (deadline.aborted) return null
      res = undefined
      continue
    }
    if (res.ok || !isRetryable(res.status)) break
    console.warn(`[moderation] Gemini returned ${res.status}, attempt ${attempt + 1}`)
  }

  if (!res || !res.ok) {
    if (res) console.warn(`[moderation] Gemini returned ${res.status}; saving unchecked`)
    return null
  }

  const body = (await res.json().catch(() => ({}))) as InteractionResponse
  const verdict = parseOutput(outputText(body))
  if (verdict) return verdict

  console.warn(`[moderation] Gemini gave no usable verdict (status ${body.status ?? 'unknown'}); rejecting to be safe`)
  return UNVERIFIABLE
}
