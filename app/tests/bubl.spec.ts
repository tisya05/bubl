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

async function popAtLerner(request: APIRequestContext, token: string, bubbleId: string) {
  const res = await callAction(request, 'canPop', token, { userLat: LERNER.lat, userLng: LERNER.lng, bubbleId })
  const body = await res.json()
  expect(body).toMatchObject({ success: true, data: { ok: true } })
  return body.data as { author: { id: string } }
}

test('love flow: only the author sees lovers; lovers never see each other', async ({ users, request }) => {
  const jwt = ownerJwt()
  test.skip(!jwt, 'No APP_OWNER_JWT in .dev.vars')
  test.skip(!loadAllTestAccounts().some((a) => a.name === 'Sam'), 'Needs the Sam test account')
  const [maya, dev, sam] = await users(['Maya', 'Dev', 'Sam'])
  const [mayaToken, devToken, samToken] = await Promise.all([tokenFor(maya), tokenFor(dev), tokenFor(sam)])
  const bubbleId = `seed-test-flow-${Date.now()}`

  const seed = await callAction(request, 'importSeedBubbles', jwt, {
    bubbles: [{ id: bubbleId, authorId: maya.userId, title: '__test__', text: '__test__', placeName: 'test', category: 'Food', ...LERNER }],
  })
  expect(await seed.json()).toMatchObject({ success: true })

  const act = (name: string, token: string | undefined, params: object) =>
    callAction(request, name, token, params).then((r) => r.json())
  const loverIds = async (token: string) =>
    ((await act('lovedBy', token, { bubbleId })) as { data: { id: string }[] }).data.map((u) => u.id).sort()

  // Too far away: no pop, so no love.
  const far = await act('canPop', samToken, { userLat: 40.7128, userLng: -74.006, bubbleId })
  expect(far).toMatchObject({ success: true, data: { ok: false, reason: 'too_far' } })
  expect(await act('loveBubble', samToken, { bubbleId })).toMatchObject({ success: false, error: expect.stringContaining('Pop this bubble') })

  // A real pop hands the lover the author, which is who they can wave at.
  expect((await popAtLerner(request, devToken, bubbleId)).author.id).toBe(maya.userId)
  await popAtLerner(request, samToken, bubbleId)

  // Popped but not loved yet: nobody is listed.
  expect(await loverIds(mayaToken)).toEqual([])

  expect(await act('loveBubble', devToken, { bubbleId })).toEqual({ success: true, data: { loved: true } })
  expect(await act('loveBubble', devToken, { bubbleId })).toEqual({ success: true, data: { loved: true } })
  expect(await loverIds(mayaToken)).toEqual([dev.userId])

  expect(await act('loveBubble', samToken, { bubbleId })).toMatchObject({ success: true })
  expect(await loverIds(mayaToken)).toEqual([dev.userId, sam.userId].sort())
  expect(await loverIds(samToken)).toEqual([])
  expect(await loverIds(devToken)).toEqual([])

  // Popping again keeps the loved flag.
  await popAtLerner(request, devToken, bubbleId)
  expect(await loverIds(mayaToken)).toEqual([dev.userId, sam.userId].sort())

  const authorView = (await act('lovedBy', mayaToken, { bubbleId })) as { data: Record<string, unknown>[] }
  for (const lover of authorView.data) {
    expect(Object.keys(lover).sort()).toEqual(expect.arrayContaining(['id', 'name']))
    expect(lover).not.toHaveProperty('email')
  }
})

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

