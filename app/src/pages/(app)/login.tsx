import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAppViewport } from '@/bubl/hooks/useAppViewport'
import { loadProfile, saveProfile } from '@/bubl/lib/localProfile'
import { AUTH_OFFLINE, claimHandle, demoSignIn, fetchMe, googleName, signInWithGoogle, type Me } from '@/bubl/lib/authActions'
import '@/bubl/mobile.css'

type Step = 'choice' | 'handle'
const DEMO_ACCOUNTS = ['maya', 'dev', 'sam'] as const

interface Droplet { key: number; left: number; top: number; dx: number; dy: number; size: number; delay: number; spin: number }
interface Burst { x: number; y: number; w: number; h: number; droplets: Droplet[] }
const POP_MS = 560

// Droplets start scattered across the button's own surface, weighted towards its
// rim the way a real soap film beads up before it goes. Each one is thrown
// outward along its own radius, then gravity takes over as it shrinks and fades.
function makeDroplets(rect: DOMRect): Droplet[] {
  const cx = rect.width / 2
  const cy = rect.height / 2
  return Array.from({ length: 18 }, (_, i) => {
    const edge = 0.55 + Math.random() * 0.45
    const angle = (i / 18) * Math.PI * 2 + Math.random() * 0.35
    const left = cx + Math.cos(angle) * cx * edge
    const top = cy + Math.sin(angle) * cy * edge
    const dist = 18 + Math.random() * 34
    return {
      key: i,
      left, top,
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist * 0.45 + 22 + Math.random() * 26,
      size: 3 + Math.random() * 6,
      delay: Math.random() * 70,
      spin: -30 + Math.random() * 60,
    }
  })
}

