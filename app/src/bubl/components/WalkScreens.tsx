import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Heart, Hand, Volume2, MapPin, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { NEARBY_QUERY_RADIUS_M } from '../config'
import { distanceM } from '../lib/geo'
import { setDemoLocation, setLocationSource, useUserLocation } from '../hooks/useUserLocation'
import type { BubblePreview, Category } from '../lib/uiModels'
import { Avatar, Categories, CategoryIcon, Empty, ScreenHeader } from './MobileUI'
import { useDemoEvents, demoEvents, eventAvailability } from '../lib/eventDemo'
import { LocationMap } from './LocationMap'
import { ReportButton } from './ReportButton'
import { EventWhen } from './EventsScreen'
import { StreetMap } from './StreetMap'
import { isSoundEnabled, useSound } from '../hooks/useSound'
import { alert } from '../lib/alerts'
import { result, useMobile, useOperation } from './MobileApp'

export function WalkScreen() {
  const { api, demo, user, open, go, notify } = useMobile()
  const location = useUserLocation()
  const events = useDemoEvents()
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  const [bubbles, setBubbles] = useState<BubblePreview[]>([])
  const [params] = useSearchParams()
  const [selected, setSelected] = useState<string | undefined>(params.get('bubble') ?? undefined)
  const [filter, setFilter] = useState<Category>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [popping, setPopping] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [sheetHeight, setSheetHeight] = useState(245)
  const [expandedHeight, setExpandedHeight] = useState(260)
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const details = useRef<HTMLDivElement>(null)
  const startHeight = useRef(0)
  const [headerHeight, setHeaderHeight] = useState(180)
  const sheet = useRef<HTMLDivElement>(null)
  const header = useRef<HTMLDivElement>(null)
  const dragStart = useRef<number | null>(null)
  const dragged = useRef(false)
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (sheet.current) setSheetHeight(sheet.current.offsetHeight)
      if (details.current) setExpandedHeight(details.current.scrollHeight + 56)
      if (header.current) setHeaderHeight(header.current.offsetTop + header.current.offsetHeight + 10)
    })
    if (sheet.current) observer.observe(sheet.current)
    if (details.current) observer.observe(details.current)
    if (header.current) observer.observe(header.current)
    return () => observer.disconnect()
  }, [])
  const { busy, run } = useOperation()
  const lat = location?.lat, lng = location?.lng
  useEffect(() => {
    if (lat === undefined || lng === undefined) return
    let active = true
    const timer = setTimeout(() => {
      setLoading(true); setError('')
      result(api.nearbyBubbles({ lat, lng, radiusM: NEARBY_QUERY_RADIUS_M })).then(data => { if (active) setBubbles(data) }).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    }, 180)
    return () => { active = false; clearTimeout(timer) }
  }, [api, lat, lng, retry])
  const eventPreviews: BubblePreview[] = demo ? events.filter(event => event.id === params.get('bubble') || !location || distanceM(location, event) <= NEARBY_QUERY_RADIUS_M).map(({ id, lat, lng, placeName, category, popRadiusM, event }) => ({ id, lat, lng, placeName, category, popRadiusM, event })) : []
  const allBubbles = [...bubbles, ...eventPreviews]
  const visible = allBubbles.filter(b => !filter || b.category === filter)
  const sorted = [...visible].sort((a, b) => location ? distanceM(location, a) - distanceM(location, b) : 0)
  const nearest = sorted.find(b => b.id === selected) ?? sorted[0]
  const distance = location && nearest ? Math.round(distanceM(location, nearest)) : null
  const eventReason = nearest?.event ? eventAvailability({ ...nearest, event: nearest.event }, location, now) : null
  // Already popped (or yours): open it again from anywhere, no pop, no sound.
  const done = Boolean(nearest && !nearest.event && (nearest.popped || nearest.mine))
  const canOpen = !done && !eventReason && nearest && distance !== null && distanceM(location!, nearest) <= nearest.popRadiusM
  async function reopen() {
    if (!nearest) return
    await run(async () => { open(await result(api.openPopped({ bubbleId: nearest.id }))) })
  }
  async function pop() {
    if (!nearest || !location) return
    await run(async () => {
      if (nearest.category === 'Events') { open(await demoEvents.pop(nearest.id, location)); return }
      const data = await result(api.canPop({ bubbleId: nearest.id, userLat: location.lat, userLng: location.lng }))
      if (!data.ok) { notify(data.reason === 'too_far' ? `Keep walking — you're ${data.distanceM} m away.` : 'This bubble is no longer floating.'); return }
      setBubbles(list => list.map(b => b.id === nearest.id ? { ...b, popped: true } : b))
      if (data.alreadyPopped) { open(data); return }
      alert({ kind: 'pop', title: 'pop.', body: data.bubble.title, bubbleId: nearest.id, quiet: true })
      setPopping(true)
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) await new Promise(resolve => setTimeout(resolve, 700))
      open(data)
    })
  }
  return <section className="walk-screen" style={{ '--sheet-height': `${sheetHeight}px`, '--map-header-height': `${headerHeight}px` } as CSSProperties}>
    <StreetMap focus={eventPreviews.find(event => event.id === params.get('bubble'))} bubbles={visible} location={location} selected={nearest?.id} onSelect={bubble => setSelected(bubble.id)} />
    <div ref={header} className="map-overlay"><div className="map-heading"><div><p className="eyebrow">{demo ? 'Morningside Heights' : 'Your neighborhood'}</p><h1>{loading ? 'Finding nearby bubbles…' : `${allBubbles.length} bubbles around you`}</h1></div><button aria-label="Your bubbles" onClick={() => go('you')}><Avatar name={user.name} image={user.imageUrl} /></button></div>
      <Categories value={filter} onChange={value => setFilter(filter === value ? undefined : value)} />
      {location?.source === 'demo' && <p className="map-hint">Demo location · drag the blue dot to explore</p>}
    </div>
    <div ref={sheet} className={`map-sheet ${collapsed ? 'collapsed' : ''} ${dragHeight !== null ? 'dragging' : ''}`} style={{ height: dragHeight ?? (collapsed ? 96 : expandedHeight) }}>
      <button className="sheet-grip" aria-label={collapsed ? 'Expand bubble details' : 'Collapse bubble details'} aria-expanded={!collapsed} aria-controls="bubble-details" onPointerDown={event => { dragStart.current = event.clientY; startHeight.current = sheet.current?.offsetHeight ?? expandedHeight; dragged.current = false; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { if (dragStart.current === null) return; const delta = event.clientY - dragStart.current; if (Math.abs(delta) > 4) dragged.current = true; setDragHeight(Math.max(96, Math.min(expandedHeight, startHeight.current - delta))) }} onPointerUp={event => { if (dragStart.current !== null && dragged.current) { const delta = event.clientY - dragStart.current; setCollapsed(Math.abs(delta) > 24 ? delta > 0 : (dragHeight ?? startHeight.current) < (expandedHeight + 96) / 2) } dragStart.current = null; setDragHeight(null) }} onPointerCancel={() => { dragStart.current = null; setDragHeight(null) }} onClick={() => { if (dragged.current) { dragged.current = false; return } setCollapsed(value => !value) }}><span className="sheet-handle" /></button>
      {collapsed && <button className="collapsed-summary" onClick={() => setCollapsed(false)}>{nearest ? <><CategoryIcon category={nearest.category} /><span>{done ? (nearest.mine ? 'Your bubble' : 'You popped this') : canOpen ? 'A bubble is ready to pop' : 'Keep exploring'}<small>{nearest.placeName}</small></span></> : 'Explore nearby bubbles'}</button>}
      <div ref={details} id="bubble-details" inert={collapsed} aria-hidden={collapsed}>
      {error ? <><h2>Couldn't load nearby bubbles</h2><p>{error}</p><Button className="bubl-primary" onClick={() => setRetry(retry + 1)}>Try again</Button></> : !location ? <><h2>Finding your corner…</h2><p>Allow location access to discover what's around you.</p><Button className="bubl-primary" onClick={() => setLocationSource('demo')}>Use a demo location</Button></> : nearest && done ? <>
        <div className="nearest-title"><CategoryIcon category={nearest.category} /><div><p className="eyebrow">{nearest.mine ? 'Your bubble' : 'You popped this'}</p><h2>{distance !== null && distance > nearest.popRadiusM ? `${distance} m away · ${nearest.placeName}` : nearest.placeName}</h2></div></div>
        <p>{nearest.mine ? 'You left this here. Open it to see what others will find.' : "You've already popped this one. Open it anytime, from here or Your bubbles."}</p>
        <Button className="bubl-outline" loading={busy} onClick={reopen}>Open note</Button>
      </> : nearest ? <>
        <div className="nearest-title"><CategoryIcon category={nearest.category} /><div><p className="eyebrow">{canOpen ? "You're standing in a bubble" : `Nearest bubble · ${nearest.category}`}</p><h2>{canOpen ? nearest.placeName : `${distance} m away · ${nearest.placeName}`}</h2></div></div>
        <p>{eventReason ? eventReason : canOpen ? 'Someone left a little piece of this place. Go on, pop it.' : "Colors tell you what kind of spot it is. What's inside stays sealed until you get close."}</p>
        {canOpen ? <Button className="bubl-primary" loading={busy} onClick={pop}>Pop it <Sparkles size={18} /></Button> : <><progress max={500} value={Math.max(0, 500 - (distance ?? 500))} /><div className="distance-labels"><span>You</span><span>Pops at {nearest.popRadiusM} m</span></div>{demo && <button className="text-button" onClick={() => setDemoLocation(nearest.lat, nearest.lng)}>Demo: walk to this bubble</button>}</>}
      </> : <><h2>{loading ? 'Finding your next discovery…' : 'A little quiet around here'}</h2><p>{filter ? 'Try another category or keep walking.' : 'Be the first to leave a bubble at this spot.'}</p><Button className="bubl-primary" onClick={() => go('drop')}>Drop a bubble</Button></>}
      {nearest && <ReportButton id={nearest.id} label={`${nearest.category} bubble at ${nearest.placeName}`} />}
      </div>
    </div>
    {popping && <div className="pop-transition" role="status"><span className="pop-orb" /><strong>pop.</strong></div>}
  </section>
}

