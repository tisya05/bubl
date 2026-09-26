# bubl: project context for Claude Code

You are helping a 3-person team build **bubl** at DivHacks 2026 (Columbia University, Sep 26 to 27, 2026).
Devpost: https://divhacks-2026.devpost.com/
**Hard submission deadline: Sunday Sep 27, 10:30 AM EST.** Aim to submit by 10 AM. Scope every decision to that.

I am Tisya. I own the AI integrations, the proximity check, demo mode, the Drop screen, and the pitch. My teammates work in parallel on other parts (see "Team and ownership"), so do not rewrite their areas without asking me.

---

## 1. The idea

bubl is a mobile-first PWA where locals pin notes (text, photos, short videos) to real spots in NYC. You **cannot search** for them. You discover them by physically walking near them, and a note only opens ("pops") when you are within **15 m**. The goal is to see the city through locals' eyes instead of a tourist guide.

Core loop:
1. **Walk.** A map shows nearby bubbles, color-coded by category. Far bubbles are blurred soft dots in their category color. Bubbles within ~100 m become solid and show a category icon. Contents stay sealed.
2. **Pop.** Within 15 m, the user gets an in-app "you drifted into a bubble" banner, taps, sees a bubble-pop animation, and the note opens.
3. **Drop.** Users leave their own bubble at their current location: text, photo, or video (max 15 s), a category, and how long it floats (1 week, 1 month, forever). Every drop is moderated by Grok before it goes live. **Every live bubble is visible to everyone** (map previews are public; there is no "only people you know" / `whoCanPop` gate). Contents still stay sealed until `canPop` passes on distance.
4. **Wave.** A wave is only between the **bubble author (A)** and a person who **popped and loved** that bubble (B). **Either side may wave first.** After B loves, A and B can see each other's **display names** for that bubble (so each can wave). Other lovers (C) cannot see that B loved it, cannot wave at B, and can only wave at A about that bubble. Authors cannot love their own bubble. On the note screen the action is **Wave** (not "Reply here"), with an **optional short note** (max ~280 chars). A chat unlocks **only when A and B have both waved**. Nobody can message anyone before that.
5. **Chat.** One DM thread per user pair (not one chat per bubble). The thread pins the **first** connecting bubble (simpler; do not update the pin later).

Name and brand: "bubl". The two b's are eyes, the u is a smile. Tagline: "pop ur bubl." (come out of your bubble, explore NYC, meet people).

Hackathon track: **Know Your City** ("anti-tourist track": NYC block by block, hidden gems, neighborhood connection).

**Seed area: Morningside Heights**, within a 10 to 15 minute walk of Lerner Hall (Columbia). One special demo bubble sits at Lerner Hall with a **60 m** pop radius because indoor GPS is off by 20 to 50 m.

---

## 2. Team and ownership

| Person | Owns |
| --- | --- |
| Urvi | DeepSpace backend: auth, tables, storage, the wave rule, deploy, .tech domain, seed import. Frontend: wave screen, Chats tab, chat thread. |
| Stephanie | Map with category bubbles, pop animation, note screen. Also splash, onboarding, You tab, PWA install. |
| Tisya (me) | `checkBubble`, `translate`, `speak`, `canPop`, demo mode, Drop screen, seed data, pitch. |

Everyone codes against the **shared contracts in section 5**. If a contract needs to change, tell me first so I can tell the team.

---

## 3. Tech stack

- **Frontend:** React + TypeScript (DeepSpace is built for React + TS). PWA via `vite-plugin-pwa` (manifest + service worker, installable).
- **Map:** MapLibre GL JS with a free vector tile source (OpenFreeMap or MapTiler free tier). Bubbles are a custom layer on top.
- **Location:** browser Geolocation API (`watchPosition`), distances with Turf.js or a small haversine function.
- **Backend:** **DeepSpace** SDK (sponsor): auth, real-time data, role-based permissions, file storage, channel messaging/DMs, scheduled jobs, deploy to an `app.space` address with a custom domain.
- **AI:**
  - **Grok (xAI API)** for moderation + suggested category on drop. Use a model that accepts text + image input and returns structured JSON (e.g. `grok-4.7`; confirm the current model name in xAI docs).
  - **Gemini API** for translating a note into the reader's language on pop.
  - **ElevenLabs** text-to-speech to read a note aloud on pop.
