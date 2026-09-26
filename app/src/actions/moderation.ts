/**
 * checkBubble: Grok (xAI) moderation for a drop. Server-only helper, not an
 * action: the client can't call it, so moderation can't be skipped.
 *
 * Uses xAI's Responses API with a strict JSON schema
 * (https://docs.x.ai/developers/rest-api-reference/inference/responses).
 * Returns null when Grok is unavailable (no key, error, timeout, bad output);
 * dropBubble then saves the bubble as moderation: 'unchecked'.
 */

import type { Env } from '../../worker'
import { MODERATION_INSTRUCTIONS, MODERATION_SCHEMA, parseVerdict, type ModerationVerdict } from '../bubl/lib/moderation'

const XAI_RESPONSES_URL = 'https://api.x.ai/v1/responses'
const DEFAULT_MODEL = 'grok-4.7'
const TIMEOUT_MS = 10_000

type ResponsesOutput = {
  output?: { type?: string; content?: { type?: string; text?: string }[] }[]
}

// xAI asks for a stable per-user id that isn't the raw id, email or name.
async function hashUserId(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function checkBubble(
  env: Env,
  input: { userId: string; title?: string; text: string; imagesBase64?: string[] },
): Promise<ModerationVerdict | null> {
  if (!env.XAI_API_KEY) return null

  const noteText = input.title ? `Title: ${input.title}\n\nNote: ${input.text}` : `Note: ${input.text}`
  const content = [
    { type: 'input_text', text: noteText },
    ...(input.imagesBase64 ?? []).map((b64) => ({
      type: 'input_image',
      image_url: b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`,
    })),
  ]

  try {
    const res = await fetch(XAI_RESPONSES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.XAI_API_KEY}` },
      body: JSON.stringify({
        model: env.XAI_MODEL || DEFAULT_MODEL,
        instructions: MODERATION_INSTRUCTIONS,
        input: [{ role: 'user', content }],
        text: { format: { type: 'json_schema', name: 'moderation', schema: MODERATION_SCHEMA, strict: true } },
        temperature: 0,
        store: false,
        safety_identifier: await hashUserId(input.userId),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) {
      console.warn(`[moderation] xAI returned ${res.status}`)
      return null
    }

    const body = (await res.json()) as ResponsesOutput
    const message = body.output?.find((item) => item.type === 'message')
    const text = message?.content?.find((c) => c.type === 'output_text')?.text
    if (!text) return null
    return parseVerdict(JSON.parse(text))
  } catch (err) {
    console.warn(`[moderation] Grok unavailable: ${err instanceof Error ? err.name : 'unknown error'}`)
    return null
  }
}
