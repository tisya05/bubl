import type { CSSProperties } from 'react'
import { CATEGORY_META } from '../lib/uiCategories'

let lastTap = { x: typeof window === 'undefined' ? 0 : window.innerWidth / 2, y: typeof window === 'undefined' ? 0 : window.innerHeight * 0.8 }
if (typeof window !== 'undefined') window.addEventListener('pointerdown', event => { lastTap = { x: event.clientX, y: event.clientY } }, { capture: true, passive: true })

export const POP_TRANSITION_MS = 640
const RING_SIZE = 120

/** A see-through bubbly wash in the bubble's category color fades in while rings ripple out from the tap. */
export function PopTransition({ category }: { category?: string }) {
  const meta = CATEGORY_META[category as keyof typeof CATEGORY_META] ?? CATEGORY_META.Street
  const { x, y } = lastTap
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
  const style = { '--pop-x': `${x}px`, '--pop-y': `${y}px`, '--ring-end': (radius * 2.2) / RING_SIZE, '--pop-color': meta.color, '--pop-tint': meta.tint } as CSSProperties
  return <div className="pop-transition" role="status" aria-label="Popping bubble" style={style}>
    <span className="pop-ring" />
    <span className="pop-ring pop-ring-late" />
  </div>
}
