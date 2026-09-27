/**
 * dropBubble: validation, the PII pre-check, and a clean drop reaching the map.
 * Gemini's own verdicts aren't asserted here: without GEMINI_API_KEY the drop is
 * saved as 'unchecked', with it as 'passed'. Needs the Dev test account.
 */
import { readFileSync } from 'node:fs'
import { test, expect, loadAllTestAccounts, type MultiplayerUser } from 'deepspace/testing'
import type { APIRequestContext } from '@playwright/test'

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url))

test.skip(
  !loadAllTestAccounts().some((account) => account.name === 'Dev'),
  'Needs the Dev test account (see npx deepspace test accounts list)',
)

const LERNER = { lat: 40.8069, lng: -73.964 }
const base = { ...LERNER, placeName: 'Broadway & 115th St', floatsFor: '1w' }

async function tokenFor(user: MultiplayerUser): Promise<string> {
  const res = await user.page.request.post('/api/auth/token')
  expect(res.ok()).toBeTruthy()
  const { token } = (await res.json()) as { token?: string }
  expect(token).toBeTruthy()
  return token as string
}

function callAction(request: APIRequestContext, name: string, token: string | undefined, params: object) {
  return request.post(`/api/actions/${name}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    data: params,
  })
}

test('dropBubble requires sign-in', async ({ request }) => {
  const res = await callAction(request, 'dropBubble', undefined, { ...base, text: 'hello' })
  expect(res.status()).toBe(401)
})

test('dropBubble rejects bad input', async ({ users }) => {
  const [dev] = await users(['Dev'])
  const token = await tokenFor(dev)
  for (const params of [
    { ...base, text: '' },
    { ...base, text: 'x', floatsFor: 'forever-ish' },
    { ...base, text: 'x', category: 'Nightclub' },
    { ...base, text: 'x', lat: 'north' },
  ]) {
    expect(await (await callAction(dev.page.request, 'dropBubble', token, params)).json()).toMatchObject({ success: false })
  }
})

test('dropBubble blocks personal info before it is saved', async ({ users }) => {
  const [dev] = await users(['Dev'])
  const token = await tokenFor(dev)
  const res = await callAction(dev.page.request, 'dropBubble', token, {
    ...base,
    text: '__test__ text me at 212-555-0123 for the spare key',
  })
  const body = (await res.json()) as { success: boolean; data: { ok: boolean; reasons: string[] } }
  expect(body).toMatchObject({ success: true, data: { ok: false } })
  expect(body.data.reasons.join(' ')).toMatch(/phone/i)
})

test('a clean drop is saved and shows on the map as a preview', async ({ users }) => {
  const [dev] = await users(['Dev'])
  const token = await tokenFor(dev)
  const res = await callAction(dev.page.request, 'dropBubble', token, {
    ...base,
    title: '__test__ steps',
    text: '__test__ the steps are warm in the afternoon sun',
    category: 'Misc',
  })
  const body = (await res.json()) as {
    success: boolean
    data: { ok: boolean; bubble: { id: string; authorId: string; expiresAt?: string; moderation: string } }
  }
  expect(body).toMatchObject({ success: true, data: { ok: true, bubble: { title: '__test__ steps', category: 'Misc' } } })
  expect(['passed', 'unchecked']).toContain(body.data.bubble.moderation)
  expect(body.data.bubble.expiresAt).toBeTruthy()

  const near = await callAction(dev.page.request, 'nearbyBubbles', token, { ...LERNER, radiusM: 200 })
  const previews = ((await near.json()) as { data: Record<string, unknown>[] }).data
  const preview = previews.find((b) => b.id === body.data.bubble.id)
  expect(preview).toMatchObject({ placeName: 'Broadway & 115th St', category: 'Misc' })
  expect(preview).not.toHaveProperty('text')
})

// A real 16x16 orange JPEG; Gemini rejects stub bytes that aren't a decodable image.
test('with Gemini configured, dropBubble moderates: clean passes, hateful is rejected and never saved', async ({ users }) => {
  test.skip(!process.env.GEMINI_API_KEY, 'Needs GEMINI_API_KEY in the test environment')
  const [dev] = await users(['Dev'])
  const token = await tokenFor(dev)

  const clean = await callAction(dev.page.request, 'dropBubble', token, {
    ...base,
    text: '__test__ go down the steps at sunset, the river turns gold',
  })
  expect(await clean.json()).toMatchObject({ success: true, data: { ok: true, bubble: { moderation: 'passed' } } })

  const hateful = await callAction(dev.page.request, 'dropBubble', token, {
    ...base,
    text: '__test__ immigrants should be kept out of this park, it was better before they came',
  })
  const body = (await hateful.json()) as { success: boolean; data: { ok: boolean; reasons: string[]; bubble?: unknown } }
  expect(body).toMatchObject({ success: true, data: { ok: false } })
  expect(body.data.reasons.length).toBeGreaterThan(0)
  expect(body.data.bubble).toBeUndefined()
})

const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAEKADAAQAAAABAAAAEAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAEAAQAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A6yiiiv57P6sP/9k=',
  'base64',
)

async function uploadPhoto(request: APIRequestContext, token: string): Promise<string> {
  const res = await request.post('/api/media/upload', {
    headers: { Authorization: `Bearer ${token}` },
    multipart: { file: { name: 'p.jpg', mimeType: 'image/jpeg', buffer: TINY_JPEG } },
  })
  const body = (await res.json()) as { success: boolean; data: { uploadId: string; mediaType: string } }
  expect(body).toMatchObject({ success: true, data: { mediaType: 'photo' } })
  return body.data.uploadId
}

test('a photo drop: upload, drop, sealed until popped, then served', async ({ users }) => {
  test.skip(!loadAllTestAccounts().some((a) => a.name === 'Sam'), 'Needs the Sam test account')
  const [dev, sam] = await users(['Dev', 'Sam'])
  const [devToken, samToken] = await Promise.all([tokenFor(dev), tokenFor(sam)])
  const photo = { ...base, title: '__test__ photo', text: '__test__ the mural behind the deli', category: 'Street' }

  const uploadId = await uploadPhoto(dev.page.request, devToken)
  const res = await callAction(dev.page.request, 'dropBubble', devToken, {
    ...photo,
    uploadId,
    frameBase64: [TINY_JPEG.toString('base64')],
  })
  const body = (await res.json()) as { success: boolean; data: { ok: boolean; bubble: { id: string; mediaUrl: string } } }
  expect(body).toMatchObject({ success: true, data: { ok: true, bubble: { mediaUrl: `/api/media/${uploadId}`, mediaType: 'photo' } } })
  const { id: bubbleId, mediaUrl } = body.data.bubble

  const reused = await callAction(dev.page.request, 'dropBubble', devToken, { ...photo, uploadId })
  expect(await reused.json()).toMatchObject({ success: false, error: expect.stringContaining('already attached') })
  const notMine = await callAction(sam.page.request, 'dropBubble', samToken, { ...photo, uploadId: await uploadPhoto(dev.page.request, devToken) })
  expect(await notMine.json()).toMatchObject({ success: false, error: 'Upload not found' })

  const near = await callAction(sam.page.request, 'nearbyBubbles', samToken, { ...LERNER, radiusM: 200 })
  const preview = ((await near.json()) as { data: Record<string, unknown>[] }).data.find((b) => b.id === bubbleId)
  expect(preview).toBeTruthy()
  expect(preview).not.toHaveProperty('mediaUrl')

  const getMedia = (token: string) => sam.page.request.get(mediaUrl, { headers: { Authorization: `Bearer ${token}` } })
  expect((await getMedia(samToken)).status()).toBe(404)
  const pop = await callAction(sam.page.request, 'canPop', samToken, { userLat: LERNER.lat, userLng: LERNER.lng, bubbleId })
  expect(await pop.json()).toMatchObject({ success: true, data: { ok: true, bubble: { mediaUrl, mediaType: 'photo' } } })
  const served = await getMedia(samToken)
  expect(served.status()).toBe(200)
  expect(served.headers()['content-type']).toBe('image/jpeg')
})

async function uploadVoiceNote(request: APIRequestContext, token: string, file: string): Promise<string> {
  const res = await request.post('/api/media/upload', {
    headers: { Authorization: `Bearer ${token}` },
    multipart: { file: { name: file, mimeType: 'audio/mp4', buffer: fixture(file) } },
  })
  const body = (await res.json()) as { success: boolean; data: { uploadId: string } }
  expect(body).toMatchObject({ success: true, data: { mediaType: 'audio' } })
  return body.data.uploadId
}

test('a voice-note drop with no text: sealed until popped, then speak plays the recording', async ({ users }) => {
  test.skip(!loadAllTestAccounts().some((a) => a.name === 'Sam'), 'Needs the Sam test account')
  const [dev, sam] = await users(['Dev', 'Sam'])
  const [devToken, samToken] = await Promise.all([tokenFor(dev), tokenFor(sam)])

  const uploadId = await uploadVoiceNote(dev.page.request, devToken, 'voice-note.m4a')
  const res = await callAction(dev.page.request, 'dropBubble', devToken, { ...base, uploadId })
  const body = (await res.json()) as { success: boolean; data: { ok: boolean; bubble: { id: string; mediaUrl: string; title: string } } }
  expect(body).toMatchObject({ success: true, data: { ok: true, bubble: { mediaUrl: `/api/media/${uploadId}`, mediaType: 'audio', text: '' } } })
  expect(body.data.bubble.title.length).toBeGreaterThan(0)
  const { id: bubbleId, mediaUrl } = body.data.bubble

  expect(await (await callAction(sam.page.request, 'speak', samToken, { bubbleId })).json()).toMatchObject({ success: false })
  const pop = await callAction(sam.page.request, 'canPop', samToken, { userLat: LERNER.lat, userLng: LERNER.lng, bubbleId })
  expect(await pop.json()).toMatchObject({ success: true, data: { ok: true, bubble: { mediaUrl, mediaType: 'audio' } } })

  const spoken = await callAction(sam.page.request, 'speak', samToken, { bubbleId })
  expect(await spoken.json()).toMatchObject({ success: true, data: { audioUrl: mediaUrl } })
  const served = await sam.page.request.get(mediaUrl, { headers: { Authorization: `Bearer ${samToken}` } })
  expect(served.status()).toBe(200)
  expect(served.headers()['content-type']).toBe('audio/mp4')
})

test('with Gemini configured, a voice note full of swearing is rejected and never saved', async ({ users }) => {
  test.skip(!process.env.GEMINI_API_KEY, 'Needs GEMINI_API_KEY in the test environment')
  const [dev] = await users(['Dev'])
  const token = await tokenFor(dev)
  const uploadId = await uploadVoiceNote(dev.page.request, token, 'voice-note-profanity.m4a')
  const res = await callAction(dev.page.request, 'dropBubble', token, { ...base, uploadId })
  const body = (await res.json()) as { success: boolean; data: { ok: boolean; reasons: string[]; bubble?: unknown } }
  expect(body).toMatchObject({ success: true, data: { ok: false } })
  expect(body.data.reasons.length).toBeGreaterThan(0)
  expect(body.data.bubble).toBeUndefined()
})
