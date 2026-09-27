import { useEffect, useRef, useState, type PointerEvent, type CSSProperties } from 'react'
import { LocateFixed, Minus, Plus, Volume2 } from 'lucide-react'
import { useSound } from '../hooks/useSound'
import type { BubblePreview } from '../lib/uiModels'
import { LERNER_HALL, NEAR_ICON_M } from '../config'
import { distanceM } from '../lib/geo'
import { setDemoLocation, type UserLocation } from '../hooks/useUserLocation'
import { CategoryIcon } from './MobileUI'
import { CATEGORY_META } from '../lib/uiCategories'

const BASE_ZOOM = 16
const WORLD = 256 * 2 ** BASE_ZOOM
const clampZoom = (zoom: number) => Math.min(19, Math.max(13, zoom))
export function project(lat: number, lng: number) {
  const sin = Math.sin(Math.min(85.05, Math.max(-85.05, lat)) * Math.PI / 180)
  return { x: (lng + 180) / 360 * WORLD, y: (.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * WORLD }
}
export function unproject(x: number, y: number) {
  return { lng: x / WORLD * 360 - 180, lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * y / WORLD))) * 180 / Math.PI }
}
type Point = { x: number; y: number }
type View = { center: Point; zoom: number }
export function StreetMap({ bubbles, location, selected, onSelect, focus, poppedIds = [] }: { poppedIds?: string[]; focus?: BubblePreview; bubbles: BubblePreview[]; location: UserLocation | null; selected?: string; onSelect: (bubble: BubblePreview) => void }) {
  const root = useRef<HTMLDivElement>(null)
  const [soundEnabled, toggleSound] = useSound()
  const [size, setSize] = useState({ width: 390, height: 600 })
  const [view, setView] = useState<View>(() => ({ center: project(location?.lat ?? LERNER_HALL.lat, location?.lng ?? LERNER_HALL.lng), zoom: BASE_ZOOM }))
  useEffect(() => { if (focus) setView(v => ({ ...v, center: project(focus.lat, focus.lng) })) }, [focus?.id, focus?.lat, focus?.lng])
  const [tilesFailed, setTilesFailed] = useState(false)
  const initialFix = useRef(false)
  const pointers = useRef(new Map<number, Point>())
  const gesture = useRef<{ start: Point; center: Point; pin: boolean } | null>(null)
  const pinch = useRef<{ distance: number; zoom: number; anchor: Point } | null>(null)
  const scale = 2 ** (view.zoom - BASE_ZOOM)
  const camera = useRef(view)
  const animation = useRef(0)
  const targetZoom = useRef<number | null>(null)
  useEffect(() => { camera.current = view }, [view])
  useEffect(() => () => cancelAnimationFrame(animation.current), [])
  function animateZoom(delta: number, offset: Point = { x: 0, y: 0 }) {
    cancelAnimationFrame(animation.current)
    const start = camera.current
    const target = clampZoom((targetZoom.current ?? start.zoom) + delta)
    targetZoom.current = target
    const anchor = { x: start.center.x + offset.x / 2 ** (start.zoom - BASE_ZOOM), y: start.center.y + offset.y / 2 ** (start.zoom - BASE_ZOOM) }
    const began = performance.now()
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const tick = (now: number) => {
      const t = reduced ? 1 : Math.min(1, (now - began) / 260)
      const zoom = t === 1 ? target : start.zoom + (target - start.zoom) * (1 - (1 - t) ** 3)
      const nextScale = 2 ** (zoom - BASE_ZOOM)
      const next = { zoom, center: { x: anchor.x - offset.x / nextScale, y: anchor.y - offset.y / nextScale } }
      camera.current = next; setView(next)
      if (t < 1) animation.current = requestAnimationFrame(tick)
      else targetZoom.current = null
    }
    animation.current = requestAnimationFrame(tick)
  }
  useEffect(() => {
    if (location && !focus && !initialFix.current) { setView(v => ({ ...v, center: project(location.lat, location.lng) })); initialFix.current = true }
  }, [location, focus])
  useEffect(() => {
    if (!root.current) return
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(root.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const element = root.current
    if (!element) return
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      const offset = { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 }
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1)
      animateZoom(Math.max(-1, Math.min(1, -pixels / 100)), offset)
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [])
  const left = view.center.x * scale - size.width / 2
  const top = view.center.y * scale - size.height / 2
  const tiles = []
  const tileZoom = Math.floor(view.zoom)
  const tileSize = 256 * 2 ** (view.zoom - tileZoom)
  const tileCount = 2 ** tileZoom
  for (let y = Math.max(0, Math.floor(top / tileSize)); y <= Math.min(tileCount - 1, Math.floor((top + size.height) / tileSize)); y++) {
    for (let x = Math.floor(left / tileSize); x <= Math.floor((left + size.width) / tileSize); x++) {
      const tileX = ((x % tileCount) + tileCount) % tileCount
      tiles.push(<img draggable={false} alt="" key={`${tileZoom}:${x}:${y}`} src={`https://tile.openstreetmap.org/${tileZoom}/${tileX}/${y}.png`} onError={() => setTilesFailed(true)} style={{ width: tileSize + .5, height: tileSize + .5, transform: `translate3d(${x * tileSize - left}px, ${y * tileSize - top}px, 0)` }} />)
    }
  }
  function point(event: PointerEvent) {
    const rect = root.current!.getBoundingClientRect()
    return { x: event.clientX - rect.left - size.width / 2, y: event.clientY - rect.top - size.height / 2 }
  }
  function down(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('button, a')) return
    cancelAnimationFrame(animation.current); targetZoom.current = null
    const p = point(event)
    pointers.current.set(event.pointerId, p)
    event.currentTarget.setPointerCapture(event.pointerId)
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom, anchor: { x: view.center.x + (a.x + b.x) / 2 / scale, y: view.center.y + (a.y + b.y) / 2 / scale } }
      gesture.current = null
    } else gesture.current = { start: p, center: view.center, pin: !!(event.target as HTMLElement).closest('[data-demo-pin]') }
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return
    const p = point(event)
    pointers.current.set(event.pointerId, p)
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()]
      const zoom = clampZoom(pinch.current.zoom + Math.log2(Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, pinch.current.distance)))
      const nextScale = 2 ** (zoom - BASE_ZOOM)
      setView({ zoom, center: { x: pinch.current.anchor.x - (a.x + b.x) / 2 / nextScale, y: pinch.current.anchor.y - (a.y + b.y) / 2 / nextScale } })
      return
    }
    const start = gesture.current
    if (!start) return
    if (start.pin && location?.source === 'demo') {
      const position = unproject(view.center.x + p.x / scale, view.center.y + p.y / scale)
      setDemoLocation(position.lat, position.lng)
    } else setView(v => ({ ...v, center: { x: start.center.x - (p.x - start.start.x) / scale, y: start.center.y - (p.y - start.start.y) / scale } }))
  }
  function up(event: PointerEvent) { pointers.current.delete(event.pointerId); gesture.current = null; pinch.current = null }
  function zoomBy(delta: number) { setTilesFailed(false); animateZoom(delta) }
  const user = location ? project(location.lat, location.lng) : null
  return <div ref={root} className="street-map" data-zoom={view.zoom} aria-label="Map of nearby bubbles" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
    <div className="map-tiles">{tiles}</div>
    {tilesFailed && <p className="tile-error">Map tiles unavailable. Bubble distances still work.</p>}
    <div className="map-marker-layer">{bubbles.map(bubble => {
      const p = project(bubble.lat, bubble.lng)
      const near = location && distanceM(location, bubble) <= NEAR_ICON_M
      const isPopped = !!bubble.popped || poppedIds.includes(bubble.id)
      return <button key={bubble.id} className={`map-bubble ${near ? '' : 'far'} ${isPopped ? 'popped' : ''} ${bubble.mine ? 'mine' : ''} ${selected === bubble.id ? 'active' : ''}`} style={{ left: p.x * scale - left, top: p.y * scale - top, '--bubble-color': CATEGORY_META[bubble.category].color } as CSSProperties} onClick={() => onSelect(bubble)} aria-label={`${bubble.category} bubble at ${bubble.placeName}${isPopped ? ', already popped' : bubble.mine ? ', yours' : ''}`}>{isPopped ? <span className="popped-mark" style={{ '--category': CATEGORY_META[bubble.category].color } as CSSProperties}><i /></span> : <CategoryIcon category={bubble.category} />}</button>
    })}
    {user && <div data-demo-pin className={`you-pin ${location?.source === 'demo' ? 'draggable' : ''}`} style={{ left: user.x * scale - left, top: user.y * scale - top }} role={location?.source === 'demo' ? 'slider' : 'img'} aria-label={location?.source === 'demo' ? 'Your demo location. Drag or use arrow keys to move.' : 'Your location'} tabIndex={location?.source === 'demo' ? 0 : undefined} aria-valuetext={`${location?.lat.toFixed(5)}, ${location?.lng.toFixed(5)}`} onKeyDown={event => {
      if (location?.source !== 'demo' || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
      event.preventDefault()
      setDemoLocation(location.lat + (event.key === 'ArrowUp' ? .00005 : event.key === 'ArrowDown' ? -.00005 : 0), location.lng + (event.key === 'ArrowRight' ? .00005 : event.key === 'ArrowLeft' ? -.00005 : 0))
    }}><span /></div>}</div>
    <div className="map-controls">
      <button className="round-button map-sound-toggle" aria-label={soundEnabled ? 'Sound on' : 'Sound off'} aria-pressed={soundEnabled} title={soundEnabled ? 'Turn sound off' : 'Turn sound on'} onClick={toggleSound}>
        <Volume2 aria-hidden="true" />
        {!soundEnabled && <svg className="sound-slash" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3 21 21" /></svg>}
      </button>
      <button className="round-button" aria-label="Zoom in" disabled={view.zoom === 19} onClick={() => zoomBy(1)}><Plus /></button><button className="round-button" aria-label="Zoom out" disabled={view.zoom === 13} onClick={() => zoomBy(-1)}><Minus /></button><button className="round-button" aria-label="Center map on you" onClick={() => { const p = location ?? LERNER_HALL; setView(v => ({ ...v, center: project(p.lat, p.lng) })) }}><LocateFixed /></button></div>
    <a className="map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
  </div>
}
