import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Camera, Check, MapPin, LocateFixed, X, PlusCircle, ShieldCheck, Video } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { useDemoLocation, useUserLocation } from '../hooks/useUserLocation'
import { distanceM } from '../lib/geo'
import type { BubblePreview, Bubble, Category, DropBubbleInput } from '../lib/uiModels'
import { CATEGORIES } from '../lib/uiCategories'
import { LocationMap } from './LocationMap'
import { demoEvents, toEventItem } from '../lib/eventDemo'
import { Categories, CategoryIcon, ScreenHeader } from './MobileUI'
import { result, useMobile, useOperation } from './MobileApp'

// Existing place names within this distance are offered as names for your spot.
const NAME_SUGGESTION_RADIUS_M = 100

function categoryFromParams(value: string | null): Category | undefined {
  return CATEGORIES.includes(value as Category) ? value as Category : undefined
}

async function videoFrames(file: File): Promise<string[]> {
  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolve, reject) => {
      const video = document.createElement('video')
      const timer = setTimeout(() => reject(new Error('Could not read this video. Try another file.')), 10000)
      video.preload = 'auto'; video.muted = true; video.playsInline = true
      video.onerror = () => { clearTimeout(timer); reject(new Error('This video format is not supported.')) }
      video.onloadedmetadata = () => {
        if (!Number.isFinite(video.duration) || video.duration > 15) { clearTimeout(timer); reject(new Error('Please choose a video that is 15 seconds or shorter.')); return }
        video.currentTime = Math.min(.5, video.duration / 2)
      }
      video.onseeked = () => {
        clearTimeout(timer)
        const canvas = document.createElement('canvas')
        canvas.width = Math.min(720, video.videoWidth); canvas.height = Math.round(video.videoHeight * canvas.width / video.videoWidth)
        const context = canvas.getContext('2d')
        if (!context) { reject(new Error('Could not prepare this video.')); return }
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        resolve([canvas.toDataURL('image/jpeg', .8).split(',')[1]])
      }
      video.src = url
    })
  } finally { URL.revokeObjectURL(url) }
}

