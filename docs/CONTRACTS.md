# bubl contracts

Everything all four of us code against. If it's not here or in `app/src/bubl/types/`, it isn't agreed yet.

## What's where

All shared bubl code lives in **`app/src/bubl/`**, inside Urvi's DeepSpace app. There is no other `src` folder; don't create one. Screens go in `app/src/pages/`, server actions in `app/src/actions/`.

| Path (under `app/src/bubl/`) | What |
| --- | --- |
| `types/models.ts` | Data shapes: `Category` (+ `CATEGORIES`), `Bubble`, `BubblePreview`, `Pop`, `Wave`, `User`, `Chat`, `Message`, and the list items `PoppedItem`, `DroppedItem`, `IncomingWave`, `ChatSummary` |
| `types/api.ts` | Inputs and outputs of every server function, plus the `Api` interface listing them all |
| `api/client.ts` | The one `api` object screens import. Mock when `VITE_USE_MOCK=true`; otherwise it calls the DeepSpace server action with the same name |
| `api/mock.ts` | In-memory mock: 6 fake bubbles near Lerner. Only `nearbyBubbles` and `canPop` are real; the rest return simple defaults |
| `hooks/useUserLocation.ts` | The only source of the user's location (GPS or demo dot) |
| `components/DemoModeToggle.tsx` | In-app GPS / demo switch (template `Switch`) |
| `lib/geo.ts` | `distanceM(a, b)`, the one distance function |
| `config.ts` | Distances: `NEAR_ICON_M`, `DEFAULT_POP_RADIUS_M`, `DEMO_POP_RADIUS_M`, `NEARBY_QUERY_RADIUS_M`, `MAX_NEARBY_RADIUS_M`, `LERNER_HALL` |
| `colors.ts` | `BRAND` (navy, sherbet, pale blue) and `CATEGORY_META` (color, tint, lucide icon component, label) |

The app-wide palette is the `navy-sherbet` theme in `app/src/themes.css` (active in `app/index.html`), so the template's UI components (`@/components/ui`) are already on-brand. Use Tailwind theme classes (`bg-background`, `text-primary`, ...) for screens and `colors.ts` only where code needs a raw color (map layers, the "you" dot).

```ts
import { api } from '@/bubl/api/client';
import type { BubblePreview } from '@/bubl/types';

const res = await api.nearbyBubbles({ lat, lng, radiusM: NEARBY_QUERY_RADIUS_M });
if (!res.success) return showError(res.error);
res.data; // BubblePreview[]
```

## MVP first

MVP = basic sign-in + map with bubbles + location / demo dot + `canPop` + note screen + seed data + deploy. Everything else stays minimal until that works end to end. Security hardening comes after.

## Server functions

All of them require a signed-in user.

