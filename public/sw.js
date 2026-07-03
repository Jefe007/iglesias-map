const VERSION = 'v1'
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

const MAX_TILES = 1500

self.addEventListener('install', event => {
  self.skipWaiting()
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

async function cacheFirst(request, cacheName, { trim } = {}) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) {
    fetch(request)
      .then(response => { if (response && response.ok) cache.put(request, response) })
      .catch(() => {})
    return cached
  }
  const response = await fetch(request)
  if (response && response.ok) {
    await cache.put(request, response.clone())
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
    event.respondWith(cacheFirst(request, TILES_CACHE, { trim: MAX_TILES }))
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
