/**
 * speak: real ElevenLabs audio through DeepSpace, only after a pop, cached after
 * the first call. Needs the Maya and Dev test accounts and the app-owner JWT in
 * .dev.vars (to seed a bubble). The first run bills a few characters of TTS to
 * the app owner; later runs reuse the cached audio.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { APIRequestContext } from '@playwright/test'
import { test, expect, loadAllTestAccounts, type MultiplayerUser } from 'deepspace/testing'

test.skip(
  !['Maya', 'Dev'].every((name) => loadAllTestAccounts().some((account) => account.name === name)),
  'Needs the Maya and Dev test accounts (see npx deepspace test accounts list)',
)

const LERNER = { lat: 40.8069, lng: -73.964 }
// Stable, so its audio is generated once and cached across runs.
const BUBBLE_ID = 'seed-test-speak'
// Fresh every run, so nobody has popped it yet (speak refuses before any ElevenLabs call).
const UNPOPPED_ID = `seed-test-speak-unpopped-${Date.now()}`

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
  return token as string
}

function callAction(request: APIRequestContext, name: string, token: string | undefined, params: object) {
  return request.post(`/api/actions/${name}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    data: params,
  })
}

test('speak returns real ElevenLabs audio only after a pop, then reuses it', async ({ users, request }) => {
  const jwt = ownerJwt()
  test.skip(!jwt, 'No APP_OWNER_JWT in .dev.vars')
  const [maya, dev] = await users(['Maya', 'Dev'])

  const base = { authorId: maya.userId ?? 'maya', title: 'Hi', text: 'Welcome to bubl.', placeName: 'Broadway & 115th St', category: 'Misc', ...LERNER }
  const seed = await callAction(request, 'importSeedBubbles', jwt, {
    bubbles: [
      { ...base, id: BUBBLE_ID },
      { ...base, id: UNPOPPED_ID },
    ],
  })
  expect(await seed.json()).toMatchObject({ success: true })

  const devToken = await tokenFor(dev)
  expect(await (await callAction(dev.page.request, 'speak', devToken, { bubbleId: UNPOPPED_ID })).json()).toMatchObject({
    success: false,
    error: 'Pop this bubble first',
  })

  const pop = await callAction(dev.page.request, 'canPop', devToken, { userLat: LERNER.lat, userLng: LERNER.lng, bubbleId: BUBBLE_ID })
  expect(await pop.json()).toMatchObject({ success: true, data: { ok: true } })

  const first = (await (await callAction(dev.page.request, 'speak', devToken, { bubbleId: BUBBLE_ID })).json()) as {
    success: boolean
    error?: string
    data?: { audioUrl: string }
  }
  expect(first.success, first.error).toBe(true)
  expect(first.data?.audioUrl).toMatch(/^data:audio\//)

  const again = (await (await callAction(dev.page.request, 'speak', devToken, { bubbleId: BUBBLE_ID })).json()) as {
    data?: { audioUrl: string }
  }
  expect(again.data?.audioUrl).toBe(first.data?.audioUrl)
})
