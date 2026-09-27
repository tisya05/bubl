// In-memory mock of the API so screens can be built before the backend exists.
// Demo-only data and interactions, stored on this browser. No backend calls.
// Like the real backend, every call resolves to DeepSpace's ActionResult.

import type { ActionResult } from 'deepspace/worker';
import {
  DEFAULT_POP_RADIUS_M,
  DEMO_POP_RADIUS_M,
  LERNER_HALL,
  MAX_NEARBY_RADIUS_M,
} from '../config';
import { distanceM } from '../lib/geo';
import type { Api, Bubble, BubblePreview, User, Chat, Message, Wave } from '../types';
import type { LibraryActions } from '../lib/libraryActions';
import { loadProfile } from '../lib/localProfile';
import { readDemoMedia, saveDemoMedia } from '../lib/demoMedia';
import { findPii } from '../lib/moderation';
import { checkPop, isExpired } from '../lib/pop';

const initialProfile = loadProfile({ id: 'me', name: 'You' });
const ME: User = { id: 'me', name: initialProfile.name, imageUrl: initialProfile.imageUrl };
const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const AUTHORS: Record<string, User> = {
  'u-alma': { id: 'u-alma', name: 'Alma Mater', imageUrl: '/bubl/alma-mater.png' },
  'u-tim': { id: 'u-tim', name: 'Tim the Beaver', imageUrl: '/bubl/tim-beaver.png' },
  'u-tiger': { id: 'u-tiger', name: 'Princeton Tiger', imageUrl: '/bubl/princeton-tiger.png' },
  'u-bruno': { id: 'u-bruno', name: 'Bruno the Bear', imageUrl: '/bubl/bruno-bear.png' },
  'u-roaree': { id: 'u-roaree', name: 'Roaree', imageUrl: '/bubl/roaree.png' },
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

const pops = new Set<string>();
const hiddenPops = new Set<string>();
const loves = new Set<string>();
const waves: Wave[] = [];
const chats: Chat[] = [];
const messages: Message[] = [];
const uploads = new Map<string, { url: string; type: 'photo' | 'video' }>();
const mediaUrls = new Map<string, string>();
const STATE_KEY = 'bubl.demo.v2';
let roareeSeeded = false;
let campusSamplesSeeded = false;
let chatReadAt: Record<string, string> = {};
try {
  const saved = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null');
  if (saved?.version === 2 && Array.isArray(saved.bubbles)) {
    roareeSeeded = saved.roareeSeeded === true;
    campusSamplesSeeded = saved.campusSamplesSeeded === true;
    chatReadAt = saved.chatReadAt ?? {};
    bubbles.splice(0, bubbles.length, ...saved.bubbles);
    for (const key of saved.pops ?? []) pops.add(key);
    for (const key of saved.hiddenPops ?? []) hiddenPops.add(key);
    for (const key of saved.loves ?? []) loves.add(key);
    waves.push(...(saved.waves ?? [])); chats.push(...(saved.chats ?? [])); messages.push(...(saved.messages ?? []));
  }
} catch { /* A fresh or storage-restricted browser starts with an empty library. */ }
function persist() {
  try { localStorage.setItem(STATE_KEY, JSON.stringify({ version: 2, roareeSeeded, campusSamplesSeeded, chatReadAt, bubbles, pops: [...pops], hiddenPops: [...hiddenPops], loves: [...loves], waves, chats, messages })); } catch { /* State remains usable for this session if storage is full. */ }
}
if (!campusSamplesSeeded) {
  const now = new Date().toISOString();
  const sunset = bubbles.find(b => b.title === 'Awesome Sunset') ?? bubble({ id: 'b-alma-sunset', authorId: 'u-alma', ...LERNER_HALL, title: 'Awesome Sunset', text: 'Catch the golden light from Low Steps. Stay a little longer—the sky gets even better.', placeName: 'Low Steps · Columbia University', category: 'Misc' });
  if (!bubbles.some(b => b.id === sunset.id)) bubbles.push(sunset);
  pops.add(`me:${sunset.id}`);
  chats.push({ id: 'chat-alma', participantIds: [ME.id, 'u-alma'], bubbleId: sunset.id, unlockedAt: now });
  messages.push(
    { chatId: 'chat-alma', senderId: 'u-alma', text: 'Did you catch that awesome sunset from the steps? 🌅', sentAt: now },
    { chatId: 'chat-alma', senderId: ME.id, text: 'Yes! The whole campus looked golden.', sentAt: now },
    { chatId: 'chat-alma', senderId: 'u-alma', text: 'My favorite view. Come back tomorrow—we can watch it together!', sentAt: now },
  );
  for (const [id, title, note] of [
    ['u-tim', 'A quiet study corner', 'Loved this spot! Want to swap campus discoveries?'],
    ['u-tiger', 'A little campus adventure', 'That was a great find. Sending a wave!'],
    ['u-bruno', 'Coffee and a stroll', 'Your coffee spot looks amazing!'],
  ]) {
    const bubbleId = `b-campus-${id}`;
    const sampleCategory = id === 'u-tim' ? 'Food' : id === 'u-tiger' ? 'Park' : 'Cafe';
    bubbles.push(bubble({ id: bubbleId, authorId: id, ...LERNER_HALL, title, text: 'A sample campus discovery. A good place to slow down and say hello.', placeName: 'College Walk · Columbia University', category: sampleCategory }));
    pops.add(`me:${bubbleId}`); loves.add(`me:${bubbleId}`);
    waves.push({ fromUserId: id === 'u-bruno' ? ME.id : id, toUserId: id === 'u-bruno' ? id : ME.id, bubbleId, note, createdAt: now });
  }
  campusSamplesSeeded = true;
  persist();
}
// Add the requested sample once, including to existing demos. Deletion stays deleted.
if (!roareeSeeded) {
  const chatId = 'chat-roaree';
  const start = Date.now() - 5 * 60_000;
  if (!chats.some(chat => chat.id === chatId)) {
    chats.push({ id: chatId, participantIds: [ME.id, 'u-roaree'], bubbleId: 'b-lerner', unlockedAt: new Date(start).toISOString() });
    messages.push(
      { chatId, senderId: 'u-roaree', text: 'Hey! Roaree here 🦁 Found any good spots around campus?', sentAt: new Date(start).toISOString() },
      { chatId, senderId: ME.id, text: 'Just found a bubble near Broadway! Any recommendations?', sentAt: new Date(start + 60_000).toISOString() },
      { chatId, senderId: 'u-roaree', text: 'Take a walk over to Low Steps. It’s my favorite place to hang out between adventures 💙', sentAt: new Date(start + 120_000).toISOString() },
    );
  }
  roareeSeeded = true;
  persist();
}
async function withMedia(b: Bubble): Promise<Bubble> {
  if (!b.mediaUrl?.startsWith('bubl-media:')) return { ...b };
  const id = b.mediaUrl.slice('bubl-media:'.length);
  if (!mediaUrls.has(id)) { const file = await readDemoMedia(id); if (file) mediaUrls.set(id, URL.createObjectURL(file)); }
  return { ...b, mediaUrl: mediaUrls.get(id) };
}
const fail = <T>(error: string): Promise<ActionResult<T>> => Promise.resolve({ success: false, error });

/** Explicit demo control; never called by the production API. */
export function simulateWaveBack(authorId: string, bubbleId: string) {
  const b = bubbles.find(b => b.id === bubbleId);
  if (!b || b.authorId !== authorId || !loves.has(`me:${bubbleId}`)) return;
  if (!waves.some(w => w.fromUserId === authorId && w.toUserId === 'me' && w.bubbleId === bubbleId)) {
    waves.push({ fromUserId: authorId, toUserId: 'me', bubbleId, createdAt: new Date().toISOString() });
    persist();
  }
}

// Preserve the agreed result shape without an artificial demo delay.
const ok = <T>(data: T): Promise<ActionResult<T>> => {
  persist();
  return Promise.resolve({ success: true, data });
};

const toPreview = ({ id, lat, lng, placeName, category, popRadiusM }: Bubble): BubblePreview => ({
  id, lat, lng, placeName, category, popRadiusM,
});

export const mockApi: Api = {
  async nearbyBubbles({ lat, lng, radiusM }) {
    const radius = Math.min(radiusM, MAX_NEARBY_RADIUS_M);
    const nearby = bubbles.filter(
      (b) => b.status === 'live' && !isExpired(b.expiresAt) && distanceM({ lat, lng }, b) <= radius,
    );
    return ok(nearby.map(toPreview));
  },

  async canPop({ userLat, userLng, bubbleId }) {
    const b = bubbles.find((x) => x.id === bubbleId);
    if (!b) return ok({ ok: false as const, reason: 'not_found' as const });
    const check = checkPop(b, { lat: userLat, lng: userLng });
    if (!check.ok) return ok(check);
    pops.add(`${ME.id}:${b.id}`);
    hiddenPops.delete(b.id);
    return ok({ ok: true as const, bubble: await withMedia(b), author: b.authorId === ME.id ? ME : AUTHORS[b.authorId] });
  },

  async loveBubble({ bubbleId }) {
    const b = bubbles.find(b => b.id === bubbleId);
    if (!b || !pops.has(`me:${bubbleId}`) || b.authorId === ME.id) return fail('Pop someone else’s bubble before loving it.');
    loves.add(`me:${bubbleId}`);
    return ok({ loved: true as const });
  },
  async lovedBy({ bubbleId }) {
    const b = bubbles.find(b => b.id === bubbleId);
    if (!b || b.authorId !== ME.id) return ok([]);
    return ok([...loves].flatMap(key => { const [userId, id] = key.split(':'); return id === bubbleId && AUTHORS[userId] ? [AUTHORS[userId]] : []; }));
  },
  async speak() {
    return ok({ audioUrl: '' });
  },
  async translate({ bubbleId, targetLanguage }) {
    const b = bubbles.find((x) => x.id === bubbleId);
    if (!b || !pops.has(`me:${bubbleId}`)) return fail('Pop this bubble first.');
    if (b.id === 'b-riverside' && targetLanguage === 'en') return ok({ title: 'The best sunset', text: 'Head down the stairs at sunset. The river turns golden, and there is almost nobody around.', sourceLanguage: 'es' });
    if (targetLanguage !== b.language) return fail('This language is not available in the demo. Live translation will use Gemini.');
    return ok({ title: b?.title ?? '', text: b?.text ?? '', sourceLanguage: b?.language ?? 'en' });
  },
  async uploadMedia(file) {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) return fail('Choose a photo or video.');
    const uploadId = newId();
    const mediaType = file.type.startsWith('video/') ? 'video' as const : 'photo' as const;
    await saveDemoMedia(uploadId, file);
    uploads.set(uploadId, { url: `bubl-media:${uploadId}`, type: mediaType });
    return ok({ uploadId, mediaType });
  },
  async dropBubble(input) {
    const pii = findPii(`${input.title ?? ''}\n${input.text}`);
    if (pii.length > 0) return ok({ ok: false as const, reasons: pii });
    const b = bubble({
      id: `b-${newId()}`,
      authorId: ME.id,
      lat: input.lat,
      lng: input.lng,
      placeName: input.placeName,
      category: input.category ?? 'Misc',
      title: input.title || input.text.slice(0, 48),
      text: input.text,
      createdAt: new Date().toISOString(),
      moderation: 'unchecked',
      expiresAt: input.floatsFor === 'forever' ? undefined : new Date(Date.now() + (input.floatsFor === '1w' ? 7 : 30) * 86400000).toISOString(),
      mediaUrl: input.uploadId ? uploads.get(input.uploadId)?.url : undefined,
      mediaType: input.uploadId ? uploads.get(input.uploadId)?.type : undefined,
    });
    bubbles.push(b);
    return ok({ ok: true as const, bubble: b });
  },
  async myPopped() {
    return ok(bubbles.filter(b => pops.has(`me:${b.id}`) && !hiddenPops.has(b.id)).map(b => ({ bubbleId: b.id, title: b.title, category: b.category, placeName: b.placeName, poppedAt: CREATED, loved: loves.has(`me:${b.id}`) })));
  },
  async myDropped() {
    return ok(bubbles.filter(b => b.authorId === ME.id).map(b => ({ bubbleId: b.id, title: b.title, category: b.category, placeName: b.placeName, createdAt: b.createdAt, expiresAt: b.expiresAt, status: isExpired(b.expiresAt) ? 'expired' as const : 'floating' as const, popCount: 0 })));
  },
  async sendWave({ toUserId, bubbleId, note }) {
    const b = bubbles.find(b => b.id === bubbleId);
    if (!b || toUserId === ME.id || (note?.length ?? 0) > 280) return fail('This wave is not available.');
    const eligible = (b.authorId === toUserId && loves.has(`me:${bubbleId}`)) || (b.authorId === ME.id && loves.has(`${toUserId}:${bubbleId}`));
    if (!eligible) return fail('Waves connect a bubble’s author with someone who loved it.');
    if (!waves.some(w => w.fromUserId === ME.id && w.toUserId === toUserId && w.bubbleId === bubbleId)) waves.push({ fromUserId: ME.id, toUserId, bubbleId, note, createdAt: new Date().toISOString() });
    const matched = waves.some(w => w.fromUserId === toUserId && w.toUserId === ME.id && w.bubbleId === bubbleId);
    if (!matched) return ok({ matched: false });
    let chat = chats.find(c => c.participantIds.includes(toUserId) && c.participantIds.includes(ME.id));
    if (!chat) { chat = { id: `chat-${newId()}`, participantIds: [ME.id, toUserId], bubbleId, unlockedAt: new Date().toISOString() }; chats.push(chat); }
    return ok({ matched: true, chatId: chat.id });
  },
  async incomingWaves() {
    return ok(waves.filter(w => w.toUserId === ME.id && !waves.some(reverse => reverse.fromUserId === ME.id && reverse.toUserId === w.fromUserId && reverse.bubbleId === w.bubbleId)).flatMap(w => {
      const b = bubbles.find(b => b.id === w.bubbleId); const from = AUTHORS[w.fromUserId];
      return b && from ? [{ from, note: w.note, bubbleId: b.id, category: b.category, placeName: b.placeName, createdAt: w.createdAt }] : [];
    }));
  },
  async outgoingWaves() {
    return ok(waves.filter(w => w.fromUserId === ME.id && !waves.some(r => r.fromUserId === w.toUserId && r.toUserId === ME.id && r.bubbleId === w.bubbleId)).flatMap(w => {
      const b = bubbles.find(b => b.id === w.bubbleId), to = AUTHORS[w.toUserId];
      return b && to ? [{ to, bubbleId: b.id, placeName: b.placeName, category: b.category, note: w.note, createdAt: w.createdAt }] : [];
    }));
  },
  async chatBubble({ chatId }) {
    const chat = chats.find(c => c.id === chatId && c.participantIds.includes(ME.id));
    const b = chat && bubbles.find(b => b.id === chat.bubbleId);
    if (!chat || !b) return fail('Chat not found');
    const waveNotes = waves
      .filter(w => chat.participantIds.includes(w.fromUserId) && chat.participantIds.includes(w.toUserId) && w.note?.trim())
      .sort((x, y) => (x.bubbleId === chat.bubbleId ? 0 : 1) - (y.bubbleId === chat.bubbleId ? 0 : 1) || x.createdAt.localeCompare(y.createdAt))
      .map(w => ({ fromUserId: w.fromUserId, note: w.note!.trim() }));
    return ok({ bubbleId: b.id, title: b.title, placeName: b.placeName, category: b.category, ...(waveNotes.length ? { waveNotes } : {}) });
  },
  async myChats() {
    return ok(chats.filter(c => c.participantIds.includes(ME.id)).map(chat => ({ chat, otherUser: AUTHORS[chat.participantIds.find(id => id !== ME.id)!], lastMessage: messages.filter(m => m.chatId === chat.id).at(-1), unread: messages.some(m => m.chatId === chat.id && m.senderId !== ME.id && m.sentAt > (chatReadAt[chat.id] ?? '')) })));
  },
  async getMessages({ chatId }) {
    if (!chats.some(c => c.id === chatId && c.participantIds.includes(ME.id))) return fail('This chat is locked. You both need to wave first.');
    chatReadAt[chatId] = new Date().toISOString();
    return ok([...messages.filter(m => m.chatId === chatId)]);
  },
  async sendMessage({ chatId, text }) {
    if (!chats.some(c => c.id === chatId && c.participantIds.includes(ME.id))) return fail('This chat is locked. You both need to wave first.');
    if (!text.trim() || text.length > 1000) return fail('Messages must be between 1 and 1000 characters.');
    const message = { chatId, senderId: ME.id, text: text.trim(), sentAt: new Date().toISOString() };
    messages.push(message);
    return ok(message);
  },
};

