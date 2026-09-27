import { useRef, useState } from 'react'
import { Flag, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useMobile } from './MobileApp'
import { useDemoEvents } from '../lib/eventDemo'
import { EventEditButton } from './EventEditButton'

export function ReportButton({ id, label }: { id: string; label: string }) {
  const { demo, notify, user } = useMobile()
  const ownEvent = useDemoEvents().find(item => item.id === id && item.authorId === user.id)
  const dialog = useRef<HTMLDialogElement>(null)
  const [reason, setReason] = useState('Incorrect location or details')
  const [details, setDetails] = useState('')
  const [saved, setSaved] = useState(false)
  if (ownEvent) return <EventEditButton item={ownEvent} />
  return <><button type="button" className="report-button" aria-label={`Report ${label}`} onClick={() => { setSaved(false); dialog.current?.showModal() }}><Flag size={17} /><span>Report</span></button>
    <dialog ref={dialog} className="report-dialog"><form onSubmit={event => {
      event.preventDefault()
      try {
        const key = demo ? 'bubl.demo.reports.v1' : 'bubl.report-drafts.v1'
        const reports = JSON.parse(localStorage.getItem(key) ?? '[]')
        localStorage.setItem(key, JSON.stringify([...reports, { targetId: id, label, reason, details: details.trim(), createdAt: new Date().toISOString(), status: 'local-only' }]))
        setSaved(true)
      } catch { notify('Could not save this report on your device. Please try again.') }
    }}><button type="button" className="round-button report-close" aria-label="Close report" onClick={() => dialog.current?.close()}><X /></button><Flag className="report-heading-icon" /><h2>{saved ? 'Report saved on this device' : 'Flag this spot'}</h2><p>{saved ? 'It hasn’t been sent to a moderation team. Reports will be submitted once reporting is connected.' : label}</p>{!saved && <><label className="field-label" htmlFor={`reason-${id}`}>What’s wrong?</label><select id={`reason-${id}`} value={reason} onChange={event => setReason(event.target.value)}>{['Incorrect location or details', 'Event canceled or wrong date', 'Spam or advertising', 'Inappropriate or unsafe content', 'Something else'].map(value => <option key={value}>{value}</option>)}</select><label className="field-label" htmlFor={`report-details-${id}`}>More details (optional)</label><textarea id={`report-details-${id}`} value={details} onChange={event => setDetails(event.target.value)} maxLength={1000} rows={3} /><p className="fine-print">{demo ? 'Demo report · saved only on this device.' : 'Reporting is not connected yet. Save a draft on this device.'}</p></>}<Button type={saved ? 'button' : 'submit'} className="bubl-primary" onClick={saved ? () => dialog.current?.close() : undefined}>{saved ? 'Done' : 'Save report'}</Button></form></dialog>
  </>
}
