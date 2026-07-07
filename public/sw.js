const VERSION = 'v5'
const PAGES_CACHE = `sp-map-pages-${VERSION}`
const STATIC_CACHE = `sp-map-static-${VERSION}`
const TILES_CACHE = `sp-map-tiles-${VERSION}`
const CURRENT_CACHES = [PAGES_CACHE, STATIC_CACHE, TILES_CACHE]

const TILE_HOSTS = [
  'tile.openstreetmap.org',
  'server.arcgisonline.com',
  'basemaps.cartocdn.com',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
]

const MAX_TILES = 2000

// Leaflet round-robins the {s} subdomain (a/b/c) for the same tile server, so
// the same geographic tile can arrive under three different URLs. Without
// normalizing, each subdomain variant becomes its own cache entry and a tile
// already cached under "a" looks like a miss when later requested as "b" —
// quietly halving the effective offline coverage of everything a user has
// actually panned across. Collapse to a subdomain-less key for cache lookups
// while still fetching from the real (subdomained) URL over the network.
function tileCacheKey(rawUrl) {
  return rawUrl.replace(/^https:\/\/[a-d]\.(tile\.openstreetmap\.org|basemaps\.cartocdn\.com)\//, 'https://$1/')
}

// Proactively warm the tile cache for the whole La Guaira coastal strip (where
// most churches/centers in this dataset are), down to zoom 15 (~500 tiles,
// ~10 MB). Deliberately NOT part of install: a single hung tile fetch there
// would block SW activation entirely. Instead it runs in the background every
// time the app opens online, triggered by a 'precache-tiles' message from
// RegisterSW, resuming wherever it left off.
const REGION = { minLat: 10.55, maxLat: 10.65, minLng: -67.10, maxLng: -66.70 }
const FULL_ZOOMS = [11, 12, 13, 14, 15]
const TILE_SUBDOMAINS = ['a', 'b', 'c']

// The region sweep above stops at 15, but selecting a church flies the map to
// zoom 16 (see FlyToSelected in ChurchMap.tsx) — one zoom level deeper than
// anything cached, so the basemap went blank on every zoom-in once offline.
// Blanket-covering the whole region at 16 would ~4x the download (see the
// tile-count math this was sized against), so instead cache a small
// neighborhood around each REAL church coordinate — covers the zoom-in case
// and, as a bonus, gives at least some coverage to parishes outside REGION
// entirely (e.g. Caracas, Morón), which otherwise had zero cached tiles at
// any zoom. Triggered separately once app/mapa/page.tsx has church data.
const POINT_ZOOMS = [14, 15, 16]
const POINT_RADIUS = 1 // 3x3 tiles per point per zoom

// The app's own routes and shell assets, precached at install so every page
// (and the installed-PWA chrome) works offline even if never visited before.
const APP_ROUTES = ['/', '/mapa', '/solicitudes', '/choferes', '/catalogo', '/metricas', '/dashboard', '/debug']
const SHELL_ASSETS = ['/logosp.jpg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/manifest.webmanifest']

function lonToTileX(lon, z) {
  return Math.floor(((lon + 180) / 360) * 2 ** z)
}
function latToTileY(lat, z) {
  const rad = (lat * Math.PI) / 180
  return Math.floor((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * 2 ** z)
}

async function notifyClients(msg) {
  const clients = await self.clients.matchAll()
  clients.forEach(c => c.postMessage(msg))
}

// Shared batched-download core for both the region sweep and the per-point
// warm-up. Small batches: parallel enough to finish in reasonable time,
// gentle enough for a weak connection (and for the OSM tile servers). Each
// fetch gets its own timeout so one hung request can never stall the rest,
// and progress is reported after every batch so the UI can show a live "%".
async function downloadTiles(cache, pending, progressLabel) {
  let i = 0
  const BATCH = 5
  for (let start = 0; start < pending.length; start += BATCH) {
    await Promise.all(pending.slice(start, start + BATCH).map(async ({ z, x, y }) => {
      const key = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
      try {
        if (await cache.match(key)) return
        const sub = TILE_SUBDOMAINS[i++ % TILE_SUBDOMAINS.length]
        const response = await withTimeout(fetch(`https://${sub}.tile.openstreetmap.org/${z}/${x}/${y}.png`), 10000)
        if (response && response.ok) await cache.put(key, response)
      } catch {
        // Best-effort: a flaky tile shouldn't block the rest.
      }
    }))
    if (progressLabel) {
      await notifyClients({ type: 'tile-progress', label: progressLabel, done: Math.min(start + BATCH, pending.length), total: pending.length })
    }
  }
}

async function precacheRegionTiles(zooms) {
  const cache = await caches.open(TILES_CACHE)
  const pending = []
  for (const z of zooms) {
    const xMin = lonToTileX(REGION.minLng, z)
    const xMax = lonToTileX(REGION.maxLng, z)
    const yMin = latToTileY(REGION.maxLat, z)
    const yMax = latToTileY(REGION.minLat, z)
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) pending.push({ z, x, y })
    }
  }
  await downloadTiles(cache, pending, 'region')
}

