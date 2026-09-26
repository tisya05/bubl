/**
 * Placeholder home page — replace this with the app's real home.
 *
 * This is intentionally unstyled scaffolding, not a design to build on.
 * Design the app's own look (layout, theme tokens, typography) from your
 * product's point of view instead of extending this page.
 */

import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { AuthOverlay, signOut, useAuthProfileReady } from 'deepspace'
import { Button } from '@/components/ui/Button'
import { MobileApp } from '@/bubl/components/MobileApp'
import { api } from '@/bubl/api/client'

export default function HomePage() {
  if (import.meta.env.VITE_UI_ONLY || import.meta.env.VITE_USE_MOCK === 'true') return <Navigate to="/demo" replace />
  return <ConnectedHome />
}

function ConnectedHome() {
  const { isSignedIn, user } = useAuthProfileReady({ requireUser: true })
  const [showAuth, setShowAuth] = useState(false)
  if (!isSignedIn) return <div className="bubl-app screen-fill signin-screen"><p className="eyebrow">A city full of little discoveries</p><h1>Your next favorite spot is around the corner.</h1><p className="lead">Sign in to pop bubbles, leave your own, and meet the locals behind them.</p><Button className="bubl-primary" data-testid="nav-sign-in-button" onClick={() => setShowAuth(true)}>Sign in to bubl</Button><Link className="text-button" to="/demo">Explore the demo</Link>{showAuth && <AuthOverlay providers={['google', 'github']} onClose={() => setShowAuth(false)} />}</div>
  if (!user) return <div className="bubl-app screen-fill signin-screen" role="status">Getting your bubbles ready…</div>
  return <MobileApp api={api} user={{ id: user.id, name: user.name, imageUrl: user.imageUrl }} onSignOut={() => { void signOut().then(() => { window.location.href = '/' }) }} />
}
