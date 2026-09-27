# bubl

A mobile-first PWA where you discover NYC by physically walking near notes ("bubbles") that locals left at real spots — you can't search for them, you have to be close enough to pop them open.

## Overview

bubl replaces the tourist-guide way of seeing a city with a walking-first, locals-first one. Anyone can drop a short note — text, a photo, a 15-second video, or a use speech-to-text — at their exact location, tag it with a category, and set how long it stays up. Other users see it on a map only as a color-coded, distance-blurred dot; the title, text, and media stay sealed on the server until a user's GPS is within the bubble's **pop radius** (15 m by default).

Popping a bubble is the core moment: it's a physical act, not a database query. From there, the product layers in a lightweight social loop — if you loved a spot and its author waves back at you, a private chat unlocks between exactly the two of you.

Built during **DivHacks 2026** (Columbia University) for the "Know Your City" track.

## Features

- **Walk (map).** Every live bubble in the city renders on the map, colored and iconed by category. Far bubbles are blurred dots; anything within ~100 m becomes a solid marker with its category icon. Sealed content (title, note, media) never reaches the client until a pop succeeds.
- **Pop.** A server-side distance check (`canPop`) is the only way to unlock a bubble's content. A successful pop is recorded once per user per bubble and triggers an in-app "you drifted into a bubble" alert (sound, vibration, banner).
- **Drop.** Compose a note with an optional photo or video (≤15 s), a category, and an expiry (or forever). Every drop is checked by Gemini before it goes live — for hate speech, PII (emails, phone numbers, SSNs, card numbers), and offensive language — with a PII pre-check that runs even if Gemini is unreachable. If moderation can't be reached at all, the drop still saves, flagged `unchecked`, so a demo never blocks on a third-party outage. 
- **Read aloud.** Any popped bubble can be read aloud via ElevenLabs text-to-speech (through DeepSpace's integration proxy), generated once and cached on the bubble. A voice-note bubble instead plays back the author's own recording.
- **Love → Wave → Chat.** Only a bubble's author and someone who popped-and-loved it can see each other's handles and wave. A private one-on-one chat is created only once both sides have waved, and it's pinned to the bubble that connected them.
- **You tab.** Your own popped bubbles and dropped bubbles, with the ability to remove a pop (unseal the bubble again) or delete your own drop.
- **Notifications.** In-app notifications (love, wave, mutual match, new message) land in a private notification feed with an unread badge; system notifications fire when permitted and the app is backgrounded.
- **Demo mode.** A draggable "you are here" dot replaces real GPS for indoor/offline demos, plus a one-tap demo sign-in (Maya, Dev, Sam) for judges who don't want to use Google OAuth.
- **Events feed (prototype).** An additional "Events" tab for scheduled local pop-ups (photo, venue, start/end time). This is currently a **frontend-only prototype**: event data and reactions are stored in the browser's `localStorage`/IndexedDB, not synced through the real backend or between devices. See [`docs/EVENTS-FRONTEND-HANDOFF.md`](docs/EVENTS-FRONTEND-HANDOFF.md).
- **Report button (prototype).** Lets a user flag a bubble or event with a reason; also frontend-only today (saved locally, not sent anywhere).
- **PWA install.** Installable to a phone home screen (manifest, icons, standalone display).

## Tech Stack

| Category | Technology |
| --- | --- |
| Frontend | React 19 + TypeScript, [Vite](https://vitejs.dev/) 8, React Router 7 with file-based routing (`@generouted/react-router`) |
| Styling | Tailwind CSS v4, Base UI (`@base-ui/react`) primitives, custom design tokens (`src/themes.css`) |
| Backend | [DeepSpace](https://www.npmjs.com/package/deepspace) SDK on Cloudflare Workers (Hono router, Durable Objects) |
| Data / storage | DeepSpace `RecordRoom` (SQLite-backed Durable Object) — collections defined in `app/src/schemas/`; media stored via DeepSpace's file storage with GPS/EXIF stripped server-side |
| Auth | DeepSpace auth (Google and GitHub OAuth), plus a server-side "demo sign-in" route for judges |
| AI / APIs | Google Gemini (drop moderation + category/title/language suggestion), ElevenLabs (read-aloud), both called through DeepSpace's integration layer / server actions |
| Testing | Vitest (unit), Playwright (end-to-end and mobile UI) |
| Deployment | `deepspace deploy` → Cloudflare Workers, served at `<app-name>.app.space` |

## Getting Started

### Prerequisites

- **Node.js** `>=22.15.0 <23`, `>=24 <25`, or `>=26 <27` (see `app/package.json` → `engines`)
- **npm** `>=11.6.0`
- A [DeepSpace](https://docs.deep.space) account, if you want to run the real backend (`npx deepspace auth login`). Not required for the frontend-only preview below.

### Installation

```bash
cd app
npm install
```

### Environment Variables

bubl doesn't use a local `.env` file. Configuration is split between two places:

**1. Build-time flags (Vite), for running the frontend without a backend:**

| Variable | Used for |
| --- | --- |
| `VITE_USE_MOCK` | Set to `true` to point `@/bubl/api/client` at an in-memory mock instead of the real DeepSpace server actions. |
| `VITE_UI_ONLY` | Set automatically by `vite.ui.config.ts` (the `npm run dev:ui` / `build:ui` build) — routes the app to the local demo experience with no auth or realtime providers. Not something you set by hand for normal development. |

**2. Server secrets (DeepSpace's encrypted secrets store, not files in the repo).** These are read by the deployed Worker via `env.<NAME>` (see `worker.ts`) and are managed with `npx deepspace secrets set KEY=value` rather than a `.env` file:

| Secret | Required? | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | Optional | Enables Gemini moderation on drops. Without it, drops still save, but are flagged `moderation: 'unchecked'`. |
| `GEMINI_MODEL` | Optional | Overrides the default Gemini model (`gemini-3.5-flash-lite`). |
| `DEMO_PASSWORD_MAYA`, `DEMO_PASSWORD_DEV`, `DEMO_PASSWORD_SAM` | Optional | Passwords for the three demo accounts used by `POST /api/demo/sign-in`. Without these set, demo sign-in is disabled. |
| `SEED_IMPORTERS` | Optional | Comma-separated user IDs (besides the app owner) allowed to run the seed-bubble import action. |

A handful of platform-provided bindings (`AUTH_JWT_PUBLIC_KEY`, `AUTH_WORKER_URL`, `API_WORKER_URL`, `DEEPSPACE_APP_ID`, `APP_OWNER_JWT`, etc.) are supplied automatically by the DeepSpace CLI/platform at dev and deploy time — you don't set these yourself.

### Running the Application

**Full app (frontend + DeepSpace backend), local dev server:**

```bash
cd app
npx deepspace auth login   # first time only
npm run dev
```

This starts DeepSpace's local dev server (Vite + a local Workers runtime) with the real auth, data, and server-action stack.

**Frontend-only preview (no backend, mock/local data), for UI work or a quick phone demo:**

```bash
cd app
npm run dev:ui        # http://localhost:5174, live-reloading
# or, for a built/optimized preview reachable from a phone on the same Wi-Fi:
npm run dev:phone     # http://localhost:5175 (and your machine's LAN address)
```

This mode never talks to the backend; it uses the mock API and browser-local storage. See [`docs/FRONTEND-PREVIEW.md`](docs/FRONTEND-PREVIEW.md) for a full walkthrough (including the demo flow and phone/PWA install steps).

## Project Structure

```
bubl/
├── docs/                       # Contracts and handoff notes (see below)
├── seed/                       # Seed bubble data (CSV + media) for Morningside Heights
├── mockup/                     # Design mockup screenshots
└── app/                        # The DeepSpace application
    ├── worker.ts                # Worker entry: Durable Object classes, route registration
    ├── wrangler.toml             # Cloudflare/DeepSpace deploy config, app identity
    ├── src/
    │   ├── bubl/                 # Shared bubl domain code (types, API client, hooks, UI)
    │   │   ├── types/            # Bubble, BubblePreview, Pop, Wave, Chat, etc. (docs/CONTRACTS.md)
    │   │   ├── api/              # `api` client (real DeepSpace calls) + `mock` (in-memory)
    │   │   ├── components/       # Screens: MobileApp, WalkScreens, DropScreen, SocialScreens, ...
    │   │   ├── hooks/             # useUserLocation (GPS/demo dot), useNotifications
    │   │   └── lib/               # geo distance math, moderation helpers, alerts, event demo data
    │   ├── actions/               # Server actions: bubbles, pop, love, waves, chats, drop, speak, moderation, you
    │   ├── schemas/               # DeepSpace collection schemas (users, bubbles, pops, waves, chats, ...)
    │   ├── server/                # Hono route modules: auth/http, media upload, realtime, demo auth
    │   ├── pages/                 # File-based routes (login, welcome, home, settings, ...)
    │   └── ai/                    # In-app assistant tools/agent (DeepSpace agent framework)
    ├── scripts/                   # seed.ts (import/reset seed bubbles), render-icons.mjs
    └── tests/                     # Playwright specs (auth, drop, pop, chat, media, mobile UI, ...)
```

The canonical description of every data shape and server function lives in [`docs/CONTRACTS.md`](docs/CONTRACTS.md) — start there for the exact API surface.

## Architecture

- **Frontend** is a single-page React app built with Vite, using file-based routing (`src/pages/`). The map, walk/pop/drop/chat screens, and location handling all live under `src/bubl/`.
- **Backend** is a Cloudflare Worker (`worker.ts`) built on the DeepSpace SDK. It registers, in order: auth/OAuth routes, WebSocket/realtime routes, server-action routes (`/api/actions/<name>`), media upload routes, a demo sign-in route, and finally static asset serving.
- **Data** lives in a per-app Durable Object (`RecordRoom`) backed by SQLite, using the collection schemas in `src/schemas/`. Every server function (`nearbyBubbles`, `canPop`, `dropBubble`, `sendWave`, `sendMessage`, ...) is a DeepSpace **server action** — a privileged, worker-side function invoked via `POST /api/actions/<name>` — never a raw client-side database query.
- **Sealed content contract:** the map only ever receives a `BubblePreview` (id, position, place name, category, pop radius). Full bubble content (`title`, `text`, `mediaUrl`, `audioUrl`) is returned by `canPop` only after the server verifies the caller's coordinates are inside the bubble's radius.
- **Auth** is handled by DeepSpace's own auth service (Google/GitHub OAuth), proxied through the Worker so session cookies stay same-origin. A separate demo-sign-in route lets judges sign in as one of three seeded demo accounts without OAuth.
- **AI integrations** run server-side only: `checkBubble` (Gemini) moderates every drop before it's saved, and `speak` calls ElevenLabs through DeepSpace's integration proxy the first time a bubble is read aloud, then caches the result on the bubble record.
- **Media uploads** go through a dedicated multipart route (`POST /api/media/upload`) that strips GPS/EXIF metadata and stores files privately; a bubble's `mediaUrl` only resolves for the uploader, the author, and users who've popped it.

## Development

```bash
cd app
npm run type-check     # tsc --noEmit
npm run lint           # eslint . (Rules of Hooks only)
npm run test:unit      # vitest run
npm run validate       # type-check + unit tests together
npm run test:watch     # vitest in watch mode
```

**Backend/integration tests** (via the DeepSpace CLI, against a real local Workers runtime):

```bash
npm run test           # deepspace test run (the quick default suite)
npm run test:smoke
npm run test:api
npm run test:e2e
```

**Mobile UI tests** (Playwright, against the frontend-only preview):

```bash
npm run test:mobile    # playwright test --config tests/mobile.config.ts
```

**Seed data** (Morningside Heights spots, imported from `seed/bubbles.csv` + `seed/media/`):

```bash
npm run seed:import            # add -- --dry-run to validate the CSV without writing
npm run demo:reset             # wipes pops/loves/waves/chats/messages and demo-dropped bubbles (owner only); seed bubbles stay
```

## Team

| Person | Responsibility |
| --- | --- |
| Urvi| responsible for backend , contributed on events page, and light frontend dev | 
|Tisya | responsible for backend, focused on APIs, contribution to events page| 
|Shreya| responsible for frontend, Logo, UI & Design, contribution to frontend and backend for events page| 
|Stephanie|responsible for frontend , UI & Design, integrated animated features, worked on backend for some actions| 
## Deployment

The app deploys to Cloudflare Workers via the DeepSpace CLI:

```bash
cd app
npx deepspace deploy
```

This builds the client and worker bundles with Vite, uploads them to Cloudflare Workers for Platforms, and serves the result at `<name>.app.space` (the subdomain is set by `name` in `wrangler.toml`; the app's permanent identity is the immutable `DEEPSPACE_APP_ID`, also in `wrangler.toml`). Server secrets are pulled from DeepSpace's encrypted secrets store at deploy time — see [Environment Variables](#environment-variables) above. Durable Object data (bubbles, pops, waves, chats) persists across deploys.

## Contributing

- Everyone codes against the shared contracts in [`docs/CONTRACTS.md`](docs/CONTRACTS.md); if a contract needs to change, flag it to the team before merging.
- Work in a feature branch off `main` (e.g. `<name>-<feature>`); pull `main` in before opening a PR and resolve conflicts there.
- Stick to your own area of the codebase where possible — check with a teammate before editing something they own (see [Team](#team) above).
- Run `npm run validate` (and `npm run lint`) before opening a PR.
