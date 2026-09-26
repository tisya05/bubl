// Live check against the real Gemini API. Skipped unless GEMINI_API_KEY is set:
//   (source ../.env && GEMINI_API_KEY="$GEMINI_API_KEY" npx vitest run src/actions/moderation.live.test.ts)
// Uses a little free-tier quota per run.

import { describe, expect, it } from 'vitest'
import type { Env } from '../../worker'
import { checkBubble } from './moderation'

const key = process.env.GEMINI_API_KEY
const env = { GEMINI_API_KEY: key, GEMINI_MODEL: process.env.GEMINI_MODEL } as Env

async function moderate(text: string) {
  const verdict = await checkBubble(env, { text })
  expect(verdict, 'Gemini was unreachable (null verdict)').not.toBeNull()
  return verdict!
}

describe.skipIf(!key)('Gemini moderation (live)', { timeout: 30_000 }, () => {
  it.each([
    ['a local tip', 'Go down the steps at sunset, the river turns gold and it is always quiet.'],
    ['a negative opinion about a place', 'Honestly the coffee here is overrated, get the pastry instead.'],
    ['a business address', 'Koronet at 2848 Broadway has the biggest slice in the neighborhood.'],
  ])('allows %s', async (_, text) => {
    const v = await moderate(text)
    expect(v.allowed, v.reasons.join('; ')).toBe(true)
  })

  it.each([
    ['swearing', 'This bench is a damn good spot, the view is shit hot.'],
    ['an insult at a person', 'The guy who works the counter here is a worthless idiot, tell him I said so.'],
    ['hate speech', 'Immigrants should be kept out of this park, it was better before they came.'],
    ['a private person and home address', 'Jessica Tran lives at 540 W 112th St apt 4B, knock after 10pm if you want the key.'],
  ])('rejects %s, with a reason', async (_, text) => {
    const v = await moderate(text)
    expect(v.allowed).toBe(false)
    expect(v.reasons.length).toBeGreaterThan(0)
  })

  it('detects the language and suggests a category and short title', async () => {
    const v = await moderate('Baja las escaleras al atardecer. El río se pone dorado y casi no hay gente.')
    expect(v.allowed).toBe(true)
    expect(v.language).toBe('es')
    expect(v.suggestedCategory).toBe('Park')
    expect(v.suggestedTitle.split(/\s+/).length).toBeLessThanOrEqual(8)
  })
})
