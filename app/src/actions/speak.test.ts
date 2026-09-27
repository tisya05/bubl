import { describe, expect, it, vi } from 'vitest'
import type { ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { speak, spokenText } from './speak'

const AUDIO = 'data:audio/mpeg;base64,SUQzBAAAAA'
const bubbleRow = { authorId: 'author', title: 'The overlook', text: 'Best view of Harlem.', status: 'live' }

function fakeTools(opts: { bubble?: object | null; popped?: boolean; tts?: unknown } = {}) {
  const bubble = opts.bubble === undefined ? bubbleRow : opts.bubble
  return {
    get: vi.fn(async () =>
      bubble ? { success: true, data: { record: { recordId: 'b1', data: bubble } } } : { success: false, error: 'Record not found' },
    ),
    query: vi.fn(async () => ({ success: true, data: { records: opts.popped ? [{ recordId: 'p1', data: {} }] : [], count: 0 } })),
    integration: vi.fn(async () => opts.tts ?? { success: true, data: { audioUrl: AUDIO } }),
    update: vi.fn(async () => ({ success: true, data: { recordId: 'b1' } })),
  } as unknown as ActionTools & Record<'get' | 'query' | 'integration' | 'update', ReturnType<typeof vi.fn>>
}

const call = (tools: ActionTools, userId = 'reader', params: Record<string, unknown> = { bubbleId: 'b1' }) =>
  speak({ userId, params, tools, env: {} as Env, callerJwt: '' })

describe('speak', () => {
  it('refuses someone who has not popped the bubble, without calling ElevenLabs', async () => {
    const tools = fakeTools({ popped: false })
    expect(await call(tools)).toMatchObject({ success: false, error: 'Pop this bubble first' })
    expect(tools.integration).not.toHaveBeenCalled()
  })

  it('generates audio once for a popper, then caches it on the bubble', async () => {
    const tools = fakeTools({ popped: true })
    expect(await call(tools)).toEqual({ success: true, data: { audioUrl: AUDIO } })
    expect(tools.integration).toHaveBeenCalledWith('elevenlabs/generate-speech', {
      text: 'The overlook. Best view of Harlem.',
      model_id: 'eleven_flash_v2_5',
      output_format: 'mp3_22050_32',
    })
    expect(tools.update).toHaveBeenCalledWith('bubbles', 'b1', { audioUrl: AUDIO })
  })

  it('reuses cached audio without paying for it again', async () => {
    const tools = fakeTools({ popped: true, bubble: { ...bubbleRow, audioUrl: AUDIO } })
    expect(await call(tools)).toEqual({ success: true, data: { audioUrl: AUDIO } })
    expect(tools.integration).not.toHaveBeenCalled()
  })

  it("plays a voice-note bubble's own recording instead of generating speech", async () => {
    const tools = fakeTools({ popped: true, bubble: { ...bubbleRow, mediaType: 'audio', mediaUrl: '/api/media/v1' } })
    expect(await call(tools)).toEqual({ success: true, data: { audioUrl: '/api/media/v1' } })
    expect(tools.integration).not.toHaveBeenCalled()
    expect(await call(fakeTools({ popped: false, bubble: { ...bubbleRow, mediaType: 'audio', mediaUrl: '/api/media/v1' } }))).toMatchObject({
      success: false,
    })
  })

  it('lets the author hear their own bubble without popping it', async () => {
    const tools = fakeTools({ popped: false })
    expect(await call(tools, 'author')).toMatchObject({ success: true })
  })

  it('reports ElevenLabs failures and odd responses without caching them', async () => {
    const down = fakeTools({ popped: true, tts: { success: false, error: 'insufficient credits' } })
    expect(await call(down)).toMatchObject({ success: false })
    const odd = fakeTools({ popped: true, tts: { success: true, data: { audioUrl: 'https://evil.example/x.mp3' } } })
    expect(await call(odd)).toMatchObject({ success: false })
    expect(odd.update).not.toHaveBeenCalled()
  })

  it('handles a missing bubble and missing input', async () => {
    expect(await call(fakeTools({ bubble: null }))).toMatchObject({ success: false, error: 'Bubble not found' })
    expect(await call(fakeTools(), 'reader', {})).toMatchObject({ success: false })
  })
})

describe('spokenText', () => {
  it('reads the title, then the note, capped in length', () => {
    expect(spokenText(' Hi ', ' there ')).toBe('Hi. there')
    expect(spokenText('T', 'x'.repeat(5000))).toHaveLength(1200)
  })
})