export function DropScreen() {
  const { api, demo, go, notify, user } = useMobile()
  const [params] = useSearchParams()
  const requestedCategory = categoryFromParams(params.get('category'))
  const [category, setCategory] = useState<Category>(requestedCategory ?? 'Misc')
  const isEvent = category === 'Events'
  const localDateTime = (offset: number) => { const date = new Date(Date.now() + offset * 3600000); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
  const [startsAt, setStartsAt] = useState(() => localDateTime(1))
  const [endsAt, setEndsAt] = useState(() => localDateTime(3))
  const userLocation = useUserLocation()
  const demoLocation = useDemoLocation()
  const currentLocation = demo ? demoLocation : userLocation
  // A bubble always drops exactly where you're standing: no picking another spot.
  const location = currentLocation
  const coordinates = location ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}` : ''
  const { busy, run } = useOperation()
  const [kind, setKind] = useState<'Text' | 'Photo' | 'Video'>('Text')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [placeName, setPlaceName] = useState('')
  const [locationFocused, setLocationFocused] = useState(false)
  const [places, setPlaces] = useState<BubblePreview[]>([])
  const [searching, setSearching] = useState(false)
  const [autoLocation, setAutoLocation] = useState(true)
  const [floatsFor, setFloatsFor] = useState<DropBubbleInput['floatsFor']>('1m')
  const [file, setFile] = useState<File>()
  const [preview, setPreview] = useState('')
  const [released, setReleased] = useState<Bubble>()
  const nearestPlace = places.find(place => currentLocation && distanceM(currentLocation, place) < 60)?.placeName
  const automaticName = nearestPlace ?? (currentLocation ? `${currentLocation.lat.toFixed(5)}, ${currentLocation.lng.toFixed(5)}` : '')
  useEffect(() => { if (autoLocation) setPlaceName(automaticName) }, [autoLocation, automaticName])
  useEffect(() => {
    if (!requestedCategory) return
    setCategory(requestedCategory)
    if (requestedCategory === 'Events') {
      setKind(current => current === 'Video' ? 'Text' : current)
      setFile(undefined)
    }
  }, [requestedCategory])
  const query = placeName.trim().toLowerCase()
  const matches = places.filter(place => autoLocation || query.split(/\s+/).every(word => place.placeName.toLowerCase().includes(word)))
  useEffect(() => {
    if (!currentLocation) return
    let active = true
    setPlaces([]); setSearching(true)
    result(api.nearbyBubbles({ lat: currentLocation.lat, lng: currentLocation.lng, radiusM: NAME_SUGGESTION_RADIUS_M })).then(items => {
      if (active) setPlaces(items.filter((item, index) => distanceM(currentLocation, item) <= NAME_SUGGESTION_RADIUS_M && items.findIndex(other => other.placeName === item.placeName) === index).sort((a, b) => distanceM(currentLocation, a) - distanceM(currentLocation, b)))
    }).catch(() => { if (active) setPlaces([]) }).finally(() => { if (active) setSearching(false) })
    return () => { active = false }
  }, [api, currentLocation?.lat, currentLocation?.lng])
  useEffect(() => {
    if (!file) { setPreview(''); return }
    const url = URL.createObjectURL(file); setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  function submit() {
    if (!location) { notify('Waiting for your location…'); return }
    if (!title.trim() || !placeName.trim()) return
    if (kind !== 'Text' && !file) { notify(`Choose a ${kind.toLowerCase()} first.`); return }
    void run(async () => {
      if (category === 'Events') {
        if (!startsAt || !endsAt) throw new Error('Choose a start and end date and time.')
        const schedule = { startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
        if (demo) {
          const event = await demoEvents.create({ title, text, placeName, lat: location.lat, lng: location.lng, event: schedule, photo: file }, user)
          setReleased(event); return
        }
        let uploadId: string | undefined
        if (file) {
          if (file.size > 20 * 1024 * 1024) throw new Error('Keep your upload under 20 MB.')
          if (!file.type.startsWith('image/')) throw new Error('Events only accept a photo for now.')
          uploadId = (await result(api.uploadMedia(file))).uploadId
        }
        const outcome = await result(api.dropEvent({
          title: title.trim(),
          text: text.trim(),
          placeName: placeName.trim(),
          lat: location.lat,
          lng: location.lng,
          startsAt: schedule.startsAt,
          endsAt: schedule.endsAt,
          uploadId,
        }))
        if (!outcome.ok) { notify(outcome.reasons.join(' ') || 'Please edit your event and try again.'); return }
        const latest = await api.getEvents()
        if (latest.success) demoEvents.syncRemote(latest.data.map(toEventItem))
        else demoEvents.syncRemote([toEventItem(outcome.event)])
        setReleased(toEventItem(outcome.event))
        return
      }
      let uploadId: string | undefined, frameBase64: string[] | undefined
      if (file) {
        if (file.size > 20 * 1024 * 1024) throw new Error('Keep your upload under 20 MB.')
        if (kind === 'Video') frameBase64 = await videoFrames(file)
        uploadId = (await result(api.uploadMedia(file))).uploadId
      }
      const outcome = await result(api.dropBubble({ title: title.trim(), text: text.trim(), category, lat: location.lat, lng: location.lng, placeName: placeName.trim(), floatsFor, uploadId, frameBase64 }))
      if (!outcome.ok) { notify(outcome.reasons.join(' ') || 'Please edit your note and try again.'); return }
      setReleased(outcome.bubble)
    })
  }
  if (released) {
    const releasedEvent = released.category === 'Events'
    return <section className="release-screen screen-fill"><div className="floating-bubl" aria-hidden="true">{preview && kind === 'Photo' ? <img src={preview} alt="Your upload" /> : preview && kind === 'Video' ? <video src={preview} muted playsInline preload="metadata" /> : <CategoryIcon category={released.category} />}</div><h1>{releasedEvent ? 'Your event is live.' : 'Your bubble is floating.'}</h1><p className="lead">{releasedEvent ? `People near ${released.placeName} can find it on Events and pop it while it’s on.` : `Anyone who walks past ${released.placeName} can get close and pop it.`}</p>
      <div className="safety-card"><p className="eyebrow"><ShieldCheck size={15} />{'Safety check'}</p><p><Check />{released.moderation === 'passed' ? (releasedEvent ? 'Your event passed the safety check.' : 'Your bubble passed the safety check.') : (releasedEvent ? 'Your event was saved, but moderation was unavailable.' : 'Your bubble was saved, but moderation was unavailable.')}</p><p><MapPin />Pinned to this place, not your profile.</p></div>
      <div className="bottom-actions"><Button className="bubl-primary" onClick={() => go(releasedEvent ? 'events' : 'walk')}>{releasedEvent ? 'Back to Events' : 'Back to walking'}</Button><button className="text-button" onClick={() => { setReleased(undefined); setText(''); setTitle(''); setFile(undefined); if (releasedEvent) setCategory('Events') }}>{releasedEvent ? 'Drop another event' : 'Drop another'}</button></div></section>
  }
  return <section className="drop-screen screen-fill"><ScreenHeader title={isEvent ? 'Drop an event' : 'Drop a bubble'} close onBack={() => go(isEvent ? 'events' : 'walk')} />
    <form onSubmit={event => { event.preventDefault(); submit() }}>
      <div className="pinned-card"><span className="icon-disc blue"><MapPin /></span><div><p className="eyebrow">{isEvent ? 'Event venue · your location' : 'Pinned to your location'}</p><strong>{location ? (location.source === 'demo' ? `Your location · ${coordinates}` : 'Your current location') : 'Waiting for your location…'}</strong></div></div>
      <label className="field-label" htmlFor="place-name">{isEvent ? 'Where is it happening?' : 'Where is this spot?'}</label>
      <div className="location-input" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setLocationFocused(false) }}>
        <div className="location-entry"><MapPin aria-hidden="true" /><Input id="place-name" required maxLength={100} autoComplete="off" value={placeName} onFocus={() => setLocationFocused(true)} onKeyDown={event => { if (event.key === 'Escape') setLocationFocused(false) }} onChange={e => { setAutoLocation(false); setPlaceName(e.target.value); setLocationFocused(true) }} placeholder="Search nearby or name this place" aria-controls={locationFocused ? 'nearby-places' : undefined} />{placeName && <button type="button" aria-label="Clear location name" onClick={() => { setAutoLocation(false); setPlaceName(''); document.getElementById('place-name')?.focus() }}><X size={18} /></button>}</div>
        {locationFocused && <div id="nearby-places" className="location-suggestions" onPointerDown={event => { if ((event.target as HTMLElement).closest('button')) event.preventDefault() }}><button type="button" disabled={!currentLocation} onClick={() => { setAutoLocation(true); setPlaceName(automaticName); setLocationFocused(false) }}><LocateFixed /><span>Use your location<small>{currentLocation ? `${currentLocation.lat.toFixed(5)}, ${currentLocation.lng.toFixed(5)}` : 'Finding your location…'}</small></span></button>{searching && <p className="location-search-status" role="status">Finding nearby places…</p>}{matches.map(place => <button type="button" key={place.id} onClick={() => { setAutoLocation(false); setPlaceName(place.placeName); setLocationFocused(false) }}><MapPin /><span>{place.placeName}<small>{Math.round(distanceM(location!, place))} m from you</small></span></button>)}{!searching && query && !autoLocation && !matches.some(place => place.placeName.toLowerCase() === query) && <button type="button" onClick={() => setLocationFocused(false)}><PlusCircle /><span>Use “{placeName.trim()}”<small>Name the spot you're standing at</small></span></button>}</div>}
      </div>
      <p className="location-caption">{isEvent ? 'The event is pinned exactly where you’re standing.' : "Your bubble drops exactly where you're standing."}</p>
      {!isEvent && location && <LocationMap lat={location.lat} lng={location.lng} label={placeName || 'Your location'} />}
      <fieldset><legend>{isEvent ? 'Category' : 'What kind of spot?'}</legend><Categories value={category} onChange={value => { setCategory(value); if (value === 'Events' && kind === 'Video') { setKind('Text'); setFile(undefined) } }} /></fieldset>
      {isEvent && <fieldset className="event-schedule"><legend>When is it happening?</legend><p className="fine-print">Times are in {Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll('_', ' ')}. An event pops only here, between its start and end.</p><label className="field-label" htmlFor="event-start">Starts</label><input id="event-start" type="datetime-local" required value={startsAt} onChange={e => setStartsAt(e.target.value)} /><label className="field-label" htmlFor="event-end">Ends</label><input id="event-end" type="datetime-local" required min={startsAt} value={endsAt} onChange={e => setEndsAt(e.target.value)} />{endsAt && startsAt && endsAt <= startsAt && <p className="inline-error" role="alert">End must be after start.</p>}{location && <><p className="field-label">Event location</p><LocationMap lat={location.lat} lng={location.lng} label={placeName || 'Event venue'} /><p className="fine-print">The event is pinned where you're standing.</p></>}</fieldset>}
      <div className="segmented" aria-label={isEvent ? 'Event format' : 'Note format'}>{(['Text', 'Photo', 'Video'] as const).filter(value => !isEvent || value !== 'Video').map(value => <button type="button" key={value} aria-pressed={kind === value} onClick={() => { setKind(value); setFile(undefined) }}>{value}</button>)}</div>
      {kind !== 'Text' && <label className="upload-area">{preview ? kind === 'Photo' ? <img src={preview} alt="Selected upload" /> : <video src={preview} muted playsInline /> : kind === 'Photo' ? <Camera /> : <Video />}<span>{file ? `${file.name} · change` : `Add a ${kind.toLowerCase()}`}</span><input type="file" aria-label={`Add a ${kind.toLowerCase()}`} accept={kind === 'Photo' ? 'image/*' : 'video/*'} onChange={e => setFile(e.target.files?.[0])} /><small>{kind === 'Video' ? 'Up to 15 seconds · ' : ''}20 MB max</small></label>}
      <label className="field-label" htmlFor="drop-title">{isEvent ? 'Event name' : 'Give it a name'}</label><Input id="drop-title" required value={title} maxLength={100} onChange={e => setTitle(e.target.value)} placeholder={isEvent ? 'Sunset on Low Steps' : 'The little thing everyone walks past'} />
      <label className="field-label" htmlFor="drop-text">{isEvent ? <>What should people know? <span>(optional)</span></> : <>What should someone know about this exact spot? <span>(optional)</span></>}</label><Textarea id="drop-text" maxLength={2000} value={text} onChange={e => setText(e.target.value)} placeholder={isEvent ? 'Bring a friend, stay for golden hour…' : 'Leave a little local knowledge…'} rows={4} /><p className="character-count">{text.length}/2000</p>
      <fieldset><legend>{isEvent ? 'Who can find it' : 'Who can pop it'}</legend><p className="public-pill"><PlusCircle size={16} />Anyone walking by</p></fieldset>
      {!isEvent && <fieldset><legend>Floats for</legend><div className="duration-options">{([['1w', '1 week'], ['1m', '1 month'], ['forever', 'Forever']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={floatsFor === value} onClick={() => setFloatsFor(value)}>{label}</button>)}</div></fieldset>}
      <p className="eyebrow safety-caption">{demo ? 'Demo only · nothing is published' : 'Safety-checked before it goes live'}</p><Button type="submit" className="bubl-primary" loading={busy} disabled={!location || !title.trim() || !placeName.trim() || (isEvent && (!title.trim() || !startsAt || !endsAt || endsAt <= startsAt))}>{isEvent ? 'Release event' : 'Release bubble'}</Button>
    </form>
  </section>
}
