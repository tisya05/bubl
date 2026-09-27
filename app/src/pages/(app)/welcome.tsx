import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, ChevronLeft, LockKeyhole, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAppViewport } from '@/bubl/hooks/useAppViewport'
import { setLocationSource } from '@/bubl/hooks/useUserLocation'
import { AUTH_OFFLINE, fetchMe, savePreferences } from '@/bubl/lib/authActions'
import { locationPermission, notificationPermission, requestLocation, requestNotifications, SETTINGS_HINT, turnOffNotifications } from '@/bubl/lib/permissions'
import '@/bubl/mobile.css'

export default function Welcome() {
  const navigate = useNavigate()
  const viewport = useAppViewport()
  // The switches show what the phone has actually allowed (plus your choice), never a default.
  // Turning one on asks the phone right then, inside the tap.
  const [location, setLocation] = useState(false)
  const [notifications, setNotifications] = useState(false)
  const [hint, setHint] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void locationPermission().then(state => { if (active && state === 'granted') setLocation(true) })
    if (notificationPermission() === 'granted') setNotifications(true)
    if (AUTH_OFFLINE) return () => { active = false }
    fetchMe().then(me => {
      if (!active) return
      if (!me || !me.handle) { navigate('/login', { replace: true }); return }
      // Switched off in bubl before: stays off even though the phone allows it.
      if (me.onboarded && !me.notificationsEnabled) setNotifications(false)
      if (me.onboarded && !me.locationEnabled) setLocation(false)
    })
    return () => { active = false }
  }, [navigate])
  async function toggleLocation() {
    setHint('')
    if (location) { setLocation(false); return }
    const state = await requestLocation()
    setLocation(state === 'granted')
    if (state === 'denied') setHint(SETTINGS_HINT.location)
  }
  async function toggleNotifications() {
    setHint('')
    if (notifications) { setNotifications(false); return }
    const state = await requestNotifications()
    setNotifications(state === 'granted')
    if (state === 'denied') setHint(SETTINGS_HINT.notifications)
    if (state === 'unsupported') setHint('Add bubl to your Home Screen to get notifications.')
  }
  async function enter() {
    if (busy) return
    setError('')
    if (!notifications) await turnOffNotifications()
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
    <div className="permission-card"><span className="icon-disc blue"><MapPin /></span><div><h2>Location</h2><p>While the app is open, so bubbles can open when you get close.</p></div><button className="bubl-switch" role="switch" aria-label="Location" aria-checked={location} onClick={() => void toggleLocation()}><span /></button></div>
    <div className="permission-card"><span className="icon-disc peach"><Bell /></span><div><h2>Notifications</h2><p>So you know the moment you drift into a bubble.</p></div><button className="bubl-switch" role="switch" aria-label="Notifications" aria-checked={notifications} onClick={() => void toggleNotifications()}><span /></button></div>
    <p className="privacy-note"><LockKeyhole size={18} />Nobody else ever sees where you are. Bubbles are pinned to places, not people.</p>
    {hint && <p className="login-error" role="status">{hint}</p>}
    {error && <p className="login-error" role="alert">{error}</p>}
    <div className="bottom-actions"><Button className="bubl-primary" disabled={busy} onClick={enter}>{busy ? 'Saving…' : "Let's go"}</Button><Link className="text-button" to="/demo">Try a demo walk first</Link></div>
  </main>
}
