// Inputs and outputs of the server functions.
// All of these run server-side; API keys never reach the client.

import type { Bubble, BubblePreview, Category, User } from './models';

// ---- Urvi (DeepSpace) ----

// Map feed: previews only, never sealed content.
export interface NearbyBubblesInput {
  lat: number;
  lng: number;
  radiusM: number;
}
export type NearbyBubbles = (input: NearbyBubblesInput) => Promise<BubblePreview[]>;

// Who else loved this bubble, so the reader can wave at them.
// Server returns [] unless the caller has popped this bubble, and never includes the caller.
export interface LovedByInput {
  bubbleId: string;
}
export type LovedBy = (input: LovedByInput) => Promise<User[]>;

// ---- Tisya ----

// Drop pipeline: runs before a bubble goes live.
// For video drops, extract 1 to 2 frames on the client and send them as images.
export interface CheckBubbleInput {
  text: string;
  imageBase64?: string[];
}
export interface CheckBubbleResult {
  allowed: boolean;
  reasons: string[];
  suggestedCategory: Category;
}
export type CheckBubble = (input: CheckBubbleInput) => Promise<CheckBubbleResult>;

// Pop pipeline: the only way sealed bubble content reaches the client.
export interface CanPopInput {
  userLat: number;
  userLng: number;
  bubbleId: string;
}
// Missing and rejected bubbles both return 'not_found', so a failed pop
// never reveals whether a bubble exists.
export type CanPopResult =
  | { ok: true; bubble: Bubble }
  | { ok: false; reason: 'too_far'; distanceM: number }
  | { ok: false; reason: 'not_found' | 'expired' | 'not_met' };
export type CanPop = (input: CanPopInput) => Promise<CanPopResult>;

export interface TranslateInput {
  text: string;
  targetLanguage: string;
}
export interface TranslateResult {
  text: string;
  sourceLanguage: string;
}
export type Translate = (input: TranslateInput) => Promise<TranslateResult>;

// Generate once, store, reuse.
export interface SpeakInput {
  bubbleId: string;
  text: string;
}
export interface SpeakResult {
  audioUrl: string;
}
export type Speak = (input: SpeakInput) => Promise<SpeakResult>;