- **Optional stretch:** Photon Spectrum (iMessage agent). Only after everything else works.

**Important:** I have not used the DeepSpace SDK before. Before writing DeepSpace code, read its official docs / package README and use the real API. **Do not guess or invent SDK function names** for DeepSpace, xAI, Gemini, ElevenLabs, or Photon. If you are unsure, tell me and check the docs.

All API keys live in server-side environment variables. Never ship a key to the client.

---

## 4. Design system (match the mockups)

Mockups: https://claude.ai/artifact/MmVhwKnRz4RaVwmRoPjXkS

**The UI is not final.** We already have some changes in mind and will make more during the hackathon. Treat the mockups and this section as the starting point, not a spec. Build UI in small, reusable components with colors and fonts pulled from shared theme tokens (not hard-coded in each file), so screens are easy to restyle or rearrange. When I describe a UI change, update this section of CLAUDE.md too so it stays current.

**Palette ("Navy Sherbet")**
- Navy (primary): `#243B64`, hover `#172946`
- Sherbet (accent, "you" dot, smile): `#FF8A5B`
- Pale blue: `#CFE0F0`
- Paper background: `#F4F1EA`, card `#FBF9F4`, border `#DDD6C8`
- Ink text: `#17171C`, muted text: `#5E5A52`

**Categories** (color + icon; never color alone, for colorblind users)

| Category | Color | Card tint | Icon |
| --- | --- | --- | --- |
| Food | `#FF8A5B` | `#FFE1D4` | fork and knife |
| Cafe | `#C98B4A` | `#F1E1CD` | cup |
| Park | `#6BAF7A` | `#DCEBD9` | tree |
| Street | `#5B8FD9` | `#D7E4F6` | signpost |
| Misc | `#B07CD8` | `#EADCF5` | sparkle |

**Type:** Bricolage Grotesque (display + body), DM Mono (small uppercase labels, distances). Google Fonts.

**Bottom nav:** Walk, Drop, Chats, You.

**Screens:** Splash (navy background, logo, "pop ur bubl."), Permissions, Walk map, In-bubble banner, Pop (navy, bubble bursts into droplets, "pop."), Note, Wave, Drop, Safety check result, You (Popped card grid / Dropped list), Chats list, Chat thread.

Respect `prefers-reduced-motion` for all animations. Touch targets at least 44 px.

---

## 5. Shared contracts (write these first as TS types in `src/types/`)

```ts
type Category = 'Food' | 'Cafe' | 'Park' | 'Street' | 'Misc';

interface Bubble {
  id: string;
  authorId: string;
  lat: number;
  lng: number;
  category: Category;
  title: string;
  text: string;            // sealed: only returned after canPop passes
  mediaUrl?: string;       // photo or video, GPS metadata stripped
  mediaType?: 'photo' | 'video';
  language: string;        // e.g. 'en', 'es'
  audioUrl?: string;       // cached ElevenLabs audio
  popRadiusM: number;      // 15 by default, 60 for the Lerner demo bubble
  // No whoCanPop: all live bubbles are discoverable by everyone.
  expiresAt?: string;      // ISO date, undefined = forever
  createdAt: string;
  status: 'live' | 'rejected';
  // Optional denormalized counts (easy; returned after canPop):
  poppedCount?: number;
  lovedCount?: number;
}

// What the map receives for nearby bubbles: NO text, NO media.
interface BubblePreview {
  id: string; lat: number; lng: number; category: Category;
}

interface Pop   { userId: string; bubbleId: string; poppedAt: string; loved: boolean; }
// Wave is author ↔ lover only (enforced server-side). Optional note from the waver.
interface Wave  {
  fromUserId: string;
  toUserId: string;
  bubbleId: string;
  note?: string;
  createdAt: string;
}
// One Chat per user pair; pin one connecting bubbleId.
interface Chat  {
  id: string;
  participantIds: [string, string];
  bubbleId: string;        // pinned connecting bubble
  unlockedAt: string;
}
interface Message { chatId: string; senderId: string; text: string; sentAt: string; }
```

