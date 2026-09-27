/**
 * Bubble media: upload strips metadata and enforces limits; the file is only
 * served to its uploader, the bubble's author, or someone who popped it.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { APIRequestContext } from '@playwright/test'
import { test, expect, loadAllTestAccounts, type MultiplayerUser } from 'deepspace/testing'

test.skip(
  !['Maya', 'Dev', 'Sam'].every((n) => loadAllTestAccounts().some((a) => a.name === n)),
  'Needs the Maya, Dev and Sam test accounts',
)

const LERNER = { lat: 40.8069, lng: -73.964 }
const SECRET = 'GPS+40.8069-073.9640'

function ownerJwt(): string | undefined {
  try {
    const devVars = readFileSync(fileURLToPath(new URL('../.dev.vars', import.meta.url)), 'utf8')
    return devVars.match(/^APP_OWNER_JWT="?([^"\n]+)"?$/m)?.[1]
  } catch {
    return undefined
  }
}

async function tokenFor(user: MultiplayerUser): Promise<string> {
  const { token } = (await (await user.page.request.post('/api/auth/token')).json()) as { token: string }
  return token
}

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]

function jpegWithGps(): Buffer {
  const exif = [...ascii('Exif\0\0'), ...ascii(SECRET)]
  return Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0, exif.length + 2, ...exif, 0xff, 0xda, 0, 2, 1, 2, 3, 0xff, 0xd9])
}

function mp4(seconds: number): Buffer {
  const box = (type: string, payload: number[]) => [...u32(payload.length + 8), ...ascii(type), ...payload]
  const mvhd = box('mvhd', [0, 0, 0, 0, ...u32(0), ...u32(0), ...u32(1000), ...u32(seconds * 1000)])
  const trak = box('trak', box('mdia', box('hdlr', [0, 0, 0, 0, ...u32(0), ...ascii('vide'), ...u32(0)])))
  return Buffer.from([...box('ftyp', ascii('isom')), ...box('moov', [...mvhd, ...trak, ...box('udta', ascii(SECRET))]), ...box('mdat', [1, 2, 3])])
}

const VOICE_NOTE = readFileSync(fileURLToPath(new URL('./fixtures/voice-note.m4a', import.meta.url)))

function upload(request: APIRequestContext, token: string | undefined, name: string, mimeType: string, buffer: Buffer) {
  return request.post('/api/media/upload', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    multipart: { file: { name, mimeType, buffer } },
  })
}

const getMedia = (request: APIRequestContext, token: string, url: string) =>
  request.get(url, { headers: { Authorization: `Bearer ${token}` } })

test('media upload: sign-in, type and length checks, metadata stripped', async ({ users, request }) => {
  const [maya] = await users(['Maya'])
  const token = await tokenFor(maya)

  expect((await upload(request, undefined, 'a.jpg', 'image/jpeg', jpegWithGps())).status()).toBe(401)
  expect(await (await upload(request, token, 'x.svg', 'image/jpeg', Buffer.from('<svg/>'))).json()).toMatchObject({ success: false })
  expect(await (await upload(request, token, 'long.mp4', 'video/mp4', mp4(20))).json()).toMatchObject({
    success: false,
    error: expect.stringContaining('15 seconds'),
  })

  const video = await (await upload(request, token, 'short.mp4', 'video/mp4', mp4(10))).json()
  expect(video).toMatchObject({ success: true, data: { mediaType: 'video' } })
  const videoBytes = await (await getMedia(request, token, `/api/media/${video.data.uploadId}`)).body()
  expect(videoBytes.toString('latin1')).not.toContain(SECRET)

  const photo = await (await upload(request, token, 'p.jpg', 'image/jpeg', jpegWithGps())).json()
  expect(photo).toMatchObject({ success: true, data: { mediaType: 'photo' } })
  const res = await getMedia(request, token, `/api/media/${photo.data.uploadId}`)
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toBe('image/jpeg')
  const bytes = await res.body()
  expect(bytes.toString('latin1')).not.toContain(SECRET)
  expect(bytes.toString('latin1')).not.toContain('Exif')

  const voice = await (await upload(request, token, 'voice.m4a', 'audio/mp4', VOICE_NOTE)).json()
  expect(voice).toMatchObject({ success: true, data: { mediaType: 'audio' } })
  const voiceRes = await getMedia(request, token, `/api/media/${voice.data.uploadId}`)
  expect(voiceRes.headers()['content-type']).toBe('audio/mp4')
  expect((await voiceRes.body()).length).toBe(VOICE_NOTE.length)

  const soundOnly = (seconds: number) => Buffer.from(mp4(seconds).toString('latin1').replace('vide', 'soun'), 'latin1')
  expect(await (await upload(request, token, 'long.m4a', 'audio/mp4', soundOnly(40))).json()).toMatchObject({
    success: false,
    error: expect.stringContaining('30 seconds'),
  })
  expect(await (await upload(request, token, 'ok.m4a', 'audio/mp4', soundOnly(25))).json()).toMatchObject({
    success: true,
    data: { mediaType: 'audio' },
  })
})

test('media is served only to the uploader, the author, and people who popped the bubble', async ({ users, request }) => {
  const jwt = ownerJwt()
  test.skip(!jwt, 'No APP_OWNER_JWT in .dev.vars')
  const [maya, dev, sam] = await users(['Maya', 'Dev', 'Sam'])
  const [mayaToken, devToken, samToken] = await Promise.all([tokenFor(maya), tokenFor(dev), tokenFor(sam)])

  // Dev uploads (standing in for whoever prepares seed media); Maya authors the bubble.
  const photo = await (await upload(request, devToken, 'p.jpg', 'image/jpeg', jpegWithGps())).json()
  const mediaUrl = `/api/media/${photo.data.uploadId}`
  expect((await getMedia(request, samToken, mediaUrl)).status()).toBe(404)

  const bubbleId = `seed-test-media-${Date.now()}`
  const seed = await request.post('/api/actions/importSeedBubbles', {
    headers: { Authorization: `Bearer ${jwt}` },
    data: {
      bubbles: [
        { id: bubbleId, authorId: maya.userId, title: '__test__', text: '__test__', placeName: 'test', category: 'Misc', mediaUrl, mediaType: 'photo', ...LERNER },
      ],
    },
  })
  expect(await seed.json()).toMatchObject({ success: true })

  expect((await getMedia(request, devToken, mediaUrl)).status()).toBe(200) // uploader
  expect((await getMedia(request, mayaToken, mediaUrl)).status()).toBe(200) // author
  expect((await getMedia(request, samToken, mediaUrl)).status()).toBe(404) // hasn't popped

  const pop = await request.post('/api/actions/canPop', {
    headers: { Authorization: `Bearer ${samToken}` },
    data: { userLat: LERNER.lat, userLng: LERNER.lng, bubbleId },
  })
  expect(await pop.json()).toMatchObject({ success: true, data: { ok: true, bubble: { mediaUrl, mediaType: 'photo' } } })
  expect((await getMedia(request, samToken, mediaUrl)).status()).toBe(200)

  expect((await getMedia(request, samToken, '/api/media/does-not-exist')).status()).toBe(404)
  expect((await request.get(mediaUrl)).status()).toBe(401)
})
