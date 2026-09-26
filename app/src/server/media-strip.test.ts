import { describe, expect, it } from 'vitest'
import { detectMedia, stripJpeg, stripPng, stripVideo, stripWebp } from './media-strip'

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)))
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const u32le = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]
const has = (b: Uint8Array, s: string) => new TextDecoder('latin1').decode(b).includes(s)

describe('detectMedia', () => {
  it('uses magic bytes, not names', () => {
    expect(detectMedia(bytes([0xff, 0xd8, 0xff, 0xe0]))).toEqual({ mediaType: 'photo', contentType: 'image/jpeg' })
    expect(detectMedia(bytes([0x89], 'PNG', [13, 10, 26, 10]))).toMatchObject({ contentType: 'image/png' })
    expect(detectMedia(bytes('RIFF', [0, 0, 0, 0], 'WEBP'))).toMatchObject({ contentType: 'image/webp' })
    expect(detectMedia(bytes(u32(16), 'ftypisom', u32(0)))).toMatchObject({ mediaType: 'video', contentType: 'video/mp4' })
    expect(detectMedia(bytes(u32(16), 'ftypqt  ', u32(0)))).toMatchObject({ contentType: 'video/quicktime' })
    expect(detectMedia(bytes('<svg>'))).toBeUndefined()
  })
})

describe('stripJpeg', () => {
  it('removes EXIF (with GPS) and comments, keeps JFIF and image data', () => {
    const app0 = [0xff, 0xe0, 0, 6, ...[...'JFIF'].map((c) => c.charCodeAt(0))]
    const exif = [0xff, 0xe1, 0, 10, ...[...'Exif\0GPS!'].map((c) => c.charCodeAt(0)).slice(0, 8)]
    const com = [0xff, 0xfe, 0, 5, 104, 105, 33]
    const scan = [0xff, 0xda, 0, 2, 1, 2, 3, 0xff, 0xd9]
    const out = stripJpeg(bytes([0xff, 0xd8], app0, exif, com, scan))
    expect(has(out, 'Exif')).toBe(false)
    expect(has(out, 'hi!')).toBe(false)
    expect(Array.from(out)).toEqual([0xff, 0xd8, ...app0, ...scan])
  })
  it('rejects garbage', () => {
    expect(() => stripJpeg(bytes([0xff, 0xd8, 0x00, 0x00, 0, 0]))).toThrow()
  })
})

describe('stripPng', () => {
  it('drops eXIf and text chunks', () => {
    const chunk = (type: string, data: string) => bytes(u32(data.length), type, data, [0, 0, 0, 0])
    const sig = bytes([0x89], 'PNG', [13, 10, 26, 10])
    const png = new Uint8Array([...sig, ...chunk('IHDR', 'hdr'), ...chunk('eXIf', 'GPS'), ...chunk('tEXt', 'where'), ...chunk('IEND', '')])
    const out = stripPng(png)
    expect(has(out, 'eXIf') || has(out, 'GPS') || has(out, 'where')).toBe(false)
    expect(has(out, 'IHDR') && has(out, 'IEND')).toBe(true)
  })
})

describe('stripWebp', () => {
  it('drops EXIF/XMP chunks, clears their flags and fixes the RIFF size', () => {
    const chunk = (type: string, data: number[]) => [...[...type].map((c) => c.charCodeAt(0)), ...u32le(data.length), ...data]
    const body = [...chunk('VP8X', [0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0]), ...chunk('VP8 ', [1, 2]), ...chunk('EXIF', [71, 80, 83, 0])]
    const webp = bytes('RIFF', u32le(body.length + 4), 'WEBP', body)
    const out = stripWebp(webp)
    expect(has(out, 'EXIF') || has(out, 'GPS')).toBe(false)
    expect(out[20]).toBe(0) // VP8X flags byte
    expect(new DataView(out.buffer).getUint32(4, true)).toBe(out.length - 8)
  })
})

describe('stripVideo', () => {
  const box = (type: string, payload: number[]) => [...u32(payload.length + 8), ...[...type].map((c) => c.charCodeAt(0)), ...payload]
  const mvhd = (timescale: number, duration: number) => box('mvhd', [0, 0, 0, 0, ...u32(0), ...u32(0), ...u32(timescale), ...u32(duration)])
  const video = (seconds: number) =>
    new Uint8Array([
      ...box('ftyp', [...'isom'].map((c) => c.charCodeAt(0))),
      ...box('moov', [...mvhd(1000, seconds * 1000), ...box('udta', box('©xyz', [...'+40.8-073.9'].map((c) => c.charCodeAt(0))))]),
      ...box('mdat', [9, 9, 9]),
    ])

  it('blanks user data (GPS) without changing the size, and reads the duration', () => {
    const input = video(12)
    const { bytes: out, durationS } = stripVideo(input)
    expect(durationS).toBe(12)
    expect(out.length).toBe(input.length)
    expect(has(out, 'udta') || has(out, '+40.8')).toBe(false)
    expect(has(out, 'mdat')).toBe(true)
  })
})
