// Give Safari a real document scroll gesture so its browser controls can retract.
// Home Screen launches retain the app layout without the extra screen.
const installed = window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true
const safari = /iPhone|iPad|iPod/.test(navigator.userAgent) &&
  /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent)
if (safari && !installed) document.documentElement.dataset.safariScroll = 'true'
