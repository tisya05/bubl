import { useEffect, useState } from 'react'
import { CalendarDays, Check, Clock3, Heart, MapPin, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { demoEvents, eventAvailability, eventImage, toEventItem, useDemoEvents, type EventItem, type EventPrice } from '../lib/eventDemo'
import { useUserLocation } from '../hooks/useUserLocation'
import { useMobile, useOperation } from './MobileApp'
import { ReportButton } from './ReportButton'
import { BalloonsIcon } from './AppIcons'
import { Empty } from './MobileUI'
import type { EventSchedule } from '../lib/uiModels'

export function EventWhen({ event }: { event: EventSchedule }) {
  const date = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: event.timeZone })
  const time = (value: string) => new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: event.timeZone })
  const sameDay = date(event.startsAt) === date(event.endsAt)
  return <div className="event-when"><span><CalendarDays size={16} />{date(event.startsAt)}{!sameDay && ` – ${date(event.endsAt)}`}</span><span><Clock3 size={16} />{time(event.startsAt)} – {time(event.endsAt)}<small>{event.timeZone.replaceAll('_', ' ')}</small></span></div>
}

function EventCard({ item, now }: { item: EventItem; now: number }) {
  const { open, openWithPop, go, user, api } = useMobile()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const location = useUserLocation()
  const { busy, run } = useOperation()
  const [image, setImage] = useState<string>()
  useEffect(() => {
    let active = true
    eventImage(item).then(url => { if (active) setImage(url) }).catch(() => setImage(undefined))
    return () => { active = false }
  }, [item.mediaUrl])
  const unavailable = eventAvailability(item, location, now)
  const canDeleteOwn = item.authorId === user.id
  return (
    <article className="event-card">
      <div className="event-cover">
        <img src={image ?? '/bubl/event-social.svg'} alt={item.title} loading="lazy" onError={event => { event.currentTarget.src = '/bubl/event-social.svg' }} />
        <span className="event-cover-label"><BalloonsIcon />{now >= Date.parse(item.event.endsAt) ? 'Ended' : now < Date.parse(item.event.startsAt) ? 'Coming up' : 'Happening now'}</span>
        <button className={`event-heart ${item.hearted ? 'selected' : ''}`} aria-label={`Heart ${item.title}`} aria-pressed={item.hearted} onClick={() => run(async () => demoEvents.heart(item.id))}><Heart fill={item.hearted ? 'currentColor' : 'none'} /></button>
      </div>
      <div className="event-card-body">
        <h2>{item.sourceUrl ? <a className="event-title-link" href={item.sourceUrl} target="_blank" rel="noreferrer">{item.title}</a> : item.title}</h2>
        <p className={`event-description ${expanded ? 'expanded' : ''}`}>{item.text || 'Discover something happening in New York City.'}</p>
        {item.text.length > 110 && <button className="event-more" type="button" onClick={() => setExpanded(value => !value)}>{expanded ? 'Show less' : 'Show more…'}</button>}
        <p className="event-location"><MapPin size={16} />{item.placeName}<span className="event-price">{item.price}</span></p>
        <EventWhen event={item.event} />
        <div className="event-card-actions">
          <Button className="bubl-primary" aria-pressed={item.going} onClick={() => run(async () => demoEvents.going(item.id))}>{item.going ? <Check /> : <Plus />}{item.going ? 'Going' : 'I’m going'}</Button>
          <Button className="bubl-outline" loading={busy} disabled={!item.poppedAt && !!unavailable} onClick={() => run(async () => {
            if (item.poppedAt) { open({ ...await demoEvents.saved(item.id, user.id), fromEvents: true }); return }
            await openWithPop({ ...await demoEvents.pop(item.id, location), fromEvents: true })
          })}>{item.poppedAt ? 'Open again' : 'Pop event'}</Button>
        </div>
        <p className="event-pop-rule">{item.poppedAt ? '✓ Already popped' : unavailable ?? 'You’re here, and it’s on. Pop to discover it.'}</p>
        <div className="event-card-foot">
          <button className="text-button" onClick={() => go('walk', item.id)}>Find it on the map</button>
          <ReportButton id={item.id} label={item.title} />
          <button className="event-delete" aria-label={`Delete ${item.title}`} onClick={() => setConfirmDelete(true)}><Trash2 size={16} />Delete</button>
        </div>
        {confirmDelete && (
          <div className="event-delete-confirm">
            <p>{canDeleteOwn ? 'Delete this event?' : 'Remove this event from your feed?'}</p>
            <div>
              <button type="button" disabled={busy} onClick={() => run(async () => {
                if (!canDeleteOwn) { demoEvents.hideFromFeed(item.id); return }
                if (item.remote) {
                  const result = await api.deleteEvent(item.id)
                  if (!result.success) throw new Error(typeof result.error === 'string' ? result.error : 'Could not delete this event.')
                  demoEvents.removeRemote(item.id)
                  return
                }
                demoEvents.delete(item.id, user.id)
              })}>Delete</button>
              <button type="button" onClick={() => setConfirmDelete(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </article>
  )
}

export function EventsScreen() {
  const { go, api } = useMobile()
  const events = useDemoEvents()
  const [filter, setFilter] = useState<'all' | 'going' | 'hearted'>('all')
  const [price, setPrice] = useState<'all' | EventPrice>('all')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [location, setLocation] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState('')
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const visible = events
    .filter(item => !item.feedHidden && (filter === 'all' || (filter === 'going' ? item.going : item.hearted)))
    .filter(item => price === 'all' || item.price === price)
    .filter(item => !location.trim() || `${item.title} ${item.placeName}`.toLowerCase().includes(location.trim().toLowerCase()))
    .filter(item => !date || item.event.startsAt.slice(0, 10) === date)
    .filter(item => !time || new Date(item.event.startsAt).toTimeString().slice(0, 5) === time)
    .sort((a, b) => Number(!!b.remote) - Number(!!a.remote) || Date.parse(a.event.startsAt) - Date.parse(b.event.startsAt))

  const clearFilters = () => { setPrice('all'); setDate(''); setTime(''); setLocation('') }

  const refresh = async () => {
    setRefreshing(true)
    setRefreshMessage('')
    const result = await api.refreshEvents()
    if (result.success) {
      const latest = await api.getEvents()
      if (latest.success) demoEvents.syncRemote(latest.data.map(toEventItem))
    }
    setRefreshing(false)
    setRefreshMessage(result.success
      ? `Scraped ${result.data.scraped} events · ${new Date(result.data.scrapedAt).toLocaleTimeString()}`
      : `Refresh failed: ${String(result.error)}`)
  }

  return (
    <section className="social-screen events-screen">
      <div className="events-heading"><div><h1>What's happening</h1></div><span className="events-icon"><BalloonsIcon /></span></div>
      <p className="lead">Find your people, one little plan at a time.</p>
      <div className="segmented">
        {(['all', 'going', 'hearted'] as const).map(value => (
          <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>
            {value === 'all' ? 'Discover' : value === 'going' ? 'Going' : 'Hearted'}
          </button>
        ))}
      </div>
      <div className="event-filters">
        <label>Date<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
        <label>Time<input type="time" value={time} onChange={event => setTime(event.target.value)} /></label>
        <label>Price<select value={price} onChange={event => setPrice(event.target.value as 'all' | EventPrice)}><option value="all">Any price</option><option>Free</option><option>$</option><option>$$</option><option>$$$</option></select></label>
        <label>Location<input value={location} onChange={event => setLocation(event.target.value)} placeholder="Neighborhood or venue" /></label>
        <button type="button" className="text-button" onClick={clearFilters}>Clear</button>
      </div>
      <button type="button" className="text-button event-refresh" disabled={refreshing} onClick={refresh}>{refreshing ? 'Refreshing…' : 'Refresh events now'}</button>
      {refreshMessage && <p className="events-refresh-message">{refreshMessage}</p>}
      {visible.map(item => <EventCard key={item.id} item={item} now={now} />)}
      {!visible.length && (
        <Empty icon={<BalloonsIcon />} title={filter === 'all' ? 'Something good is on its way.' : 'Your next plan starts here.'}>
          {filter === 'all' ? 'Events will appear here when the feed is connected.' : 'Save an event with Heart or Going to find it here.'}
        </Empty>
      )}
      <button className="text-button" onClick={() => go('drop', undefined, { category: 'Events' })}>Hosting something? Drop an event</button>
    </section>
  )
}
