'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents, LayersControl } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Church } from '@/lib/supabase'
import { IconHospital, IconMapPin, IconUser, IconMessageCircle, IconCheck, IconClock, IconCompass, IconX, IconSatelliteDish } from '@/lib/icons'
import { isSpecialLocation, LOCATION_LABELS, LOCATION_COLORS, type SpecialLocationType } from '@/lib/locationTypes'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// Custom teardrop pin with an inner glyph (SVG via divIcon).
// Distribution centers get a star; churches get a cross.
function makePin(fill: string, glyph: 'star' | 'cross', size = 1) {
  const w = 30 * size
  const h = 40 * size
  const star = `<path transform="translate(15 14) scale(0.9)" fill="#fff" d="M0 -6 L1.8 -1.9 L6.2 -1.9 L2.6 0.7 L4 5 L0 2.3 L-4 5 L-2.6 0.7 L-6.2 -1.9 L-1.8 -1.9 Z"/>`
  const cross = `<g fill="#fff"><rect x="13.2" y="8" width="3.6" height="13" rx="1"/><rect x="9.8" y="11.4" width="10.4" height="3.6" rx="1"/></g>`
  const svg = `
    <svg width="${w}" height="${h}" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="s" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-opacity="0.4"/>
        </filter>
      </defs>
      <path filter="url(#s)" fill="${fill}" stroke="#fff" stroke-width="1.5"
        d="M15 1 C7.3 1 1 7.1 1 14.6 C1 24 15 39 15 39 C15 39 29 24 29 14.6 C29 7.1 22.7 1 15 1 Z"/>
      ${glyph === 'star' ? star : cross}
    </svg>`
  return L.divIcon({
    html: svg,
    className: 'church-pin',
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
    popupAnchor: [0, -h + 6],
  })
}

// Circular badge for the Samaritan's Purse field hospital: a plain red cross
// on white, matching the medical/emergency convention rather than the SP logo.
function makeHospitalIcon(isSelected: boolean) {
  const d = isSelected ? 56 : 46
  const html = `
    <div style="width:${d}px;height:${d}px;border-radius:9999px;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid #dc2626;overflow:hidden;display:flex;align-items:center;justify-content:center">
      <svg viewBox="0 0 24 24" width="62%" height="62%"><rect x="10" y="3" width="4" height="18" rx="1" fill="#dc2626"/><rect x="3" y="10" width="18" height="4" rx="1" fill="#dc2626"/></svg>
    </div>`
  return L.divIcon({
    html,
    className: isSelected ? 'church-pin selected' : 'church-pin',
    iconSize: [d, d],
    iconAnchor: [d / 2, d / 2],
    popupAnchor: [0, -d / 2 - 2],
  })
}

// Circular logo badge for the Base: always shows the Samaritan's Purse logo
// (unlike Warehouse/Desalination Plant below, which show the location's own
// photo) so it never breaks even before a real photo is added.
function makeBaseIcon(isSelected: boolean) {
  const d = isSelected ? 56 : 46
  const ring = LOCATION_COLORS.base
  const fallback = `<svg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'><circle cx='50' cy='50' r='48' fill='%23fff'/><path d='M50 14a36 36 0 1 0 0 72 36 36 0 0 0 0-72zm0 10a26 26 0 0 1 23 14H53V24h-3zm-3 0v40a26 26 0 0 1-23-26 26 26 0 0 1 23-14z' fill='%23808733'/><g fill='%23172a45'><rect x='44' y='30' width='12' height='44' rx='2'/><rect x='34' y='42' width='32' height='12' rx='2'/></g></svg>`
  const html = `
    <div style="width:${d}px;height:${d}px;border-radius:9999px;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid ${ring};overflow:hidden;display:flex;align-items:center;justify-content:center">
      <img src="/logosp.jpg" alt="Samaritan's Purse" style="width:100%;height:100%;object-fit:cover"
        onerror="this.onerror=null;this.src=&quot;data:image/svg+xml;utf8,${fallback}&quot;" />
    </div>`
  return L.divIcon({
    html,
    className: isSelected ? 'church-pin selected' : 'church-pin',
    iconSize: [d, d],
    iconAnchor: [d / 2, d / 2],
    popupAnchor: [0, -d / 2 - 2],
  })
}

