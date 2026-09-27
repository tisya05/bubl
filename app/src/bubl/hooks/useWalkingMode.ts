// Walking mode (the speaker button on the map): while it's on, every bubble you
// walk into pops by itself, without opening the note, and is read aloud
// (ElevenLabs via api.speak), one after another. If it has a photo or video,
// the voice then says so ("This bubble also has a photo. Open bubl to see it.").
//
// Web apps pause when you leave them or lock the phone, so walking mode keeps
// the screen awake (Screen Wake Lock) for "pocket mode": the UI shows a black
// screen and the phone stays in your pocket. Leaving the app pauses it; coming
// back picks up where it left off.
//
// Usage: const walking = useWalkingMode(); <Switch checked={walking.on}
// onCheckedChange={(on) => (on ? startWalkingMode() : stopWalkingMode())} />
// startWalkingMode must run inside the tap: that's what lets it play audio later.

import { useSyncExternalStore } from 'react';
import { api } from '../api/client';
import { alert } from '../lib/alerts';
import { NEARBY_QUERY_RADIUS_M } from '../config';
import { bubblesInRange, shouldRefetch } from '../lib/walking';
import type { Bubble, BubblePreview } from '../types';
import { watchUserLocation, type UserLocation } from './useUserLocation';

export interface WalkingState {
  on: boolean;
  playing: { bubbleId: string; title: string; placeName: string } | null;
  lastPopped: Bubble | null; // so the UI can open the note screen
  error: string | null;
}

type Queued = { bubble: Bubble; audioUrls: string[] };
type MediaLine = 'photo' | 'video';

// A 1-sample silent WAV, played during the tap to unlock audio on iOS.
const SILENT_WAV = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQIAAAAAAA==';

let state: WalkingState = { on: false, playing: null, lastPopped: null, error: null };
const listeners = new Set<() => void>();
const fired = new Set<string>();
let previews: BubblePreview[] = [];
let lastFetch: { at: number; where: { lat: number; lng: number } } | null = null;
let queue: Queued[] = [];
let current: string[] = []; // the rest of the bubble being read (the note, then its photo/video line)
const lines = new Map<MediaLine, Promise<string | null>>();
let audio: HTMLAudioElement | null = null;
let wakeLock: WakeLockSentinel | null = null;
let stopWatching: (() => void) | null = null;

function set(patch: Partial<WalkingState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

async function keepScreenAwake() {
  if (!state.on || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch {
    // Low battery mode or an unsupported browser: walking mode still works while the screen is on.
  }
}

// The wake lock is dropped whenever the page is hidden, so take it again on return.
const onVisibility = () => void keepScreenAwake();

// "This bubble also has a photo/video…", generated once and reused.
function mediaLine(line: MediaLine): Promise<string | null> {
  let url = lines.get(line);
  if (!url) {
    url = api.speakLine({ line }).then((res) => (res.success && res.data.audioUrl ? res.data.audioUrl : null)).catch(() => null);
    lines.set(line, url);
    void url.then((u) => { if (!u) lines.delete(line); }); // try again next time
  }
  return url;
}

function playUrl(url: string) {
  if (!audio) return;
  audio.src = url;
  audio.play().catch(() => {
    current = [];
    set({ playing: null, error: 'Tap the speaker off and on again to allow audio' });
  });
}

function playNext() {
  if (!audio || state.playing || queue.length === 0) return;
  const { bubble, audioUrls } = queue.shift()!;
  set({ playing: { bubbleId: bubble.id, title: bubble.title, placeName: bubble.placeName } });
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: bubble.title, artist: bubble.placeName, album: 'bubl' });
  }
  current = audioUrls.slice(1);
  playUrl(audioUrls[0]);
}

function onEnded() {
  const next = current.shift();
  if (next) {
    playUrl(next);
    return;
  }
  set({ playing: null });
  playNext();
}

async function popAndSpeak(preview: BubblePreview, you: UserLocation) {
  const pop = await api.canPop({ userLat: you.lat, userLng: you.lng, bubbleId: preview.id });
  if (!pop.success || !pop.data.ok) {
    // GPS jitter can say "too far" right at the edge; let it try again on the next fix.
    if (pop.success && !pop.data.ok && pop.data.reason === 'too_far') fired.delete(preview.id);
    return;
  }
  alert({ kind: 'pop', title: 'pop.', body: pop.data.bubble.title, bubbleId: preview.id });
  set({ lastPopped: pop.data.bubble });

  const bubble = pop.data.bubble;
  const media = bubble.mediaUrl && (bubble.mediaType === 'photo' || bubble.mediaType === 'video') ? bubble.mediaType : null;
  const [spoken, line] = await Promise.all([api.speak({ bubbleId: preview.id }), media ? mediaLine(media) : null]);
  if (!spoken.success || !spoken.data.audioUrl || !state.on) return;
  queue.push({ bubble, audioUrls: line ? [spoken.data.audioUrl, line] : [spoken.data.audioUrl] });
  playNext();
}

async function onLocation(you: UserLocation | null) {
  if (!state.on || !you) return;
  if (shouldRefetch(lastFetch, you)) {
    lastFetch = { at: Date.now(), where: { lat: you.lat, lng: you.lng } };
    const res = await api.nearbyBubbles({ lat: you.lat, lng: you.lng, radiusM: NEARBY_QUERY_RADIUS_M });
    if (res.success) previews = res.data;
  }
  for (const preview of bubblesInRange(previews, you, fired)) {
    fired.add(preview.id);
    void popAndSpeak(preview, you);
  }
}

/** Turn walking mode on. Call it directly from the switch's tap handler. */
export function startWalkingMode() {
  if (state.on) return;
  if (!audio) {
    audio = new Audio();
    audio.addEventListener('ended', onEnded);
  }
  audio.src = SILENT_WAV;
  void audio.play().catch(() => {});

  set({ on: true, error: null });
  void keepScreenAwake();
  document.addEventListener('visibilitychange', onVisibility);
  if ('mediaSession' in navigator) navigator.mediaSession.setActionHandler('stop', stopWalkingMode);
  stopWatching = watchUserLocation((you) => void onLocation(you));
}

/** Turn walking mode off: stop listening, stop audio, let the screen sleep. */
export function stopWalkingMode() {
  if (!state.on) return;
  stopWatching?.();
  stopWatching = null;
  document.removeEventListener('visibilitychange', onVisibility);
  void wakeLock?.release().catch(() => {});
  wakeLock = null;
  queue = [];
  current = [];
  fired.clear();
  audio?.pause();
  if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
  set({ on: false, playing: null });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useWalkingMode(): WalkingState {
  return useSyncExternalStore(subscribe, () => state);
}
