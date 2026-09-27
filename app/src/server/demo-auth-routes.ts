/**
 * POST /api/demo/sign-in { as: 'maya' | 'dev' | 'sam' }: the "Demo sign-in"
 * button for judges. Signs in as one of the demo accounts on the server, so
 * their passwords stay in secrets (DEMO_PASSWORD_MAYA, _DEV, _SAM) and never
 * reach the browser. The session cookie it sets is the same one Google
 * sign-in sets, so the user stays signed in the same way.
 */

import type { Hono } from 'hono'
import { authWorkerFetch } from 'deepspace/worker'
import type { AppContext, Env } from '../../worker.js'

export const DEMO_ACCOUNTS = {
  maya: { email: 'bubl-demo-author@deepspace.test', secret: 'DEMO_PASSWORD_MAYA' },
  dev: { email: 'bubl-demo-visitor@deepspace.test', secret: 'DEMO_PASSWORD_DEV' },
  sam: { email: 'bubl-test-sam@deepspace.test', secret: 'DEMO_PASSWORD_SAM' },
} as const

type DemoName = keyof typeof DEMO_ACCOUNTS

export function registerDemoAuthRoutes(app: Hono<AppContext>): void {
  app.post('/api/demo/sign-in', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { as?: string }
    const name = body.as?.toLowerCase() as DemoName | undefined
    const account = name && Object.hasOwn(DEMO_ACCOUNTS, name) ? DEMO_ACCOUNTS[name] : undefined
    if (!account) return c.json({ success: false, error: 'as must be maya, dev or sam' }, 400)
    const password = c.env[account.secret as keyof Env] as string | undefined
    if (!password) return c.json({ success: false, error: 'Demo sign-in is not set up' }, 503)

    const origin = new URL(c.req.url).origin
    const res = await authWorkerFetch(c.env, '/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ email: account.email, password }),
    })
    if (!res.ok) {
      console.error(`[demo] sign-in failed status=${res.status}`)
      return c.json({ success: false, error: 'Demo sign-in failed' }, 502)
    }

    const headers = new Headers({ 'Content-Type': 'application/json' })
    for (const cookie of res.headers.getSetCookie()) headers.append('Set-Cookie', cookie.replace(/;\s*Domain=[^;]*/gi, ''))
    return new Response(JSON.stringify({ success: true }), { status: 200, headers })
  })
}
