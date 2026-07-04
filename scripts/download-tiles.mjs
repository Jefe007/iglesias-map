// One-time bulk download of OSM tiles for the La Guaira region so they can be
// bundled with the app deployment and always available offline, instead of
// depending on the browser having successfully cached them at runtime.
//
// Respects OSM's tile usage policy: identifies the app via User-Agent and
// rate-limits requests (one at a time, small delay between each) since this
// is a modest one-time bulk grab, not a scraper.
import fs from 'node:fs/promises'
import path from 'node:path'

const REGION = { minLat: 10.55, maxLat: 10.65, minLng: -67.10, maxLng: -66.70 }
const ZOOMS = [10, 11, 12, 13, 14, 15]
const OUT_DIR = path.join(process.cwd(), 'public', 'tiles')
const USER_AGENT = 'iglesias-map-la-guaira/1.0 (humanitarian offline map; contact rusbeljosue@gmail.com)'
const DELAY_MS = 150

function lonToX(lon, z) {
  return Math.floor(((lon + 180) / 360) * 2 ** z)
}
function latToY(lat, z) {
  const rad = (lat * Math.PI) / 180
  return Math.floor((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * 2 ** z)
}
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function main() {
  let downloaded = 0
  let skipped = 0
  let failed = 0
  const jobs = []
  for (const z of ZOOMS) {
    const xMin = lonToX(REGION.minLng, z)
    const xMax = lonToX(REGION.maxLng, z)
    const yMin = latToY(REGION.maxLat, z)
    const yMax = latToY(REGION.minLat, z)
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        jobs.push({ z, x, y })
      }
    }
  }
  console.log(`Fetching ${jobs.length} tiles...`)

  for (const { z, x, y } of jobs) {
    const dir = path.join(OUT_DIR, String(z), String(x))
    const file = path.join(dir, `${y}.png`)
    try {
      await fs.access(file)
      skipped++
      continue
    } catch {
      // not present yet, fetch it
    }
    const sub = 'abc'[Math.floor(Math.random() * 3)]
    const url = `https://${sub}.tile.openstreetmap.org/${z}/${x}/${y}.png`
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(file, buf)
      downloaded++
    } catch (err) {
      failed++
      console.error(`Failed ${z}/${x}/${y}: ${err.message}`)
    }
    await sleep(DELAY_MS)
  }
  console.log(`Done. downloaded=${downloaded} skipped=${skipped} failed=${failed}`)
}

main()
