// Inputs and outputs of every server function the client can call.
// Each one is a DeepSpace server action (POST /api/actions/<name>), requires a signed-in
// user, and returns DeepSpace's ActionResult: { success: true, data } or { success: false, error }.
// API keys never reach the client. Owners are in docs/CONTRACTS.md.

import type { ActionResult } from 'deepspace/worker';
import type {
  Bubble,
  BubblePreview,
  Category,
  ChatBubble,
  ChatSummary,
  DroppedItem,
  IncomingWave,
  Message,
  OutgoingWave,
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
  | { ok: true; bubble: Bubble; author: User; alreadyPopped?: boolean }
  | { ok: false; reason: 'too_far'; distanceM: number }
  | { ok: false; reason: 'not_found' | 'expired' };

// Reopen a note you already popped (or wrote), from anywhere. For "Open note" and the You tab.
export interface OpenPoppedInput {
  bubbleId: string;
}
export interface OpenPoppedResult {
  bubble: Bubble;
  author: User;
  loved: boolean;
}

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
// For a voice-note bubble (mediaType 'audio') audioUrl is the author's recording (/api/media/<id>) instead.
export interface SpeakInput {
  bubbleId: string;
}
export interface SpeakResult {
  audioUrl: string;
}


// ---- Drop ----

// Server strips GPS/EXIF metadata and enforces size limits (video max 15 s, voice note max 30 s / 1 MB).
export interface UploadMediaResult {
  uploadId: string;
  mediaType: 'photo' | 'video' | 'audio';
}

// Moderation runs inside dropBubble and cannot be skipped. Empty title or category
// fall back to Gemini's suggestions. If Gemini is unavailable, the bubble is saved with moderation 'unchecked'.
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
  note?: string;             // optional, max 280 characters (server rejects longer)
}
export interface SendWaveResult {
  matched: boolean;
  chatId?: string;           // set when matched; reuses the pair's existing chat if there is one
}

export interface GetMessagesInput {
  chatId: string;
}

export interface ChatBubbleInput {
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
  openPopped(input: OpenPoppedInput): Promise<ActionResult<OpenPoppedResult>>;
  loveBubble(input: LoveBubbleInput): Promise<ActionResult<{ loved: true }>>;
  lovedBy(input: LovedByInput): Promise<ActionResult<User[]>>;
  speak(input: SpeakInput): Promise<ActionResult<SpeakResult>>;

  uploadMedia(file: File): Promise<ActionResult<UploadMediaResult>>;
  dropBubble(input: DropBubbleInput): Promise<ActionResult<DropBubbleResult>>;

  myPopped(): Promise<ActionResult<PoppedItem[]>>;
  myDropped(): Promise<ActionResult<DroppedItem[]>>;

  sendWave(input: SendWaveInput): Promise<ActionResult<SendWaveResult>>;
  incomingWaves(): Promise<ActionResult<IncomingWave[]>>;
  outgoingWaves(): Promise<ActionResult<OutgoingWave[]>>;
  myChats(): Promise<ActionResult<ChatSummary[]>>;
  chatBubble(input: ChatBubbleInput): Promise<ActionResult<ChatBubble>>;
  getMessages(input: GetMessagesInput): Promise<ActionResult<Message[]>>;
  sendMessage(input: SendMessageInput): Promise<ActionResult<Message>>;
}
