// Runs after `next build` (see package.json "build"). Walks .next/static and
// writes the URL of every build asset to public/precache-manifest.json, so the
// service worker can precache all JS/CSS chunks — including ones loaded via
// dynamic import (Leaflet, forms), which never appear in any page's HTML and
// would otherwise be unreachable offline until each page was visited online.
import { readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const STATIC_DIR = join(process.cwd(), '.next', 'static')
const OUT_FILE = join(process.cwd(), 'public', 'precache-manifest.json')

function walk(dir) {
  const files = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) files.push(...walk(full))
    else files.push(full)
  }
  return files
}

const urls = walk(STATIC_DIR).map(f => '/_next/static/' + relative(STATIC_DIR, f).split('\\').join('/'))
writeFileSync(OUT_FILE, JSON.stringify(urls))
console.log(`precache-manifest.json: ${urls.length} assets`)