| Function | Owner | Input | Output | Notes |
| --- | --- | --- | --- | --- |
| `nearbyBubbles` | Urvi | `lat`, `lng`, `radiusM` | `BubblePreview[]` | Excludes expired and rejected bubbles. Server caps `radiusM` at 25 km: the map shows every bubble in the city (far ones blurred); content stays sealed until you are inside a pop radius |
| `canPop` | Tisya | `userLat`, `userLng`, `bubbleId` | `{ ok: true, bubble, author }` or `{ ok: false, reason }` | `reason`: `'too_far'` (with `distanceM`), `'not_found'`, `'expired'`. Success creates the caller's `Pop` (one per user and bubble; popping again is a no-op). `lovedBy` and `loveBubble` depend on it |
| `loveBubble` | Urvi | `bubbleId` | `{ loved: true }` | Sets `Pop.loved`. Requires an existing `Pop`; refused for the bubble's own author. Loving twice is a no-op |
| `lovedBy` | Urvi | `bubbleId` | `User[]` | Only for the bubble's author: who loved it. Everyone else gets `[]` (a lover gets the author from `canPop`) |
| `speak` | Tisya | `bubbleId` | `{ audioUrl }` | Server loads the text itself, only if the caller has popped it. Generated once, stored, reused. For a voice-note bubble (`mediaType: 'audio'`) it returns the author's recording (`/api/media/<id>`) instead of an ElevenLabs voice |
| `translate` | Tisya | `bubbleId`, `targetLanguage` | `{ title, text, sourceLanguage }` | **Deferred: not planned for now, don't build UI for it.** The type and a mock stay as a placeholder. If revived: server loads the bubble itself, only if the caller has popped it; cached per bubble and language |
| `uploadMedia` | Urvi | `File` | `{ uploadId, mediaType }` | Not an action: multipart `POST /api/media/upload`. JPEG, PNG, WebP (max 5 MB) or MP4/MOV (max 12 MB, 15 s), or a voice note: M4A/MP4 audio (Safari), WebM or Ogg (Chrome/Android), MP3 (max 1 MB, 30 s; `mediaType: 'audio'`). Strips GPS/EXIF/XMP, video metadata and MP3 ID3 tags. The bubble's `mediaUrl` is `/api/media/<uploadId>`, served only to the uploader, the author, and people who popped it. The client (`uploadMedia`) converts HEIC and photos over 4 MB to JPEG first, where the browser can decode them (HEIC: Safari) |
| `dropBubble` | Tisya | `DropBubbleInput` | `{ ok: true, bubble }` or `{ ok: false, reasons }` | Checks run in order: input validation, a PII pre-check (emails, phone numbers, SSNs, card numbers; works even without Gemini), then Gemini moderation (hate speech, offensive language, swearing, PII such as private names or home addresses; images too). Rejected drops are never saved; `reasons` are safe to show the author. Empty title/category use Gemini's suggestions; Gemini also sets `language`. If Gemini is unreachable (no `GEMINI_API_KEY`, network error, 10 s timeout, error status) the bubble is saved with `moderation: 'unchecked'`; if Gemini answers but gives no usable verdict (likely its own safety filter), the drop is rejected. Text max 1000 chars, title max 60. `uploadId` comes from `uploadMedia` and must be the caller's own unused upload (checked by `mediaForDrop`); for video, send 1 to 2 client-extracted frames as `frameBase64`; a voice note needs no frames (Gemini listens to the stored file on the server). `text` may be empty when there is an `uploadId` |
| `myPopped` | Urvi | none | `PoppedItem[]` | You tab. The caller's pops, newest first |
| `myDropped` | Urvi | none | `DroppedItem[]` | You tab. The caller's live drops, newest first. `popCount` excludes the author's own pop |
| `sendWave` | Urvi | `toUserId`, `bubbleId`, `note?` (max 280 chars) | `{ matched, chatId? }` | Only between the bubble's author and someone who loved it; either may wave first. Waving again is a no-op. `matched` when the other person already waved; the server then creates the pair's one `Chat` (or reuses it), pinned to the first bubble |
| `incomingWaves` | Urvi | none | `IncomingWave[]` | Waves to the caller they haven't waved back yet, newest first. `createdAt` is the day only |
| `myChats` | Urvi | none | `ChatSummary[]` | Most recent activity first. No read receipts: `unread` means the other person sent the last message |
| `getMessages` | Urvi | `chatId` | `Message[]` | Only the chat's two users. Latest 200, oldest first |
| `sendMessage` | Urvi | `chatId`, `text` (1 to 1000 chars) | `Message` | Only the chat's two users |
| `getMe` | Urvi | none | `{ userId, handle, notificationsEnabled, locationEnabled, onboarded }` | Splash: signed out (401 / no session) → sign-in screen; `onboarded: false` → handle, then notifications; `onboarded: true` → map. `handle` is `null` until claimed |
| `claimHandle` | Urvi | `handle` | `{ ok: true, me }` or `{ ok: false, reason }` | 3 to 20 chars, lowercase letters, numbers and `_` (input is lowercased, a leading `@` dropped). Unique; `reason` is safe to show ("That handle is taken"). Claiming a new one frees the old one |
| `savePreferences` | Urvi | `notificationsEnabled`, `locationEnabled` (booleans) | same as `getMe` | Needs a handle first. The first save marks onboarding done |

