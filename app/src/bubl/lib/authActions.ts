import { authClient, clearAuthToken, getAuthToken } from 'deepspace'

export const AUTH_OFFLINE = Boolean(import.meta.env.VITE_UI_ONLY) || import.meta.env.VITE_USE_MOCK === 'true'

export interface Me { userId: string; handle: string | null; notificationsEnabled: boolean; locationEnabled: boolean; onboarded: boolean }
type Result<T> = { success: true; data: T } | { success: false; error: string; status?: number }

async function call<T>(name: string, params: object = {}): Promise<Result<T>> {
  try {
    const token = await getAuthToken().catch(() => null)
    const res = await fetch(`/api/actions/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(params),
    })
    const body = await res.json().catch(() => ({})) as Result<T> & { error?: string }
    if (!res.ok) return { success: false, error: body.error ?? `Request failed (${res.status})`, status: res.status }
    return body
  } catch {
    return { success: false, error: 'Could not reach bubl. Check your connection and try again.' }
  }
}

/** Resolves to null when nobody is signed in. */
export async function fetchMe(): Promise<Me | null> {
  const res = await call<Me>('getMe')
  return res.success ? res.data : null
}

export async function claimHandle(handle: string): Promise<{ ok: true; me: Me } | { ok: false; reason: string }> {
  const res = await call<{ ok: true; me: Me } | { ok: false; reason: string }>('claimHandle', { handle })
  return res.success ? res.data : { ok: false, reason: res.error }
}

export async function savePreferences(prefs: { notificationsEnabled: boolean; locationEnabled: boolean }): Promise<Result<Me>> {
  return call<Me>('savePreferences', prefs)
}

export async function googleName(): Promise<string> {
  try {
    const session = await authClient.getSession()
    return session.data?.user?.name ?? ''
  } catch { return '' }
}

export function signInWithGoogle() {
  window.location.assign('/api/auth/social-redirect?provider=google')
}

export async function demoSignIn(as: 'maya' | 'dev' | 'sam'): Promise<string | null> {
  try {
    const res = await fetch('/api/demo/sign-in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ as }) })
    if (res.ok) { clearAuthToken(); return null }
    const body = await res.json().catch(() => ({})) as { error?: string }
    return body.error ?? 'Demo sign-in failed. Please try again.'
  } catch { return 'Could not reach bubl. Check your connection and try again.' }
}
