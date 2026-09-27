/**
 * Walk + Note screens against the real backend, signed in as Dev: a seeded
 * bubble stays sealed from afar, pops through the actual "Pop it" button when
 * you stand on it, opens the note, and reads it aloud. Needs the Maya and Dev
 * test accounts and the app-owner JWT in .dev.vars (to seed the bubble).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'

test.skip(
  !['Maya', 'Dev'].every((name) => loadAllTestAccounts().some((account) => account.name === name)),
  'Needs the Maya and Dev test accounts (see npx deepspace test accounts list)',
)

// North of Lerner, at a random spot in a ~400 m square each run, so a bubble left
// unpopped by an earlier (failed) run is very unlikely to sit inside this one's pop radius.
const SPOT = { lat: 40.8135 + Math.random() * 0.0035, lng: -73.966 + Math.random() * 0.0045 }
const BUBBLE = {
  // Fresh every run, so Dev hasn't popped it yet.
  id: `seed-test-walk-ui-${Date.now()}`,
  title: '__test__ Walk UI bubble',
  text: '__test__ You found the walk screen test note.',
  placeName: 'Broadway & 122nd St',
  category: 'Street',
  popRadiusM: 25,
  ...SPOT,
}

function ownerJwt(): string | undefined {
  try {
    const devVars = readFileSync(fileURLToPath(new URL('../.dev.vars', import.meta.url)), 'utf8')
    return devVars.match(/^APP_OWNER_JWT="?([^"\n]+)"?$/m)?.[1]
  } catch {
    return undefined
  }
}

// The demo dot is the app's location source when GPS isn't available (as in this headless browser).
const standAt = (page: Page, lat: number, lng: number) =>
  page.evaluate(
    async ([la, ln]) => {
      const location = await import('/src/bubl/hooks/useUserLocation.ts')
      location.setLocationSource('demo')
      location.setDemoLocation(la, ln)
    },
    [lat, lng],
  )

test('walk to a bubble, pop it once, then only reopen it', async ({ users, request }) => {
  const jwt = ownerJwt()
  test.skip(!jwt, 'No APP_OWNER_JWT in .dev.vars')
  const [maya, dev] = await users(['Maya', 'Dev'])

  const seed = await request.post('/api/actions/importSeedBubbles', {
    headers: { Authorization: `Bearer ${jwt}` },
    data: { bubbles: [{ ...BUBBLE, authorId: maya.userId ?? 'maya' }] },
  })
  expect(await seed.json()).toMatchObject({ success: true })

  const page = dev.page
  // Select this run's bubble (older test bubbles sit at the same spot).
  await page.goto(`/home?bubble=${BUBBLE.id}`)
  await expect(page.locator('.walk-screen')).toBeVisible({ timeout: 20_000 })

  // ~150 m further north: shows the distance, no Pop button, and nothing sealed on screen.
  await standAt(page, SPOT.lat + 150 / 111_195, SPOT.lng)
  await expect(page.getByText(/m away · Broadway & 122nd St/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Pop it', exact: true })).toBeHidden()
  await expect(page.getByText('__test__ Walk UI bubble')).toHaveCount(0)

  // Standing on it: pop through the real button.
  await standAt(page, SPOT.lat, SPOT.lng)
  await expect(page.getByText("You're standing in a bubble")).toBeVisible({ timeout: 15_000 })
  // The in-app banner says so too.
  await expect(page.locator('.bubl-banner')).toContainText('You drifted into a bubble')
  const popped = page.waitForResponse((r) => r.url().endsWith('/api/actions/canPop'))
  await page.getByRole('button', { name: 'Pop it', exact: true }).click()
  expect(await (await popped).json()).toMatchObject({ success: true, data: { ok: true, bubble: { id: BUBBLE.id } } })

  // The note opens with the sealed content.
  await expect(page.getByRole('heading', { name: BUBBLE.title })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(BUBBLE.text)).toBeVisible()

  // Listen: real ElevenLabs audio comes back (generated once, then cached for later runs).
  const spoken = page.waitForResponse((r) => r.url().endsWith('/api/actions/speak'))
  await page.getByRole('button', { name: 'Listen' }).click()
  const speak = (await (await spoken).json()) as { success: boolean; error?: string; data?: { audioUrl: string } }
  expect(speak.success, speak.error).toBe(true)
  expect(speak.data?.audioUrl).toMatch(/^data:audio\//)

  // Back on the map, the same bubble can't be popped again: only reopened.
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByText('You popped this')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Open note' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pop it', exact: true })).toBeHidden()

  // And it reopens from anywhere, without a new pop.
  await standAt(page, SPOT.lat + 300 / 111_195, SPOT.lng)
  await expect(page.getByText(/m away · Broadway & 122nd St/)).toBeVisible({ timeout: 15_000 })
  let popCalls = 0
  page.on('request', (r) => {
    if (r.url().endsWith('/api/actions/canPop')) popCalls++
  })
  const reopened = page.waitForResponse((r) => r.url().endsWith('/api/actions/openPopped'))
  await page.getByRole('button', { name: 'Open note' }).click()
  expect(await (await reopened).json()).toMatchObject({ success: true, data: { bubble: { id: BUBBLE.id } } })
  await expect(page.getByRole('heading', { name: BUBBLE.title })).toBeVisible({ timeout: 15_000 })
  expect(popCalls).toBe(0)
})
