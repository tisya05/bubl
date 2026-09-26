// The pop rule, shared by the canPop server action and the mock.
// Pure: no DeepSpace calls, so it's unit-tested in pop.test.ts.

import { distanceM, type LatLng } from './geo';

export const isExpired = (expiresAt?: string, now = Date.now()) =>
  expiresAt !== undefined && Date.parse(expiresAt) < now;

export interface PoppableBubble extends LatLng {
  popRadiusM: number;
  status: 'live' | 'rejected';
  expiresAt?: string;
}

export type PopCheck =
  | { ok: true }
  | { ok: false; reason: 'too_far'; distanceM: number }
  | { ok: false; reason: 'not_found' | 'expired' };

// A rejected bubble reads as 'not_found': it was never live for anyone.
export function checkPop(bubble: PoppableBubble, user: LatLng, now = Date.now()): PopCheck {
  if (bubble.status !== 'live') return { ok: false, reason: 'not_found' };
  if (isExpired(bubble.expiresAt, now)) return { ok: false, reason: 'expired' };

  const d = distanceM(user, bubble);
  if (d > bubble.popRadiusM) return { ok: false, reason: 'too_far', distanceM: Math.round(d) };
  return { ok: true };
}
