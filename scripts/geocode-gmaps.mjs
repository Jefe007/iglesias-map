// Geocode churches using Google Maps URL redirect scraping
// Google Maps embeds coordinates in the redirect URL: @lat,lng,zoom
// Strategy:
//   1. Search Google Maps for church name + parish + Venezuela
//   2. Extract coords from redirect URL pattern /@lat,lng/
//   3. Validate coords are within La Guaira region (lat 10.4-10.8, lng -67.3 to -66.6)
//   4. Mark as "validado" if found, "pendiente" if not

const SUPABASE_URL = 'https://qtfdhgqtprzfefhrdqfu.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0ZmRoZ3F0cHJ6ZmVmaHJkcWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NjU4OTksImV4cCI6MjA5NzQ0MTg5OX0.3iNwXCaIZBRL869lwuv_ixfNdLx5_juwreCUbhxZvUE'
const SCRAPE_API = 'http://localhost:3000' // will use fetch directly

// La Guaira region bounding box
const BOUNDS = { latMin: 10.4, latMax: 10.85, lngMin: -67.4, lngMax: -66.5 }

const PARISH_COORDS = {
  'Naiguata':     { lat: 10.6095, lng: -66.7424 },
  'Carayaca':     { lat: 10.5833, lng: -67.0667 },
  'Caraballeda':  { lat: 10.6128, lng: -66.8498 },
  'Maiquetia':    { lat: 10.5997, lng: -66.9650 },
  'La Guaira':    { lat: 10.6017, lng: -66.9297 },
  'Catia La Mar': { lat: 10.5993, lng: -67.0145 },
  'Urimare':      { lat: 10.5900, lng: -66.8200 },
  'Soublet':      { lat: 10.6050, lng: -66.8500 },
}

function extractCoordsFromUrl(url) {
  // Pattern: /@lat,lng,zoom or /place/...!3dlat!4dlng
  const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) }

  const placeMatch = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
  if (placeMatch) return { lat: parseFloat(placeMatch[1]), lng: parseFloat(placeMatch[2]) }

  return null
}

function isInBounds(lat, lng) {
  return lat >= BOUNDS.latMin && lat <= BOUNDS.latMax &&
         lng >= BOUNDS.lngMin && lng <= BOUNDS.lngMax
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function searchGoogleMaps(query) {
  const encodedQuery = encodeURIComponent(query)
  const url = `https://www.google.com/maps/search/${encodedQuery}`

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'es-VE,es;q=0.9',
    },
    redirect: 'follow'
  })

  const finalUrl = res.url
  return extractCoordsFromUrl(finalUrl)
}

async function getChurches() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/churches?select=id,name,parish,lat,lng,geocode_status&order=parish`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  })
  return res.json()
}

async function updateChurch(id, lat, lng, status) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/churches?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ lat, lng, geocode_status: status })
  })
  return res.ok
}

async function main() {
  console.log('🗺️  Geocodificando iglesias con Google Maps...\n')

  const churches = await getChurches()
  console.log(`Total: ${churches.length} iglesias\n`)

  let validated = 0
  let pending = 0

  const results = []

  for (let i = 0; i < churches.length; i++) {
    const church = churches[i]
    process.stdout.write(`[${i + 1}/${churches.length}] ${church.name} (${church.parish})... `)

    let coords = null
    let status = 'pendiente'

    // Try 1: name + parish + Venezuela
    coords = await searchGoogleMaps(`${church.name} ${church.parish} La Guaira Venezuela`)
    await sleep(1500)

    if (!coords || !isInBounds(coords.lat, coords.lng)) {
      // Try 2: name + Venezuela (broader)
      coords = await searchGoogleMaps(`${church.name} Venezuela`)
      await sleep(1500)
    }

    let lat, lng
    if (coords && isInBounds(coords.lat, coords.lng)) {
      lat = coords.lat
      lng = coords.lng
      status = 'validado'
      validated++
      console.log(`✅ ${lat.toFixed(5)}, ${lng.toFixed(5)}`)
    } else {
      const center = PARISH_COORDS[church.parish] || PARISH_COORDS['La Guaira']
      lat = center.lat
      lng = center.lng
      status = 'pendiente'
      pending++
      console.log(`⏳ pendiente`)
    }

    results.push({ name: church.name, parish: church.parish, lat, lng, status })
    await updateChurch(church.id, lat, lng, status)
  }

  console.log(`\n📊 Resultado:`)
  console.log(`   ✅ Validados: ${validated}`)
  console.log(`   ⏳ Pendientes: ${pending}`)

  console.log('\n📍 Iglesias validadas:')
  results.filter(r => r.status === 'validado').forEach(r => {
    console.log(`   • ${r.name} (${r.parish}) → ${r.lat}, ${r.lng}`)
  })
}

main().catch(console.error)
