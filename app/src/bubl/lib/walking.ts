// Walking-mode decisions that don't touch the browser: which bubbles you just
// walked into, and when to refresh the nearby list. Unit-tested in walking.test.ts.

import { distanceM, type LatLng } from './geo';
import type { BubblePreview } from '../types';

export const REFETCH_EVERY_MS = 30_000;
export const REFETCH_AFTER_M = 150;

/** Bubbles whose pop radius you're inside and that haven't fired yet, closest first.
 *  Skips bubbles you already popped or dropped: they don't pop or announce again. */
export function bubblesInRange(previews: BubblePreview[], you: LatLng, fired: ReadonlySet<string>): BubblePreview[] {
  return previews
    .filter((b) => !fired.has(b.id) && !b.popped && !b.mine)
    .map((b) => ({ b, d: distanceM(you, b) }))
    .filter(({ b, d }) => d <= b.popRadiusM)
    .sort((x, y) => x.d - y.d)
    .map(({ b }) => b);
}

/** Refresh the nearby list every 30 s, or sooner once you've walked 150 m from the last fetch. */
export function shouldRefetch(last: { at: number; where: LatLng } | null, you: LatLng, now = Date.now()): boolean {
  if (!last) return true;
  return now - last.at >= REFETCH_EVERY_MS || distanceM(last.where, you) >= REFETCH_AFTER_M;
}
