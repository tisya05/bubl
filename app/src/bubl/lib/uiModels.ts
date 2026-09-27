// Frontend extensions only. The team's shared server contracts stay unchanged.
import type * as Shared from '../types'
export type { Api, User, ChatSummary, IncomingWave, Message, DropBubbleInput } from '../types'
export type Category = Shared.Category | 'Events'
export type EventSchedule = { startsAt: string; endsAt: string; timeZone: string }
export type Bubble = Omit<Shared.Bubble, 'category'> & { category: Category; event?: EventSchedule }
export type BubblePreview = Omit<Shared.BubblePreview, 'category'> & { category: Category; event?: EventSchedule }
export type PoppedItem = Omit<Shared.PoppedItem, 'category'> & { category: Category }
export type DroppedItem = Omit<Shared.DroppedItem, 'category'> & { category: Category }