export default function Login() {
  const navigate = useNavigate()
  const viewport = useAppViewport()
  const [step, setStep] = useState<Step>('choice')
  const [name, setName] = useState('')
  const [handle, setHandle] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(!AUTH_OFFLINE)
  const [userId, setUserId] = useState('me')
  const [transitioning, setTransitioning] = useState(false)
  const [burst, setBurst] = useState<Burst | null>(null)
  const [avatarBust] = useState(() => Date.now())
  const submitRef = useRef<HTMLButtonElement>(null)
  // Purely visual: the pressed button thins out like a soap film and breaks into
  // droplets, then `after` runs. Auth work stays exactly where it was — this only
  // defers the step change / navigation that would have happened anyway.
  function popThen(target: HTMLElement | null, after: () => void) {
    if (!target || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { after(); return }
    const rect = target.getBoundingClientRect()
    setTransitioning(true)
    target.classList.add('poofing')
    setBurst({ x: rect.left, y: rect.top, w: rect.width, h: rect.height, droplets: makeDroplets(rect) })
    setTimeout(() => { after(); setBurst(null); setTransitioning(false) }, POP_MS)
  }
  useEffect(() => {
    if (AUTH_OFFLINE) return
    let active = true
    fetchMe().then(async me => {
      if (!active) return
      if (me) await continueAs(me)
      if (active) setBusy(false)
    })
    return () => { active = false }
  }, [])
  function move(next: Step) { setError(''); setStep(next) }
  async function continueAs(me: Me) {
    if (me.onboarded) { navigate('/home', { replace: true }); return }
    if (me.handle) { navigate('/welcome', { replace: true }); return }
    setUserId(me.userId)
    setName(await googleName())
    move('handle')
  }
  async function signInDemo(as: typeof DEMO_ACCOUNTS[number]) {
    setBusy(true); setError('')
    const problem = await demoSignIn(as)
    if (problem) { setError(problem); setBusy(false); return }
    // The auth provider only reads the session cookie on load, so reload to pick up the new one.
    window.location.assign('/login')
  }
  async function google() {
    if (AUTH_OFFLINE) { move('handle'); return }
    setBusy(true); setError('')
    try { await signInWithGoogle() } catch { setError('Google sign-in could not start. Please try again.'); setBusy(false) }
  }
  async function submit() {
    setError('')
    const username = handle.replace(/^@/, '').trim().toLowerCase()
    const displayName = name.trim()
    if (!/^[a-z0-9_]{3,20}$/.test(username)) { setError('Use 3–20 lowercase letters, numbers, or underscores for your username.'); return }
    if (!displayName) { setError('Enter your name.'); return }
    if (!AUTH_OFFLINE) {
      setBusy(true)
      const res = await claimHandle(username)
      setBusy(false)
      if (!res.ok) { setError(res.reason); return }
    }
    try {
      const profile = loadProfile({ id: userId, name: 'You' })
      saveProfile(userId, { ...profile, username, name: displayName })
    } catch { /* The server already has the handle; the local copy is only a cache. */ }
    popThen(submitRef.current, () => navigate('/welcome'))
  }
  return <main ref={viewport} className={`bubl-app mobile-shell login-screen login-${step}`}>
    <div className="login-scroll"><header className="login-header">{step === 'choice' ? <Link to="/" className="round-button" aria-label="Back to intro"><ChevronLeft /></Link> : <button className="round-button" aria-label="Back" disabled={busy} onClick={() => move('choice')}><ChevronLeft /></button>}</header>
      <div className="login-orbs" aria-hidden="true"><i /><i /><i /></div>
      <section className="login-card" key={step} aria-busy={busy}>
        {step === 'choice' ? <><h1 className="login-wordmark">bubl</h1><p className="login-subtitle">Discover the city on foot.</p><Button className="google-login" disabled={busy || transitioning} onClick={event => popThen(event.currentTarget, google)}><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.5h3.3c1.9-1.8 2.9-4.3 2.9-7.4Z"/><path fill="#34A853" d="M12 22c2.7 0 5-0.9 6.7-2.4l-3.3-2.5c-.9.6-2 1-3.4 1-2.6 0-4.9-1.8-5.7-4.1H2.9v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.3 14a6 6 0 0 1 0-4V7.4H2.9a10 10 0 0 0 0 9.2Z"/><path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8A9.7 9.7 0 0 0 12 2a10 10 0 0 0-9.1 5.4L6.3 10c.8-2.3 3.1-4.1 5.7-4.1Z"/></svg>Continue with Google</Button>
          {!AUTH_OFFLINE && <><div className="login-divider"><span />Demo sign-in<span /></div><div className="login-demo-accounts">{DEMO_ACCOUNTS.map(as => <button key={as} type="button" disabled={busy} aria-label={`Sign in as ${as}`} onClick={() => signInDemo(as)}><span className={`login-demo-avatar avatar-${as}`} aria-hidden="true"><img src={`/api/media/demo-avatar/${as}?v=${avatarBust}`} alt="" onError={event => { event.currentTarget.style.display = 'none' }} /></span>{as}</button>)}</div></>}
          <Link className="text-button login-demo-backup" to="/demo">Skip sign-in · try the demo</Link>
          {error && <p className="login-error" role="alert">{error}</p>}</> : <form onSubmit={event => { event.preventDefault(); if (!busy) submit() }}>
          <h1>Create your account.</h1>
          <p className="login-subtitle">Your @handle is how other users see you on the street.</p>
          <label className="sr-only" htmlFor="login-name">Name</label><input id="login-name" placeholder="Your name" autoComplete="name" value={name} onChange={event => setName(event.target.value)} required maxLength={40} />
          <label className="sr-only" htmlFor="login-handle">Username</label><input id="login-handle" placeholder="@username" autoCapitalize="none" autoCorrect="off" autoComplete="username" value={handle} onChange={event => setHandle(event.target.value)} required maxLength={21} />
          <p className="login-demo-note">Your name stays on this device. Others only see your @handle.</p>
          {error && <p className="login-error" role="alert">{error}</p>}
          <Button type="submit" ref={submitRef} className="bubl-primary" disabled={busy || transitioning}>{busy ? 'One moment…' : 'Create account'}</Button>
        </form>}
      </section>
    </div>
    {burst && <span className="droplet-burst" aria-hidden="true" style={{ left: burst.x, top: burst.y, width: burst.w, height: burst.h }}>{burst.droplets.map(d => <i key={d.key} style={{ left: d.left, top: d.top, animationDelay: `${d.delay}ms`, '--size': `${d.size}px`, '--dx': `${d.dx}px`, '--dy': `${d.dy}px`, '--spin': `${d.spin}deg` } as CSSProperties} />)}</span>}
  </main>
}
