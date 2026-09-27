import { lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Landing from './pages/index'
import './styles.css'
import './bubl/lib/safariScroll'

// The phone preview needs no auth, realtime providers, or unrelated routes.
const Login = lazy(() => import('./pages/(app)/login'))
const Welcome = lazy(() => import('./pages/(app)/welcome'))
const Demo = lazy(() => import('./pages/demo'))
createRoot(document.getElementById('root')!).render(
  <BrowserRouter><Suspense fallback={<div className="preview-loading" role="status">Opening bubl…</div>}>
    <Routes><Route path="/" element={<Landing />} /><Route path="/login" element={<Login />} /><Route path="/welcome" element={<Welcome />} /><Route path="/demo" element={<Demo />} /><Route path="*" element={<Navigate to="/demo" replace />} /></Routes>
  </Suspense></BrowserRouter>,
)
