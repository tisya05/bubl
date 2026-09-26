// Inputs and outputs of every server function the client can call.
// All of them run server-side and require a signed-in user; API keys never reach the client.
// Owners are in docs/CONTRACTS.md.

import type {
  Bubble,
  BubblePreview,
  Category,
  ChatSummary,
  DroppedItem,
  IncomingWave,
  Message,
  PoppedItem,
  User,
} from './models';

// ---- Walk and pop ----

// Excludes expired and rejected bubbles. Server caps radiusM at MAX_NEARBY_RADIUS_M.
export interface NearbyBubblesInput {
  lat: number;
  lng: number;
  radiusM: number;
}

// Success creates the caller's Pop record (idempotent: one per user and bubble).
export interface CanPopInput {
  userLat: number;
  userLng: number;
  bubbleId: string;
}
export type CanPopResult =
  | { ok: true; bubble: Bubble; author: User }
  | { ok: false; reason: 'too_far'; distanceM: number }
  | { ok: false; reason: 'not_found' | 'expired' };

// Sets Pop.loved. Requires an existing Pop.
export interface LoveBubbleInput {
  bubbleId: string;
}

// Other users who loved this bubble. Empty unless the caller has popped it; never includes the caller.
export interface LovedByInput {
  bubbleId: string;
}

// Server loads the bubble text itself, only if the caller has popped it. Generated once, stored, reused.
export interface SpeakInput {
  bubbleId: string;
}
export interface SpeakResult {
  audioUrl: string;
}

// Server loads the bubble itself, only if the caller has popped it. Cached per (bubbleId, targetLanguage).
export interface TranslateInput {
  bubbleId: string;
  targetLanguage: string;
}
export interface TranslateResult {
  title: string;
  text: string;
  sourceLanguage: string;
}

// ---- Drop ----

// Server strips GPS/EXIF metadata and enforces size limits (video max 15 s).
export interface UploadMediaResult {
  uploadId: string;
  mediaType: 'photo' | 'video';
}

// Moderation runs inside dropBubble and cannot be skipped. Empty title or category
// fall back to Grok's suggestions. If Grok fails, the bubble is saved with moderation 'unchecked'.
export interface DropBubbleInput {
  title?: string;
  text: string;
  category?: Category;
  lat: number;
  lng: number;
  placeName: string;
  uploadId?: string;         // from uploadMedia
  frameBase64?: string[];    // video only: 1 to 2 frames extracted on the client, for moderation
  floatsFor: '1w' | '1m' | 'forever';
}
export type DropBubbleResult =
  | { ok: true; bubble: Bubble }
  | { ok: false; reasons: string[] };

// ---- Wave and chat ----

export interface SendWaveInput {
  toUserId: string;
  bubbleId: string;
}
export interface SendWaveResult {
  matched: boolean;
  chatId?: string;           // set when matched
}

export interface GetMessagesInput {
  chatId: string;
}

export interface SendMessageInput {
  chatId: string;
  text: string;
}

// ---- The whole client-facing API ----

export interface Api {
  nearbyBubbles(input: NearbyBubblesInput): Promise<BubblePreview[]>;
  canPop(input: CanPopInput): Promise<CanPopResult>;
  loveBubble(input: LoveBubbleInput): Promise<{ loved: true }>;
  lovedBy(input: LovedByInput): Promise<User[]>;
  speak(input: SpeakInput): Promise<SpeakResult>;
  translate(input: TranslateInput): Promise<TranslateResult>;

  uploadMedia(file: File): Promise<UploadMediaResult>;
  dropBubble(input: DropBubbleInput): Promise<DropBubbleResult>;

  myPopped(): Promise<PoppedItem[]>;
  myDropped(): Promise<DroppedItem[]>;

  sendWave(input: SendWaveInput): Promise<SendWaveResult>;
  incomingWaves(): Promise<IncomingWave[]>;
  myChats(): Promise<ChatSummary[]>;
  getMessages(input: GetMessagesInput): Promise<Message[]>;
  sendMessage(input: SendMessageInput): Promise<Message>;
}
