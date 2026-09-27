/**
 * canPop: sealed content only comes back within the bubble's radius, and a pop
 * is recorded once per user. Same setup as bubl.spec.ts: needs the Maya and Dev
 * test accounts and the app-owner JWT in .dev.vars (to seed a bubble).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { APIRequestContext } from '@playwright/test'
import { test, expect, loadAllTestAccounts, type MultiplayerUser } from 'deepspace/testing'

const hasDemoAccounts = ['Maya', 'Dev'].every((name) =>
  loadAllTestAccounts().some((account) => account.name === name),
)
test.skip(!hasDemoAccounts, 'Needs the Maya and Dev test accounts (see npx deepspace test accounts list)')

const LERNER = { lat: 40.8069, lng: -73.964 }
const BUBBLE_ID = 'test-can-pop'

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

test('canPop requires sign-in', async ({ request }) => {
  const res = await callAction(request, 'canPop', undefined, { userLat: LERNER.lat, userLng: LERNER.lng, bubbleId: BUBBLE_ID })
  expect(res.status()).toBe(401)
})

test('canPop keeps content sealed until the caller is inside the radius', async ({ users, request }) => {
  const jwt = ownerJwt()
  test.skip(!jwt, 'No APP_OWNER_JWT in .dev.vars')
  const [maya, dev] = await users(['Maya', 'Dev'])

  const seed = await callAction(request, 'importSeedBubbles', jwt, {
    bubbles: [
      {
        id: BUBBLE_ID,
        authorId: maya.userId ?? 'maya',
        title: '__test__ sealed title',
        text: '__test__ sealed text',
        placeName: 'Broadway & 115th St',
        category: 'Misc',
        ...LERNER,
        popRadiusM: 15,
      },
    ],
  })
  expect(await seed.json()).toMatchObject({ success: true })

  const token = await tokenFor(dev)

  // About 50 m north: too far for a 15 m bubble, and nothing sealed leaks.
  const far = await callAction(dev.page.request, 'canPop', token, {
    userLat: LERNER.lat + 50 / 111_195,
    userLng: LERNER.lng,
    bubbleId: BUBBLE_ID,
  })
  const farBody = (await far.json()) as { success: boolean; data: Record<string, unknown> }
  expect(farBody).toMatchObject({ success: true, data: { ok: false, reason: 'too_far' } })
  expect(farBody.data.distanceM).toBeGreaterThan(15)
  expect(JSON.stringify(farBody)).not.toContain('__test__ sealed')

  // Standing on it: content and author come back, twice without error (idempotent pop).
  for (let i = 0; i < 2; i++) {
    const near = await callAction(dev.page.request, 'canPop', token, {
      userLat: LERNER.lat,
      userLng: LERNER.lng,
      bubbleId: BUBBLE_ID,
    })
    expect(await near.json()).toMatchObject({
      success: true,
      data: { ok: true, bubble: { id: BUBBLE_ID, text: '__test__ sealed text' }, author: { id: maya.userId ?? 'maya' } },
    })
  }

  // Popping again doesn't create a second pop: the server says so.
  const again = await callAction(dev.page.request, 'canPop', token, { userLat: LERNER.lat, userLng: LERNER.lng, bubbleId: BUBBLE_ID })
  expect(await again.json()).toMatchObject({ success: true, data: { ok: true, alreadyPopped: true } })

  // The map marks it popped for Dev, and not for Maya, who wrote it (it's hers instead).
  const devNear = (await (await callAction(dev.page.request, 'nearbyBubbles', token, { ...LERNER, radiusM: 100 })).json()) as {
    data: { id: string; popped?: boolean; mine?: boolean }[]
  }
  expect(devNear.data.find((b) => b.id === BUBBLE_ID)).toMatchObject({ popped: true })
  const mayaToken = await tokenFor(maya)
  const mayaNear = (await (await callAction(maya.page.request, 'nearbyBubbles', mayaToken, { ...LERNER, radiusM: 100 })).json()) as {
    data: { id: string; popped?: boolean; mine?: boolean }[]
  }
  expect(mayaNear.data.find((b) => b.id === BUBBLE_ID)).toMatchObject({ mine: true })
  expect(mayaNear.data.find((b) => b.id === BUBBLE_ID)?.popped).toBeUndefined()

  const missing = await callAction(dev.page.request, 'canPop', token, {
    userLat: LERNER.lat,
    userLng: LERNER.lng,
    bubbleId: 'test-does-not-exist',
  })
  expect(await missing.json()).toMatchObject({ success: true, data: { ok: false, reason: 'not_found' } })
})

test('canPop rejects bad input', async ({ users }) => {
  const [dev] = await users(['Dev'])
  const res = await callAction(dev.page.request, 'canPop', await tokenFor(dev), { userLat: 'north' })
  expect(await res.json()).toMatchObject({ success: false })
})
