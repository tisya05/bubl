import { useSyncExternalStore } from 'react'

const key = 'bubl.sound-enabled'
const changed = 'bubl-sound-change'
export function isSoundEnabled() {
  try { return localStorage.getItem(key) !== 'false' } catch { return true }
}
function subscribe(notify: () => void) {
  window.addEventListener(changed, notify)
  window.addEventListener('storage', notify)
  return () => { window.removeEventListener(changed, notify); window.removeEventListener('storage', notify) }
}
export function useSound() {
  const enabled = useSyncExternalStore(subscribe, isSoundEnabled, () => true)
  return [enabled, () => {
    try { localStorage.setItem(key, String(!enabled)) } catch { return }
    window.dispatchEvent(new Event(changed))
  }] as const
}
