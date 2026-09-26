# bubl: DivHacks 2026 implementation plan

Sep 26, 2026 · @tisya

## The idea and key decisions

bubl is a PWA where locals pin notes (text, photos, short videos) to real spots around NYC, and you can only open them by physically walking within 15 m. There is no search bar. Bubbles are color-coded by category. **Every live bubble is visible to everyone** (no "friends only" / `whoCanPop` gate). A wave is only between the **author** of a bubble and someone who **loved** it; a chat unlocks only when both have waved. Peer lovers of the same bubble cannot see or wave at each other.

- **Track:** Know Your City (the anti-tourist track).
- **Seed area:** Morningside Heights, within a 10 to 15 minute walk of Lerner Hall, not the Lower East Side from the mockups.
- **Live demo bubble:** plant one bubble outside Lerner with a 60 m pop radius, since indoor GPS can be off by 20 to 50 m. Demo mode is the backup.
- **Visibility:** all live bubbles are public on the map (previews only). Sealed content still requires the server distance check.
- **Wave:** author ↔ lover only, about that bubble. Either side may wave first. After a love, author and that lover see each other's display names (not other lovers). Authors cannot love their own bubble. Note CTA is **Wave** (replaces "Reply here"), optional note ≤280 chars. Incoming waves show "X waved at you" with wave-back.
- **Chat:** one DM per user pair; pin the **first** connecting bubble. Unlock only after mutual wave.
- **Palette:** Navy Sherbet. Navy #243B64, sherbet #FF8A5B, pale blue #CFE0F0, paper #F4F1EA.
- **Categories:** Food #FF8A5B, Cafe #C98B4A, Park #6BAF7A, Street #5B8FD9, Misc #B07CD8.
- **Mockups:** [bubl canvas](https://claude.ai/artifact/MmVhwKnRz4RaVwmRoPjXkS) + `mockup/` in repo. Treat mockups as vision; product rules above win when they disagree (e.g. wave is author↔lover, not lover↔lover). **Devpost:** [DivHacks 2026](https://divhacks-2026.devpost.com/).

## Roles

Four people. Urvi stays on the DeepSpace backend (the critical path) and hands everything that doesn't need DeepSpace to Tisya; Shreya takes the app shell and the social screens so Stephanie can focus on the map and pop.

| Person | Owns | Frontend share |
| --- | --- | --- |
| Urvi | DeepSpace only: DeepSpace setup in the scaffold, auth, tables, storage, the wave rule, chat, deploy, connecting the domain, the one `saveBubble` call the seed import uses | None; backend only |
| Stephanie | Map with category bubbles, pop animation, note screen | Splash, onboarding, PWA install, in-bubble banner |
| Shreya | App shell: bottom nav (Walk, Drop, Chats, You), routing, sign-in screen | Wave screen, Chats tab, chat thread, You tab |
| Tisya | AI functions (Grok, Gemini, ElevenLabs), canPop proximity check, demo mode, seed data trip, pitch and Devpost. Moved from Urvi: base scaffold (Vite + React + TS), seed import script, .tech domain registration and DNS, server logic that doesn't touch DeepSpace | Drop screen |

## Bottlenecks

The contracts and the mock stop us waiting on each other for *shapes*: every screen can be built today against `VITE_USE_MOCK=true`. They don't remove the work that only one person can do and that everything real depends on.

| # | Bottleneck | Who it blocks | Fix |
| --- | --- | --- | --- |
| 1 | **No scaffold yet** (no `package.json`, Vite, React, DeepSpace). Nothing runs or type-checks, not even mock screens | Everyone, right now | Tisya pushes a plain Vite + React + TS scaffold (`tisya-scaffold`, about 10 minutes). Urvi adds DeepSpace on top |
| 2 | **Urvi's backend.** Tables, storage, sign-in (now P0), `nearbyBubbles`, deploy, domain, seed import, and 11 of the 15 functions all run through Urvi. Tisya's server functions also can't go real until the DeepSpace pattern exists. Nobody has used DeepSpace before | The real demo; Tisya's server functions | Move everything that doesn't need DeepSpace to Tisya (below). Urvi's first DeepSpace goal: one working server function + one table, so everyone can copy the pattern |
| 3 | **No HTTPS deploy.** Phones only give GPS to HTTPS pages, so real GPS can't be tested on a phone until there's a deployed link | Real-GPS testing, the Lerner demo bubble | Urvi deploys a hello-world as soon as the scaffold exists, before building features |
| 4 | **Seed data.** Real coordinates only exist after Tisya's 4 to 6 PM walk, and then have to be imported | The 6 PM checkpoint | Tisya writes the import script before the walk; Urvi only provides `saveBubble` |

### Moved from Urvi to Tisya (no DeepSpace needed)

Urvi to confirm. The rule: Urvi owns anything that calls DeepSpace; Tisya owns the rest.

- **Base scaffold:** Vite + React + TypeScript, folder layout, `.env.example`, `.gitignore` for `.env`. Urvi adds the DeepSpace SDK and deploy config.
- **Seed import script:** reads the CSV, validates each row (category, coordinates, place name), builds `Bubble` objects, runs media through metadata stripping, then calls Urvi's `saveBubble` for each one.
- **Metadata stripping helper:** one function that removes GPS/EXIF from photos (and video if time allows). Used by the seed import and later by Urvi's `uploadMedia`. Post-MVP for user uploads, but the seed media gets stripped from the start.
- **.tech domain:** claim it through MLH and set up DNS. Urvi does the one step that points it at the DeepSpace deploy.
- **Pure server logic in `app/src/bubl/lib/`:** the `nearbyBubbles` filter (distance, expired, rejected, 1000 m cap) and the expiry check, so Urvi's version is just "load bubbles, call the helper".
- **Cut P3.2 (expiry scheduled job):** `nearbyBubbles` and `canPop` already skip expired bubbles, so the job isn't needed.

**Tisya's load after this:** the scaffold and seed script come first (they unblock others), then `canPop` + demo mode, then the walk. If Tisya falls behind on P1, Shreya can take the Drop screen UI once her P0 is done.

## Git and branching

Four people push to one repo overnight, so `main` must always build and demo. Nobody commits straight to `main`; every feature gets its own branch and lands through a pull request.

**Branch names: `<name>-<feature>`.** First name, lowercase, then the feature in kebab-case. One branch per feature, not per person.

- `tisya-demo-mode`, `tisya-can-pop`, `tisya-drop-screen`
- `stephanie-map-bubbles`, `stephanie-pop-animation`
- `urvi-auth`, `urvi-wave-rule`
- `shreya-app-shell`, `shreya-chats`
- Bug fixes: `<name>-fix-<bug>`, e.g. `stephanie-fix-map-blank-on-ios`

| Feature | Branch |
| --- | --- |
| P0.1 Contracts + scaffold | `tisya-contracts`, `tisya-scaffold`, `urvi-deepspace-setup` |
| P0.2 Map with bubbles | `stephanie-map-bubbles` |
| P0.3 GPS + demo mode | `tisya-demo-mode` |
| P0.4 Pop flow | `tisya-can-pop`, `stephanie-pop-animation`, `stephanie-note-screen` |
| P0.5 Seed data | `tisya-seed-data`, `tisya-seed-import`, `urvi-save-bubble` |
| P0.6 Deploy + domain | `urvi-deploy`, `tisya-domain` |
| P0.7 Basic sign-in | `urvi-auth`, `shreya-sign-in-screen` |
| P0.8 App shell + bottom nav | `shreya-app-shell` |
| P1.2 Drop flow | `tisya-drop-screen`, `tisya-check-bubble` |
| P1.3 Read-aloud | `tisya-speak` |
| P1.4 Loves, waves, chat unlock | `urvi-wave-rule`, `shreya-wave-screen` |
| P1.5 Chats | `urvi-chats`, `shreya-chats` |
| P2.1 Translation | `tisya-translate` |
| P2.2 to P2.4 | `shreya-you-tab`, `stephanie-onboarding`, `stephanie-pwa` |
| P3.1 Photon agent | `tisya-photon` |
| P3.3 Report and block | `urvi-report-block` |

**Workflow for every feature**

```bash
git checkout main && git pull            # start from the latest main
git checkout -b tisya-demo-mode          # <name>-<feature>
# ...work, commit small and often...
git push -u origin tisya-demo-mode       # first push; later just `git push`
# open a PR into main on GitHub
```

**Rules**

1. **Keep branches short.** Merge within a few hours. A branch that lives all night will conflict with everything.
2. **Sync before you open a PR.** Run `git pull origin main` inside your branch (merge, not rebase, so nobody has to force-push), fix conflicts, check the app still runs, then open the PR.
3. **Merging.** Post the PR link in the group chat. Anyone can merge once the app builds and the PR only touches the author's area. Use "Squash and merge" and delete the branch after.
4. **Stay in your lane.** Only edit files in your own area (see Roles). If you need a change in a teammate's file, ask them or put it in a separate small PR and tag them.
5. **Shared contracts (`app/src/bubl/types/`) change in their own PR,** announced in the group chat before merging, because everyone codes against them.
6. **Dependencies.** Say so in the chat when you add a package. For `package-lock.json` conflicts, take `main`'s version and run `npm install` again; do not hand-merge the lockfile.
7. **No secrets in git.** API keys go in `.env` (gitignored) and in the deploy environment, never in a commit.
8. **Never force-push `main`,** and never commit to it directly.
9. **After the 7 AM feature freeze,** only `<name>-fix-<bug>` branches get merged.

## Features by priority

P0 has to work for any demo. Finish each tier before starting the next.

| # | Feature | Owner | Prize it counts toward |
| --- | --- | --- | --- |
| P0.1 | Contracts (done: `app/src/bubl/types`, `docs/CONTRACTS.md`) and scaffold: Vite + React + TS (Tisya), DeepSpace setup (Urvi) | Tisya, Urvi | DeepSpace |
| P0.2 | Map with color-coded bubbles: far = soft dot, close = solid with icon, legend row | Stephanie | Know Your City |
| P0.3 | Real GPS plus demo mode (draggable "you" dot) | Tisya | Functionality score |
| P0.4 | Pop flow: server-side 15 m check, pop animation, note screen with text, photo or video | Tisya, Stephanie, Urvi | Know Your City, DeepSpace, Wow Factor |
| P0.5 | Seed data collected and imported: walk, import script, metadata stripping (Tisya); `saveBubble` (Urvi) | Tisya, Urvi | Functionality score |
| P0.6 | Deploy to app.space early (Urvi); claim .tech domain and DNS (Tisya), connect it to the deploy (Urvi) | Urvi, Tisya | DeepSpace, .Tech |
| P0.7 | Basic sign-in with DeepSpace auth (the fastest method it offers). Every server function needs a user; `canPop` records a Pop per user | Urvi (auth), Shreya (screen) | DeepSpace |
| P0.8 | App shell: bottom nav (Walk, Drop, Chats, You) and routing between screens | Shreya | UX score |
| P1.2 | Drop flow: compose screen, category picker, media upload, Grok moderation and suggested category | Tisya, Urvi | SpaceXAI (long shot), DeepSpace |
| P1.3 | Read-aloud on pop: ElevenLabs audio generated once and saved | Tisya | ElevenLabs, Wow Factor |
| P1.4 | Loves, waves, chat unlock enforced on the server; wave screen | Urvi (server), Shreya (screen) | DeepSpace, Concept score |
| P1.5 | Chats tab and chat thread | Urvi (messaging), Shreya (screens) | DeepSpace |
| P2.1 | Translation on pop with Gemini | Tisya | Gemini, Value to Community |
| P2.2 | You tab: popped card grid and dropped list | Shreya | UX score |
| P2.3 | Splash and onboarding | Stephanie | UX score |
| P2.4 | PWA install, "you drifted into a bubble" banner, vibration | Stephanie | Wow Factor |
| P3.1 | Photon agent (time-box 2 hrs, after P1.4): a text-in "local friend" that keeps the no-search rule by giving only hints (category, distance, direction from `BubblePreview`, never sealed content) until you walk close enough to pop in the app. Works over SMS fallback too. Bonus: after a mutual wave, texts both people to suggest meeting at the bubble | Tisya | Photon |
| P3.3 | Report and block in chat | Urvi | Value to Community |

Strip GPS metadata from every uploaded photo and video on the server. Media carries coordinates that could reveal where a user lives.

## Timeline

Submit by 10 AM Sunday; the hard deadline is 10:30 AM.

| When | Goal |
| --- | --- |
| Sat 12 to 1 PM | Contracts done. Tisya pushes the Vite scaffold; Urvi adds DeepSpace and deploys a hello-world page over HTTPS; Shreya gets set up and reads `docs/CONTRACTS.md` |
| Sat 1 to 4 PM | P0 build. Tisya: seed import script, `canPop`, demo mode, domain. Urvi: first working DeepSpace function + table, sign-in. Tisya attends the 2:30 Photon workshop only if ahead |
| Sat 4 to 6 PM | Tisya collects seed data; Stephanie builds map and pop; Urvi builds auth and storage; Shreya builds the app shell and sign-in screen |
| Sat 6 PM (dinner) | Checkpoint: import seed data and pop one bubble end to end |
| Sat 7 PM to 2 AM | P1 |
| Sun 2 to 7 AM | P2 and polish; sleep in shifts so someone is always awake |
| Sun 7 AM | Feature freeze: bug fixes, demo video, Devpost writeup only |
| Sun 10 AM | Submit |

Workshops: DeepSpace SDK at 11:30 AM in Lerner 477 (Urvi), Photon iMessage agents at 2:30 PM in Lerner 477 (Tisya), Judges Meet & Greet at 3:30 PM on the 5th floor.

## Data collection trip

Tisya collects 20 to 30 bubbles within a 10 to 15 minute walk of Lerner, Sat 4 to 6 PM, before sunset.

- **Where:** Broadway, Amsterdam Ave, 116th St, Riverside Park, Morningside Park, plus one bubble at Lerner for the live demo.
- **Categories:** spread across Food, Cafe, Park, Street and Misc.
- **Formats:** about 10 videos, 10 photos, and some text-only notes.
- **Video spec:** 15 seconds or less, vertical, 720p, so uploads stay small.
- **Languages:** 3 or 4 notes written by teammates or friends in their own languages, for Gemini translation.
- **B-roll:** walking and opening the app, for the demo video.
- **Coordinates:** turn on camera location so every photo and video stores its coordinates.
- **Rules:** no faces without asking, no filming anyone's home.

Log each spot in a shared sheet so the import script can load it in one go:

```csv
title,note_text,category,latitude,longitude,place_name,media_file,language,author
```

## Prizes we are entering

One main track, plus as many sponsor and MLH prizes as we want ([Devpost](https://divhacks-2026.devpost.com/)).

| Prize | What it needs from us | Odds |
| --- | --- | --- |
| Know Your City track | The app itself | Strong fit |
| Grand prize (1st to 3rd) | Automatic; a smooth demo | Possible |
| DeepSpace (winner and runner-up) | Backend, auth, storage, chat, deploy on DeepSpace | Good |
| MLH ElevenLabs | Read-aloud on pop | Good |
| MLH Gemini | Translation on pop | Good if multilingual seed notes exist |
| MLH .Tech domain | App live on a .tech domain | Good |
| Most Popular (Nord Security) | QR code on the table, live app on judges' phones | Depends on the demo |
| SpaceXAI | Grok moderation; they want it built with Cursor and aimed at big societal problems | Long shot |
| Photon ($400 + interview) | Integrate Spectrum; an agent, not just notifications. Free plan: DMs only (no group chats), only texts registered users, needs a Node/Bun runtime | Stretch only |

## Judging and pitch

Judges score Concept 30%, Functionality 30%, Wow Factor 20%, UX and Design 10%, and Value to Community 10%. Each judge gets 5 minutes: about 3 minutes of pitch and 2 of questions.

- **Concept:** lead with what is new. No search, you have to walk, bubbles are for meeting new people (public discovery), and chats open only when author and lover both wave.
- **Functionality:** show the demo bubble at Lerner live, with demo mode ready as backup.
- **Wow Factor:** hit all three moments: the pop animation, the note read aloud, and the wave.
- **Security story:** notes are gated on the server, GPS metadata is stripped from uploads, and profiles never show exact locations.
- **Devpost writeup:** one short section per sponsor saying what it does in bubl and why.
