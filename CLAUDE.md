# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

This project pins Next.js 16, which has breaking changes vs. training data. Before touching routing, metadata, config, or other Next.js-specific APIs, check `node_modules/next/dist/docs/` (see AGENTS.md above).

## What this is

A single-page offline-first PWA mapping churches, distribution centers, and a field hospital for Samaritan's Purse relief operations in La Guaira, Venezuela. UI text is entirely in Spanish — keep new user-facing strings in Spanish. Deployed on Vercel.

## Commands

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run start` — run a production build locally

There is no lint or test script configured in `package.json`, and no test framework is set up.

## Environment variables (`.env.local`)

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — client-side Supabase access (reads)
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, used by `lib/supabaseAdmin.ts` for all writes
- `EDIT_PASSCODE` — single shared passcode gating edit mode (see Auth below)

## Architecture

### Data flow: reads vs. writes are asymmetric

The client reads directly from Supabase with the anon key (`lib/supabase.ts`, e.g. `getChurches` in `lib/offlineStore.ts`). All writes instead go through `app/api/{churches,distributions,upload}/route.ts`, which check auth and then use `lib/supabaseAdmin.ts` (service-role key, server-only). The client never has write access to Supabase directly.

### Auth: shared passcode, not user accounts

There's no login/session system — one passcode (`EDIT_PASSCODE`) unlocks edit mode for anyone who has it. The client sends it as the `x-edit-passcode` header; `lib/serverAuth.ts#isAuthorized` checks it on every mutating API route. Client-side, `lib/api.ts` stores it in `sessionStorage` (`getStoredPasscode`/`setStoredPasscode`) after `/api/verify` confirms it, and re-attaches it to every request, including replayed offline mutations.

### Offline-first: three cooperating layers

This is the load-bearing complexity in the codebase. A recent attempt to bundle map tiles into the deployment itself (`public/tiles/`, `scripts/download-tiles.mjs`) was tried and reverted (see git log) — runtime service-worker tile caching below is the current, working approach.

1. **IndexedDB snapshot + mutation queue** (`lib/offlineDb.ts`, `lib/offlineStore.ts`, `lib/api.ts`): `getChurches`/`getAllDistributions` read from Supabase when reachable and mirror the result into IndexedDB (`churches`/`distributions` stores) as a fallback snapshot; when the network fails they read that snapshot back. Any pending local edits in the `mutations` store are layered on top via `applyMutations` so unsynced changes are visible immediately, even offline.
   Writes (`createChurch`, `updateChurch`, etc. in `lib/api.ts`) try the network first. `isNetworkFailure` (checks for `TypeError`, i.e. the request never reached the server) is what decides whether to enqueue a `MutationRecord` for later replay vs. surface a real server error (bad auth, validation) immediately — don't blur this distinction when touching this code. Photo uploads that fail offline are queued as blobs in the `photos` store and resolved (uploaded, URL patched in) during replay.
2. **Sync on reconnect** (`lib/offlineSync.ts`, `lib/useOfflineStatus.ts`): `flushQueue` replays queued mutations in `seq` order when the app comes back online, stopping (not discarding) on a renewed network failure but discarding-and-logging on a real server-side rejection.
3. **Service worker** (`public/sw.js`): network-first for page navigations (short timeout, falls back to cached shell so a flaky connection doesn't hang on blank/loading), cache-first for map tiles and static assets. Tile requests are normalized across Leaflet's `{a,b,c}` subdomain rotation to a single cache key (`tileCacheKey`) so panning doesn't fragment the cache. Precaches La Guaira-area tiles at install for a baseline offline map. Explicitly skips `*.supabase.co` requests — those are handled entirely by the IndexedDB layer above, not the service worker.

`app/debug/page.tsx` (`/debug`) surfaces SW registration state, cache contents, and IndexedDB counts for diagnosing offline issues on a field device without devtools. `?tiledebug=1` on the map overlays a live tile load/error counter (see `TileDebugOverlay` in `components/ChurchMap.tsx`).

### Map rendering (`components/ChurchMap.tsx`)

react-leaflet with custom SVG `divIcon` pins: cross glyph for churches, star for distribution centers, circular photo badge for the hospital. A church without validated coordinates (`geocode_status !== 'validado'`) doesn't get hidden — it's deterministically scattered around its parish's fallback center (`PARISH_COORDS`) so it still renders somewhere sane; `buildPositions` reuses that same layout so route `Polyline`s connect to exactly where each marker is drawn. Manual pin placement (`onSetLocation`/`onPickLocation`) is how `geocode_status` gets promoted to `validado`.

### Single-page shell (`app/page.tsx`)

Everything — header, filters, map, the responsive sidebar/bottom-sheet detail panel, passcode modal, add/edit forms, distribution logging, and PDF export — lives in one large client component. PDF export (`html2canvas-pro` + `jsPDF`) captures a dedicated DOM ref (`exportAreaRef`) so only the map and a print-style header are included, not the app chrome. The mobile bottom sheet's drag-to-open/close gesture is hand-rolled with pointer events (not a library) and is careful to fall through to a plain tap's `onClick` when no drag occurred.

### Other entry points

- `app/dashboard/page.tsx` — read-only stats view over the same offline-aware data (`lib/offlineStore.ts`)
- `scripts/geocode.mjs` / `scripts/geocode-gmaps.mjs` — one-off manual Node scripts (Nominatim / Google Maps redirect scraping) for bulk-geocoding churches; not part of the build, contain a hardcoded Supabase anon key

### Design tokens

`app/globals.css` defines the Samaritan's Purse brand colors as CSS custom properties (`--navy`, `--olive`, and shade variants) and two font utility classes: `font-sans-pro` (Fira Sans, headings/body) and `font-data` (Fira Code, tabular nums — used for counts/stats).
