// In-memory mock of the API so screens can be built before the backend exists.
// Only nearbyBubbles and canPop are fully implemented; everything else returns simple defaults.
// Like the real backend, every call resolves to DeepSpace's ActionResult.

import type { ActionResult } from 'deepspace/worker';
import {
  DEFAULT_POP_RADIUS_M,
  DEMO_POP_RADIUS_M,
  LERNER_HALL,
  MAX_NEARBY_RADIUS_M,
} from '../config';
import { distanceM } from '../lib/geo';
import type { Api, Bubble, BubblePreview, User } from '../types';

const ME: User = { id: 'me', name: 'You' };

const AUTHORS: Record<string, User> = {
  'u-maya': { id: 'u-maya', name: 'Maya' },
  'u-diego': { id: 'u-diego', name: 'Diego' },
};

const PHOTO_PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#CFE0F0"/><text x="200" y="160" font-family="sans-serif" font-size="28" text-anchor="middle" fill="#243B64">mock photo</text></svg>',
  );

const CREATED = '2026-09-26T12:00:00.000Z';

function bubble(fields: Omit<Bubble, 'status' | 'moderation' | 'createdAt' | 'language' | 'popRadiusM'> & Partial<Bubble>): Bubble {
  return {
    status: 'live',
    moderation: 'passed',
    createdAt: CREATED,
    language: 'en',
    popRadiusM: DEFAULT_POP_RADIUS_M,
    ...fields,
  };
}

// TODO: replace all coordinates and notes with real ones from the seed trip.
const bubbles: Bubble[] = [
  bubble({
    id: 'b-lerner',
    authorId: 'u-maya',
    lat: LERNER_HALL.lat,
    lng: LERNER_HALL.lng,
    placeName: 'Broadway & 115th St',
    category: 'Misc',
    title: 'You found the demo bubble',
    text: 'Welcome to bubl. Every note here was left by someone who lives nearby. Go find the rest.',
    popRadiusM: DEMO_POP_RADIUS_M,
  }),
  bubble({
    id: 'b-slice',
    authorId: 'u-maya',
    lat: 40.8036,
    lng: -73.9665,
    placeName: 'Broadway & 111th St',
    category: 'Food',
    title: 'The 2 AM slice',
    text: 'The slice is the size of your face. Get it after a late night in Butler.',
  }),
  bubble({
    id: 'b-pastry',
    authorId: 'u-maya',
    lat: 40.8038,
    lng: -73.9624,
    placeName: 'Amsterdam Ave & 111th St',
    category: 'Cafe',
    title: 'Write your thesis here',
    text: 'No wifi, which is the point. Sit in the back room and order the strudel.',
  }),
  bubble({
    id: 'b-riverside',
    authorId: 'u-diego',
    lat: 40.8095,
    lng: -73.9669,
    placeName: 'Riverside Dr & 116th St',
    category: 'Park',
    title: 'El mejor atardecer',
    text: 'Baja las escaleras al atardecer. El río se pone dorado y casi no hay gente.',
    language: 'es',
  }),
  bubble({
    id: 'b-college-walk',
    authorId: 'u-diego',
    lat: 40.8078,
    lng: -73.963,
    placeName: 'Broadway & 116th St',
    category: 'Street',
    title: 'Look up',
    text: 'Stand at the gate and look up. Almost nobody notices the carvings.',
    mediaUrl: PHOTO_PLACEHOLDER,
    mediaType: 'photo',
  }),
  bubble({
    id: 'b-morningside',
    authorId: 'u-maya',
    lat: 40.806,
    lng: -73.958,
    placeName: 'Morningside Dr & 116th St',
    category: 'Park',
    title: 'The overlook',
    text: 'Best view of Harlem from the top of the stairs. Go on a clear morning.',
  }),
];

const pops = new Set<string>(); // `${userId}:${bubbleId}`

// Resolves like a successful DeepSpace action after a fake network delay.
const ok = <T>(data: T, ms = 300) =>
  new Promise<ActionResult<T>>((resolve) => setTimeout(() => resolve({ success: true, data }), ms));

const isExpired = (b: Bubble) => b.expiresAt !== undefined && Date.parse(b.expiresAt) < Date.now();

const toPreview = ({ id, lat, lng, placeName, category, popRadiusM }: Bubble): BubblePreview => ({
  id, lat, lng, placeName, category, popRadiusM,
});

export const mockApi: Api = {
  async nearbyBubbles({ lat, lng, radiusM }) {
    const radius = Math.min(radiusM, MAX_NEARBY_RADIUS_M);
    const nearby = bubbles.filter(
      (b) => b.status === 'live' && !isExpired(b) && distanceM({ lat, lng }, b) <= radius,
    );
    return ok(nearby.map(toPreview));
  },

  async canPop({ userLat, userLng, bubbleId }) {
    const b = bubbles.find((x) => x.id === bubbleId && x.status === 'live');
    if (!b) return ok({ ok: false as const, reason: 'not_found' as const });
    if (isExpired(b)) return ok({ ok: false as const, reason: 'expired' as const });

    const d = distanceM({ lat: userLat, lng: userLng }, b);
    if (d > b.popRadiusM) {
      return ok({ ok: false as const, reason: 'too_far' as const, distanceM: Math.round(d) });
    }
    pops.add(`${ME.id}:${b.id}`);
    return ok({ ok: true as const, bubble: b, author: AUTHORS[b.authorId] });
  },

  // ---- Simple defaults below ----

  async loveBubble() {
    return ok({ loved: true as const });
  },
  async lovedBy() {
    return ok([]);
  },
  async speak() {
    return ok({ audioUrl: '' });
  },
  async translate({ bubbleId }) {
    const b = bubbles.find((x) => x.id === bubbleId);
    return ok({ title: b?.title ?? '', text: b?.text ?? '', sourceLanguage: b?.language ?? 'en' });
  },
  async uploadMedia(file) {
    return ok({ uploadId: 'mock-upload', mediaType: file.type.startsWith('video/') ? ('video' as const) : ('photo' as const) });
  },
  async dropBubble(input) {
    const b = bubble({
      id: `b-${Date.now()}`,
      authorId: ME.id,
      lat: input.lat,
      lng: input.lng,
      placeName: input.placeName,
      category: input.category ?? 'Misc',
      title: input.title ?? 'Untitled',
      text: input.text,
    });
    bubbles.push(b);
    return ok({ ok: true as const, bubble: b });
  },
  async myPopped() {
    return ok([]);
  },
  async myDropped() {
    return ok([]);
  },
  async sendWave() {
    return ok({ matched: false });
  },
  async incomingWaves() {
    return ok([]);
  },
  async myChats() {
    return ok([]);
  },
  async getMessages() {
    return ok([]);
  },
  async sendMessage({ chatId, text }) {
    return ok({ chatId, senderId: ME.id, text, sentAt: new Date().toISOString() });
  },
};
