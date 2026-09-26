import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../../worker'
import { checkBubble } from './moderation'

const env = { GEMINI_API_KEY: 'test-key' } as Env
const verdict = { allowed: true, reasons: [], suggestedCategory: 'Park', suggestedTitle: 'Sunset steps', language: 'en' }

// A Gemini Interactions API response carrying `text` as the model's output.
const interaction = (text: string) => ({
  status: 'completed',
  steps: [{ type: 'model_output', content: [{ type: 'text', text }] }],
})

function mockFetch(impl: () => Promise<Response>) {
  const fn = vi.fn(impl)
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => vi.unstubAllGlobals())

describe('checkBubble (Gemini)', () => {
  it('returns null without a key, so the drop is saved unchecked', async () => {
    const fetch = mockFetch(async () => Response.json({}))
    expect(await checkBubble({} as Env, { text: 'hi' })).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends the key, schema and images in the Interactions API shape', async () => {
    const fetch = mockFetch(async () => Response.json(interaction(JSON.stringify(verdict))))
    await checkBubble(env, { title: 'Steps', text: 'warm in the sun', imagesBase64: ['data:image/png;base64,AAAA'] })

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions')
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key')
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({
      model: 'gemini-3.5-flash-lite',
      store: false,
      response_format: { type: 'text', mime_type: 'application/json' },
      input: [
        { type: 'text', text: 'Title: Steps\n\nNote: warm in the sun' },
        { type: 'image', data: 'AAAA', mime_type: 'image/png' },
      ],
    })
    expect(body.system_instruction).toContain('hate speech')
  })

  it('parses an allowed verdict', async () => {
    mockFetch(async () => Response.json(interaction(JSON.stringify(verdict))))
    expect(await checkBubble(env, { text: 'nice view' })).toEqual(verdict)
  })

  it('passes a rejection and its reasons through', async () => {
    const rejected = { ...verdict, allowed: false, reasons: ['Contains a swear word'] }
    mockFetch(async () => Response.json(interaction(JSON.stringify(rejected))))
    expect(await checkBubble(env, { text: 'x' })).toMatchObject({ allowed: false, reasons: ['Contains a swear word'] })
  })

  it('retries a rate limit or overload, then uses the verdict', async () => {
    let calls = 0
    const fetch = mockFetch(async () =>
      ++calls < 3 ? new Response('busy', { status: calls === 1 ? 429 : 503 }) : Response.json(interaction(JSON.stringify(verdict))),
    )
    expect(await checkBubble(env, { text: 'x' }, [0, 0])).toEqual(verdict)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('returns null once retries run out, or on a network failure (saved unchecked)', async () => {
    const fetch = mockFetch(async () => new Response('quota', { status: 429 }))
    expect(await checkBubble(env, { text: 'x' }, [0, 0])).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(3)
    mockFetch(async () => {
      throw new TypeError('network down')
    })
    expect(await checkBubble(env, { text: 'x' }, [0, 0])).toBeNull()
  })

  it('does not retry a request Gemini refuses outright', async () => {
    const fetch = mockFetch(async () => new Response('bad key', { status: 403 }))
    expect(await checkBubble(env, { text: 'x' }, [0, 0])).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('rejects when Gemini answers with no usable verdict (likely its own safety block)', async () => {
    mockFetch(async () => Response.json({ status: 'failed', steps: [] }))
    expect(await checkBubble(env, { text: 'x' })).toMatchObject({ allowed: false })
    mockFetch(async () => Response.json(interaction('not json')))
    expect(await checkBubble(env, { text: 'x' })).toMatchObject({ allowed: false })
  })
})
