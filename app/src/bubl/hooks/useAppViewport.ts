import { useLayoutEffect, useRef } from 'react'

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
          // screen.height includes space iOS may not allow this page to draw in.
          ref.current.style.height = 'auto'
          ref.current.style.top = '0px'
          ref.current.style.bottom = '0px'
          return
        }
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

