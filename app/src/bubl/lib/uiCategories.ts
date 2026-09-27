import { CATEGORY_META as shared } from '../colors'
import { CATEGORIES as categories } from '../types'
import { BalloonsIcon } from '../components/AppIcons'
export const CATEGORIES = [...categories, 'Events'] as const
export const CATEGORY_META = { ...shared, Events: { label: 'Events', color: '#E65D9C', tint: '#F7D4E5', icon: BalloonsIcon } }
