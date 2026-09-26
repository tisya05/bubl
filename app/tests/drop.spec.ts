/**
 * dropBubble: validation, the PII pre-check, and a clean drop reaching the map.
 * Grok's own verdicts aren't asserted here: without XAI_API_KEY the drop is
 * saved as 'unchecked', with it as 'passed'. Needs the Dev test account.
 */
import { test, expect, loadAllTestAccounts, type MultiplayerUser } from 'deepspace/testing'
import type { APIRequestContext } from '@playwright/test'

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
