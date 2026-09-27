// Every time bubl starts: if location or notifications aren't allowed, ask. The
// buttons are real taps, which iPhones need before they show the notification
// prompt. A blocked permission can't be asked for again, so it says where in
// Settings to turn it on. "Not now" hides it until the next start.

import { useEffect, useState } from 'react'
import { Bell, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { gpsWasDenied, useLocationSource, useUserLocation } from '../hooks/useUserLocation'
import { locationPermission, notificationPermission, requestLocation, requestNotifications, SETTINGS_HINT, type PermissionState } from '../lib/permissions'

export function PermissionSheet() {
  const source = useLocationSource()
  const you = useUserLocation()
  const [location, setLocation] = useState<PermissionState | null>(null)
  const [notifications, setNotifications] = useState<PermissionState>(notificationPermission)
  const [dismissed, setDismissed] = useState(false)
  const [asking, setAsking] = useState<'location' | 'notifications' | null>(null)

  useEffect(() => {
    let active = true
    let status: PermissionStatus | undefined
    void locationPermission().then(state => { if (active) setLocation(state) })
    // Follow changes (e.g. the phone's own prompt answered) where the browser reports them.
    navigator.permissions?.query({ name: 'geolocation' }).then(s => { status = s; s.onchange = () => setLocation(s.state) }).catch(() => {})
    return () => { active = false; if (status) status.onchange = null }
  }, [])

  // A GPS fix means location is allowed, whatever the Permissions API says.
  const locationState = you?.source === 'gps' ? 'granted' : location
  // Someone who chose the demo dot isn't asked for location; someone the phone refused is.
  const askLocation = (source === 'gps' || gpsWasDenied()) && (locationState === 'prompt' || locationState === 'denied')
  const askNotifications = notifications === 'prompt' || notifications === 'denied'
  if (dismissed || (!askLocation && !askNotifications)) return null

  async function allowLocation() {
    setAsking('location')
    setLocation(await requestLocation())
    setAsking(null)
  }
  async function allowNotifications() {
    setAsking('notifications')
    setNotifications(await requestNotifications())
    setAsking(null)
  }

  return <div className="permission-sheet-backdrop">
    <section className="permission-sheet" role="dialog" aria-modal="true" aria-labelledby="permission-sheet-title">
      <h2 id="permission-sheet-title">bubl works best with these on</h2>
      {askLocation && <div className="permission-card"><span className="icon-disc blue"><MapPin /></span><div><h3>Location</h3><p>{locationState === 'denied' ? SETTINGS_HINT.location : 'So bubbles open when you get close.'}</p></div>{locationState !== 'denied' && <Button className="bubl-primary permission-allow" loading={asking === 'location'} onClick={() => void allowLocation()}>Allow</Button>}</div>}
      {askNotifications && <div className="permission-card"><span className="icon-disc peach"><Bell /></span><div><h3>Notifications</h3><p>{notifications === 'denied' ? SETTINGS_HINT.notifications : 'So you know when you drift into a bubble, or someone waves.'}</p></div>{notifications !== 'denied' && <Button className="bubl-primary permission-allow" loading={asking === 'notifications'} onClick={() => void allowNotifications()}>Allow</Button>}</div>}
      <button className="text-button" onClick={() => setDismissed(true)}>Not now</button>
    </section>
  </div>
}