export const mockLibrary: LibraryActions = {
  async outgoingWaves() {
    return waves.filter(w => w.fromUserId === ME.id && !waves.some(r => r.fromUserId === w.toUserId && r.toUserId === ME.id && r.bubbleId === w.bubbleId)).flatMap(w => {
      const b = bubbles.find(b => b.id === w.bubbleId), to = AUTHORS[w.toUserId];
      return b && to ? [{ to, bubbleId: b.id, placeName: b.placeName, note: w.note }] : [];
    });
  },
  simulateWaveBack,
  async getSavedBubble(id) {
    const b = bubbles.find(b => b.id === id);
    if (!b || (b.authorId !== ME.id && !chats.some(c => c.bubbleId === id && c.participantIds.includes(ME.id)) && (!pops.has(`me:${id}`) || hiddenPops.has(id)))) throw new Error('This bubble is no longer in your collection.');
    return { bubble: await withMedia(b), author: b.authorId === ME.id ? { ...ME } : AUTHORS[b.authorId], loved: loves.has(`me:${id}`) };
  },
  async removePopped(id) { hiddenPops.add(id); persist(); },
  async deleteDropped(id) {
    const index = bubbles.findIndex(b => b.id === id && b.authorId === ME.id);
    if (index < 0) throw new Error('Only your own dropped bubbles can be deleted.');
    bubbles.splice(index, 1); persist();
  },
  async deleteChat(id) {
    const index = chats.findIndex(c => c.id === id && c.participantIds.includes(ME.id));
    if (index < 0) throw new Error('Chat not found.');
    const chat = chats[index]; chats.splice(index, 1);
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].chatId === id) messages.splice(i, 1);
    for (let i = waves.length - 1; i >= 0; i--) if (chat.participantIds.includes(waves[i].fromUserId) && chat.participantIds.includes(waves[i].toUserId)) waves.splice(i, 1);
    persist();
  },
  updateProfile(user) { Object.assign(ME, user); },
};
