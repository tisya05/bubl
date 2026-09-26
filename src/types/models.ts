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
  whoCanPop: 'anyone' | 'met';  // 'met' = only users with a mutual wave with the author
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

// Public profile: safe to show other users. Never add location, email or phone here.
export interface User {
  id: string;
  displayName: string;
  neighborhood: string;    // e.g. 'Morningside Heights', never coordinates
  language: string;        // reader's language for translate, e.g. 'en'
}

// Created by the server only when waves exist in both directions.
export interface Chat {
  id: string;
  userIds: [string, string];
  bubbleId: string;        // the bubble that connected them, pinned in the thread
  createdAt: string;
}

export interface Message {
  chatId: string;
  senderId: string;
  text: string;
  sentAt: string;
}
