import { useEffect, useState } from 'react'
import { MobileApp } from '@/bubl/components/MobileApp'
import { mockApi, mockLibrary } from '@/bubl/api/mock'
import { setLocationSource } from '@/bubl/hooks/useUserLocation'
import { AUTH_OFFLINE, demoSignIn } from '@/bubl/lib/authActions'

// "Try a demo walk" / "Explore the demo": sign in as the demo visitor and open the real app,
// so the demo shows the real bubbles and everything done in it is real and shared across phones.
// The offline mock is only for UI-only builds, or if the demo sign-in can't be reached.
export default function DemoPage() {
  const [offline, setOffline] = useState(AUTH_OFFLINE)
  useEffect(() => {
    setLocationSource('demo')
    if (AUTH_OFFLINE) return
    let active = true
    demoSignIn('dev').then(problem => {
      if (!active) return
      // The auth provider reads the session cookie on load, so reload straight into the app
      // (/home only needs a signed-in user, so a judge never lands on a setup step).
      if (!problem) window.location.assign('/home')
      else setOffline(true)
    })
    return () => { active = false }
  }, [])
  if (!offline) return <main className="bubl-app screen-fill signin-screen" role="status"><p className="eyebrow">Demo walk</p><h1>Getting your bubbles ready…</h1></main>
  return <MobileApp api={mockApi} library={mockLibrary} demo user={{ id: 'me', name: 'You' }} />
}
