# bubl contracts

The shared types everyone codes against live in [`src/types/`](../src/types/). Import them from `src/types`:

```ts
import type { Bubble, BubblePreview, CanPopResult } from '../types';
```

- `models.ts`: `Category` (plus the `CATEGORIES` list), `Bubble`, `BubblePreview`, `Pop`, `Wave`, `User`, `Chat`, `Message`
- `api.ts`: inputs and outputs for the server functions `nearbyBubbles`, `lovedBy`, `checkBubble`, `canPop`, `translate`, `speak`

**Changing a contract:** do it in its own `tisya-contracts-*` branch and PR, and post in the group chat before merging. All three of us build against these.

## Rules that the types alone don't enforce

1. **Sealed content stays on the server.** The map only ever gets `BubblePreview` (id, lat, lng, category). `title`, `text`, `mediaUrl` and `audioUrl` reach the client only inside a successful `canPop` result, after the server has checked the distance. Hiding them in the UI is not enough.
2. **The pop radius is per bubble.** `popRadiusM` is 15 by default and 60 for the Lerner demo bubble. `canPop` uses the bubble's own radius.
3. **Media has GPS/EXIF metadata stripped on the server** before `mediaUrl` exists.
4. **A chat exists only when waves go both ways** (A to B and B to A, same bubble), and only those two users can read or write it. Enforced on the server.
5. **Never expose a user's location** to other users. Profiles show neighborhoods only.
6. **Dates are ISO strings** (`new Date().toISOString()`), distances are meters, coordinates are WGS84 decimal degrees.

## Server functions

| Function | Owner | When | Input | Output |
| --- | --- | --- | --- | --- |
| `nearbyBubbles` | Urvi | Map load and as the user moves | `lat`, `lng`, `radiusM` | `BubblePreview[]` (never sealed content) |
| `lovedBy` | Urvi | Note screen, to pick someone to wave at | `bubbleId` | `User[]` who loved it. Empty unless the caller has popped it; never includes the caller |
| `checkBubble` | Tisya | Drop, before the bubble goes live | `text`, optional `imageBase64[]` (video: 1 to 2 frames extracted on the client) | `allowed`, `reasons[]`, `suggestedCategory` |
| `canPop` | Tisya | Tap on a nearby bubble | `userLat`, `userLng`, `bubbleId` | `{ ok: true, bubble }`, or `{ ok: false, reason }` where `reason` is `'too_far'` (with `distanceM`), `'not_found'`, `'expired'` or `'not_met'` |
| `translate` | Tisya | Note screen, if the note's language differs from the reader's | `text`, `targetLanguage` | `text`, `sourceLanguage` |
| `speak` | Tisya | Note screen, read aloud | `bubbleId`, `text` | `audioUrl` (generated once, stored, reused) |

## Decisions

1. **Map feed:** `nearbyBubbles` (Urvi) returns `BubblePreview[]` for the map.
2. **`whoCanPop: 'met'`** means only users who have a mutual wave with the author can pop it.
3. **`canPop` failures carry a `reason`.** Only `'too_far'` includes `distanceM`. A missing or rejected bubble returns `'not_found'` so a failed pop never reveals whether a bubble exists. Narrow on `reason` before reading `distanceM`.
4. **`User` is the public profile:** id, display name, neighborhood, language. Never add location, email or phone to it. **`Chat`** holds the two user ids and the `bubbleId` that connected them. Urvi: adjust the field names to match DeepSpace if needed, in a contracts PR.
5. **Finding someone to wave at:** after popping, the note screen calls `lovedBy` and shows the other people who loved that bubble (name and neighborhood only).
