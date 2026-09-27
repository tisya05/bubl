import { useEffect, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import { project, unproject } from './StreetMap'

/** A compact location snapshot. Optional picking is used only for an event venue. */
export function LocationMap({ lat, lng, label, onPick }: { lat: number; lng: number; label: string; onPick?: (point: { lat: number; lng: number }) => void }) {
  const root = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(350)
  const [failed, setFailed] = useState(false)
  useEffect(() => { if (!root.current) return; const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width)); observer.observe(root.current); return () => observer.disconnect() }, [])
  const center = project(lat, lng), left = center.x - width / 2, top = center.y - 90
  const tiles = []
  for (let y = Math.floor(top / 256); y <= Math.floor((top + 180) / 256); y++) for (let x = Math.floor(left / 256); x <= Math.floor((left + width) / 256); x++) tiles.push(<img key={`${x}:${y}`} src={`https://tile.openstreetmap.org/16/${((x % 65536) + 65536) % 65536}/${y}.png`} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)} style={{ left: x * 256 - left, top: y * 256 - top }} />)
  return <figure className="location-map"><div ref={root} className={`location-map-image ${onPick ? 'pickable' : ''}`} role={onPick ? 'button' : 'img'} tabIndex={onPick ? 0 : undefined} aria-label={onPick ? 'Event location map. Click to place the pin or use arrow keys.' : `Map of ${label}`} onClick={onPick ? event => { const rect = event.currentTarget.getBoundingClientRect(); onPick(unproject(left + event.clientX - rect.left, top + event.clientY - rect.top)) } : undefined} onKeyDown={onPick ? event => { if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); onPick(unproject(center.x + (event.key === 'ArrowRight' ? 24 : event.key === 'ArrowLeft' ? -24 : 0), center.y + (event.key === 'ArrowDown' ? 24 : event.key === 'ArrowUp' ? -24 : 0))) } : undefined}>{tiles}<MapPin className="location-map-pin" fill="#FF60B7" />{failed && <span className="map-unavailable">Map unavailable · coordinates below</span>}</div><figcaption><div><strong>{label}</strong><small>{lat.toFixed(5)}, {lng.toFixed(5)}</small></div><a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`} target="_blank" rel="noreferrer" aria-label={`Open map of ${label}`}>Open map ↗</a></figcaption><a className="snapshot-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></figure>
}