**Auth (Urvi).** DeepSpace only supports Google (or GitHub) sign-in for new users: email sign-up is disabled and there's no phone sign-in, so the phone option is UI only. Everywhere a person is shown to someone else (`canPop` author, `lovedBy`, waves, chats) their name is `@handle` (or "A local" / "bubl user" before they pick one), never their Google name or email.
- **Google:** send the browser to `/api/auth/social-redirect?provider=google`. It flashes a "Signing in…" page, goes to Google, and comes back to `/home` signed in. No DeepSpace sign-in screen.
- **Staying signed in:** the session cookie lasts 30 days, so on launch just call `getMe`. Signed-out calls fail with 401.
- **Demo sign-in:** `POST /api/demo/sign-in` with `{ as: 'maya' | 'dev' | 'sam' }` sets the same session cookie (their passwords are server secrets). Those three are already onboarded (`@maya`, `@dev`, `@sam`).
- **Sign out:** `POST /api/auth/sign-out`.

**Server-only pieces (not in `Api`, never called from the client):**

- `saveBubble(bubble: Bubble)` (Urvi): the one DeepSpace write the seed import and `dropBubble` use.
- `mediaForDrop(tools, userId, uploadId)` (Urvi, `app/src/server/media-routes.ts`): `dropBubble` calls it with the input's `uploadId`. It checks the caller owns an unused upload and returns `{ ok, mediaUrl, mediaType, storageKey, contentType }` to put on the bubble (`storageKey` lets `dropBubble` send a voice note to Gemini via `readStoredMediaBase64`); `saveBubble` then links the upload to the bubble.
- Pure helpers in `app/src/bubl/lib/` (Tisya): the `nearbyBubbles` filter (distance, expired, rejected, 25 km cap), the expiry check, and GPS/EXIF stripping. Urvi's DeepSpace functions load data and call these.

Rule of thumb: Urvi owns anything that calls DeepSpace; Tisya owns the logic that doesn't.

**Results and errors (DeepSpace native):** every server function is a DeepSpace server action (`POST /api/actions/<name>`) and returns `ActionResult`: `{ success: true, data }` or `{ success: false, error }`. Check `res.success` before reading `res.data`. `canPop` and `dropBubble` put their user-facing outcome (too far, rejected by moderation) inside `data`; `success: false` is only for real failures. `User` is DeepSpace's own user (`id`, `name`, `imageUrl`), never email.

## Rules the types don't enforce

1. **Sealed content stays on the server.** The map only gets `BubblePreview` (id, position, place name, category, pop radius). `title`, `text`, `mediaUrl` and `audioUrl` reach the client only in a successful `canPop` result. `speak` and `translate` take a `bubbleId`, never text from the client.
2. **The pop radius is per bubble:** 15 m by default, 60 m for the Lerner demo bubble. Use `popRadiusM` from the preview for the in-bubble banner, and `distanceM` from `app/src/bubl/lib/geo.ts` for the math.
3. **Location comes only from `useUserLocation`.** Nothing else calls `navigator.geolocation`. The in-app toggle switches between GPS and the draggable demo dot (`setDemoLocation`); denied or missing GPS falls back to the demo dot automatically.
4. **Waves are author and lover only.** A wave is only between a bubble's author and someone who loved it, about that bubble, and either can wave first. Two people who loved the same bubble never see or wave at each other. Authors can't love their own bubble. On the note screen the action is **Wave** (not "Reply"), with an optional note of up to 280 characters.
5. **One chat per pair of users,** created only when both have waved, readable and writable only by those two. It pins the *first* bubble that connected them and never updates the pin.
6. **Never expose a user's location.** `User` is only `id`, `name` and `imageUrl`.
7. **Units:** ISO date strings, meters, WGS84 decimal degrees.

