// Shared data shapes for bubl. Everyone codes against these.
// Change them only in a tisya-contracts-* PR, announced in the group chat.

export const CATEGORIES = ['Food', 'Cafe', 'Park', 'Street', 'Misc'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Bubble {
  id: string;
  authorId: string;
  lat: number;
  lng: number;
  category: Category;
  title: string;
  text: string;            // sealed: only returned after canPop passes
  mediaUrl?: string;       // photo or video, GPS metadata stripped
  mediaType?: 'photo' | 'video';
  language: string;        // e.g. 'en', 'es'
  audioUrl?: string;       // cached ElevenLabs audio
  popRadiusM: number;      // 15 by default, 60 for the Lerner demo bubble
  whoCanPop: 'anyone' | 'met';
  expiresAt?: string;      // ISO date, undefined = forever
  createdAt: string;
  status: 'live' | 'rejected';
}

// What the map receives for nearby bubbles: NO title, NO text, NO media.
export interface BubblePreview {
  id: string;
  lat: number;
  lng: number;
  category: Category;
}

export interface Pop {
  userId: string;
  bubbleId: string;
  poppedAt: string;
  loved: boolean;
}

export interface Wave {
  fromUserId: string;
  toUserId: string;
  bubbleId: string;
  createdAt: string;
}

export interface Message {
  chatId: string;
  senderId: string;
  text: string;
  sentAt: string;
}
