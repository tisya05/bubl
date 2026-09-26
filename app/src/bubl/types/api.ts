// Inputs and outputs of every server function the client can call.
// Each one is a DeepSpace server action (POST /api/actions/<name>), requires a signed-in
// user, and returns DeepSpace's ActionResult: { success: true, data } or { success: false, error }.
// API keys never reach the client. Owners are in docs/CONTRACTS.md.

import type { ActionResult } from 'deepspace/worker';
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

// Sets Pop.loved. Requires an existing Pop. Refused for the bubble's own author.
export interface LoveBubbleInput {
  bubbleId: string;
}

// For the bubble's author: the users who loved it (so the author can wave back).
// For anyone else: [] (lovers never see each other; they wave at the author from canPop's `author`).
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

// Allowed only author -> lover or lover -> author for that bubble.
export interface SendWaveInput {
  toUserId: string;
  bubbleId: string;
}
export interface SendWaveResult {
  matched: boolean;
  chatId?: string;           // set when matched; reuses the pair's existing chat if there is one
}

export interface GetMessagesInput {
  chatId: string;
}

export interface SendMessageInput {
  chatId: string;
  text: string;
}

// ---- The whole client-facing API ----
// canPop and dropBubble put their user-facing outcome (too far, rejected) inside `data`;
// `success: false` is only for real failures (not signed in, server error).

export interface Api {
  nearbyBubbles(input: NearbyBubblesInput): Promise<ActionResult<BubblePreview[]>>;
  canPop(input: CanPopInput): Promise<ActionResult<CanPopResult>>;
  loveBubble(input: LoveBubbleInput): Promise<ActionResult<{ loved: true }>>;
  lovedBy(input: LovedByInput): Promise<ActionResult<User[]>>;
  speak(input: SpeakInput): Promise<ActionResult<SpeakResult>>;
  translate(input: TranslateInput): Promise<ActionResult<TranslateResult>>;

  uploadMedia(file: File): Promise<ActionResult<UploadMediaResult>>;
  dropBubble(input: DropBubbleInput): Promise<ActionResult<DropBubbleResult>>;

  myPopped(): Promise<ActionResult<PoppedItem[]>>;
  myDropped(): Promise<ActionResult<DroppedItem[]>>;

  sendWave(input: SendWaveInput): Promise<ActionResult<SendWaveResult>>;
  incomingWaves(): Promise<ActionResult<IncomingWave[]>>;
  myChats(): Promise<ActionResult<ChatSummary[]>>;
  getMessages(input: GetMessagesInput): Promise<ActionResult<Message[]>>;
  sendMessage(input: SendMessageInput): Promise<ActionResult<Message>>;
}
