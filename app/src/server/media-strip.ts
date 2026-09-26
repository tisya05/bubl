/**
 * Detects the media type from its bytes (never the client's content-type) and
 * removes metadata that can carry GPS: EXIF, XMP, IPTC, text chunks, and
 * video user-data. Pure functions, unit-tested in media-strip.test.ts.
 */

export type MediaKind =
  | { mediaType: 'photo'; contentType: 'image/jpeg' | 'image/png' | 'image/webp' }
  | { mediaType: 'video'; contentType: 'video/mp4' | 'video/quicktime' }

const ascii = (b: Uint8Array, at: number, len: number) => String.fromCharCode(...b.subarray(at, at + len))

export function detectMedia(b: Uint8Array): MediaKind | undefined {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mediaType: 'photo', contentType: 'image/jpeg' }
  if (b.length >= 8 && ascii(b, 1, 3) === 'PNG' && b[0] === 0x89) return { mediaType: 'photo', contentType: 'image/png' }
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return { mediaType: 'photo', contentType: 'image/webp' }
  if (b.length >= 12 && ascii(b, 4, 4) === 'ftyp') {
    return { mediaType: 'video', contentType: ascii(b, 8, 4) === 'qt  ' ? 'video/quicktime' : 'video/mp4' }
  }
  return undefined
}

/** JPEG: keep APP0 (JFIF) and image data; drop APP1-APP15 (EXIF, XMP, IPTC...) and comments. */
export function stripJpeg(b: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [b.subarray(0, 2)]
  let i = 2
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) throw new Error('Corrupt JPEG')
    const marker = b[i + 1]
    if (marker === 0xda) {
      out.push(b.subarray(i)) // start of scan: the rest is image data
      return concat(out)
    }
    const len = (b[i + 2] << 8) | b[i + 3]
    const end = i + 2 + len
    if (len < 2 || end > b.length) throw new Error('Corrupt JPEG')
    const isMetadata = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe
    if (!isMetadata) out.push(b.subarray(i, end))
    i = end
  }
  throw new Error('Corrupt JPEG')
}

const PNG_METADATA = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME'])

/** PNG: drop EXIF, text and timestamp chunks. */
export function stripPng(b: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [b.subarray(0, 8)]
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  let i = 8
  while (i + 12 <= b.length) {
    const len = view.getUint32(i)
    const end = i + 12 + len
    if (end > b.length) throw new Error('Corrupt PNG')
    if (!PNG_METADATA.has(ascii(b, i + 4, 4))) out.push(b.subarray(i, end))
    i = end
  }
  return concat(out)
}

/** WebP: drop EXIF and XMP chunks, clear their VP8X flags, fix the RIFF size. */
export function stripWebp(b: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = []
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  let i = 12
  while (i + 8 <= b.length) {
    const len = view.getUint32(i + 4, true)
    const end = i + 8 + len + (len % 2)
    if (i + 8 + len > b.length) throw new Error('Corrupt WebP')
    const type = ascii(b, i, 4)
    if (type !== 'EXIF' && type !== 'XMP ') {
      const chunk = b.slice(i, Math.min(end, b.length))
      if (type === 'VP8X' && chunk.length > 8) chunk[8] &= ~(0x08 | 0x04)
      chunks.push(chunk)
    }
    i = end
  }
  const body = concat(chunks)
  const header = b.slice(0, 12)
  new DataView(header.buffer).setUint32(4, body.length + 4, true)
  return concat([header, body])
}

const CONTAINER_BOXES = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts'])

/**
 * MP4/MOV: rename every `udta` and `meta` box (where phones store GPS, e.g.
 * ©xyz and com.apple.quicktime.location) to `free`, zeroing its contents.
 * Sizes don't change, so sample offsets stay valid. Returns the duration too.
 */
export function stripVideo(input: Uint8Array): { bytes: Uint8Array; durationS: number } {
  const b = input.slice()
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  let durationS = NaN

  const walk = (start: number, end: number) => {
    let i = start
    while (i + 8 <= end) {
      let size = view.getUint32(i)
      let header = 8
      if (size === 1) {
        size = Number(view.getBigUint64(i + 8))
        header = 16
      } else if (size === 0) {
        size = end - i
      }
      if (size < header || i + size > end) throw new Error('Corrupt video')
      const type = ascii(b, i + 4, 4)
      if (type === 'udta' || type === 'meta') {
        b.set([0x66, 0x72, 0x65, 0x65], i + 4) // 'free'
        b.fill(0, i + header, i + size)
      } else if (type === 'mvhd') {
        const v = b[i + header]
        const timescale = view.getUint32(i + header + (v === 1 ? 20 : 12))
        const duration = v === 1 ? Number(view.getBigUint64(i + header + 24)) : view.getUint32(i + header + 16)
        durationS = timescale > 0 ? duration / timescale : NaN
      } else if (CONTAINER_BOXES.has(type)) {
        walk(i + header, i + size)
      }
      i += size
    }
  }
  walk(0, b.length)
  if (!Number.isFinite(durationS)) throw new Error('Video has no duration')
  return { bytes: b, durationS }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}
