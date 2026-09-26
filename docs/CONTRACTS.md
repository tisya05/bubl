# bubl contracts

The shared types everyone codes against live in [`src/types/`](../src/types/). Import them from `src/types`:

```ts
import type { Bubble, BubblePreview, CanPopResult } from '../types';
```

- `models.ts`: `Category` (plus the `CATEGORIES` list), `Bubble`, `BubblePreview`, `Pop`, `Wave`, `Message`
- `api.ts`: inputs and outputs for the server functions `checkBubble`, `canPop`, `translate`, `speak`

**Changing a contract:** do it in its own `tisya-contracts-*` branch and PR, and post in the group chat before merging. All three of us build against these.

## Rules that the types alone don't enforce

1. **Sealed content stays on the server.** The map only ever gets `BubblePreview` (id, lat, lng, category). `title`, `text`, `mediaUrl` and `audioUrl` reach the client only inside a successful `canPop` result, after the server has checked the distance. Hiding them in the UI is not enough.
2. **The pop radius is per bubble.** `popRadiusM` is 15 by default and 60 for the Lerner demo bubble. `canPop` uses the bubble's own radius.
3. **Media has GPS/EXIF metadata stripped on the server** before `mediaUrl` exists.
4. **A chat exists only when waves go both ways** (A to B and B to A, same bubble), and only those two users can read or write it. Enforced on the server.
5. **Never expose a user's location** to other users. Profiles show neighborhoods only.
6. **Dates are ISO strings** (`new Date().toISOString()`), distances are meters, coordinates are WGS84 decimal degrees.

## Server functions (Tisya)

| Function | When | Input | Output |
| --- | --- | --- | --- |
| `checkBubble` | Drop, before the bubble goes live | `text`, optional `imageBase64[]` (video: 1 to 2 frames extracted on the client) | `allowed`, `reasons[]`, `suggestedCategory` |
| `canPop` | Tap on a nearby bubble | `userLat`, `userLng`, `bubbleId` | `{ ok: true, bubble }` or `{ ok: false, distanceM }` |
| `translate` | Note screen, if the note's language differs from the reader's | `text`, `targetLanguage` | `text`, `sourceLanguage` |
| `speak` | Note screen, read aloud | `bubbleId`, `text` | `audioUrl` (generated once, stored, reused) |

## Open questions (decide by 1 PM)

1. **Who serves the map's nearby bubbles, and with what signature?** Nothing in the contract returns `BubblePreview[]` yet. Proposal: `nearbyBubbles({ lat, lng, radiusM }) => Promise<BubblePreview[]>`, owned by Urvi on DeepSpace.
2. **What does `whoCanPop: 'met'` mean?** Proposal: only people who have a mutual wave with the author. Or cut it and ship `'anyone'` only.
3. **What does `canPop` return when the bubble is missing, expired, rejected, or `'met'`-only?** Right now it can only say `distanceM`. Proposal: add an optional `reason` to the `ok: false` branch.
4. **User and Chat shapes.** There is no `User` (id, display name, neighborhood, language) or `Chat` (id, the two user ids, the pinned `bubbleId`) type yet. Urvi, can you propose these from what DeepSpace gives us?
5. **How does someone find who to wave at?** Waves need a `toUserId`. Proposal: after popping, the note screen shows the other people who loved that bubble (name and neighborhood only) from a server query.
