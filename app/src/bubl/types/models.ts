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
  moderation: 'passed' | 'unchecked';  // 'unchecked' = Gemini unavailable, saved anyway
  poppedCount?: number;    // optional denormalized counts, returned after canPop
  lovedCount?: number;
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

// Created by a successful canPop, one per user and bubble. Authors can't love their own bubble.
export interface Pop {
  userId: string;
  bubbleId: string;
  poppedAt: string;
  loved: boolean;
}

// Only between a bubble's author and someone who loved it, about that bubble. Either side may
// wave first. Two people who loved the same bubble can't see or wave at each other.
export interface Wave {
  fromUserId: string;
  toUserId: string;
  bubbleId: string;
  note?: string;           // optional, max 280 characters
  createdAt: string;
}

// Another user as we show them: DeepSpace's own user fields, minus email and role.
// Never add location, email or phone here.
export type User = Pick<RoomUser, 'id' | 'name' | 'imageUrl'>;

// One chat per user pair, created by the server only when both have waved.
export interface Chat {
  id: string;
  participantIds: [string, string];
  bubbleId: string;        // the FIRST bubble that connected them, pinned; never updated
  unlockedAt: string;
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
  note?: string;           // the waver's optional note
  createdAt: string;       // day only (midnight UTC), not the exact time
}

export interface ChatSummary {
  chat: Chat;
  otherUser: User;
  lastMessage?: Message;
  unread: boolean;
}
