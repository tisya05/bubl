// The words for each notification, in one place so every sender says the same
// thing. Pure: unit-tested in notifications.test.ts. Server actions pass these
// to notify() in src/actions/notify.ts.

import type { NotificationKind } from '../types';

export interface NotificationDraft {
  kind: NotificationKind;
  title: string;
  body: string;
  bubbleId?: string;
  chatId?: string;
  fromUserId?: string;
}

const PREVIEW_CHARS = 80;
const preview = (text: string) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > PREVIEW_CHARS ? `${flat.slice(0, PREVIEW_CHARS - 1)}…` : flat;
};
const at = (placeName: string) => (placeName ? ` at ${placeName}` : '');

// Some bubbles are named with raw coordinates ("40.80553, -73.96055"): never show those.
const isCoordinates = (placeName: string) => /^\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*$/.test(placeName);

/** To you, when you drift into a bubble: its kind and, if it has a real name, where. */
export const nearbyNotice = (bubble: { category: string; placeName?: string }) => {
  const kind = bubble.category === 'Misc' ? 'A' : `A ${bubble.category.toLowerCase()}`;
  const place = bubble.placeName && !isCoordinates(bubble.placeName) ? ` at ${bubble.placeName.trim()}` : '';
  return { title: 'You drifted into a bubble 🫧', body: `${kind} bubble${place} is right here. Tap to pop it.` };
};

/** To a bubble's author: someone loved it. */
export const loveNotice = (from: { id: string; name: string }, bubble: { id: string; placeName: string }): NotificationDraft => ({
  kind: 'love',
  title: `${from.name} loved your bubble`,
  body: `Your bubble${at(bubble.placeName)} got some love. Wave back?`,
  bubbleId: bubble.id,
  fromUserId: from.id,
});

/** To whoever was waved at (author or lover). */
export const waveNotice = (
  from: { id: string; name: string },
  bubble: { id: string; placeName: string },
  note?: string,
): NotificationDraft => ({
  kind: 'wave',
  title: `${from.name} waved at you 👋`,
  body: note ? `“${preview(note)}”` : `About the bubble${at(bubble.placeName)}. Wave back to start a chat.`,
  bubbleId: bubble.id,
  fromUserId: from.id,
});

/** To both people when a wave is returned and the chat unlocks. */
export const matchNotice = (other: { id: string; name: string }, chatId: string, bubbleId: string): NotificationDraft => ({
  kind: 'match',
  title: `You and ${other.name} both waved!`,
  body: 'Your chat is open. Say hi.',
  chatId,
  bubbleId,
  fromUserId: other.id,
});

/** To the other person in a chat. */
export const messageNotice = (from: { id: string; name: string }, chatId: string, text: string): NotificationDraft => ({
  kind: 'message',
  title: from.name,
  body: preview(text),
  chatId,
  fromUserId: from.id,
});
