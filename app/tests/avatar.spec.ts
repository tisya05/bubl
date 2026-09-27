/**
 * Profile avatars: any signed-in user can see another's photo; GPS metadata is
 * stripped; clearing removes the stored file and users.imageUrl.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { APIRequestContext } from '@playwright/test'
import { test, expect, loadAllTestAccounts, type MultiplayerUser } from 'deepspace/testing'

test.skip(
  !['Maya', 'Sam'].every((n) => loadAllTestAccounts().some((a) => a.name === n)),
  'Needs the Maya and Sam test accounts',
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

function jpegWithGps(): Buffer {
  const exif = [...ascii('Exif\0\0'), ...ascii(SECRET)]
  return Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0, exif.length + 2, ...exif, 0xff, 0xda, 0, 2, 1, 2, 3, 0xff, 0xd9])
}

function uploadAvatar(request: APIRequestContext, token: string | undefined, buffer: Buffer) {
  return request.post('/api/media/profile', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    multipart: { file: { name: 'me.jpg', mimeType: 'image/jpeg', buffer } },
  })
}

const getAvatar = (request: APIRequestContext, token: string, url: string) =>
  request.get(url, { headers: { Authorization: `Bearer ${token}` } })

test('avatar upload is visible to other signed-in users and shows up on canPop', async ({ users, request }) => {
  const jwt = ownerJwt()
  test.skip(!jwt, 'No APP_OWNER_JWT in .dev.vars')

  const [maya, sam] = await users(['Maya', 'Sam'])
  const [mayaToken, samToken] = await Promise.all([tokenFor(maya), tokenFor(sam)])

  expect((await uploadAvatar(request, undefined, jpegWithGps())).status()).toBe(401)

  const uploaded = await (await uploadAvatar(request, mayaToken, jpegWithGps())).json()
  expect(uploaded).toMatchObject({ success: true, data: { imageUrl: expect.stringMatching(/^\/api\/media\/profile\//) } })
  const imageUrl = uploaded.data.imageUrl as string

  const forSelf = await getAvatar(request, mayaToken, imageUrl)
  expect(forSelf.status()).toBe(200)
  expect(forSelf.headers()['content-type']).toMatch(/^image\//)
  expect((await forSelf.body()).toString('latin1')).not.toContain(SECRET)

  const forOther = await getAvatar(request, samToken, imageUrl)
  expect(forOther.status()).toBe(200)

  const bubbleId = `seed-test-avatar-${Date.now()}`
  expect(
    (
      await request.post('/api/actions/importSeedBubbles', {
        headers: { Authorization: `Bearer ${jwt}` },
        data: {
          bubbles: [
            {
              id: bubbleId,
              authorId: maya.userId,
              title: '__avatar__',
              text: '__avatar__',
              placeName: 'test',
              category: 'Misc',
              ...LERNER,
            },
          ],
        },
      })
    ).ok(),
  ).toBe(true)

  const pop = await (
    await request.post('/api/actions/canPop', {
      headers: { Authorization: `Bearer ${samToken}` },
      data: { userLat: LERNER.lat, userLng: LERNER.lng, bubbleId },
    })
  ).json()
  expect(pop).toMatchObject({
    success: true,
    data: { ok: true, author: { id: maya.userId, imageUrl: expect.stringMatching(/^\/api\/media\/profile\//) } },
  })

  expect(await (await request.delete('/api/media/profile', { headers: { Authorization: `Bearer ${mayaToken}` } })).json()).toMatchObject({
    success: true,
    data: { imageUrl: null },
  })
  expect((await getAvatar(request, samToken, imageUrl)).status()).toBe(404)
})
