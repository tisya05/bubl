# bubl: DivHacks 2026 implementation plan

Sep 26, 2026 · @tisya

## The idea and key decisions

bubl is a PWA where locals pin notes (text, photos, short videos) to real spots around NYC, and you can only open them by physically walking within 15 m. There is no search bar. Bubbles are color-coded by category, and two people who loved the same spot can each wave; a chat opens only when both wave.

- **Track:** Know Your City (the anti-tourist track).
- **Seed area:** Morningside Heights, within a 10 to 15 minute walk of Lerner Hall, not the Lower East Side from the mockups.
- **Live demo bubble:** plant one bubble outside Lerner with a 60 m pop radius, since indoor GPS can be off by 20 to 50 m. Demo mode is the backup.
- **Palette:** Navy Sherbet. Navy #243B64, sherbet #FF8A5B, pale blue #CFE0F0, paper #F4F1EA.
- **Categories:** Food #FF8A5B, Cafe #C98B4A, Park #6BAF7A, Street #5B8FD9, Misc #B07CD8.
- **Mockups:** [bubl canvas](https://claude.ai/artifact/MmVhwKnRz4RaVwmRoPjXkS). **Devpost:** [DivHacks 2026](https://divhacks-2026.devpost.com/).

## Roles

Three people, and everyone pitches in on frontend.

| Person | Owns | Frontend share |
| --- | --- | --- |
| Urvi | DeepSpace backend: auth, tables, storage, the wave rule, deploy, .tech domain, seed import | Wave screen, Chats tab, chat thread (DeepSpace messaging pieces) |
| Stephanie | Map with category bubbles, pop animation, note screen | Splash, onboarding, You tab, PWA install |
| Tisya | AI functions (Grok, Gemini, ElevenLabs), canPop proximity check, demo mode, seed data trip, pitch and Devpost | Drop screen |

## Features by priority

P0 has to work for any demo. Finish each tier before starting the next.

| # | Feature | Owner | Prize it counts toward |
| --- | --- | --- | --- |
| P0.1 | Data shape and repo: fields for bubble, pop, wave, message; function inputs and outputs | All | DeepSpace |
| P0.2 | Map with color-coded bubbles: far = soft dot, close = solid with icon, legend row | Stephanie | Know Your City |
| P0.3 | Real GPS plus demo mode (draggable "you" dot) | Tisya | Functionality score |
| P0.4 | Pop flow: server-side 15 m check, pop animation, note screen with text, photo or video | Tisya, Stephanie, Urvi | Know Your City, DeepSpace, Wow Factor |
| P0.5 | Seed data collected and imported | Tisya, Urvi | Functionality score |
| P0.6 | Deploy to app.space early, connect .tech domain | Urvi | DeepSpace, .Tech |
| P0.7 | Basic sign-in with DeepSpace auth (the fastest method it offers). Every server function needs a user; `canPop` records a Pop per user | Urvi | DeepSpace |
| P1.2 | Drop flow: compose screen, category picker, media upload, Grok moderation and suggested category | Tisya, Urvi | SpaceXAI (long shot), DeepSpace |
| P1.3 | Read-aloud on pop: ElevenLabs audio generated once and saved | Tisya | ElevenLabs, Wow Factor |
| P1.4 | Loves, waves, chat unlock enforced on the server | Urvi | DeepSpace, Concept score |
| P1.5 | Chats tab and chat thread | Urvi | DeepSpace |
| P2.1 | Translation on pop with Gemini | Tisya | Gemini, Value to Community |
| P2.2 | You tab: popped card grid and dropped list | Stephanie | UX score |
| P2.3 | Splash and onboarding | Stephanie | UX score |
| P2.4 | PWA install, "you drifted into a bubble" banner, vibration | Stephanie | Wow Factor |
| P3.1 | Photon agent: joins after a mutual wave to suggest a meetup, or accepts drops by text | Tisya | Photon |
| P3.2 | Bubble expiry as a scheduled DeepSpace job | Urvi | DeepSpace |
| P3.3 | Report and block in chat | Urvi | Value to Community |

Strip GPS metadata from every uploaded photo and video on the server. Media carries coordinates that could reveal where a user lives.

## Timeline

Submit by 10 AM Sunday; the hard deadline is 10:30 AM.

| When | Goal |
| --- | --- |
| Sat 12 to 1 PM | Agree on the data shape; Urvi deploys a hello-world page |
| Sat 1 to 4 PM | P0 build. Tisya attends the 2:30 Photon workshop only if ahead |
| Sat 4 to 6 PM | Tisya collects seed data; Stephanie builds map and pop; Urvi builds auth and storage |
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

Log each spot in a shared sheet so Urvi can import it in one go:

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
| Photon | Integrate Spectrum; agent joins human conversations | Stretch only |

## Judging and pitch

Judges score Concept 30%, Functionality 30%, Wow Factor 20%, UX and Design 10%, and Value to Community 10%. Each judge gets 5 minutes: about 3 minutes of pitch and 2 of questions.

- **Concept:** lead with what is new. No search, you have to walk, and chats open only when both people wave.
- **Functionality:** show the demo bubble at Lerner live, with demo mode ready as backup.
- **Wow Factor:** hit all three moments: the pop animation, the note read aloud, and the wave.
- **Security story:** notes are gated on the server, GPS metadata is stripped from uploads, and profiles never show exact locations.
- **Devpost writeup:** one short section per sponsor saying what it does in bubl and why.
