// Geocode churches using Nominatim (OpenStreetMap)
// Strategy:
//   1. Search by church name + parish + Venezuela → if found: "validado"
//   2. Search by church name + "La Guaira" + Venezuela → if found: "validado"
//   3. Fallback to parish center coordinates → "pendiente"

const SUPABASE_URL = 'https://qtfdhgqtprzfefhrdqfu.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0ZmRoZ3F0cHJ6ZmVmaHJkcWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NjU4OTksImV4cCI6MjA5NzQ0MTg5OX0.3iNwXCaIZBRL869lwuv_ixfNdLx5_juwreCUbhxZvUE'

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

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function nominatimSearch(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=ve`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'IglesiasLaGuairaApp/1.0 (rusbeljosue@gmail.com)' }
  })
  const data = await res.json()
  return data[0] || null
}

async function getChurches() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/churches?select=id,name,parish,lat,lng,geocode_status&order=parish`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
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
  console.log('📍 Iniciando geocodificación de iglesias...\n')

  const churches = await getChurches()
  console.log(`Total: ${churches.length} iglesias\n`)

  let validated = 0
  let pending = 0

  for (let i = 0; i < churches.length; i++) {
    const church = churches[i]
    console.log(`[${i + 1}/${churches.length}] ${church.name} (${church.parish})`)

    let result = null
    let status = 'pendiente'

    // Try 1: church name + parish + Venezuela
    await sleep(1100) // Nominatim rate limit: 1 req/sec
    result = await nominatimSearch(`${church.name} ${church.parish} Venezuela`)

    if (!result) {
      // Try 2: church name + La Guaira Venezuela
      await sleep(1100)
      result = await nominatimSearch(`${church.name} La Guaira Venezuela`)
    }

    let lat, lng
    if (result) {
      lat = parseFloat(result.lat)
      lng = parseFloat(result.lon)
      status = 'validado'
      validated++
      console.log(`   ✅ Validado: ${lat}, ${lng} (${result.display_name.substring(0, 60)}...)`)
    } else {
      // Fallback: parish center
      const center = PARISH_COORDS[church.parish] || PARISH_COORDS['La Guaira']
      lat = center.lat
      lng = center.lng
      status = 'pendiente'
      pending++
      console.log(`   ⏳ Pendiente — usando centro de ${church.parish}: ${lat}, ${lng}`)
    }

    await updateChurch(church.id, lat, lng, status)
  }

  console.log(`\n✅ Geocodificación completa:`)
  console.log(`   Validados: ${validated}`)
  console.log(`   Pendientes: ${pending}`)
}

main().catch(console.error)
