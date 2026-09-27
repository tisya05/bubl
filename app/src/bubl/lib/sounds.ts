// The bubl pop: one recorded bubble pop (public/bubl/sounds/pop.wav, trimmed
// from "Bubbles Burst" by BigSoundBank, CC0), so every phone and laptop plays
// exactly the same sound. Every alert uses it.
// Browsers only allow sound after the user has tapped something once;
// unlockSounds() is called on the first tap anywhere (see MobileApp).
// Respects the app's sound on/off setting (useSound).

import { isSoundEnabled } from '../hooks/useSound';

const POP_URL = '/bubl/sounds/pop.wav';

let ctx: AudioContext | null = null;
let pop: Promise<AudioBuffer | null> | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
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