export function NoteScreen() {
  const { api, opened, go, waveAt, user, notify } = useMobile()
  const { busy, run } = useOperation()
  const [loved, setLoved] = useState(opened?.loved ?? false)
  const [soundEnabled] = useSound()
  const audio = useRef<HTMLAudioElement | null>(null)
  useEffect(() => { if (audio.current) audio.current.muted = !soundEnabled }, [soundEnabled])
  useEffect(() => () => { audio.current?.pause() }, [])
  if (!opened) return null
  const { bubble, author } = opened
  const own = bubble.authorId === user.id
  return <section className="note-screen screen-fill"><ScreenHeader onBack={() => go(opened.fromLibrary ? 'you' : opened.fromEvents ? 'events' : 'walk')} title={bubble.placeName}><ReportButton id={bubble.id} label={bubble.title} /></ScreenHeader>
    <div className="note-body">
      {bubble.mediaType === 'video' && bubble.mediaUrl ? <video className="note-media" src={bubble.mediaUrl} controls playsInline muted={!soundEnabled} /> : bubble.mediaUrl ? <img className="note-media" src={bubble.mediaUrl} alt={bubble.title} /> : <div className="note-illustration"><CategoryIcon category={bubble.category} /><span>A little local knowledge.</span></div>}
      <div className="author-row"><Avatar name={author.name} image={author.imageUrl} /><div><strong>{author.name || 'A local'}</strong><p className="eyebrow">Local · {new Date(bubble.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p></div></div>
      {bubble.event && <EventWhen event={bubble.event} />}
      <h1>{bubble.title}</h1><p className="note-text">{bubble.text}</p>
      <p className="eyebrow">{bubble.poppedCount ?? 1} popped · {(bubble.lovedCount ?? 0) + (loved ? 1 : 0)} loved it</p>
      {!bubble.event && <div className="note-tools"><Button variant="outline" disabled={busy} onClick={() => run(async () => { const data = await result(api.speak({ bubbleId: bubble.id })); if (!data.audioUrl) { notify('Read-aloud is not connected in this demo yet.'); return } audio.current?.pause(); audio.current = new Audio(data.audioUrl); audio.current.muted = !isSoundEnabled(); await audio.current.play() })}><Volume2 />Listen</Button></div>}
      <LocationMap lat={bubble.lat} lng={bubble.lng} label={bubble.placeName} />
    </div>
    {!own && !bubble.event && <div className="note-actions"><Button className="bubl-primary" loading={busy} onClick={() => run(async () => { await result(api.loveBubble({ bubbleId: bubble.id })); setLoved(true) })} disabled={loved}><Heart fill={loved ? 'currentColor' : 'none'} />{loved ? 'Loved this spot' : 'Love this spot'}</Button><Button className="bubl-outline" disabled={!loved} onClick={() => waveAt({ user: author, bubbleId: bubble.id, category: bubble.category, placeName: bubble.placeName })}><Hand />Wave</Button></div>}
    {own && <p className="privacy-note"><MapPin size={18} />{bubble.event ? 'You dropped this event. Find it in Your bubbles.' : 'You left this bubble. Find incoming waves in Chats.'}</p>}
  </section>
}
