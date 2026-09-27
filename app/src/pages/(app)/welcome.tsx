import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, ChevronLeft, LockKeyhole, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAppViewport } from '@/bubl/hooks/useAppViewport'
import { setLocationSource } from '@/bubl/hooks/useUserLocation'
import { AUTH_OFFLINE, fetchMe, savePreferences } from '@/bubl/lib/authActions'
import '@/bubl/mobile.css'

export default function Welcome() {
  const navigate = useNavigate()
  const viewport = useAppViewport()
  const [location, setLocation] = useState(true)
  const [notifications, setNotifications] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (AUTH_OFFLINE) return
    let active = true
    fetchMe().then(me => {
      if (!active) return
      if (!me || !me.handle) { navigate('/login', { replace: true }); return }
      if (me.onboarded) { setLocation(me.locationEnabled); setNotifications(me.notificationsEnabled) }
    })
    return () => { active = false }
  }, [navigate])
  async function enter() {
    if (busy) return
    setError('')
    if (notifications && 'Notification' in window && Notification.permission === 'default') {
      try { await Notification.requestPermission() } catch { /* In-app banners still work. */ }
    }
    if (!AUTH_OFFLINE) {
      setBusy(true)
      const res = await savePreferences({ notificationsEnabled: notifications, locationEnabled: location })
      setBusy(false)
      if (!res.success) { if (res.status === 401) navigate('/login', { replace: true }); else setError(res.error); return }
    }
    setLocationSource(location ? 'gps' : 'demo')
    navigate(AUTH_OFFLINE ? '/demo' : '/home')
  }
  return <main ref={viewport} className="bubl-app mobile-shell welcome-screen">
    <Link className="round-button" to="/" aria-label="Back to intro"><ChevronLeft /></Link>
    <div className="welcome-heading"><p className="eyebrow">Step 1 of 1</p><h1>bubl only works on foot.</h1>
      <p className="lead">There's no search bar. A bubble opens when you're within about 15 metres of it, so we need to know where you are while you walk.</p></div>
    <div className="permission-card"><span className="icon-disc blue"><MapPin /></span><div><h2>Location</h2><p>While the app is open, so bubbles can open when you get close.</p></div><button className="bubl-switch" role="switch" aria-label="Location" aria-checked={location} onClick={() => setLocation(!location)}><span /></button></div>
    <div className="permission-card"><span className="icon-disc peach"><Bell /></span><div><h2>Notifications</h2><p>So you know the moment you drift into a bubble.</p></div><button className="bubl-switch" role="switch" aria-label="Notifications" aria-checked={notifications} onClick={() => setNotifications(!notifications)}><span /></button></div>
    <p className="privacy-note"><LockKeyhole size={18} />Nobody else ever sees where you are. Bubbles are pinned to places, not people.</p>
    {error && <p className="login-error" role="alert">{error}</p>}
    <div className="bottom-actions"><Button className="bubl-primary" disabled={busy} onClick={enter}>{busy ? 'Saving…' : "Let's go"}</Button><Link className="text-button" to="/demo">Try a demo walk first</Link></div>
  </main>
}
