// The ONE place the app reads the user's location. The map, the in-bubble banner
// and pop all use this hook, never navigator.geolocation directly.
// Demo mode swaps the source to the draggable "you" dot, which writes here via setDemoLocation.

import { useSyncExternalStore } from 'react';
import { LERNER_HALL } from '../config';

export type LocationSource = 'gps' | 'demo';

export interface UserLocation {
  lat: number;
  lng: number;
  accuracyM: number;
  source: LocationSource;
}

// The chosen source survives a page reload in this tab (e.g. the demo walk reloads after signing in).
const SOURCE_KEY = 'bubl.location-source';
function savedSource(): LocationSource {
  try {
    return sessionStorage.getItem(SOURCE_KEY) === 'demo' ? 'demo' : 'gps';
  } catch {
    return 'gps';
  }
}

let source: LocationSource = typeof window === 'undefined' ? 'gps' : savedSource();
let gpsLocation: UserLocation | null = null;
let demoLocation: UserLocation = { ...LERNER_HALL, accuracyM: 5, source: 'demo' };
let watchId: number | null = null;
// The phone refused location (not the same as choosing the demo dot): the start-up check asks again.
let gpsDenied = false;
export const gpsWasDenied = () => gpsDenied;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

function startGps() {
  if (watchId !== null) return;
  if (!('geolocation' in navigator)) {
    setLocationSource('demo');
    return;
  }
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      gpsDenied = false;
      gpsLocation = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyM: pos.coords.accuracy,
        source: 'gps',
      };
      emit();
    },
    // Permission denied or no fix (e.g. judges indoors): fall back to the demo dot.
    (err) => {
      if (err.code === 1) gpsDenied = true;
      setLocationSource('demo');
    },
    { enableHighAccuracy: true, maximumAge: 5_000 },
  );
}

function stopGps() {
  if (watchId === null) return;
  navigator.geolocation.clearWatch(watchId);
  watchId = null;
}

// For the in-app GPS / demo toggle.
export function setLocationSource(next: LocationSource) {
  try {
    sessionStorage.setItem(SOURCE_KEY, next);
  } catch {
    // Storage blocked (private mode): the choice just won't survive a reload.
  }
  if (next === source) return;
  source = next;
  if (source === 'gps') startGps();
  else stopGps();
  emit();
}

// For the draggable "you" dot.
export function setDemoLocation(lat: number, lng: number) {
  demoLocation = { lat, lng, accuracyM: 5, source: 'demo' };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (source === 'gps') startGps();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopGps();
  };
}

const getLocation = () => (source === 'demo' ? demoLocation : gpsLocation);
const getSource = () => source;

// Current location, or null until the first GPS fix.
export function useUserLocation(): UserLocation | null {
  return useSyncExternalStore(subscribe, getLocation);
}

export function useLocationSource(): LocationSource {
  return useSyncExternalStore(subscribe, getSource);
}

// Explicit demo snapshot: never starts a GPS watcher.
const subscribeDemo = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const getDemoLocation = () => demoLocation;
export function useDemoLocation(): UserLocation {
  return useSyncExternalStore(subscribeDemo, getDemoLocation);
}

// Same store, outside React (walking mode). Calls back on every location change.
export function watchUserLocation(onChange: (location: UserLocation | null) => void): () => void {
  const unsubscribe = subscribe(() => onChange(getLocation()));
  onChange(getLocation());
  return unsubscribe;
}
