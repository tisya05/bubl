/**
 * Walking voice (the speaker button on the map) against the real backend, signed
 * in as Dev: walking onto a bubble pops it by itself, fetches its ElevenLabs
 * audio, and stays on the map (no note screen). Plus the "also has a photo /
 * video" line. Needs the Maya and Dev test accounts and the app-owner JWT in .dev.vars.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'

test.skip(
  !['Maya', 'Dev'].every((name) => loadAllTestAccounts().some((account) => account.name === name)),
  'Needs the Maya and Dev test accounts (see npx deepspace test accounts list)',
)

// ~1 km north of Lerner, away from the other test bubbles.
const SPOT = { lat: 40.8165, lng: -73.9605 }
const BUBBLE = {
  id: `seed-test-walking-voice-${Date.now()}`,
  title: '__test__ Walking voice bubble',
  text: '__test__ Read me out loud.',
  placeName: 'Broadway & 127th St',
  category: 'Street',
  popRadiusM: 25,
  ...SPOT,
}
// Selected on the card before the walk, ~400 m away: the walk-in pop must take its place.
const OTHER = { ...BUBBLE, id: `${BUBBLE.id}-other`, title: '__test__ Other bubble', placeName: 'Amsterdam & 131st St', lat: SPOT.lat + 400 / 111_195 }

function ownerJwt(): string | undefined {
  try {
    const devVars = readFileSync(fileURLToPath(new URL('../.dev.vars', import.meta.url)), 'utf8')
    return devVars.match(/^APP_OWNER_JWT="?([^"\n]+)"?$/m)?.[1]
  } catch {
    return undefined
  }
}

const standAt = (page: Page, lat: number, lng: number) =>
  page.evaluate(
    async ([la, ln]) => {
      const location = await import('/src/bubl/hooks/useUserLocation.ts')
      location.setLocationSource('demo')
      location.setDemoLocation(la, ln)
    },
    [lat, lng],
  )

test('walking voice pops a bubble you walk into and reads it, without opening it', async ({ users, request }) => {
  const jwt = ownerJwt()
  test.skip(!jwt, 'No APP_OWNER_JWT in .dev.vars')
  const [maya, dev] = await users(['Maya', 'Dev'])
  const seed = await request.post('/api/actions/importSeedBubbles', {
    headers: { Authorization: `Bearer ${jwt}` },
    data: { bubbles: [BUBBLE, OTHER].map((b) => ({ ...b, authorId: maya.userId ?? 'maya' })) },
  })
  expect(await seed.json()).toMatchObject({ success: true })

  const page = dev.page
  await page.goto(`/home?bubble=${OTHER.id}`)
  await expect(page.locator('.walk-screen')).toBeVisible({ timeout: 20_000 })
  await standAt(page, SPOT.lat + 150 / 111_195, SPOT.lng)
  await expect(page.getByText(/m away · Amsterdam & 131st St/)).toBeVisible({ timeout: 15_000 })

  const toggle = page.getByRole('button', { name: 'Walking voice' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Walking voice on · bubbles pop and read aloud')).toBeVisible()

  // Walk in: it pops by itself and asks ElevenLabs for the note.
  const popped = page.waitForResponse((r) => r.url().endsWith('/api/actions/canPop'))
  const spoken = page.waitForResponse((r) => r.url().endsWith('/api/actions/speak'))
  await standAt(page, SPOT.lat, SPOT.lng)
  expect(await (await popped).json()).toMatchObject({ success: true, data: { ok: true, bubble: { id: BUBBLE.id } } })
  const speak = (await (await spoken).json()) as { success: boolean; error?: string; data?: { audioUrl: string } }
  expect(speak.success, speak.error).toBe(true)
  expect(speak.data?.audioUrl).toMatch(/^data:audio\//)

  // Still on the map, and the card switched to the bubble it just popped; the note never opened.
  await expect(page.getByText('You popped this')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('#bubble-details .nearest-title h2')).toHaveText('Broadway & 127th St')
  await expect(page.getByRole('heading', { name: BUBBLE.title })).toHaveCount(0)
  expect(new URL(page.url()).searchParams.get('view')).not.toBe('note')

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
})

test('the "also has a photo" line is spoken in the same voice', async ({ users }) => {
  const [dev] = await users(['Dev'])
  const token = ((await (await dev.page.request.post('/api/auth/token')).json()) as { token: string }).token
  const photo = await dev.page.request.post('/api/actions/speakLine', { headers: { Authorization: `Bearer ${token}` }, data: { line: 'photo' } })
  const body = (await photo.json()) as { success: boolean; error?: string; data?: { audioUrl: string } }
  expect(body.success, body.error).toBe(true)
  expect(body.data?.audioUrl).toMatch(/^data:audio\//)
  const bad = await dev.page.request.post('/api/actions/speakLine', { headers: { Authorization: `Bearer ${token}` }, data: { line: 'anything else' } })
  expect(await bad.json()).toMatchObject({ success: false })
})
