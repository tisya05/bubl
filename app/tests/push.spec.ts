/**
 * Web Push actions against the real local backend: the public key is served,
 * only real push-service endpoints are saved, pushNearby only fires inside an
 * unpopped bubble, and a dead endpoint never breaks anything. (A real delivery
 * needs a phone; see src/server/webpush.test.ts for the encryption itself.)
 * Needs the Maya and Dev test accounts, the app-owner JWT in .dev.vars, and the
 * VAPID secrets (restart `deepspace dev` after setting them).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { APIRequestContext } from '@playwright/test'
import { test, expect, loadAllTestAccounts, type MultiplayerUser } from 'deepspace/testing'

test.skip(
  !['Maya', 'Dev'].every((name) => loadAllTestAccounts().some((account) => account.name === name)),
  'Needs the Maya and Dev test accounts (see npx deepspace test accounts list)',
)

// Well away from the other test bubbles.
const SPOT = { lat: 40.8155, lng: -73.9585 }
const BUBBLE = {
  id: `seed-test-push-${Date.now()}`,
  title: '__test__ push bubble',
  text: '__test__ push text',
  placeName: 'Amsterdam & 125th St',
  category: 'Park',
  popRadiusM: 20,
  ...SPOT,
}
// Shaped like a real subscription; FCM rejects it, which is the "dead endpoint" case.
const FAKE_SUB = {
  endpoint: `https://fcm.googleapis.com/fcm/send/test-${Date.now()}`,
  p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
}

function ownerJwt(): string | undefined {
  try {
    const devVars = readFileSync(fileURLToPath(new URL('../.dev.vars', import.meta.url)), 'utf8')
    return devVars.match(/^APP_OWNER_JWT="?([^"\n]+)"?$/m)?.[1]
  } catch {
    return undefined
  }
}

async function tokenFor(user: MultiplayerUser): Promise<string> {
  const res = await user.page.request.post('/api/auth/token')
  const { token } = (await res.json()) as { token?: string }
  expect(token).toBeTruthy()
  return token as string
}

async function call(request: APIRequestContext, name: string, token: string | undefined, params: object = {}) {
  const res = await request.post(`/api/actions/${name}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, data: params })
  return { status: res.status(), body: (await res.json().catch(() => ({}))) as { success: boolean; data?: Record<string, unknown>; error?: string } }
}

test('push actions require sign-in', async ({ request }) => {
  expect((await call(request, 'savePushSubscription', undefined, FAKE_SUB)).status).toBe(401)
  expect((await call(request, 'pushNearby', undefined, { bubbleId: 'x', lat: 0, lng: 0 })).status).toBe(401)
})

test('subscribe, then nearby pushes only fire inside an unpopped bubble', async ({ users, request }) => {
  const jwt = ownerJwt()
  test.skip(!jwt, 'No APP_OWNER_JWT in .dev.vars')
  const [maya, dev] = await users(['Maya', 'Dev'])
  const token = await tokenFor(dev)

  const key = await call(request, 'getPushKey', token)
  expect(key.body.success, key.body.error).toBe(true)
  expect(key.body.data?.publicKey).toMatch(/^[A-Za-z0-9_-]{87}$/)

  // Only real push services.
  const evil = await call(request, 'savePushSubscription', token, { ...FAKE_SUB, endpoint: 'https://evil.example/push' })
  expect(evil.body).toMatchObject({ success: false })
  const badKeys = await call(request, 'savePushSubscription', token, { ...FAKE_SUB, auth: 'short' })
  expect(badKeys.body).toMatchObject({ success: false })
  const saved = await call(request, 'savePushSubscription', token, FAKE_SUB)
  expect(saved.body).toMatchObject({ success: true, data: { saved: true } })

  const seed = await call(request, 'importSeedBubbles', jwt, { bubbles: [{ ...BUBBLE, authorId: maya.userId ?? 'maya' }] })
  expect(seed.body).toMatchObject({ success: true })

  // 200 m away: no push attempted.
  const far = await call(request, 'pushNearby', token, { bubbleId: BUBBLE.id, lat: SPOT.lat + 200 / 111_195, lng: SPOT.lng })
  expect(far.body).toMatchObject({ success: true, data: { pushed: 0 } })

  // Inside: a push is attempted; FCM rejects the fake endpoint, and the action still succeeds.
  const inside = await call(request, 'pushNearby', token, { bubbleId: BUBBLE.id, lat: SPOT.lat, lng: SPOT.lng })
  expect(inside.body).toMatchObject({ success: true, data: { pushed: 0 } })

  // After popping it, no more nearby pushes for it.
  const popped = await call(request, 'canPop', token, { bubbleId: BUBBLE.id, userLat: SPOT.lat, userLng: SPOT.lng })
  expect(popped.body).toMatchObject({ success: true, data: { ok: true } })
  const again = await call(request, 'pushNearby', token, { bubbleId: BUBBLE.id, lat: SPOT.lat, lng: SPOT.lng })
  expect(again.body).toMatchObject({ success: true, data: { pushed: 0 } })

  // Loving it notifies Maya (feed + push) and still succeeds.
  const loved = await call(request, 'loveBubble', token, { bubbleId: BUBBLE.id })
  expect(loved.body).toMatchObject({ success: true, data: { loved: true } })

  // Wave, wave back (match), message: each notifies the other person and still succeeds.
  const mayaToken = await tokenFor(maya)
  const wave = await call(request, 'sendWave', mayaToken, { toUserId: dev.userId, bubbleId: BUBBLE.id, note: 'glad you found it' })
  expect(wave.body).toMatchObject({ success: true, data: { matched: false } })
  const back = await call(request, 'sendWave', token, { toUserId: maya.userId, bubbleId: BUBBLE.id })
  expect(back.body).toMatchObject({ success: true, data: { matched: true } })
  const chatId = back.body.data?.chatId as string
  const message = await call(request, 'sendMessage', token, { chatId, text: '__test__ hi from push spec' })
  expect(message.body).toMatchObject({ success: true })

  // bubl is open on Dev's phone: Maya's message isn't pushed there (the app shows its own banner).
  // Pushing to the fake endpoint would get it rejected and deleted, so the row surviving shows the push was skipped.
  expect((await call(request, 'savePushSubscription', token, FAKE_SUB)).body).toMatchObject({ success: true })
  expect((await call(request, 'setAppOpen', token, { endpoint: FAKE_SUB.endpoint, open: true })).body).toMatchObject({ success: true, data: { saved: true } })
  expect((await call(request, 'sendMessage', mayaToken, { chatId, text: '__test__ while bubl is open' })).body).toMatchObject({ success: true })
  expect((await call(request, 'setAppOpen', token, { endpoint: FAKE_SUB.endpoint, open: false })).body).toMatchObject({ success: true, data: { saved: true } })
  // Someone else can't touch Dev's phone row.
  expect((await call(request, 'setAppOpen', mayaToken, { endpoint: FAKE_SUB.endpoint, open: true })).body).toMatchObject({ success: true, data: { saved: false } })

  const removed = await call(request, 'removePushSubscription', token, { endpoint: FAKE_SUB.endpoint })
  expect(removed.body.success).toBe(true)
})