**Server functions (Tisya owns these):**

```ts
// Drop pipeline: runs before a bubble goes live
checkBubble(input: { text: string; imageBase64?: string[] })
  => Promise<{ allowed: boolean; reasons: string[]; suggestedCategory: Category }>

// Pop pipeline
canPop(input: { userLat: number; userLng: number; bubbleId: string })
  => Promise<{ ok: true; bubble: Bubble } | { ok: false; distanceM: number }>

translate(input: { text: string; targetLanguage: string })
  => Promise<{ text: string; sourceLanguage: string }>

speak(input: { bubbleId: string; text: string })
  => Promise<{ audioUrl: string }>   // generate once, store, reuse
```

For video drops, Grok does not take video input. Extract 1 to 2 frames on the client and send them as images.

---

## 6. Features by priority

Finish each tier before starting the next.

**P0: no demo without these**
1. Contracts (section 5) + repo structure + DeepSpace scaffold, deploy hello-world early.
2. Map with color-coded bubbles (far = blurred dot, near = solid + icon, legend row).
3. Real GPS + **demo mode**: a draggable "you" dot that replaces GPS (toggle, e.g. `?demo=1`). Required for judging indoors.
4. Pop flow: `canPop` on the server, pop animation, note screen (text / photo / video).
5. Seed data imported (see section 8).
6. Deploy + .tech domain.

**P1: full product and most prizes**
7. Sign-in (DeepSpace auth).
8. Drop flow: compose screen, category picker, media upload, `checkBubble`.
9. Read-aloud on pop with `speak`.
10. Loves, waves, chat unlock enforced on the server.
11. Chats tab + chat thread (DeepSpace messaging).

**P2: good to have**
12. `translate` on pop (Gemini).
13. You tab: Popped card grid with category tints, Dropped list.
14. Splash + onboarding.
15. PWA install, "drifted into a bubble" banner, vibration.

**P3: stretch**
16. Photon agent (after a mutual wave, suggests a meetup; or accepts drops by text).
17. Bubble expiry via scheduled job.
18. Report / block in chat.

---

## 7. Security and privacy requirements (non-negotiable)

- **Never send sealed bubble content to the client early.** The map gets `BubblePreview` only. Text, media, and audio come back only from `canPop` after the server verifies distance. Hiding content in the UI is not enough.
- **Strip GPS/EXIF metadata** from every uploaded photo and video on the server.
- **Chat permissions enforced server-side:** a DM channel is created only when waves exist in both directions, and only those two users can read or write it.
- **Never expose users' locations** to other users. Profiles show neighborhoods only.
- API keys server-side only.
- Validate and size-limit uploads (video 15 s, keep files small).

---

## 8. Seed data format

Tisya collects 20 to 30 spots around Morningside Heights. The shared sheet uses these columns, and we need an import script that turns it into `Bubble` rows (running each through the same media processing, including metadata stripping):

```csv
title,note_text,category,latitude,longitude,media_file,language,author
```

---

## 9. Prizes we are targeting (so you know what each feature is for)

- Know Your City track (main), grand prize, Most Popular
- **DeepSpace** (backend, auth, storage, chat, deploy)
- **MLH ElevenLabs** (read-aloud)
- **MLH Gemini** (translation)
- **MLH .Tech domain**
- **SpaceXAI** (Grok moderation; long shot)
- **Photon** (stretch only)

Judging: Concept 30%, Functionality 30%, Wow Factor 20%, UX and Design 10%, Value to Community 10%. The three wow moments are the pop animation, a note read aloud, and the mutual wave.

---

## 10. How to work with me

- Start by writing the section 5 types and a short `docs/CONTRACTS.md`, then scaffold. Show me the plan before large changes.
- Keep things simple and demo-safe. Working and ugly beats beautiful and broken.
- Commit small and often with clear messages. Teammates are pushing to the same repo; pull before you start and avoid touching files in their areas.
- When something is uncertain (an SDK method, a model name, a limit), say so and check the docs instead of guessing.
- Tell me if a feature is going to take much longer than expected so we can cut scope.