## Notifications

In-app only for now (sound, vibration, a banner; a system notification too if the app is in the background and the user allowed it). Nothing arrives while the app is closed: that needs Web Push, not built.

- **Your own events** (client): call `alert({ kind: 'pop', title: 'pop.', body: bubble.title, bubbleId })` from `@/bubl/lib/alerts` when a pop succeeds. It plays the pop sound. Walking mode already does this; the Walk screen's manual pop should too. "You drifted into a bubble" fires by itself.
- **Other people's actions** (server): after the action succeeds, one line, e.g. `await notify(tools, authorId, loveNotice({ id: userId, name: await displayName(tools, userId) }, { id: bubbleId, placeName }))`. Helpers: `notify`/`displayName` in `src/actions/notify.ts`; `loveNotice`, `waveNotice`, `matchNotice`, `messageNotice` in `@/bubl/lib/notifications`. Rows go to the recipient's private `notifications` table; `notify` never throws and never notifies you about yourself.
- **Mounting:** `<NotificationCenter />` is already in `src/pages/(app)/_layout.tsx`. Screens that need the list or an unread badge use `useNotifications()` (`notifications`, `unreadCount`, `markRead`, `markAllRead`). System notifications need `enableSystemNotifications()` from a tap (e.g. a settings toggle).

## Sign-in is P0

Every server function needs a user identity (`canPop` records a `Pop` per user), so basic DeepSpace sign-in is part of the MVP (Urvi builds auth, Shreya the screen). Keep it to the fastest method DeepSpace offers so judges scanning the QR code can get in within seconds. The mock signs everyone in as a fake `me` user, so screens don't wait on it.

## Known limitations

- `canPop` trusts client coordinates, so GPS can be spoofed. The server check keeps sealed content off the client; it doesn't stop a determined spoofer.
- No rate limiting yet.
- HEIC photos are only converted to JPEG in browsers that can decode them (Safari).
- The Gemini key lives in the DeepSpace secrets store (`npx deepspace secrets set GEMINI_API_KEY=...`), never in code or `.dev.vars`. Without it, drops still work but are saved `unchecked`.

## Seed data (Urvi)

`seed/bubbles.csv`, with photos and videos in `seed/media/`:

```csv
title,note_text,category,latitude,longitude,place_name,media_file,language,author
```

- `place_name` is cross streets, e.g. `Broadway & 116th St`. Coordinates must be in NYC.
- `author` is `maya`, `dev` or `sam` (the demo accounts). `language` defaults to `en`. `media_file` is a file name in `seed/media/` or empty (photo, video, or a .m4a/.mp3/.webm/.ogg voice note). `note_text` may be empty when there is a `media_file`. HEIC and photos over 4 MB are converted to JPEG automatically (macOS).
- Every row becomes bubble `seed-<title-slug>`: 15 m pop radius, never expires.
- `cd app && npm run seed:import` (add `-- --dry-run` to only check the CSV). Re-running updates in place and skips already-uploaded media.
- `cd app && npm run demo:reset` between judges: wipes all pops, loves, waves, chats, messages and bubbles dropped during the demo. Seed bubbles stay. Owner only.

## Working together

- **Never commit to `main`.** Every feature gets its own branch named `<name>-<feature>`, e.g. `tisya-demo-mode`, `stephanie-map-bubbles`, `urvi-auth`, `shreya-app-shell`. Bug fixes: `<name>-fix-<bug>`.
- Start each branch from a freshly pulled `main`.
- **Before opening a PR,** merge `main` into your branch (`git pull origin main`, merge not rebase), fix conflicts, check the app runs.
- **Squash-merge** PRs and delete the branch after.
- Only edit files in your own area. Ask before touching a teammate's.
- **Changing these contracts:** adding a new optional field = push and post in the group chat. Any breaking change (renaming, removing, making something required, changing a meaning) = heads-up in the group chat **before** merging.