async function precachePointTiles(points) {
  const cache = await caches.open(TILES_CACHE)
  const pending = []
  const seen = new Set()
  for (const { lat, lng } of points) {
    if (typeof lat !== 'number' || typeof lng !== 'number') continue
    for (const z of POINT_ZOOMS) {
      const cx = lonToTileX(lng, z)
      const cy = latToTileY(lat, z)
      for (let dx = -POINT_RADIUS; dx <= POINT_RADIUS; dx++) {
        for (let dy = -POINT_RADIUS; dy <= POINT_RADIUS; dy++) {
          const x = cx + dx, y = cy + dy
          const id = `${z}/${x}/${y}`
          if (seen.has(id)) continue
          seen.add(id)
          pending.push({ z, x, y })
        }
      }
    }
  }
  await downloadTiles(cache, pending, 'points')
}

// Individual adds (not atomic addAll), each with its own timeout: one failed
// or hung request must not abort — or indefinitely stall — install/warm-up.
function addToCache(cache, url, init) {
  return withTimeout(fetch(url, init), 10000)
    .then(res => { if (res && res.ok) return cache.put(url, res) })
    .catch(() => {})
}

async function precacheAppShell() {
  const pages = await caches.open(PAGES_CACHE)
  const statics = await caches.open(STATIC_CACHE)
  await Promise.all([
    ...APP_ROUTES.map(route => addToCache(pages, route)),
    // Also the RSC payload of each route (same normalized key as the fetch
    // handler below), so in-app navigations work offline even to pages the
    // user never opened online.
    ...APP_ROUTES.map(route => addToCache(pages, `${route}?_rsc=1`, { headers: { RSC: '1' } })),
    ...SHELL_ASSETS.map(asset => addToCache(statics, asset)),
  ])
}

// Precaching each route's HTML isn't enough offline: the JS/CSS chunks it
// needs (including dynamic imports like Leaflet, which appear in no page's
// HTML) live under content-hashed /_next/static/ URLs. The build writes the
// full list to /precache-manifest.json (see scripts/build-precache-manifest.mjs);
// download whatever is missing and drop chunks from older builds.
async function precacheBuildAssets() {
  let manifest
  try {
    const res = await withTimeout(fetch('/precache-manifest.json'), 10000)
    if (!res || !res.ok) return
    manifest = await res.json()
  } catch { return } // dev server or offline: nothing to do
  const cache = await caches.open(STATIC_CACHE)
  const wanted = new Set(manifest.map(u => new URL(u, self.location.origin).href))
  const cached = new Set((await cache.keys()).map(req => req.url))
  const missing = manifest.filter(u => !cached.has(new URL(u, self.location.origin).href))
  const BATCH = 5
  for (let start = 0; start < missing.length; start += BATCH) {
    await Promise.all(missing.slice(start, start + BATCH).map(u => addToCache(cache, u)))
  }
  for (const url of cached) {
    if (url.includes('/_next/static/') && !wanted.has(url)) await cache.delete(url)
  }
}

