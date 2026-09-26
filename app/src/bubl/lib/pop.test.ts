import { describe, expect, it } from 'vitest';
import { checkPop, isExpired, type PoppableBubble } from './pop';

const LERNER = { lat: 40.8069, lng: -73.964 };
const NOW = Date.parse('2026-09-26T20:00:00.000Z');

// Roughly `m` meters north of a point (1 degree of latitude is about 111,195 m).
const north = (p: { lat: number; lng: number }, m: number) => ({ lat: p.lat + m / 111_195, lng: p.lng });

const bubble = (fields: Partial<PoppableBubble> = {}): PoppableBubble => ({
  ...LERNER,
  popRadiusM: 15,
  status: 'live',
  ...fields,
});

describe('checkPop', () => {
  it('pops when standing on the bubble', () => {
    expect(checkPop(bubble(), LERNER, NOW)).toEqual({ ok: true });
  });

  it('pops just inside the radius and refuses just outside it', () => {
    expect(checkPop(bubble(), north(LERNER, 14), NOW)).toEqual({ ok: true });
    expect(checkPop(bubble(), north(LERNER, 16), NOW)).toEqual({ ok: false, reason: 'too_far', distanceM: 16 });
  });

  it('uses the bubble radius, so the Lerner demo bubble pops from 50 m', () => {
    expect(checkPop(bubble({ popRadiusM: 60 }), north(LERNER, 50), NOW)).toEqual({ ok: true });
    expect(checkPop(bubble(), north(LERNER, 50), NOW)).toMatchObject({ ok: false, reason: 'too_far' });
  });

  it('treats a rejected bubble as not found, even up close', () => {
    expect(checkPop(bubble({ status: 'rejected' }), LERNER, NOW)).toEqual({ ok: false, reason: 'not_found' });
  });

  it('refuses an expired bubble, even up close', () => {
    const expired = bubble({ expiresAt: '2026-09-26T19:59:59.000Z' });
    expect(checkPop(expired, LERNER, NOW)).toEqual({ ok: false, reason: 'expired' });
  });

  it('pops a bubble that has not expired yet', () => {
    expect(checkPop(bubble({ expiresAt: '2026-10-03T20:00:00.000Z' }), LERNER, NOW)).toEqual({ ok: true });
  });
});

describe('isExpired', () => {
  it('never expires without an expiry date', () => {
    expect(isExpired(undefined, NOW)).toBe(false);
  });

  it('expires once the date has passed', () => {
    expect(isExpired('2026-09-26T19:00:00.000Z', NOW)).toBe(true);
    expect(isExpired('2026-09-26T21:00:00.000Z', NOW)).toBe(false);
  });
});
