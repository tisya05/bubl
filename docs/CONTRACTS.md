# bubl contracts

Everything all four of us code against. If it's not here or in `src/types/`, it isn't agreed yet.

## What's where

| Path | What |
| --- | --- |
| `src/types/models.ts` | Data shapes: `Category` (+ `CATEGORIES`), `Bubble`, `BubblePreview`, `Pop`, `Wave`, `User`, `Chat`, `Message`, and the list items `PoppedItem`, `DroppedItem`, `IncomingWave`, `ChatSummary` |
| `src/types/api.ts` | Inputs and outputs of every server function, plus the `Api` interface listing them all |
| `src/types/errors.ts` | `ApiError` |
| `src/api/client.ts` | The one `api` object screens import. Mock when `VITE_USE_MOCK=true`, otherwise real (TODO stubs for now) |
| `src/api/mock.ts` | In-memory mock: 6 fake bubbles near Lerner. Only `nearbyBubbles` and `canPop` are real; the rest return simple defaults |
| `src/hooks/useUserLocation.ts` | The only source of the user's location (GPS or demo dot) |
| `src/components/DemoModeToggle.tsx` | In-app GPS / demo switch |
| `src/lib/geo.ts` | `distanceM(a, b)`, the one distance function |
| `src/constants.ts` | Distances: `NEAR_ICON_M`, `DEFAULT_POP_RADIUS_M`, `DEMO_POP_RADIUS_M`, `NEARBY_QUERY_RADIUS_M`, `MAX_NEARBY_RADIUS_M`, `LERNER_HALL` |
| `src/theme.ts` | Navy Sherbet color and font tokens, `CATEGORY_META` (color, tint, lucide icon name, label) |

```ts
import { api } from '../api/client';
import type { BubblePreview } from '../types';
```

## MVP first

MVP = basic sign-in + map with bubbles + location / demo dot + `canPop` + note screen + seed data + deploy. Everything else stays minimal until that works end to end. Security hardening comes after.

## Server functions

All of them require a signed-in user.

| Function | Owner | Input | Output | Notes |
| --- | --- | --- | --- | --- |
| `nearbyBubbles` | Urvi | `lat`, `lng`, `radiusM` | `BubblePreview[]` | Excludes expired and rejected bubbles. Server caps `radiusM` at 1000 m |
| `canPop` | Tisya | `userLat`, `userLng`, `bubbleId` | `{ ok: true, bubble, author }` or `{ ok: false, reason }` | `reason`: `'too_far'` (with `distanceM`), `'not_found'`, `'expired'`. Success creates the caller's `Pop` (one per user and bubble; popping again is a no-op). `lovedBy` and `loveBubble` depend on it |
| `loveBubble` | Urvi | `bubbleId` | `{ loved: true }` | Sets `Pop.loved`. Requires an existing `Pop` |
| `lovedBy` | Urvi | `bubbleId` | `User[]` | Others who loved it. Empty unless the caller has popped it; never includes the caller |
| `speak` | Tisya | `bubbleId` | `{ audioUrl }` | Server loads the text itself, only if the caller has popped it. Generated once, stored, reused |
| `translate` | Tisya | `bubbleId`, `targetLanguage` | `{ title, text, sourceLanguage }` | Server loads the bubble itself, only if the caller has popped it. Cached per bubble and language |
| `uploadMedia` | Urvi | `File` | `{ uploadId, mediaType }` | Strips GPS/EXIF, enforces size limits (video max 15 s). Media URLs must be unguessable |
| `dropBubble` | Tisya | `DropBubbleInput` | `{ ok: true, bubble }` or `{ ok: false, reasons }` | Grok moderation runs inside and can't be skipped. Empty title/category use Grok's suggestions. If Grok fails, saves with `moderation: 'unchecked'`. For video, send 1 to 2 client-extracted frames as `frameBase64` |
| `myPopped` | Urvi | none | `PoppedItem[]` | You tab |
| `myDropped` | Urvi | none | `DroppedItem[]` | You tab |
| `sendWave` | Urvi | `toUserId`, `bubbleId` | `{ matched, chatId? }` | `matched` when the other person already waved back; the server creates the `Chat` then |
| `incomingWaves` | Urvi | none | `IncomingWave[]` | |
| `myChats` | Urvi | none | `ChatSummary[]` | |
| `getMessages` | Urvi | `chatId` | `Message[]` | Only the chat's two users |
| `sendMessage` | Urvi | `chatId`, `text` | `Message` | Only the chat's two users |