test('waves: only author and lover, note limit, mutual wave opens one chat per pair', async ({ users, request }) => {
  const jwt = ownerJwt()
  test.skip(!jwt, 'No APP_OWNER_JWT in .dev.vars')
  test.skip(!loadAllTestAccounts().some((a) => a.name === 'Sam'), 'Needs the Sam test account')
  const [maya, dev, sam] = await users(['Maya', 'Dev', 'Sam'])
  const [mayaToken, devToken, samToken] = await Promise.all([tokenFor(maya), tokenFor(dev), tokenFor(sam)])
  const run = Date.now()
  const first = `seed-test-wave-a-${run}`
  const second = `seed-test-wave-b-${run}`

  const act = (name: string, token: string | undefined, params: object = {}) =>
    callAction(request, name, token, params).then((r) => r.json())
  const bubble = (id: string) => ({ id, authorId: maya.userId, title: '__test__', text: '__test__', placeName: `place ${id}`, category: 'Street', ...LERNER })

  expect(await act('importSeedBubbles', jwt, { bubbles: [bubble(first), bubble(second)] })).toMatchObject({ success: true })
  for (const [token, id] of [[devToken, first], [samToken, first], [devToken, second]] as const) {
    await popAtLerner(request, token, id)
  }
  await act('loveBubble', devToken, { bubbleId: first })
  await act('loveBubble', devToken, { bubbleId: second })
  // Sam popped `first` but never loved it.

  const refused = { success: false, error: expect.stringContaining('author') }
  expect(await act('sendWave', samToken, { toUserId: maya.userId, bubbleId: first })).toMatchObject(refused)
  expect(await act('sendWave', mayaToken, { toUserId: sam.userId, bubbleId: first })).toMatchObject(refused)
  expect(await act('sendWave', devToken, { toUserId: sam.userId, bubbleId: first })).toMatchObject(refused)
  expect(await act('sendWave', devToken, { toUserId: dev.userId, bubbleId: first })).toMatchObject({ success: false })
  expect(await act('sendWave', devToken, { toUserId: maya.userId, bubbleId: first, note: 'x'.repeat(281) })).toMatchObject({
    success: false,
    error: expect.stringContaining('280'),
  })

  // Dev waves first, with a note. Waving again is a no-op.
  const hello = { toUserId: maya.userId, bubbleId: first, note: '  loved this spot!  ' }
  expect(await act('sendWave', devToken, hello)).toEqual({ success: true, data: { matched: false } })
  expect(await act('sendWave', devToken, hello)).toEqual({ success: true, data: { matched: false } })

  const mayaInbox = (await act('incomingWaves', mayaToken)) as { data: Record<string, any>[] }
  const fromDev = mayaInbox.data.filter((w) => w.bubbleId === first)
  expect(fromDev).toHaveLength(1)
  expect(fromDev[0]).toMatchObject({ from: { id: dev.userId }, placeName: `place ${first}`, category: 'Street', note: 'loved this spot!' })
  expect(fromDev[0].createdAt).toMatch(/T00:00:00\.000Z$/)
  expect(fromDev[0].from).not.toHaveProperty('email')
  expect(((await act('incomingWaves', samToken)) as { data: { bubbleId: string }[] }).data.some((w) => w.bubbleId === first)).toBe(false)

  // Maya waves back: matched, and the wave leaves her inbox.
  const match = (await act('sendWave', mayaToken, { toUserId: dev.userId, bubbleId: first })) as { data: { matched: boolean; chatId: string } }
  expect(match.data.matched).toBe(true)
  expect(match.data.chatId).toBeTruthy()
  const after = (await act('incomingWaves', mayaToken)) as { data: { bubbleId: string }[] }
  expect(after.data.some((w) => w.bubbleId === first)).toBe(false)

  // Maya waves first on the second bubble; Dev waves back. Same pair, same chat.
  expect(await act('sendWave', mayaToken, { toUserId: dev.userId, bubbleId: second })).toEqual({ success: true, data: { matched: false } })
  const again = (await act('sendWave', devToken, { toUserId: maya.userId, bubbleId: second })) as { data: { matched: boolean; chatId: string } }
  expect(again.data).toEqual({ matched: true, chatId: match.data.chatId })
})