self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil(precacheAppShell())
})

// Triggered by RegisterSW on every online app open; resumes wherever it left off.
self.addEventListener('message', event => {
  if (event.data === 'precache-tiles') {
    event.waitUntil(Promise.all([precacheBuildAssets(), precacheRegionTiles(FULL_ZOOMS)]))
  }
  // Sent separately by app/mapa/page.tsx once real church coordinates are
  // loaded (the SW has no data access of its own) — see POINT_ZOOMS above.
  if (event.data && event.data.type === 'precache-points' && Array.isArray(event.data.points)) {
    event.waitUntil(precachePointTiles(event.data.points))
  }
})

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names.filter(n => !CURRENT_CACHES.includes(n)).map(n => caches.delete(n))
      )
      await self.clients.claim()
    })()
  )
})

async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length > maxItems) {
    await cache.delete(keys[0])
    await trimCache(cacheName, maxItems)
  }
}

// "Offline" is rarely a clean instant rejection on mobile — a dropped wifi
// connection often leaves in-flight requests hanging for many seconds (DNS/
// connect timeouts) before the browser gives up. Race the network against a
// short timer so a shaky connection falls back to cache quickly instead of
// leaving the page stuck on a blank/loading screen.
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(v => { clearTimeout(timer); resolve(v) }, e => { clearTimeout(timer); reject(e) })
  })
}

async function networkFirst(request, cacheName, { cacheKey } = {}) {
  const cache = await caches.open(cacheName)
  const key = cacheKey || request
  try {
    const response = await withTimeout(fetch(request), 4000)
    if (response && response.ok) cache.put(key, response.clone())
    return response
  } catch (err) {
    const cached = await cache.match(key)
    if (cached) return cached
    if (request.mode === 'navigate') {
      const fallback = await cache.match('/')
      if (fallback) return fallback
    }
    throw err
  }
}

async function cacheFirst(request, cacheName, { trim, cacheKey } = {}) {
  const cache = await caches.open(cacheName)
  const key = cacheKey || request
  const cached = await cache.match(key)
  if (cached) {
    fetch(request)
      .then(response => { if (response && response.ok) cache.put(key, response) })
      .catch(() => {})
    return cached
  }
  const response = await withTimeout(fetch(request), 4000)
  if (response && response.ok) {
    await cache.put(key, response.clone())
    if (trim) trimCache(cacheName, trim)
  }
  return response
}

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Let Supabase API calls go straight through — the app's offline layer
  // handles caching/queueing for those with read-your-writes consistency.
  if (url.hostname.endsWith('.supabase.co')) return

  if (TILE_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request, TILES_CACHE, { trim: MAX_TILES, cacheKey: tileCacheKey(request.url) }))
    return
  }

  if (url.origin === self.location.origin) {
    if (request.mode === 'navigate') {
      event.respondWith(networkFirst(request, PAGES_CACHE))
      return
    }
    // Next.js client-side navigations don't fetch HTML — they fetch RSC payloads
    // (?_rsc=<router-state-hash>). Cache them under a normalized key (the _rsc
    // value varies per navigation; a fixed one avoids fragmenting the cache and
    // colliding with the plain-HTML entry for the same pathname) so in-app
    // navigation keeps working offline for every page.
    if (url.searchParams.has('_rsc') || request.headers.get('RSC') === '1') {
      event.respondWith(networkFirst(request, PAGES_CACHE, { cacheKey: `${url.origin}${url.pathname}?_rsc=1` }))
      return
    }
    if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icon-') || url.pathname === '/logosp.jpg') {
      event.respondWith(cacheFirst(request, STATIC_CACHE))
      return
    }
  }
})