**Server-only pieces (not in `Api`, never called from the client):**

- `saveBubble(bubble: Bubble)` (Urvi): the one DeepSpace write the seed import and `dropBubble` use.
- Pure helpers in `src/lib/` (Tisya): the `nearbyBubbles` filter (distance, expired, rejected, 1000 m cap), the expiry check, and GPS/EXIF stripping. Urvi's DeepSpace functions load data and call these.

Rule of thumb: Urvi owns anything that calls DeepSpace; Tisya owns the logic that doesn't.

**Errors:** functions throw an `ApiError` (`{ code, message }`, codes `unauthenticated`, `forbidden`, `not_found`, `invalid_input`, `rate_limited`, `internal`). **Except `canPop` and `dropBubble`,** which return their union results because the UI shows those reasons to the user.

## Rules the types don't enforce

1. **Sealed content stays on the server.** The map only gets `BubblePreview` (id, position, place name, category, pop radius). `title`, `text`, `mediaUrl` and `audioUrl` reach the client only in a successful `canPop` result. `speak` and `translate` take a `bubbleId`, never text from the client.
2. **The pop radius is per bubble:** 15 m by default, 60 m for the Lerner demo bubble. Use `popRadiusM` from the preview for the in-bubble banner, and `distanceM` from `src/lib/geo.ts` for the math.
3. **Location comes only from `useUserLocation`.** Nothing else calls `navigator.geolocation`. The in-app toggle switches between GPS and the draggable demo dot (`setDemoLocation`); denied or missing GPS falls back to the demo dot automatically.
4. **A chat exists only when waves go both ways** on the same bubble, and only those two users can read or write it.
5. **Never expose a user's location.** `User` holds a neighborhood, never coordinates.
6. **Units:** ISO date strings, meters, WGS84 decimal degrees.

## Sign-in is P0

Every server function needs a user identity (`canPop` records a `Pop` per user), so basic DeepSpace sign-in is part of the MVP (Urvi builds auth, Shreya the screen). Keep it to the fastest method DeepSpace offers so judges scanning the QR code can get in within seconds. The mock signs everyone in as a fake `me` user, so screens don't wait on it.

## Known limitations

- `canPop` trusts client coordinates, so GPS can be spoofed. The server check keeps sealed content off the client; it doesn't stop a determined spoofer.
- No rate limiting yet.
- GPS/EXIF metadata stripping is a TODO for after the MVP.

## Seed data CSV

```csv
title,note_text,category,latitude,longitude,place_name,media_file,language,author
```

`place_name` is cross streets, e.g. `Broadway & 116th St`.

## Working together

- **Never commit to `main`.** Every feature gets its own branch named `<name>-<feature>`, e.g. `tisya-demo-mode`, `stephanie-map-bubbles`, `urvi-auth`, `shreya-app-shell`. Bug fixes: `<name>-fix-<bug>`.
- Start each branch from a freshly pulled `main`.
- **Before opening a PR,** merge `main` into your branch (`git pull origin main`, merge not rebase), fix conflicts, check the app runs.
- **Squash-merge** PRs and delete the branch after.
- Only edit files in your own area. Ask before touching a teammate's.
- **Changing these contracts:** adding a new optional field = push and post in the group chat. Any breaking change (renaming, removing, making something required, changing a meaning) = heads-up in the group chat **before** merging.
