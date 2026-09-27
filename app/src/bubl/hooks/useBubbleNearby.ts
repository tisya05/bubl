// "You drifted into a bubble": raises a nearby alert once per bubble when you
// walk inside its pop radius. Walking mode pops bubbles itself, so this stays
// quiet while walking mode is on, and never re-announces a bubble that already popped.

import { useEffect, useRef } from 'react';
import { api as defaultApi } from '../api/client';
import { NEARBY_QUERY_RADIUS_M } from '../config';
import { alert, subscribeAlerts } from '../lib/alerts';
import { requestNearbyPush } from '../lib/push';
import { nearbyNotice } from '../lib/notifications';
import { bubblesInRange, shouldRefetch } from '../lib/walking';
import type { Api, BubblePreview } from '../types';
import { useUserLocation } from './useUserLocation';
import { useWalkingMode } from './useWalkingMode';

export function useBubbleNearby(api: Pick<Api, 'nearbyBubbles'> = defaultApi) {
  const you = useUserLocation();
  const walking = useWalkingMode();
  const announced = useRef(new Set<string>());
  const previews = useRef<BubblePreview[]>([]);
  const lastFetch = useRef<{ at: number; where: { lat: number; lng: number } } | null>(null);

  // A bubble popped anywhere (walking mode, the Walk screen) doesn't need a "nearby" nudge.
  useEffect(
    () =>
      subscribeAlerts((a) => {
        if (a.kind === 'pop' && a.bubbleId) announced.current.add(a.bubbleId);
      }),
    [],
  );

  useEffect(() => {
    if (!you || walking.on) return;
    let cancelled = false;

    (async () => {
      if (shouldRefetch(lastFetch.current, you)) {
        lastFetch.current = { at: Date.now(), where: { lat: you.lat, lng: you.lng } };
        const res = await api.nearbyBubbles({ lat: you.lat, lng: you.lng, radiusM: NEARBY_QUERY_RADIUS_M });
        if (res.success) previews.current = res.data;
      }
      if (cancelled) return;
      for (const b of bubblesInRange(previews.current, you, announced.current)) {
        announced.current.add(b.id);
        alert({ kind: 'nearby', ...nearbyNotice(b), bubbleId: b.id });
        requestNearbyPush(b.id, you);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api, you, walking.on]);
}
