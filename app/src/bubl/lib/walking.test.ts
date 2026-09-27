import { describe, expect, it } from 'vitest';
import type { BubblePreview } from '../types';
import { bubblesInRange, shouldRefetch } from './walking';

const LERNER = { lat: 40.8069, lng: -73.964 };
const north = (m: number) => ({ lat: LERNER.lat + m / 111_195, lng: LERNER.lng });

const preview = (id: string, at: { lat: number; lng: number }, popRadiusM = 15): BubblePreview => ({
  id,
  ...at,
  popRadiusM,
  placeName: 'x',
  category: 'Misc',
});

describe('bubblesInRange', () => {
  const previews = [preview('near', north(10)), preview('far', north(40)), preview('demo', north(50), 60), preview('here', LERNER)];

  it('returns every bubble whose own radius you are inside, closest first', () => {
    expect(bubblesInRange(previews, LERNER, new Set()).map((b) => b.id)).toEqual(['here', 'near', 'demo']);
  });

  it('skips bubbles that already fired this walk', () => {
    expect(bubblesInRange(previews, LERNER, new Set(['here', 'demo'])).map((b) => b.id)).toEqual(['near']);
  });

  it('never fires for a bubble you already popped or dropped', () => {
    const mine = [{ ...preview('popped', LERNER), popped: true }, { ...preview('own', LERNER), mine: true }, preview('fresh', LERNER)];
    expect(bubblesInRange(mine, LERNER, new Set()).map((b) => b.id)).toEqual(['fresh']);
  });

  it('returns nothing when you are outside every radius', () => {
    expect(bubblesInRange(previews, north(500), new Set())).toEqual([]);
  });
});

describe('shouldRefetch', () => {
  const NOW = 1_000_000;

  it('fetches the first time', () => {
    expect(shouldRefetch(null, LERNER, NOW)).toBe(true);
  });

  it('waits 30 s while you stay put', () => {
    expect(shouldRefetch({ at: NOW - 10_000, where: LERNER }, north(20), NOW)).toBe(false);
    expect(shouldRefetch({ at: NOW - 30_000, where: LERNER }, north(20), NOW)).toBe(true);
  });

  it('refetches early once you have walked 150 m', () => {
    expect(shouldRefetch({ at: NOW - 1_000, where: LERNER }, north(160), NOW)).toBe(true);
  });
});