// Circular badge for Warehouse/Desalination Plant: shows the location's own photo
// with a colored, type-specific fallback glyph when there's no photo yet or it fails to load.
const LOCATION_GLYPHS: Record<SpecialLocationType, string> = {
  base: `<rect x='47' y='20' width='4' height='60' rx='1'/><path d='M51 22 L78 32 L51 42 Z'/>`,
  // A light-brown cardboard box with a darker lid band and tape line — reads
  // as an actual little box rather than an abstract white silhouette. The
  // explicit per-shape fill colors override the white default this whole
  // glyph set otherwise inherits (see makeLocationIcon's wrapping <g>).
  deposito: `<rect x='20' y='32' width='60' height='48' rx='4' fill='%23c9a66b'/><rect x='20' y='32' width='60' height='16' rx='4' fill='%238b6f47'/><rect x='46' y='40' width='8' height='40' fill='%238b6f47'/>`,
  desalinizador: `<path d='M50 16 C66 34 78 48 78 60 A32 32 0 0 1 22 60 C22 48 34 34 50 16 Z'/>`,
}

function makeLocationIcon(church: Church, kind: SpecialLocationType, isSelected: boolean) {
  const d = isSelected ? 56 : 46
  const ring = LOCATION_COLORS[kind]
  const glyph = LOCATION_GLYPHS[kind]
  const fallback = `<svg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'><circle cx='50' cy='50' r='48' fill='${ring.replace('#', '%23')}'/><g fill='%23fff'>${glyph}</g></svg>`
  const inner = church.image_url
    ? `<img src="${church.image_url}" alt="${church.name}" style="width:100%;height:100%;object-fit:cover" onerror="this.onerror=null;this.src=&quot;data:image/svg+xml;utf8,${fallback}&quot;" />`
    : `<img src="data:image/svg+xml;utf8,${fallback}" alt="${church.name}" style="width:100%;height:100%;object-fit:cover" />`
  const html = `
    <div style="width:${d}px;height:${d}px;border-radius:9999px;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid ${ring};overflow:hidden;display:flex;align-items:center;justify-content:center">
      ${inner}
    </div>`
  return L.divIcon({
    html,
    className: isSelected ? 'church-pin selected' : 'church-pin',
    iconSize: [d, d],
    iconAnchor: [d / 2, d / 2],
    popupAnchor: [0, -d / 2 - 2],
  })
}

function getIcon(church: Church, isSelected: boolean) {
  if (church.marker_type === 'hospital') return makeHospitalIcon(isSelected)
  if (church.marker_type === 'base') return makeBaseIcon(isSelected)
  if (isSpecialLocation(church.marker_type)) return makeLocationIcon(church, church.marker_type, isSelected)
  const fill = church.is_distribution_center ? '#dc2626'
    : church.geocode_status === 'validado' ? '#2563eb'
    : '#94a3b8'
  const glyph: 'star' | 'cross' = church.is_distribution_center ? 'star' : 'cross'
  const pin = makePin(fill, glyph, isSelected ? 1.25 : 1)
  if (isSelected) {
    pin.options.className = 'church-pin selected'
  }
  return pin
}

const PARISH_COORDS: Record<string, [number, number]> = {
  'Naiguata':     [10.6095, -66.7424],
  'Carayaca':     [10.5833, -67.0667],
  'Caraballeda':  [10.6128, -66.8498],
  'Maiquetia':    [10.5997, -66.9650],
  'La Guaira':    [10.6017, -66.9297],
  'Catia La Mar': [10.5993, -67.0145],
  'Urimare':      [10.5900, -66.8200],
  'Soublet':      [10.6050, -66.8500],
}

