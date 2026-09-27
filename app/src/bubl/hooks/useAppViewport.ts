import { useLayoutEffect, useRef } from 'react'

// iOS 26 Home Screen apps can lay the page out short of the screen's bottom edge (the
// home-indicator strip), leaving empty page below the app. Returns that strip's height,
// or 0 anywhere else (Safari tabs, Android, older iOS, no gap), so nothing else changes.
function homeScreenBottomGap(): number {
  const iPhone = /iPhone|iPad|iPod/.test(navigator.userAgent)
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  if (!iPhone || !standalone) return 0
  const portrait = innerHeight >= innerWidth
  const screenHeight = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height)
  const gap = Math.round(screenHeight - innerHeight)
  return gap > 0 && gap <= 80 ? gap : 0
}

/** Follow the visible viewport, including Safari's keyboard-induced viewport pan. */
export function useAppViewport() {
  const ref = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const viewport = window.visualViewport
    let frame = 0
    let settle = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (!ref.current) return
        // Preserve browser accessibility zoom; only track unzoomed keyboard resizing.
        const normalScale = !viewport || Math.abs(viewport.scale - 1) < .01
        const editing = document.activeElement?.matches('input, textarea, [contenteditable="true"]')
        const keyboardOpen = normalScale && editing && viewport && (innerHeight - viewport.height > 80 || viewport.offsetTop > 0)
        if (!keyboardOpen) {
          // Fill the whole screen; bottom bars pad themselves by --app-bottom-gap (mobile.css).
          const gap = homeScreenBottomGap()
          ref.current.style.height = 'auto'
          ref.current.style.top = '0px'
          ref.current.style.bottom = `${-gap}px`
          ref.current.style.setProperty('--app-bottom-gap', `${gap}px`)
          return
        }
        ref.current.style.setProperty('--app-bottom-gap', '0px')
        ref.current.style.bottom = 'auto'
        ref.current.style.height = `${normalScale ? viewport?.height ?? innerHeight : innerHeight}px`
        ref.current.style.top = `${normalScale ? viewport?.offsetTop ?? 0 : 0}px`
      })
    }
    const focusChanged = () => {
      update()
      window.clearTimeout(settle)
      settle = window.setTimeout(update, 350)
    }
    update()
    viewport?.addEventListener('resize', update)
    viewport?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    window.addEventListener('pageshow', update)
    window.addEventListener('orientationchange', focusChanged)
    document.addEventListener('focusin', focusChanged)
    document.addEventListener('focusout', focusChanged)
    return () => {
      cancelAnimationFrame(frame); clearTimeout(settle)
      viewport?.removeEventListener('resize', update)
      viewport?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      window.removeEventListener('pageshow', update)
      window.removeEventListener('orientationchange', focusChanged)
      document.removeEventListener('focusin', focusChanged)
      document.removeEventListener('focusout', focusChanged)
    }
  }, [])
  return ref
}

