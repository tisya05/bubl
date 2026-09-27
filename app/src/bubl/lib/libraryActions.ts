import type { Bubble, User } from '../types'

// Frontend capabilities, separate from the team's agreed server API contract.
export interface LibraryActions {
  outgoingWaves?(): Promise<{ to: User; bubbleId: string; placeName: string; note?: string }[]>
  getSavedBubble(id: string): Promise<{ bubble: Bubble; author: User; loved: boolean }>
  removePopped(id: string): Promise<void>
  deleteDropped(id: string): Promise<void>
  deleteChat(id: string): Promise<void>
  updateProfile(user: User): void
  simulateWaveBack?(authorId: string, bubbleId: string): void
}
