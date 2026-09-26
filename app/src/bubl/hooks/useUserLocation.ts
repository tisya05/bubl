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

let source: LocationSource = 'gps';
let gpsLocation: UserLocation | null = null;
let demoLocation: UserLocation = { ...LERNER_HALL, accuracyM: 5, source: 'demo' };
let watchId: number | null = null;
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
      gpsLocation = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyM: pos.coords.accuracy,
        source: 'gps',
      };
      emit();
    },
    // Permission denied or no fix (e.g. judges indoors): fall back to the demo dot.
    () => setLocationSource('demo'),
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
