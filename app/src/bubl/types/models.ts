// Shared data shapes for bubl. Everyone codes against these.
// See docs/CONTRACTS.md for the rules and how to change them.

import type { RoomUser } from 'deepspace';

export const CATEGORIES = ['Food', 'Cafe', 'Park', 'Street', 'Misc'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Bubble {
  id: string;
  authorId: string;
  lat: number;
  lng: number;
  placeName: string;       // cross streets, e.g. 'Broadway & 116th St'
  category: Category;
  title: string;           // sealed
  text: string;            // sealed: only returned after canPop passes
  mediaUrl?: string;       // sealed; unguessable URL, GPS metadata stripped
  mediaType?: 'photo' | 'video';
  language: string;        // e.g. 'en', 'es'
  audioUrl?: string;       // cached ElevenLabs audio
  popRadiusM: number;      // 15 by default, 60 for the Lerner demo bubble
  expiresAt?: string;      // ISO date, undefined = forever
  createdAt: string;
  status: 'live' | 'rejected';
  moderation: 'passed' | 'unchecked';  // 'unchecked' = Grok failed, saved anyway
}

// What the map receives: NO title, NO text, NO media.
export interface BubblePreview {
  id: string;
  lat: number;
  lng: number;
  placeName: string;
  category: Category;
  popRadiusM: number;      // so the client shows the in-bubble banner at the right distance
}

// Created by a successful canPop, one per user and bubble.
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

// Another user as we show them: DeepSpace's own user fields, minus email and role.
// Never add location, email or phone here.
export type User = Pick<RoomUser, 'id' | 'name' | 'imageUrl'>;

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

// ---- List items for the You and Chats tabs ----

export interface PoppedItem {
  bubbleId: string;
  title: string;
  category: Category;
  placeName: string;
  poppedAt: string;
  loved: boolean;
}

export interface DroppedItem {
  bubbleId: string;
  title: string;
  category: Category;
  placeName: string;
  createdAt: string;
  expiresAt?: string;
  status: 'floating' | 'expired';
  popCount: number;
}

export interface IncomingWave {
  from: User;
  bubbleId: string;
  placeName: string;
  category: Category;
  createdAt: string;
}

export interface ChatSummary {
  chat: Chat;
  otherUser: User;
  lastMessage?: Message;
  unread: boolean;
}
