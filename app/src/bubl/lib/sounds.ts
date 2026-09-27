// Tiny synthesized sounds (Web Audio), so there are no audio files to ship.
// Browsers only allow sound after the user has tapped something once;
// unlockSounds() is called on the first tap anywhere (see MobileApp).
// Both sounds respect the app's sound on/off setting (useSound).

import { isSoundEnabled } from '../hooks/useSound';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function unlockSounds() {
  audio();
}

function tone(freqFrom: number, freqTo: number, startIn: number, length: number, volume: number) {
  if (!isSoundEnabled()) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + startIn;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freqFrom, t);
  osc.frequency.exponentialRampToValueAtTime(freqTo, t + length);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

/** A bubble popping: a quick bright blip that drops in pitch. */
export function playPop() {
  tone(900, 180, 0, 0.12, 0.5);
  tone(1800, 600, 0, 0.05, 0.15);
}

/** Something arrived (a wave, a message, a bubble nearby): two soft rising notes. */
export function playChime() {
  tone(880, 880, 0, 0.18, 0.2);
  tone(1320, 1320, 0.12, 0.25, 0.18);
}
