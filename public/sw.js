const VERSION = 'v3'
const PAGES_CACHE = `sp-map-pages-${VERSION}`
const STATIC_CACHE = `sp-map-static-${VERSION}`
const TILES_CACHE = `sp-map-tiles-${VERSION}`
const CURRENT_CACHES = [PAGES_CACHE, STATIC_CACHE, TILES_CACHE]

// The base "Mapa" layer is bundled with the deployment (public/tiles/, see
// scripts/download-tiles.mjs) so it's always available offline. These hosts
// are only the *optional* extra layers (satellite, place-name overlay) and
// the icon/font CDNs — none of them are load-bearing for the offline case.
const TILE_HOSTS = [
  'server.arcgisonline.com',
  'basemaps.cartocdn.com',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
]

const MAX_TILES = 2000

// Leaflet round-robins the {s} subdomain (a/b/c) for basemaps.cartocdn.com, so
// the same geographic tile can arrive under three different URLs. Normalize
// so a tile cached under one subdomain isn't a "miss" when requested under
// another later.
function tileCacheKey(rawUrl) {
  return rawUrl.replace(/^https:\/\/[a-d]\.(basemaps\.cartocdn\.com)\//, 'https://$1/')
}

// Proactively cache every bundled tile (zooms 10-15 over the La Guaira region)
// on install. These are same-origin static files served from our own
// deployment, so — unlike the previous approach of trying to cache third-
// party OSM tiles at runtime — this doesn't depend on external rate limits,
// subdomain routing, or the user having happened to view a given spot before
// losing signal. It's the whole point of bundling them: guaranteed offline
// coverage after the very first successful visit.
const REGION = { minLat: 10.55, maxLat: 10.65, minLng: -67.10, maxLng: -66.70 }
const BUNDLED_ZOOMS = [10, 11, 12, 13, 14, 15]

function lonToTileX(lon, z) {
  return Math.floor(((lon + 180) / 360) * 2 ** z)
}
function latToTileY(lat, z) {
  const rad = (lat * Math.PI) / 180
  return Math.floor((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * 2 ** z)
}

async function precacheBundledTiles() {
  const cache = await caches.open(TILES_CACHE)
  for (const z of BUNDLED_ZOOMS) {
    const xMin = lonToTileX(REGION.minLng, z)
    const xMax = lonToTileX(REGION.maxLng, z)
    const yMin = latToTileY(REGION.maxLat, z)
    const yMax = latToTileY(REGION.minLat, z)
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        const path = `/tiles/${z}/${x}/${y}.png`
        try {
          if (await cache.match(path)) continue
          const response = await fetch(path)
          if (response && response.ok) await cache.put(path, response)
        } catch {
          // Best-effort: a flaky fetch during install shouldn't block the rest.
        }
      }
    }
  }
}

self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil(precacheBundledTiles())
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

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const response = await withTimeout(fetch(request), 4000)
    if (response && response.ok) cache.put(request, response.clone())
    return response
  } catch (err) {
    const cached = await cache.match(request)
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
    if (
      url.pathname.startsWith('/_next/static/') ||
      url.pathname.startsWith('/icon-') ||
      url.pathname.startsWith('/tiles/') ||
      url.pathname === '/logosp.jpg'
    ) {
      event.respondWith(cacheFirst(request, url.pathname.startsWith('/tiles/') ? TILES_CACHE : STATIC_CACHE))
      return
    }
  }
})
