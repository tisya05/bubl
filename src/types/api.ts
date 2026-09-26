// Inputs and outputs of the server functions Tisya owns.
// All of these run server-side; API keys never reach the client.

import type { Bubble, Category } from './models';

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
export type CanPopResult =
  | { ok: true; bubble: Bubble }
  | { ok: false; distanceM: number };
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
