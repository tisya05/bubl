import type { CSSProperties, ReactNode } from 'react'
import { ChevronLeft, X } from 'lucide-react'
import { CATEGORY_META } from '../lib/uiCategories'
import type { Category } from '../lib/uiModels'
import { CATEGORIES } from '../lib/uiCategories'

export function CategoryIcon({ category, className = '' }: { category: Category; className?: string }) {
  const meta = CATEGORY_META[category]
  const Icon = meta.icon
  return <span className={`category-icon ${className}`} style={{ '--category': meta.color, '--tint': meta.tint } as CSSProperties}><Icon aria-hidden="true" /></span>
}
export function Categories({ value, onChange }: { value?: Category; onChange: (value: Category) => void }) {
  return <div className="category-chips" aria-label="Bubble categories">{CATEGORIES.map(category => {
    const Icon = CATEGORY_META[category].icon
    return <button key={category} type="button" aria-pressed={value === category} className={`${value === category ? 'selected ' : ''}${category === 'Events' ? 'category-events' : ''}`} onClick={() => onChange(category)} style={{ '--category': CATEGORY_META[category].color, '--tint': CATEGORY_META[category].tint } as CSSProperties}><Icon size={13} /><span>{category}</span></button>
  })}</div>
}
export function ScreenHeader({ title, onBack, close = false, children }: { title?: ReactNode; onBack: () => void; close?: boolean; children?: ReactNode }) {
  return <header className="screen-header"><button type="button" className="round-button" aria-label={close ? 'Close' : 'Back'} onClick={onBack}>{close ? <X /> : <ChevronLeft />}</button><h1>{title}</h1>{children ?? <span className="header-spacer" />}</header>
}
export function Avatar({ name, image }: { name?: string | null; image?: string | null }) {
  return <span className="bubl-avatar">{image ? <img src={image} alt="" /> : (name?.[0] ?? 'Y').toUpperCase()}</span>
}
export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <div className="bubl-empty"><span className="empty-icon">{icon}</span><h2>{title}</h2><p>{children}</p></div>
}
