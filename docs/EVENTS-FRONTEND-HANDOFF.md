# Events and reports frontend handoff

This iteration adds frontend-only event creation, discovery, reactions, collection entries, map pins, and reporting. It does not implement a scraper, server endpoint, moderation service, or shared cross-device state. Existing shared models, API contracts, and server actions are unchanged.

## UI integration points

- `app/src/bubl/lib/uiModels.ts` extends the UI category with `Events` and adds `event: { startsAt, endsAt, timeZone }` to bubble views. Dates are ISO timestamps; `timeZone` is an IANA zone. Venue coordinates are WGS84 and separate from the viewer's location.
- `app/src/bubl/lib/uiCategories.ts` provides the pink two-balloon category without changing the shared category enum.
- `app/src/bubl/lib/eventDemo.ts` provides the local data source: create, heart, going, pop, reopen, remove from collection, and delete. Replace this source and its subscription with the team's authenticated event API when ready. The module is consumed by DropScreen, EventsScreen, WalkScreens, and SocialScreens. The non-demo feed remains empty until connected; non-demo event publishing is explicitly unavailable.
- An event includes public listing fields (title, image, venue, schedule), author, coordinates, pop radius, and viewer-specific heart/going/popped state. Public listing metadata is visible before popping. The demo uses illustrated sample posters, not scraped or verified listings. Uploaded event images persist in browser IndexedDB.
- `ReportButton.tsx` offers a reason and optional details for any selected map bubble, opened note, or event listing. Reports are saved locally with target ID, reason, details, and timestamp. UI confirmation explicitly says they were not sent to moderators. Replace local saving with the reporting API and only show a submitted confirmation after server acknowledgement.

## Rules the backend must enforce

The browser checks `startsAt <= now < endsAt` and distance within the event's `popRadiusM` (60m in the demo). Heart and Going do not unlock a pop. Enforce eligibility again with server time, authenticated identity, and validated location on every pop request; the demo is not a security boundary. Validate time zones, finite coordinates, start/end order, ownership, media, and content. No scraping or moderation is performed here.

Previously popped events can be reopened from Your bubbles after their time window; removing a popped event clears the saved-list entry without deleting the event. Deleting a dropped event removes the local event from feed, map, and both collection lists. Decide cancellation/history semantics for production and preserve access deliberately.

## Demo storage

- `bubl.events.v1`: event listings and local Heart/Going/collection state.
- `bubl.demo.reports.v1`: demo reports.
- `bubl.report-drafts.v1`: non-demo report drafts; never marked submitted.
- `bubl-demo-media`: IndexedDB images, reused by the frontend demo.

These values are device-local, not synchronized between phones. Feed sample schedules are generated on first load and retained after a state change. The regular bubble demo storage remains unchanged.

## Verification

The mobile browser suite covers creation with photo and multi-day schedule, invalid end time, venue selection, feed Heart/Going persistence, upcoming/ended/out-of-range pop restrictions, successful pop, reporting, collection reopening, and deletion. Map previews retain attribution and show coordinates if tiles fail. Test with `npm run test:mobile` in `app`; frontend builds use `npm run build:ui`.

The home-screen icon uses the visible Figma vector (61:6), rendered with extra padding on splash indigo #252b61 by `app/scripts/render-icons.mjs`. Existing home-screen installs may need removal and re-adding to refresh the cached icon.
