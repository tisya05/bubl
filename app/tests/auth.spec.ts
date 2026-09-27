/**
 * Onboarding backend: getMe (splash decides map vs onboarding), claimHandle,
 * savePreferences, handles shown to other users, and demo sign-in.
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
const devVars = () => readFileSync(fileURLToPath(new URL('../.dev.vars', import.meta.url)), 'utf8')
const ownerJwt = () => devVars().match(/^APP_OWNER_JWT="?([^"\n]+)"?$/m)?.[1]

async function tokenFor(user: MultiplayerUser): Promise<string> {
  const { token } = (await (await user.page.request.post('/api/auth/token')).json()) as { token: string }
  return token
}

async function call(request: APIRequestContext, name: string, token: string | undefined, params: object = {}) {
  const res = await request.post(`/api/actions/${name}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    data: params,
  })
  return { status: res.status(), body: await res.json() }
}

test('onboarding: getMe, claimHandle, savePreferences, and handles shown to others', async ({ users, request }) => {
  const jwt = ownerJwt()
  test.skip(!jwt, 'No APP_OWNER_JWT in .dev.vars')
  const [maya, sam] = await users(['Maya', 'Sam'])
  const [mayaToken, samToken] = await Promise.all([tokenFor(maya), tokenFor(sam)])

  expect((await call(request, 'getMe', undefined)).status).toBe(401)
  expect((await call(request, 'setupDemoProfiles', samToken)).body).toMatchObject({ success: false, error: expect.stringContaining('owner') })
  expect((await call(request, 'setupDemoProfiles', jwt)).body).toMatchObject({ success: true })
  expect((await call(request, 'getMe', mayaToken)).body).toMatchObject({
    success: true,
    data: { userId: maya.userId, handle: 'maya', onboarded: true, notificationsEnabled: true },
  })

  // Sam goes through onboarding again under a temporary handle.
  const temp = `sam_${Date.now().toString(36).slice(-8)}`
  expect((await call(request, 'claimHandle', samToken, { handle: 'Bad Name!' })).body).toMatchObject({ data: { ok: false, reason: expect.stringContaining('3 to 20') } })
  expect((await call(request, 'claimHandle', samToken, { handle: '@MAYA' })).body).toMatchObject({ data: { ok: false, reason: 'That handle is taken' } })
  expect((await call(request, 'claimHandle', samToken, { handle: `@${temp.toUpperCase()}` })).body).toMatchObject({
    success: true,
    data: { ok: true, me: { handle: temp } },
  })
  expect((await call(request, 'claimHandle', mayaToken, { handle: temp })).body).toMatchObject({ data: { ok: false, reason: 'That handle is taken' } })
  expect((await call(request, 'savePreferences', samToken, { notificationsEnabled: 'yes', locationEnabled: true })).body).toMatchObject({ success: false })
  expect((await call(request, 'savePreferences', samToken, { notificationsEnabled: false, locationEnabled: true })).body).toMatchObject({
    success: true,
    data: { handle: temp, notificationsEnabled: false, locationEnabled: true, onboarded: true },
  })

  // Switching back frees the temporary handle.
  expect((await call(request, 'claimHandle', samToken, { handle: 'sam' })).body).toMatchObject({ data: { ok: true } })
  expect((await call(request, 'claimHandle', mayaToken, { handle: temp })).body).toMatchObject({ data: { ok: true } })
  expect((await call(request, 'claimHandle', mayaToken, { handle: 'maya' })).body).toMatchObject({ data: { ok: true } })

  // Other people see the handle, not the account name.
  const bubbleId = `seed-test-handle-${Date.now()}`
  const seeded = await call(request, 'importSeedBubbles', jwt, {
    bubbles: [{ id: bubbleId, authorId: maya.userId, title: '__test__', text: '__test__', placeName: 'test', category: 'Misc', ...LERNER }],
  })
  expect(seeded.body).toMatchObject({ success: true })
  const pop = await call(request, 'canPop', samToken, { userLat: LERNER.lat, userLng: LERNER.lng, bubbleId })
  expect(pop.body).toMatchObject({ success: true, data: { ok: true, author: { id: maya.userId, name: '@maya' } } })
})

test('demo sign-in signs in as a demo account and stays signed in; bad input is refused', async ({ playwright, baseURL }) => {
  test.skip(!/^DEMO_PASSWORD_DEV=/m.test(devVars()), 'No DEMO_PASSWORD_DEV in .dev.vars')
  const ctx = await playwright.request.newContext({ baseURL })
  try {
    expect((await ctx.post('/api/demo/sign-in', { data: { as: 'root' } })).status()).toBe(400)
    const signedIn = await ctx.post('/api/demo/sign-in', { data: { as: 'Dev' } })
    expect(await signedIn.json()).toMatchObject({ success: true })

    // The session cookie alone is enough: this is what a returning user has when they reopen the app.
    const tokenRes = await ctx.post('/api/auth/token')
    const { token } = (await tokenRes.json()) as { token?: string }
    expect(token).toBeTruthy()
    const dev = loadAllTestAccounts().find((a) => a.name === 'Dev')!
    expect((await call(ctx, 'getMe', token)).body).toMatchObject({ success: true, data: { userId: dev.userId, handle: 'dev', onboarded: true } })
  } finally {
    await ctx.dispose()
  }
})