function getCoords(church: Church, index: number, total: number): [number, number] {
  if (church.lat && church.lng) return [Number(church.lat), Number(church.lng)]
  const base = PARISH_COORDS[church.parish] || [10.6017, -66.9297]
  const angle = (index / total) * 2 * Math.PI
  const spread = Math.min(0.008, 0.003 * Math.sqrt(total))
  return [base[0] + spread * Math.cos(angle), base[1] + spread * Math.sin(angle)]
}

function FlyToSelected({ church }: { church: Church | null }) {
  const map = useMap()
  useEffect(() => {
    if (!church) return
    const target: [number, number] = church.lat && church.lng
      ? [Number(church.lat), Number(church.lng)]
      : PARISH_COORDS[church.parish] || [10.6017, -66.9297]
    map.flyTo(target, 16, { duration: 0.8 })
  }, [church, map])
  return null
}

function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onClick(e.latlng.lat, e.latlng.lng) } })
  return null
}

function MapReadyNotifier({ onReady }: { onReady?: (map: L.Map) => void }) {
  const map = useMap()
  useEffect(() => { onReady?.(map) }, [map, onReady])
  return null
}

// Leaflet sizes its tile grid from the container's dimensions at the moment
// each layer mounts; it doesn't re-measure on its own afterward. A window
// resize/orientation change — or a connectivity flip that changes the header
// (the online-status pill reflows, shifting the map container's height) —
// left the grid stale, rendering as a blank/broken basemap until a manual
// resize. invalidateSize() forces Leaflet to re-measure and redraw.
function InvalidateOnLayoutChange() {
  const map = useMap()
  useEffect(() => {
    const invalidate = () => map.invalidateSize()
    window.addEventListener('resize', invalidate)
    window.addEventListener('orientationchange', invalidate)
    window.addEventListener('online', invalidate)
    window.addEventListener('offline', invalidate)
    return () => {
      window.removeEventListener('resize', invalidate)
      window.removeEventListener('orientationchange', invalidate)
      window.removeEventListener('online', invalidate)
      window.removeEventListener('offline', invalidate)
    }
  }, [map])
  return null
}

// Temporary on-screen counter for diagnosing offline tile loading in the
// field, where there's no way to attach devtools. Enabled with ?tiledebug=1.
function TileDebugOverlay() {
  const map = useMap()
  const [stats, setStats] = useState({ ok: 0, error: 0, log: [] as string[] })

  useEffect(() => {
    const layers: L.TileLayer[] = []
    map.eachLayer(layer => { if (layer instanceof L.TileLayer) layers.push(layer) })

    const onLoad = () => setStats(s => ({ ...s, ok: s.ok + 1 }))
    const onError = (e: L.TileErrorEvent) => {
      const src = (e.tile as HTMLImageElement | undefined)?.src || '?'
      setStats(s => ({ ...s, error: s.error + 1, log: [...s.log.slice(-3), src.replace(/^https:\/\/[a-z0-9.]+/, '')] }))
    }
    layers.forEach(l => { l.on('tileload', onLoad); l.on('tileerror', onError) })
    return () => { layers.forEach(l => { l.off('tileload', onLoad); l.off('tileerror', onError) }) }
  }, [map])

  return (
    <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[1000] bg-black/85 text-white text-[11px] font-mono px-3 py-2 rounded-lg max-w-[90vw]">
      <div>tiles ok: {stats.ok} · error: {stats.error} · online: {String(typeof navigator !== 'undefined' && navigator.onLine)}</div>
      {stats.log.map((l, i) => <div key={i} className="text-red-300 truncate">{l}</div>)}
    </div>
  )
}

// Detects active base layer and adds label overlay for hybrid mode
function HybridLabelsManager() {
  const map = useMap()
  const [showLabels, setShowLabels] = useState(false)
  const labelsLayerRef = useState(() =>
    new L.TileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png',
      { attribution: '&copy; <a href="https://carto.com">CARTO</a>', pane: 'overlayPane', zIndex: 450 }
    )
  )[0]

  useEffect(() => {
    const handler = (e: L.LayersControlEvent) => {
      setShowLabels(e.name === 'Satellite + Labels')
    }
    map.on('baselayerchange', handler)
    return () => { map.off('baselayerchange', handler) }
  }, [map])

  useEffect(() => {
    if (showLabels) {
      labelsLayerRef.addTo(map)
    } else {
      if (map.hasLayer(labelsLayerRef)) map.removeLayer(labelsLayerRef)
    }
  }, [showLabels, map, labelsLayerRef])

  return null
}

