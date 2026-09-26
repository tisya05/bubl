/**
 * The seed script (import + reset) against the local server.
 *
 * The reset wipes every pop, wave, chat and message, which would break other
 * spec files running at the same time, so this only runs on request:
 *   BUBL_RESET_TEST=1 npx deepspace test run tests/seed-reset.spec.ts
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { APIRequestContext } from '@playwright/test'
import { test, expect, loadAllTestAccounts, type MultiplayerUser } from 'deepspace/testing'

test.skip(!process.env.BUBL_RESET_TEST, 'Wipes local social data; run alone with BUBL_RESET_TEST=1')
test.skip(!['Maya', 'Dev', 'Sam'].every((n) => loadAllTestAccounts().some((a) => a.name === n)), 'Needs Maya, Dev and Sam')

const APP_DIR = fileURLToPath(new URL('..', import.meta.url))
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const box = (type: string, payload: number[]) => [...u32(payload.length + 8), ...ascii(type), ...payload]
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0, 12, ...ascii('Exif\0\0GPS!'), 0xff, 0xda, 0, 2, 1, 2, 0xff, 0xd9])
const MP4 = Buffer.from([
  ...box('ftyp', ascii('isom')),
  ...box('moov', box('mvhd', [0, 0, 0, 0, ...u32(0), ...u32(0), ...u32(1000), ...u32(8000)])),
  ...box('mdat', [1, 2, 3]),
])

function ownerJwt(): string {
  return readFileSync(join(APP_DIR, '.dev.vars'), 'utf8').match(/^APP_OWNER_JWT="?([^"\n]+)"?$/m)![1]
}

async function tokenFor(user: MultiplayerUser): Promise<string> {
  return ((await (await user.page.request.post('/api/auth/token')).json()) as { token: string }).token
}

function runScript(args: string[], seedDir: string): string {
  return execFileSync('node', ['scripts/seed.ts', ...args], { cwd: APP_DIR, env: { ...process.env, SEED_DIR: seedDir }, encoding: 'utf8' })
}

const act = (request: APIRequestContext, name: string, token: string, params: object = {}) =>
  request.post(`/api/actions/${name}`, { headers: { Authorization: `Bearer ${token}` }, data: params }).then((r) => r.json())

test('seed import, demo activity, then reset keeps only the seed bubbles', async ({ users, request, baseURL }) => {
  test.setTimeout(90_000)
  const [maya, dev, sam] = await users(['Maya', 'Dev', 'Sam'])
  const [mayaToken, devToken, samToken] = await Promise.all([tokenFor(maya), tokenFor(dev), tokenFor(sam)])

  const seedDir = mkdtempSync(join(tmpdir(), 'bubl-seed-e2e-'))
  mkdirSync(join(seedDir, 'media'))
  writeFileSync(join(seedDir, 'media', 'slice.jpg'), JPEG)
  writeFileSync(join(seedDir, 'media', 'river.mp4'), MP4)
  const run = Date.now()
  writeFileSync(
    join(seedDir, 'bubbles.csv'),
    [
      'title,note_text,category,latitude,longitude,place_name,media_file,language,author',
      `E2E slice ${run},"Huge, cheap slice.",Food,40.8036,-73.9645,Broadway & 111th St,slice.jpg,,maya`,
      `E2E sunset ${run},Ven al atardecer.,Park,40.8095,-73.9687,Riverside Dr,river.mp4,es,dev`,
      `E2E steps ${run},Sit here at noon.,Street,40.8061,-73.9632,Low Steps,,,sam`,
    ].join('\n'),
  )
  const ids = [`seed-e2e-slice-${run}`, `seed-e2e-sunset-${run}`, `seed-e2e-steps-${run}`]

  expect(runScript(['import', '--target', baseURL!], seedDir)).toContain('Imported 3 bubble(s)')
  // Re-running uploads nothing new and updates in place.
  const again = runScript(['import', '--target', baseURL!], seedDir)
  expect(again).not.toContain('uploading')
  expect(again).toContain('Imported 3 bubble(s)')

  const near = await act(request, 'nearbyBubbles', samToken, { lat: 40.8061, lng: -73.9632, radiusM: 1000 })
  const nearIds = (near.data as { id: string }[]).map((b) => b.id)
  for (const id of ids) expect(nearIds.filter((x) => x === id)).toHaveLength(1)

  // Demo activity: Sam pops Maya's photo bubble, loves it, they wave and chat.
  const pop = await act(request, 'canPop', samToken, { userLat: 40.8036, userLng: -73.9645, bubbleId: ids[0] })
  expect(pop).toMatchObject({ data: { ok: true, author: { id: maya.userId }, bubble: { mediaType: 'photo', text: 'Huge, cheap slice.' } } })
  const mediaUrl = pop.data.bubble.mediaUrl as string
  expect((await request.get(mediaUrl, { headers: { Authorization: `Bearer ${samToken}` } })).status()).toBe(200)
  const video = await act(request, 'canPop', samToken, { userLat: 40.8095, userLng: -73.9687, bubbleId: ids[1] })
  expect(video).toMatchObject({ data: { ok: true, author: { id: dev.userId }, bubble: { mediaType: 'video', language: 'es' } } })
  await act(request, 'loveBubble', samToken, { bubbleId: ids[0] })
  await act(request, 'sendWave', samToken, { toUserId: maya.userId, bubbleId: ids[0], note: 'love this' })
  const match = await act(request, 'sendWave', mayaToken, { toUserId: sam.userId, bubbleId: ids[0] })
  await act(request, 'sendMessage', samToken, { chatId: match.data.chatId, text: 'hi' })

  // An upload that never became a bubble (an abandoned drop).
  const orphan = await (
    await request.post('/api/media/upload', {
      headers: { Authorization: `Bearer ${devToken}` },
      multipart: { file: { name: 'o.jpg', mimeType: 'image/jpeg', buffer: JPEG } },
    })
  ).json()

  expect(await act(request, 'resetDemo', mayaToken)).toEqual({ success: false, error: 'Forbidden: owner only' })
  expect(runScript(['reset', '--target', baseURL!], seedDir)).toMatch(/Reset .*removed .* Seed bubbles kept\./)

  expect((await act(request, 'myPopped', samToken)).data).toEqual([])
  expect((await act(request, 'myChats', samToken)).data).toEqual([])
  expect((await act(request, 'myChats', mayaToken)).data).toEqual([])
  expect((await act(request, 'incomingWaves', mayaToken)).data).toEqual([])
  expect((await act(request, 'lovedBy', mayaToken, { bubbleId: ids[0] })).data).toEqual([])

  const after = ((await act(request, 'nearbyBubbles', samToken, { lat: 40.8061, lng: -73.9632, radiusM: 1000 })).data as { id: string }[]).map((b) => b.id)
  for (const id of ids) expect(after).toContain(id)
  expect((await request.get(mediaUrl, { headers: { Authorization: `Bearer ${mayaToken}` } })).status()).toBe(200) // seed media kept
  expect((await request.get(mediaUrl, { headers: { Authorization: `Bearer ${samToken}` } })).status()).toBe(404) // Sam's pop is gone
  expect((await request.get(`/api/media/${orphan.data.uploadId}`, { headers: { Authorization: `Bearer ${devToken}` } })).status()).toBe(404)

  // The next judge can pop again from scratch.
  expect(await act(request, 'canPop', samToken, { userLat: 40.8036, userLng: -73.9645, bubbleId: ids[0] })).toMatchObject({ data: { ok: true } })
})
