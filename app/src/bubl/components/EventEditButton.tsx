import { useRef, useState } from 'react'
import { Pencil, X } from 'lucide-react'
import { demoEvents, type EventItem } from '../lib/eventDemo'
import { useMobile } from './MobileApp'
import { LocationMap } from './LocationMap'
import { useUserLocation } from '../hooks/useUserLocation'
import { distanceM } from '../lib/geo'

const localTime = (value: string) => { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
export function EventEditButton({ item }: { item: EventItem }) {
  const { user, notify } = useMobile()
  const location = useUserLocation()
  const dialog = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState(item)
  const [start, setStart] = useState(''), [end, setEnd] = useState('')
  const [error, setError] = useState(''), [saving, setSaving] = useState(false)
  return <><button className="report-button" aria-label={`Edit ${item.title}`} onClick={() => { setDraft(item); setStart(localTime(item.event.startsAt)); setEnd(localTime(item.event.endsAt)); setError(''); dialog.current?.showModal() }}><Pencil size={17} /><span>Edit</span></button>
    <dialog ref={dialog} className="report-dialog event-edit-dialog"><form onSubmit={async event => {
      event.preventDefault(); if (saving) return
      setSaving(true); setError('')
      try {
        if ((draft.lat !== item.lat || draft.lng !== item.lng) && (!location || distanceM(location, draft) > 500)) throw new Error('Choose a spot within 500 metres of your location.')
        await demoEvents.edit(item.id, { ...draft, event: { startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } }, user.id)
        dialog.current?.close(); notify('Event updated.')
      } catch (error) { setError(error instanceof Error ? error.message : 'Could not update this event.') }
      finally { setSaving(false) }
    }}>
      <button type="button" className="report-close" aria-label="Close event editor" onClick={() => dialog.current?.close()}><X /></button><h2>Edit event</h2>
      <label>Event name: <input required maxLength={100} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
      <label>Description: <textarea maxLength={2000} value={draft.text} onChange={e => setDraft({ ...draft, text: e.target.value })} /></label>
      <label>Location<input required maxLength={100} value={draft.placeName} onChange={e => setDraft({ ...draft, placeName: e.target.value })} /></label>
      <LocationMap lat={draft.lat} lng={draft.lng} label={draft.placeName} onPick={point => { if (!location || distanceM(location, point) > 500) { setError('Choose a spot within 500 metres of your location.'); return } setError(''); setDraft({ ...draft, ...point }) }} />
      <label>Starts: <input type="datetime-local" required value={start} onChange={e => setStart(e.target.value)} /></label>
      <label>Ends: <input type="datetime-local" required min={start} value={end} onChange={e => setEnd(e.target.value)} /></label>
      {error && <p role="alert" className="inline-error">{error}</p>}<button className="bubl-primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
    </form></dialog></>
}
