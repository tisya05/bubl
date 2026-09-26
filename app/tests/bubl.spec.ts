/**
 * bubl server actions: saveBubble (via importSeedBubbles) and nearbyBubbles.
 *
 * Needs the two demo test accounts (Maya, Dev) and the app-owner JWT that
 * `deepspace dev` / `deepspace test` write to .dev.vars.
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
const SEALED_FIELDS = ['title', 'text', 'mediaUrl', 'audioUrl', 'authorId']

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

test('bubl actions require sign-in', async ({ request }) => {
  const res = await callAction(request, 'nearbyBubbles', undefined, { ...LERNER, radiusM: 500 })
  expect(res.status()).toBe(401)
})

test('non-importers cannot import seed bubbles', async ({ users }) => {
  const [maya] = await users(['Maya'])
  const res = await callAction(maya.page.request, 'importSeedBubbles', await tokenFor(maya), {
    bubbles: [{ title: 'x', text: 'x', placeName: 'x', category: 'Misc', lat: 0, lng: 0, authorId: 'x' }],
  })
  expect(await res.json()).toMatchObject({ success: false, error: 'Forbidden: seed importers only' })
})

test('nearbyBubbles rejects bad input', async ({ users }) => {
  const [dev] = await users(['Dev'])
  const res = await callAction(dev.page.request, 'nearbyBubbles', await tokenFor(dev), { lat: 'north' })
  expect(await res.json()).toMatchObject({ success: false })
})

test('a seeded bubble reaches nearbyBubbles as a preview only', async ({ users, request }) => {
  const jwt = ownerJwt()
  test.skip(!jwt, 'No APP_OWNER_JWT in .dev.vars')
  const [maya, dev] = await users(['Maya', 'Dev'])

  const seed = await callAction(request, 'importSeedBubbles', jwt, {
    bubbles: [
      {
        id: 'seed-test-lerner',
        authorId: maya.userId ?? 'maya',
        title: '__test__ Lerner steps',
        text: '__test__ sealed text',
        placeName: 'Broadway & 115th St',
        category: 'Misc',
        ...LERNER,
        popRadiusM: 60,
      },
    ],
  })
  expect(await seed.json()).toMatchObject({ success: true, data: { imported: 1 } })

  const near = await callAction(dev.page.request, 'nearbyBubbles', await tokenFor(dev), { ...LERNER, radiusM: 500 })
  const body = (await near.json()) as { success: boolean; data: Record<string, unknown>[] }
  expect(body.success).toBe(true)

  const preview = body.data.find((b) => b.id === 'seed-test-lerner')
  expect(preview).toMatchObject({ placeName: 'Broadway & 115th St', category: 'Misc', popRadiusM: 60 })
  for (const item of body.data) {
    for (const field of SEALED_FIELDS) expect(item).not.toHaveProperty(field)
  }

  const far = await callAction(dev.page.request, 'nearbyBubbles', await tokenFor(dev), {
    lat: 40.7128,
    lng: -74.006,
    radiusM: 500,
  })
  const farBody = (await far.json()) as { data: { id: string }[] }
  expect(farBody.data.some((b) => b.id === 'seed-test-lerner')).toBe(false)
})

test('seed import: bad rows block the batch, re-import upserts, expired and out-of-cap bubbles stay hidden', async ({
  users,
  request,
}) => {
  const jwt = ownerJwt()
  test.skip(!jwt, 'No APP_OWNER_JWT in .dev.vars')
  const [dev] = await users(['Dev'])
  const base = { authorId: 'maya', title: '__test__', text: '__test__', placeName: 'test', category: 'Park' }

  const bad = await callAction(request, 'importSeedBubbles', jwt, {
    bubbles: [
      { ...base, id: 'seed-test-batch-good', ...LERNER },
      { ...base, id: 'seed-test-batch-bad', category: 'Nightclub', ...LERNER },
    ],
  })
  expect(await bad.json()).toMatchObject({ success: false, error: expect.stringContaining('row 2') })

  const notSeed = await callAction(request, 'importSeedBubbles', jwt, {
    bubbles: [{ ...base, id: 'some-user-drop', ...LERNER }],
  })
  expect(await notSeed.json()).toMatchObject({ success: false, error: expect.stringContaining('seed-') })

  const good = {
    bubbles: [
      { ...base, id: 'seed-test-upsert', ...LERNER },
      { ...base, id: 'seed-test-expired', ...LERNER, expiresAt: '2020-01-01T00:00:00.000Z' },
      // ~1.5 km north of Lerner: outside the 1 km cap even if the client asks for more.
      { ...base, id: 'seed-test-beyond-cap', lat: LERNER.lat + 0.0135, lng: LERNER.lng },
    ],
  }
  for (let i = 0; i < 2; i++) {
    expect(await (await callAction(request, 'importSeedBubbles', jwt, good)).json()).toMatchObject({ success: true })
  }

  const near = await callAction(dev.page.request, 'nearbyBubbles', await tokenFor(dev), { ...LERNER, radiusM: 5000 })
  const ids = ((await near.json()) as { data: { id: string }[] }).data.map((b) => b.id)
  expect(ids.filter((id) => id === 'seed-test-upsert')).toHaveLength(1)
  expect(ids).not.toContain('seed-test-batch-good')
  expect(ids).not.toContain('seed-test-expired')
  expect(ids).not.toContain('seed-test-beyond-cap')
})

// The happy path (pop -> love -> author sees lover) needs canPop to create the Pop.
test('loveBubble and lovedBy refuse what the rules forbid', async ({ users, request }) => {
  const jwt = ownerJwt()
  test.skip(!jwt, 'No APP_OWNER_JWT in .dev.vars')
  const [maya, dev] = await users(['Maya', 'Dev'])
  const mayaToken = await tokenFor(maya)
  const devToken = await tokenFor(dev)

  const seed = await callAction(request, 'importSeedBubbles', jwt, {
    bubbles: [
      {
        id: 'seed-test-love',
        authorId: maya.userId,
        title: '__test__',
        text: '__test__',
        placeName: 'test',
        category: 'Cafe',
        ...LERNER,
      },
    ],
  })
  expect(await seed.json()).toMatchObject({ success: true })

  const love = (token: string, bubbleId: string) =>
    callAction(request, 'loveBubble', token, { bubbleId }).then((r) => r.json())
  const lovers = (token: string, bubbleId: string) =>
    callAction(request, 'lovedBy', token, { bubbleId }).then((r) => r.json())

  expect(await love(mayaToken, 'seed-test-love')).toMatchObject({ success: false, error: expect.stringContaining('own bubble') })
  expect(await love(devToken, 'seed-test-love')).toMatchObject({ success: false, error: expect.stringContaining('Pop this bubble') })
  expect(await love(devToken, 'no-such-bubble')).toMatchObject({ success: false, error: 'Bubble not found' })

  expect(await lovers(devToken, 'seed-test-love')).toEqual({ success: true, data: [] })
  expect(await lovers(mayaToken, 'seed-test-love')).toEqual({ success: true, data: [] })
})
