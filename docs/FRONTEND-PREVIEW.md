# Testing the bubl frontend

This is the existing React mobile web app. The UI preview uses local demo data stored on the current browser; profiles, saved bubbles, and conversations survive a refresh. Chats and the popped list start empty. It does not start, configure, or modify the DeepSpace backend. Two phones have separate local data: cross-phone drops, waves, and messages require the team's existing backend integration.

## Computer

Open a terminal in `bubl/app` and run:

```powershell
npm ci
npm run dev:ui
```

Open http://localhost:5174. The intro opens onboarding, then the local demo. In Chrome or Edge, press **F12**, then **Ctrl+Shift+M**, and choose a phone size to test the mobile layout.

## Phone

Keep your phone and computer on the same Wi-Fi. From `bubl/app`, run:

```powershell
npm run dev:phone
```

Open the **Network** address printed in the terminal on your phone. It looks like `http://192.168.1.12:5175`. Do not use `localhost` on the phone: that refers to the phone itself. Keep the computer awake and the preview running. If the network isolates devices (common on campus/guest Wi-Fi), use a personal hotspot or another shared network. If Windows asks, allow Node on your trusted private network.

For iPhone, open the address in Safari, tap **Share → Add to Home Screen**, keep **Open as Web App** enabled when offered, and tap **Add**. The home-screen icon uses the original Figma city/bubble mark on splash indigo `#252B61`. Android Chrome's menu offers Add to Home screen; a full PWA installation requires HTTPS. A plain local HTTP address is sufficient for checking the UI with demo locations, but real GPS, notifications, and full PWA install behavior require a secure origin.

## Try the flow

1. Tap anywhere on the intro, then **Let's go**.
2. On Walk, tap **Pop it** to open the Lerner demo bubble.
3. Love the spot, wave at its author, and use the labeled demo wave-back control to unlock a chat.
4. Send a message. Open Chats to find the conversation again.
5. Drop a note (optionally a photo or a video up to 15 seconds), then check **You → Dropped**.
6. Drag the blue location dot on the map to explore. Arrow keys also move it when focused.

Only local demo data changes. Read-aloud and most translations remain unavailable in the demo; their controls explain this. Map tiles need an internet connection. The live route is wired to existing shared API contracts, whose server actions are a separate team responsibility. New saved-item deletion/reopening capabilities are frontend demo adapters, kept separate from the shared server contracts.

The phone command builds an optimized frontend before serving it, so the browser does not download hundreds of development modules. It takes a few seconds to build on the computer. After changing code, stop and restart `npm run dev:phone` to rebuild; `npm run dev:ui` still updates live during development.

Map controls support +/−, mouse wheel, and two-finger pinch. Drag the bottom panel handle down to collapse it (or tap it); drag up or tap to expand. Under You, tap a saved card to reopen it and use Remove/Delete to clear it. Edit profile changes the locally saved name, username, and photo. Delete chat is available inside a conversation. The overall viewport stays fixed; long lists, note content, forms, and messages scroll within their own areas.

## Frontend checks

```powershell
npm run type-check
npm run lint
npm run build:ui
npm run test:mobile
```

The mobile tests use installed Microsoft Edge. They cover the main journey, reduced motion, narrow layouts, and that the preview does not call backend endpoints. The map-render check requires internet access.

Production frontend assets are generated into `app/dist-ui`. The original DeepSpace build/deploy commands are unchanged. No deployment has been performed.
