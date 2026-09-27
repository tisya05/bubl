// Real files through the upload route's parsers (kept here because src/ has no Node types).
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { detectMedia, stripVideo } from '../src/server/media-strip'

describe('real media files', () => {
  it('reads a voice note (macOS say, AAC in M4A) as audio only', () => {
    const file = readFileSync(fileURLToPath(new URL('../tests/fixtures/voice-note.m4a', import.meta.url)))
    expect(detectMedia(file)).toMatchObject({ contentType: 'video/mp4' })
    const { durationS, hasVideoTrack } = stripVideo(file)
    expect(hasVideoTrack).toBe(false)
    expect(durationS).toBeGreaterThan(3)
    expect(durationS).toBeLessThan(4)
  })

  const iphoneVideo = fileURLToPath(new URL('../../seed/media/IMG_1326.mov', import.meta.url))
  it.skipIf(!existsSync(iphoneVideo))('still reads a real iPhone video as video', () => {
    expect(stripVideo(readFileSync(iphoneVideo)).hasVideoTrack).toBe(true)
  })
})
