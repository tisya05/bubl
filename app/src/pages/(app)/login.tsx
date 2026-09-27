import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, Phone, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAppViewport } from '@/bubl/hooks/useAppViewport'
import { loadProfile, saveProfile } from '@/bubl/lib/localProfile'
import { AUTH_OFFLINE, claimHandle, demoSignIn, fetchMe, googleName, signInWithGoogle, type Me } from '@/bubl/lib/authActions'
import '@/bubl/mobile.css'

type Step = 'choice' | 'phone' | 'code' | 'handle'
type Method = 'phone' | 'google'
const METHOD_KEY = 'bubl.login.method'
const DEMO_ACCOUNTS = ['maya', 'dev', 'sam'] as const

export default function Login() {
  const navigate = useNavigate()
  const viewport = useAppViewport()
  const [step, setStep] = useState<Step>('choice')
  const [method, setMethod] = useState<Method>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [handle, setHandle] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(!AUTH_OFFLINE)
  const [userId, setUserId] = useState('me')
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(value => value - 1), 1000); return () => clearTimeout(timer) }, [cooldown])
  useEffect(() => {
    if (AUTH_OFFLINE) return
    let active = true
    fetchMe().then(async me => {
      if (!active) return
      if (me) await continueAs(me, (sessionStorage.getItem(METHOD_KEY) as Method | null) ?? 'google')
      if (active) setBusy(false)
    })
    return () => { active = false }
  }, [])
  function move(next: Step) { setError(''); setNotice(''); setStep(next) }
  async function continueAs(me: Me, via: Method) {
    if (me.onboarded) { navigate('/home', { replace: true }); return }
    if (me.handle) { navigate('/welcome', { replace: true }); return }
    setUserId(me.userId); setMethod(via)
    if (via === 'google') setName(await googleName())
    move('handle')
  }
  async function signInDemo(as: typeof DEMO_ACCOUNTS[number], via: Method) {
    setBusy(true); setError('')
    const problem = await demoSignIn(as)
    if (problem) { setError(problem); setBusy(false); return }
    sessionStorage.setItem(METHOD_KEY, via)
    // The auth provider only reads the session cookie on load, so reload to pick up the new one.
    window.location.assign('/login')
  }
  async function google() {
    if (AUTH_OFFLINE) { setMethod('google'); move('handle'); return }
    setBusy(true); setError('')
    sessionStorage.setItem(METHOD_KEY, 'google')
    try { await signInWithGoogle() } catch { setError('Google sign-in could not start. Please try again.'); setBusy(false) }
  }
  async function submit() {
    setError('')
    if (step === 'phone') {
      if (!/^\+?[\d\s().-]+$/.test(phone) || phone.replace(/\D/g, '').length < 8 || phone.replace(/\D/g, '').length > 15) { setError('Enter a phone number with country code.'); return }
      setCode(''); setCooldown(30); move('code')
    } else if (step === 'code') {
      if (code !== '123456') { setError('For this demo, enter 123456. No text message was sent.'); return }
      if (AUTH_OFFLINE) move('handle')
      else await signInDemo('sam', 'phone')
    } else if (step === 'handle') {
      const username = handle.replace(/^@/, '').trim().toLowerCase()
      const displayName = name.trim()
      if (!/^[a-z0-9_]{3,20}$/.test(username)) { setError('Use 3–20 lowercase letters, numbers, or underscores for your username.'); return }
      if (method === 'google' && !displayName) { setError('Enter your name.'); return }
      if (method === 'phone' && password.length < 8) { setError('Use at least 8 characters for the demo password.'); return }
      if (!AUTH_OFFLINE) {
        setBusy(true)
        const res = await claimHandle(username)
        setBusy(false)
        if (!res.ok) { setError(res.reason); return }
      }
      try {
        const profile = loadProfile({ id: userId, name: 'You' })
        saveProfile(userId, { ...profile, username, ...(method === 'google' ? { name: displayName } : {}) })
      } catch { /* The server already has the handle; the local copy is only a cache. */ }
      setPassword(''); setPhone(''); setCode('')
      sessionStorage.removeItem(METHOD_KEY)
      navigate('/welcome')
    }
  }
  return <main ref={viewport} className={`bubl-app mobile-shell login-screen login-${step}`}>
    <div className="login-scroll"><header className="login-header">{step === 'choice' ? <Link to="/" className="round-button" aria-label="Back to intro"><ChevronLeft /></Link> : <button className="round-button" aria-label="Back" disabled={busy} onClick={() => move(step === 'phone' ? 'choice' : step === 'code' ? 'phone' : method === 'google' ? 'choice' : 'code')}><ChevronLeft /></button>}</header>
      <div className="login-orbs" aria-hidden="true"><i /><i /><i /></div>
      <section className="login-card" key={step} aria-busy={busy}>
        {step === 'choice' ? <><h1 className="login-wordmark">bubl</h1><p className="login-subtitle">Discover the city on foot.</p><Button className="google-login" disabled={busy} onClick={google}><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.5h3.3c1.9-1.8 2.9-4.3 2.9-7.4Z"/><path fill="#34A853" d="M12 22c2.7 0 5-0.9 6.7-2.4l-3.3-2.5c-.9.6-2 1-3.4 1-2.6 0-4.9-1.8-5.7-4.1H2.9v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.3 14a6 6 0 0 1 0-4V7.4H2.9a10 10 0 0 0 0 9.2Z"/><path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8A9.7 9.7 0 0 0 12 2a10 10 0 0 0-9.1 5.4L6.3 10c.8-2.3 3.1-4.1 5.7-4.1Z"/></svg>Continue with Google</Button><div className="login-divider"><span />or<span /></div><Button className="bubl-primary" disabled={busy} onClick={() => { setMethod('phone'); move('phone') }}><Phone size={18} />Use phone number</Button>          {!AUTH_OFFLINE && <><div className="login-divider"><span />Demo sign-in<span /></div><div className="login-demo-accounts">{DEMO_ACCOUNTS.map(as => <button key={as} type="button" disabled={busy} aria-label={`Sign in as ${as}`} onClick={() => signInDemo(as, 'phone')}><span className={`login-demo-avatar avatar-${as}`} aria-hidden="true">{as[0].toUpperCase()}</span>{as}</button>)}</div></>}
          {error && <p className="login-error" role="alert">{error}</p>}</> : <form onSubmit={event => { event.preventDefault(); if (!busy) submit() }}>
          {method === 'phone' && <p className="eyebrow">Step {step === 'phone' ? '1' : step === 'code' ? '2' : '3'} of 3</p>}
          <h1>{step === 'phone' ? 'What’s your number?' : step === 'code' ? 'Check your texts.' : method === 'google' ? 'Create your account.' : 'Pick your handle.'}</h1>
          <p className="login-subtitle">{step === 'phone' ? 'We’ll use a one-time code to get you started.' : step === 'code' ? <>Enter the 6-digit code for <strong>{phone}</strong>.</> : 'Your @handle is how other users see you on the street.'}</p>
          {step === 'phone' && <><label className="sr-only" htmlFor="login-phone">Phone number</label><input id="login-phone" type="tel" autoComplete="tel" placeholder="+1 (555) 000-0000" value={phone} onChange={event => setPhone(event.target.value)} required maxLength={24} /><p className="login-demo-note">Demo only — no SMS will be sent.</p></>}
          {step === 'code' && <><label className="sr-only" htmlFor="login-code">Verification code</label><input id="login-code" className="login-code" type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" value={code} maxLength={6} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} required /><p className="login-demo-note">Use demo code <strong>123456</strong>. No text message was sent.</p><button className="text-button login-resend" type="button" disabled={cooldown > 0} onClick={() => { setCooldown(30); setNotice('Demo code: 123456. No text message was sent.') }}>{cooldown ? `Resend code in ${cooldown}s` : 'Resend code'}</button></>}
          {step === 'handle' && <>
            {method === 'google' && <><label className="sr-only" htmlFor="login-name">Name</label><input id="login-name" placeholder="Your name" autoComplete="name" value={name} onChange={event => setName(event.target.value)} required maxLength={40} /></>}
            <label className="sr-only" htmlFor="login-handle">Username</label><input id="login-handle" placeholder="@username" autoCapitalize="none" autoCorrect="off" autoComplete="username" value={handle} onChange={event => setHandle(event.target.value)} required maxLength={21} />
            {method === 'phone' && <><label className="sr-only" htmlFor="login-password">Demo password</label><div className="login-password"><input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="off" placeholder="Password" value={password} onChange={event => setPassword(event.target.value)} required minLength={8} maxLength={128} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff /> : <Eye />}</button></div><p className="login-demo-note">Use a pretend password. It won’t be saved or sent.</p></>}
            {method === 'google' && <p className="login-demo-note">Your name stays on this device. Others only see your @handle.</p>}
          </>}
          {error && <p className="login-error" role="alert">{error}</p>}{notice && <p className="login-demo-note" role="status">{notice}</p>}
          <Button type="submit" className="bubl-primary" disabled={busy}>{busy ? 'One moment…' : step === 'phone' ? 'Send code' : step === 'code' ? 'Verify' : 'Create account'}</Button>
        </form>}
      </section>
    </div>
  </main>
}