test('chats: only the pair can list, read and write; pinned to the first bubble', async ({ users, request }) => {
  const jwt = ownerJwt()
  test.skip(!jwt, 'No APP_OWNER_JWT in .dev.vars')
  test.skip(!loadAllTestAccounts().some((a) => a.name === 'Sam'), 'Needs the Sam test account')
  const [maya, dev, sam] = await users(['Maya', 'Dev', 'Sam'])
  const [mayaToken, devToken, samToken] = await Promise.all([tokenFor(maya), tokenFor(dev), tokenFor(sam)])
  const run = Date.now()
  const first = `seed-test-chat-a-${run}`
  const second = `seed-test-chat-b-${run}`

  const act = (name: string, token: string | undefined, params: object = {}) =>
    callAction(request, name, token, params).then((r) => r.json())
  const bubble = (id: string) => ({ id, authorId: maya.userId, title: '__test__', text: '__test__', placeName: 'test', category: 'Cafe', ...LERNER })

  // Fresh pair each run isn't possible (Maya and Dev may already share a chat), so compare against what exists.
  const chatWithDev = async () =>
    ((await act('myChats', mayaToken)) as { data: Record<string, any>[] }).data.find((c) => c.otherUser.id === dev.userId)
  const existing = await chatWithDev()

  expect(await act('importSeedBubbles', jwt, { bubbles: [bubble(first), bubble(second)] })).toMatchObject({ success: true })
  for (const id of [first, second]) {
    await popAtLerner(request, devToken, id)
    await act('loveBubble', devToken, { bubbleId: id })
    await act('sendWave', devToken, { toUserId: maya.userId, bubbleId: id })
  }
  const match = (await act('sendWave', mayaToken, { toUserId: dev.userId, bubbleId: first })) as { data: { chatId: string } }
  await act('sendWave', mayaToken, { toUserId: dev.userId, bubbleId: second })
  const chatId = match.data.chatId

  const summary = await chatWithDev()
  expect(summary).toMatchObject({ chat: { id: chatId, participantIds: expect.arrayContaining([maya.userId, dev.userId]) }, otherUser: { id: dev.userId } })
  expect(summary!.otherUser).not.toHaveProperty('email')
  if (!existing) expect(summary!.chat.bubbleId).toBe(first)
  else expect(summary!.chat.bubbleId).toBe(existing.chat.bubbleId)

  // Outsiders can't see, read or write the chat.
  const samChats = (await act('myChats', samToken)) as { data: { chat: { id: string } }[] }
  expect(samChats.data.some((c) => c.chat.id === chatId)).toBe(false)
  expect(await act('getMessages', samToken, { chatId })).toEqual({ success: false, error: 'Chat not found' })
  expect(await act('sendMessage', samToken, { chatId, text: 'hi' })).toEqual({ success: false, error: 'Chat not found' })
  expect(await act('getMessages', devToken, { chatId: 'no-such-chat' })).toEqual({ success: false, error: 'Chat not found' })

  expect(await act('sendMessage', devToken, { chatId, text: '   ' })).toMatchObject({ success: false })
  expect(await act('sendMessage', devToken, { chatId, text: 'x'.repeat(1001) })).toMatchObject({ success: false, error: expect.stringContaining('1000') })

  const hi = `hi from dev ${run}`
  const reply = `hi back ${run}`
  expect(await act('sendMessage', devToken, { chatId, text: `  ${hi}  ` })).toMatchObject({ success: true, data: { chatId, senderId: dev.userId, text: hi } })
  expect(await chatWithDev()).toMatchObject({ lastMessage: { text: hi }, unread: true })

  const devSide = ((await act('myChats', devToken)) as { data: Record<string, any>[] }).data.find((c) => c.chat.id === chatId)
  expect(devSide).toMatchObject({ otherUser: { id: maya.userId }, lastMessage: { text: hi }, unread: false })

  await act('sendMessage', mayaToken, { chatId, text: reply })
  expect(await chatWithDev()).toMatchObject({ lastMessage: { text: reply }, unread: false })

  const thread = ((await act('getMessages', devToken, { chatId })) as { data: { text: string }[] }).data.map((m) => m.text)
  expect(thread.slice(-2)).toEqual([hi, reply])
})

test('You tab: myPopped and myDropped show only the caller’s own bubbles', async ({ users, request }) => {
  const jwt = ownerJwt()
  test.skip(!jwt, 'No APP_OWNER_JWT in .dev.vars')
  test.skip(!loadAllTestAccounts().some((a) => a.name === 'Sam'), 'Needs the Sam test account')
  const [maya, dev, sam] = await users(['Maya', 'Dev', 'Sam'])
  const [mayaToken, devToken, samToken] = await Promise.all([tokenFor(maya), tokenFor(dev), tokenFor(sam)])
  const run = Date.now()
  const live = `seed-test-you-live-${run}`
  const old = `seed-test-you-old-${run}`

  const act = (name: string, token: string | undefined, params: object = {}) =>
    callAction(request, name, token, params).then((r) => r.json())
  const bubble = (id: string, extra: object = {}) => ({ id, authorId: maya.userId, title: `title ${id}`, text: '__test__', placeName: 'test', category: 'Park', ...LERNER, ...extra })

  expect(await act('importSeedBubbles', jwt, { bubbles: [bubble(live), bubble(old, { expiresAt: '2020-01-01T00:00:00.000Z' })] })).toMatchObject({ success: true })
  await popAtLerner(request, devToken, live)
  await popAtLerner(request, samToken, live)
  await popAtLerner(request, mayaToken, live) // the author's own pop doesn't count
  await act('loveBubble', devToken, { bubbleId: live })

  const devPopped = ((await act('myPopped', devToken)) as { data: Record<string, unknown>[] }).data
  expect(devPopped.find((p) => p.bubbleId === live)).toMatchObject({ title: `title ${live}`, category: 'Park', placeName: 'test', loved: true })
  expect(devPopped[0].bubbleId).toBe(live)
  const samPopped = ((await act('myPopped', samToken)) as { data: Record<string, unknown>[] }).data
  expect(samPopped.find((p) => p.bubbleId === live)).toMatchObject({ loved: false })

  const dropped = ((await act('myDropped', mayaToken)) as { data: Record<string, unknown>[] }).data
  expect(dropped.find((d) => d.bubbleId === live)).toMatchObject({ title: `title ${live}`, status: 'floating', popCount: 2 })
  expect(dropped.find((d) => d.bubbleId === old)).toMatchObject({ status: 'expired', popCount: 0 })

  // Dev and Sam dropped nothing; Dev never sees Maya's drops.
  const devDropped = ((await act('myDropped', devToken)) as { data: { bubbleId: string }[] }).data
  expect(devDropped.some((d) => d.bubbleId === live || d.bubbleId === old)).toBe(false)
})