function groupByParish(churches: Church[]) {
  const groups: Record<string, Church[]> = {}
  for (const c of churches) {
    if (!groups[c.parish]) groups[c.parish] = []
    groups[c.parish].push(c)
  }
  return groups
}

// Build a stable id -> [lat,lng] map using the same per-parish spread as markers,
// so routes connect to exactly where each marker is drawn.
function buildPositions(churches: Church[]) {
  const map = new Map<string, [number, number]>()
  const groups = groupByParish(churches)
  for (const parishChurches of Object.values(groups)) {
    parishChurches.forEach((church, idx) => {
      map.set(church.id, getCoords(church, idx, parishChurches.length))
    })
  }
  return map
}

// Distinct colors for each distribution center's route network
const ROUTE_COLORS = ['#7c3aed', '#0891b2', '#db2777', '#ea580c']

type RouteState = {
  target: Church
  geometry: [number, number][] | null
  distanceKm: number | null
  durationMin: number | null
  loading: boolean
  error: string | null
}

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('This browser does not support geolocation')); return }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 })
  })
}

// Public OSRM (no API key): takes lon,lat (reversed from Leaflet) and returns
// distance/duration + the driving route geometry. No offline fallback —
// calculating a real street route can't be done without this external service.
async function fetchOsrmRoute(from: [number, number], to: [number, number]) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Could not calculate the route')
  const data = await res.json()
  const route = data.routes?.[0]
  if (!route) throw new Error('No driving route was found to that point')
  const geometry: [number, number][] = route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]])
  return { geometry, distanceKm: route.distance / 1000, durationMin: Math.round(route.duration / 60) }
}

