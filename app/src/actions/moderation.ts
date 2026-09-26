/**
 * checkBubble: Gemini moderation for a drop. Server-only helper, not an
 * action: the client can't call it, so moderation can't be skipped.
 *
 * Uses the Gemini Interactions API with a JSON schema response format
 * (https://ai.google.dev/api/interactions-api).
 * - No key, network error, timeout or non-2xx: returns null, and dropBubble
 *   saves the bubble as moderation: 'unchecked' so a demo never breaks.
 * - A 2xx with no usable verdict most likely means Gemini's own safety filter
 *   blocked the note, so that is treated as a rejection, never as unchecked.
 */

import type { Env } from '../../worker'
import { MODERATION_INSTRUCTIONS, MODERATION_SCHEMA, parseVerdict, type ModerationVerdict } from '../bubl/lib/moderation'

const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions'
const DEFAULT_MODEL = 'gemini-3.8-flash'
const TIMEOUT_MS = 10_000

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
  input: { title?: string; text: string; imagesBase64?: string[] },
): Promise<ModerationVerdict | null> {
  if (!env.GEMINI_API_KEY) return null

  const noteText = input.title ? `Title: ${input.title}\n\nNote: ${input.text}` : `Note: ${input.text}`
  const content = [
    { type: 'text', text: noteText },
    ...(input.imagesBase64 ?? []).map((b64) => ({
      type: 'image',
      data: b64.replace(/^data:image\/[a-z]+;base64,/, ''),
      mime_type: b64.startsWith('data:image/png') ? 'image/png' : 'image/jpeg',
    })),
  ]

  let res: Response
  try {
    res = await fetch(GEMINI_INTERACTIONS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        model: env.GEMINI_MODEL || DEFAULT_MODEL,
        system_instruction: MODERATION_INSTRUCTIONS,
        input: content,
        response_format: { type: 'text', mime_type: 'application/json', schema: MODERATION_SCHEMA },
        store: false,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    console.warn(`[moderation] Gemini unavailable: ${err instanceof Error ? err.name : 'unknown error'}`)
    return null
  }

  if (!res.ok) {
    console.warn(`[moderation] Gemini returned ${res.status}`)
    return null
  }

  const body = (await res.json().catch(() => ({}))) as InteractionResponse
  const verdict = parseOutput(outputText(body))
  if (verdict) return verdict

  console.warn(`[moderation] Gemini gave no usable verdict (status ${body.status ?? 'unknown'}); rejecting to be safe`)
  return UNVERIFIABLE
}
