import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, LockKeyhole, Phone, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAppViewport } from '@/bubl/hooks/useAppViewport'
import { loadProfile, saveProfile } from '@/bubl/lib/localProfile'
import '@/bubl/mobile.css'

type Step = 'choice' | 'phone' | 'code' | 'handle'

interface Droplet { key: number; left: number; top: number; dx: number; dy: number; size: number; delay: number }
interface Burst { x: number; y: number; droplets: Droplet[] }

// Scatters droplets across the button's own footprint (not one spot), so the
// whole pill reads as bursting apart. Each flies outward from the button's
// center through its own start point, then gravity pulls it down as it fades.
function makeDroplets(rect: DOMRect): Droplet[] {
  const cx = rect.width / 2
  const cy = rect.height / 2
  return Array.from({ length: 12 }, (_, i) => {
    const left = Math.random() * rect.width
    const top = Math.random() * rect.height
    const angle = Math.atan2(top - cy, left - cx || 1)
    const dist = 26 + Math.random() * 40
    const dx = Math.cos(angle) * dist
    const dy = Math.sin(angle) * dist * 0.5 + 30 + Math.random() * 30
    return { key: i, left, top, dx, dy, size: 6 + Math.random() * 8, delay: Math.random() * 90 }
  })
}

export default function Login() {
  const navigate = useNavigate()
  const viewport = useAppViewport()
  const [step, setStep] = useState<Step>('choice')
  const [method, setMethod] = useState<'phone' | 'google'>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [handle, setHandle] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [notice, setNotice] = useState('')
  const [transitioning, setTransitioning] = useState(false)
  const [burst, setBurst] = useState<Burst | null>(null)
  const submitRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(value => value - 1), 1000); return () => clearTimeout(timer) }, [cooldown])
  function move(next: Step) { setError(''); setNotice(''); setStep(next) }
  // Every button that leads to a new screen vanishes almost instantly (poof)
  // while droplets burst from its shape and fall away (.poofing / .droplet-burst
  // in mobile.css); the next screen only appears once that finishes.
  function popThen(target: HTMLElement | null, after: () => void) {
    if (!target || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { after(); return }
    setTransitioning(true)
    target.classList.add('poofing')
    const rect = target.getBoundingClientRect()
    setBurst({ x: rect.left, y: rect.top, droplets: makeDroplets(rect) })
    setTimeout(() => { after(); setBurst(null); setTransitioning(false) }, 620)
  }
  function submit() {
    setError('')
    if (step === 'phone') {
      if (!/^\+?[\d\s().-]+$/.test(phone) || phone.replace(/\D/g, '').length < 8 || phone.replace(/\D/g, '').length > 15) { setError('Enter a phone number with country code.'); return }
      popThen(submitRef.current, () => { setCode(''); setCooldown(30); move('code') })
    } else if (step === 'code') {
      if (code !== '123456') { setError('For this demo, enter 123456. No text message was sent.'); return }
      popThen(submitRef.current, () => move('handle'))
    } else if (step === 'handle') {
      const username = handle.replace(/^@/, '').trim().toLowerCase()
      if (!/^[a-z0-9_]{3,24}$/.test(username)) { setError('Use 3–24 letters, numbers, or underscores for your username.'); return }
      if (password.length < 8) { setError('Use at least 8 characters for the demo password.'); return }
      try {
        const profile = loadProfile({ id: 'me', name: 'You' })
        saveProfile('me', { ...profile, username })
        popThen(submitRef.current, () => { setPassword(''); setPhone(''); setCode(''); navigate('/welcome') })
      } catch { setError('Your browser could not save your profile. Please try again.') }
    }
  }
  return <main ref={viewport} className={`bubl-app mobile-shell login-screen login-${step}`}>
    <div className="login-scroll"><header className="login-header">{step === 'choice' ? <Link to="/" className="round-button" aria-label="Back to intro"><ChevronLeft /></Link> : <button className="round-button" aria-label="Back" onClick={() => move(step === 'phone' ? 'choice' : step === 'code' ? 'phone' : method === 'google' ? 'choice' : 'code')}><ChevronLeft /></button>}<span>Demo sign-in</span></header>
      <div className="login-orbs" aria-hidden="true"><i /><i /><i /></div>
      <section className="login-card" key={step}>
        {step === 'choice' ? <><h1 className="login-wordmark">bubl</h1><p className="login-subtitle">Discover the city on foot.</p><Button className="google-login" disabled={transitioning} onClick={event => popThen(event.currentTarget, () => { setMethod('google'); move('handle') })}><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.5h3.3c1.9-1.8 2.9-4.3 2.9-7.4Z"/><path fill="#34A853" d="M12 22c2.7 0 5-0.9 6.7-2.4l-3.3-2.5c-.9.6-2 1-3.4 1-2.6 0-4.9-1.8-5.7-4.1H2.9v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.3 14a6 6 0 0 1 0-4V7.4H2.9a10 10 0 0 0 0 9.2Z"/><path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8A9.7 9.7 0 0 0 12 2a10 10 0 0 0-9.1 5.4L6.3 10c.8-2.3 3.1-4.1 5.7-4.1Z"/></svg>Continue with Google</Button><div className="login-divider"><span />or<span /></div><Button className="bubl-primary" disabled={transitioning} onClick={event => popThen(event.currentTarget, () => { setMethod('phone'); move('phone') })}><Phone size={18} />Use phone number</Button><p className="login-demo-note">Preview only. Google and text verification aren’t connected yet.</p></> : <form onSubmit={event => { event.preventDefault(); submit() }}>
          <p className="eyebrow">Step {step === 'phone' ? '1' : step === 'code' ? '2' : '3'} of 3</p>
          <h1>{step === 'phone' ? 'What’s your number?' : step === 'code' ? 'Check your texts.' : 'Pick your handle.'}</h1>
          <p className="login-subtitle">{step === 'phone' ? 'We’ll use a one-time code to get you started.' : step === 'code' ? <>Enter the 6-digit code for <strong>{phone}</strong>.</> : 'This is how other users see you on the street.'}</p>
          {step === 'phone' && <><label className="sr-only" htmlFor="login-phone">Phone number</label><input id="login-phone" type="tel" autoComplete="tel" placeholder="+1 (555) 000-0000" value={phone} onChange={event => setPhone(event.target.value)} required maxLength={24} /><p className="login-demo-note">Demo only — no SMS will be sent.</p></>}
          {step === 'code' && <><label className="sr-only" htmlFor="login-code">Verification code</label><input id="login-code" className="code-input" type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" value={code} maxLength={6} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} required /><button className="text-button login-resend" type="button" disabled={cooldown > 0} onClick={() => { setCooldown(30); setNotice('Demo code: 123456. No text message was sent.') }}>{cooldown ? `Resend code in ${cooldown}s` : 'Resend code'}</button></>}
          {step === 'handle' && <>{method === 'google' && <p className="login-google-note"><LockKeyhole size={18} />Google preview · no account connected</p>}<label className="sr-only" htmlFor="login-handle">Username</label><input id="login-handle" placeholder="@username" autoCapitalize="none" autoCorrect="off" autoComplete="username" value={handle} onChange={event => setHandle(event.target.value)} required maxLength={25} /><label className="sr-only" htmlFor="login-password">Demo password</label><div className="login-password"><input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="off" placeholder="Password" value={password} onChange={event => setPassword(event.target.value)} required minLength={8} maxLength={128} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff /> : <Eye />}</button></div><p className="login-demo-note">Use a pretend password. It won’t be saved or sent. Only your username is saved on this device.</p></>}
          {error && <p className="login-error" role="alert">{error}</p>}{notice && <p className="login-demo-note" role="status">{notice}</p>}
          <Button type="submit" ref={submitRef} disabled={transitioning} className="bubl-primary">{step === 'phone' ? 'Send code' : step === 'code' ? 'Verify' : 'Create account'}</Button>
        </form>}
      </section><Link className="text-button login-skip" to="/welcome">Explore the demo without signing in</Link><p className="login-footer">A little local knowledge. A whole new city.</p>
    </div>
    {burst && <span className="droplet-burst" style={{ left: burst.x, top: burst.y }}>{burst.droplets.map(d => <i key={d.key} style={{ left: d.left, top: d.top, animationDelay: `${d.delay}ms`, '--size': `${d.size}px`, '--dx': `${d.dx}px`, '--dy': `${d.dy}px` } as CSSProperties} />)}</span>}
  </main>
}