// Only rendered for points with real (not parish-scattered) coordinates — a
// Google Maps link to a fallback position would send someone to the wrong place.
function GoogleMapsLink({ church }: { church: Church }) {
  if (!church.lat || !church.lng) return null
  return (
    <a
      href={`https://www.google.com/maps/search/?api=1&query=${church.lat},${church.lng}`}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-1 mt-1.5 text-[#1a73e8] text-xs font-medium hover:underline"
    >
      <IconMapPin className="w-3.5 h-3.5" /> Open in Google Maps
    </a>
  )
}

interface Props {
  churches: Church[]
  allChurches?: Church[]
  selected: Church | null
  focusChurch?: Church | null
  onSelect: (church: Church) => void
  onSetLocation?: (church: Church, lat: number, lng: number) => void
  settingLocationFor?: Church | null
  showRoutes?: boolean
  pickingLocation?: boolean
  onPickLocation?: (lat: number, lng: number) => void
  onMapReady?: (map: L.Map) => void
}

export default function ChurchMap({ churches, allChurches, selected, focusChurch, onSelect, onSetLocation, settingLocationFor, showRoutes, pickingLocation, onPickLocation, onMapReady }: Props) {
  const tileDebug = useSearchParams().get('tiledebug') === '1'
  const groups = groupByParish(churches)

  // Routes are computed over the full church set so the network stays complete
  // even when the list is filtered.
  const routeSource = allChurches && allChurches.length ? allChurches : churches
  const positions = buildPositions(routeSource)
  const centers = routeSource.filter(c => c.is_distribution_center)
  const centerColor = new Map<string, string>()
  centers.forEach((c, i) => centerColor.set(c.id, ROUTE_COLORS[i % ROUTE_COLORS.length]))

  const [routeState, setRouteState] = useState<RouteState | null>(null)

  async function requestRoute(church: Church) {
    const dest = positions.get(church.id) || getCoords(church, 0, 1)
    setRouteState({ target: church, geometry: null, distanceKm: null, durationMin: null, loading: true, error: null })
    try {
      const pos = await getCurrentPosition()
      const origin: [number, number] = [pos.coords.latitude, pos.coords.longitude]
      const { geometry, distanceKm, durationMin } = await fetchOsrmRoute(origin, dest)
      setRouteState({ target: church, geometry, distanceKm, durationMin, loading: false, error: null })
    } catch (err) {
      let message = 'Could not calculate the route.'
      if (err && typeof err === 'object' && 'code' in err) {
        const code = (err as GeolocationPositionError).code
        message = code === 1 ? 'You need to grant location permission to calculate the route.'
          : code === 2 ? 'Could not get your current location.'
          : 'Timed out waiting for your location.'
      } else if (err instanceof TypeError) {
        message = 'Routes need an internet connection.'
      }
      setRouteState({ target: church, geometry: null, distanceKm: null, durationMin: null, loading: false, error: message })
    }
  }

  return (
    <MapContainer
      center={[10.6017, -66.9297]}
      zoom={12}
      style={{ height: '100%', width: '100%', cursor: (settingLocationFor || pickingLocation) ? 'crosshair' : undefined }}
    >
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Map">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19} keepBuffer={4}
          />
        </LayersControl.BaseLayer>

        <LayersControl.BaseLayer name="Satellite">
          <TileLayer
            attribution='Tiles &copy; Esri'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19} keepBuffer={4}
          />
        </LayersControl.BaseLayer>

        <LayersControl.BaseLayer name="Satellite + Labels">
          <TileLayer
            attribution='Tiles &copy; Esri'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19} keepBuffer={4}
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      <HybridLabelsManager />
      <FlyToSelected church={focusChurch ?? selected} />
      <MapReadyNotifier onReady={onMapReady} />
      <InvalidateOnLayoutChange />
      {tileDebug && <TileDebugOverlay />}

      {settingLocationFor && onSetLocation && (
        <MapClickHandler onClick={(lat, lng) => onSetLocation(settingLocationFor, lat, lng)} />
      )}

      {pickingLocation && onPickLocation && (
        <MapClickHandler onClick={onPickLocation} />
      )}

      {/* Distribution routes: line from each center to its assigned churches */}
      {showRoutes && routeSource.map(church => {
        if (church.is_distribution_center || !church.distribution_center_id) return null
        const from = positions.get(church.distribution_center_id)
        const to = positions.get(church.id)
        if (!from || !to) return null
        const color = centerColor.get(church.distribution_center_id) || '#7c3aed'
        return (
          <Polyline
            key={`route-${church.id}`}
            positions={[from, to]}
            pathOptions={{ color, weight: 2, opacity: 0.55 }}
          />
        )
      })}

      {routeState?.geometry && (
        <Polyline positions={routeState.geometry} pathOptions={{ color: '#1b2a4a', weight: 5, opacity: 0.75 }} />
      )}

      {routeState && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-white shadow-xl rounded-xl px-4 py-3 max-w-[92vw] w-80 text-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="font-semibold text-slate-800 truncate">Route to {routeState.target.name}</div>
            <button onClick={() => setRouteState(null)} aria-label="Close route" className="text-slate-400 hover:text-slate-600 flex-shrink-0"><IconX className="w-4 h-4" /></button>
          </div>
          {routeState.loading && <div className="text-slate-500 text-xs mt-1">Calculating route…</div>}
          {routeState.error && <div className="text-red-600 text-xs mt-1">{routeState.error}</div>}
          {routeState.distanceKm != null && routeState.durationMin != null && (
            <div className="text-slate-600 text-xs mt-1 font-data">{routeState.distanceKm.toFixed(1)} km · {routeState.durationMin} min by car</div>
          )}
        </div>
      )}

      {Object.entries(groups).map(([, parishChurches]) =>
        parishChurches.map((church, idx) => {
          const pos = positions.get(church.id) || getCoords(church, idx, parishChurches.length)
          const icon = getIcon(church, selected?.id === church.id)
          return (
            <Marker
              key={church.id}
              position={pos}
              icon={icon}
              zIndexOffset={church.marker_type === 'hospital' ? 1000 : isSpecialLocation(church.marker_type) ? 900 : church.is_distribution_center ? 500 : 0}
              eventHandlers={{ click: () => onSelect(church) }}
            >
              <Popup>
                <div className="min-w-[180px]">
                  {church.image_url && (
                    <img src={church.image_url} alt={church.name}
                      onError={e => { e.currentTarget.style.display = 'none' }}
                      className="w-full h-24 object-cover rounded-md mb-2" />
                  )}
                  {church.marker_type === 'hospital' ? (
                    <>
                      <div className="flex items-center gap-1 text-[#808733] text-xs font-bold mb-0.5"><IconHospital className="w-3.5 h-3.5" /> Field Hospital</div>
                      <div className="font-bold text-sm leading-tight">{church.name}</div>
                      <div className="flex items-center gap-1 text-gray-500 text-xs mt-0.5"><IconMapPin className="w-3 h-3" /> {church.parish}</div>
                      <button onClick={() => requestRoute(church)} className="flex items-center gap-1 mt-2 text-navy text-xs font-medium hover:underline">
                        <IconCompass className="w-3.5 h-3.5" /> Get directions
                      </button>
                      <GoogleMapsLink church={church} />
                    </>
                  ) : isSpecialLocation(church.marker_type) ? (
                    <>
                      <div className="text-xs font-bold mb-0.5" style={{ color: LOCATION_COLORS[church.marker_type] }}>{LOCATION_LABELS[church.marker_type]}</div>
                      <div className="font-bold text-sm leading-tight">{church.name}</div>
                      <div className="flex items-center gap-1 text-gray-500 text-xs mt-0.5"><IconMapPin className="w-3 h-3" /> {church.parish}</div>
                      {church.phone && (
                        <a href={`https://wa.me/58${church.phone}`} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1 mt-2 text-green-600 text-xs font-medium hover:underline">
                          <IconMessageCircle className="w-3.5 h-3.5" /> WhatsApp →
                        </a>
                      )}
                      <button onClick={() => requestRoute(church)} className="flex items-center gap-1 mt-2 text-navy text-xs font-medium hover:underline">
                        <IconCompass className="w-3.5 h-3.5" /> Get directions
                      </button>
                      <GoogleMapsLink church={church} />
                    </>
                  ) : (
                    <>
                      {church.is_distribution_center && (
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <div className="flex items-center gap-1.5 text-red-600 text-xs font-bold">
                            <span className="w-2 h-2 rounded-full bg-red-600 flex-shrink-0" /> Distribution Center
                          </div>
                          {church.has_starlink && (
                            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                              <IconSatelliteDish className="w-3 h-3" /> Starlink
                            </div>
                          )}
                        </div>
                      )}
                      <div className="font-bold text-sm leading-tight">{church.name}</div>
                      {church.pastor_name && <div className="flex items-center gap-1 text-gray-600 text-xs mt-1"><IconUser className="w-3.5 h-3.5" /> {church.pastor_name}</div>}
                      <div className="flex items-center gap-1 text-gray-500 text-xs mt-0.5"><IconMapPin className="w-3 h-3" /> {church.parish}</div>
                      {church.phone && (
                        <a href={`https://wa.me/58${church.phone}`} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1 mt-2 text-green-600 text-xs font-medium hover:underline">
                          <IconMessageCircle className="w-3.5 h-3.5" /> WhatsApp →
                        </a>
                      )}
                      <div className={`inline-flex items-center gap-1 mt-2 text-xs px-1.5 py-0.5 rounded-full ${church.geocode_status === 'validado' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {church.geocode_status === 'validado' ? <IconCheck className="w-3 h-3" /> : <IconClock className="w-3 h-3" />}
                        {church.geocode_status === 'validado' ? 'Verified' : 'Pending'}
                      </div>
                      <button onClick={() => requestRoute(church)} className="flex items-center gap-1 mt-2 text-navy text-xs font-medium hover:underline">
                        <IconCompass className="w-3.5 h-3.5" /> Get directions
                      </button>
                      <GoogleMapsLink church={church} />
                    </>
                  )}
                </div>
              </Popup>
            </Marker>
          )
        })
      )}
    </MapContainer>
  )
}
