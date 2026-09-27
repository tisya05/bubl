// The bubl pop: one recorded bubble pop (public/bubl/sounds/pop.wav, trimmed
// from "Bubbles Burst" by BigSoundBank, CC0), so every phone and laptop plays
// exactly the same sound. It plays for pops and every notification except drifting into a bubble.
// Browsers only allow sound after a tap; installSoundUnlock() turns sound on at
// the first tap the browser accepts (see MobileApp).
// Respects the app's sound on/off setting (useSound).

import { isSoundEnabled } from '../hooks/useSound';

const POP_URL = '/bubl/sounds/pop.wav';

let ctx: AudioContext | null = null;
let pop: Promise<AudioBuffer | null> | null = null;

// iPhones play web audio as "ambient" sound, which the silent switch mutes.
// Asking for "playback" makes the pop audible on silent too (Safari 16.4+).
function claimPlayback() {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session && session.type !== 'playback') session.type = 'playback';
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  claimPlayback();
  ctx ??= new AudioContext();
  // 'suspended' before the first tap; iOS also reports 'interrupted' after a call or backgrounding.
  if (ctx.state !== 'running') void ctx.resume().catch(() => {});
  return ctx;
}

function loadPop(ac: AudioContext): Promise<AudioBuffer | null> {
  pop ??= fetch(POP_URL)
    .then((res) => res.arrayBuffer())
    .then((data) => ac.decodeAudioData(data))
    .catch(() => {
      pop = null; // try again next time
      return null;
    });
  return pop;
}

export function unlockSounds() {
  const ac = audio();
  if (ac) void loadPop(ac);
}

// iOS only lets a tap start audio when the finger lifts (touchend / click), not
// on touch-down, so listen for those and keep trying until audio is running.
const UNLOCK_EVENTS = ['touchend', 'click', 'keydown'] as const;

/** Turns sound on at the first accepted tap. Returns a cleanup function. */
export function installSoundUnlock(): () => void {
  const remove = () => UNLOCK_EVENTS.forEach((e) => window.removeEventListener(e, onTap, true));
  function onTap() {
    unlockSounds();
    if (ctx?.state === 'running') remove();
  }
  UNLOCK_EVENTS.forEach((e) => window.addEventListener(e, onTap, true));
  return remove;
}

/** A bubble popping. Also the sound for every other alert. */
export function playPop() {
  if (!isSoundEnabled()) return;
  const ac = audio();
  if (!ac) return;
  void loadPop(ac).then((buffer) => {
    if (!buffer) return;
    const source = ac.createBufferSource();
    source.buffer = buffer;
    source.connect(ac.destination);
    source.start();
  });
}
