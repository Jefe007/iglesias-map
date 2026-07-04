const VERSION = 'v2'
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
// every church/center in this dataset actually is) at a few zoom levels, so
// the base map still renders somewhere recognizable offline even if the user
// never happened to pan across a given spot before losing signal. Kept to
// moderate zooms (~70 tiles, a couple MB) so it's cheap on a slow connection —
// deep zoom on a specific church still depends on having viewed it before.
const REGION = { minLat: 10.55, maxLat: 10.65, minLng: -67.10, maxLng: -66.70 }
const PRECACHE_ZOOMS = [11, 12, 13]
const TILE_SUBDOMAINS = ['a', 'b', 'c']

function lonToTileX(lon, z) {
  return Math.floor(((lon + 180) / 360) * 2 ** z)
}
function latToTileY(lat, z) {
  const rad = (lat * Math.PI) / 180
  return Math.floor((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * 2 ** z)
}

async function precacheRegionTiles() {
  const cache = await caches.open(TILES_CACHE)
  let i = 0
  for (const z of PRECACHE_ZOOMS) {
    const xMin = lonToTileX(REGION.minLng, z)
    const xMax = lonToTileX(REGION.maxLng, z)
    const yMin = latToTileY(REGION.maxLat, z)
    const yMax = latToTileY(REGION.minLat, z)
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        const key = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
        try {
          if (await cache.match(key)) { i++; continue }
          const sub = TILE_SUBDOMAINS[i++ % TILE_SUBDOMAINS.length]
          const response = await fetch(`https://${sub}.tile.openstreetmap.org/${z}/${x}/${y}.png`)
          if (response && response.ok) await cache.put(key, response)
        } catch {
          // Best-effort: a flaky tile during install shouldn't block the rest.
        }
      }
    }
  }
}

self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil(precacheRegionTiles())
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

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
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
  const response = await fetch(request)
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
    if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icon-') || url.pathname === '/logosp.jpg') {
      event.respondWith(cacheFirst(request, STATIC_CACHE))
      return
    }
  }
})
