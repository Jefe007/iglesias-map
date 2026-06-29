'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, LayersControl } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Church } from '@/lib/supabase'

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

function getIcon(church: Church, isSelected: boolean) {
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

function MapClickHandler({ church, onSetLocation }: { church: Church; onSetLocation: (c: Church, lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onSetLocation(church, e.latlng.lat, e.latlng.lng) } })
  return null
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
      setShowLabels(e.name === 'Satélite + Nombres')
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

interface Props {
  churches: Church[]
  selected: Church | null
  onSelect: (church: Church) => void
  onSetLocation?: (church: Church, lat: number, lng: number) => void
  settingLocationFor?: Church | null
}

export default function ChurchMap({ churches, selected, onSelect, onSetLocation, settingLocationFor }: Props) {
  const groups = groupByParish(churches)

  return (
    <MapContainer
      center={[10.6017, -66.9297]}
      zoom={12}
      style={{ height: '100%', width: '100%', cursor: settingLocationFor ? 'crosshair' : undefined }}
      preferCanvas={true}
    >
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Mapa">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19} keepBuffer={4}
          />
        </LayersControl.BaseLayer>

        <LayersControl.BaseLayer name="Satélite">
          <TileLayer
            attribution='Tiles &copy; Esri'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19} keepBuffer={4}
          />
        </LayersControl.BaseLayer>

        <LayersControl.BaseLayer name="Satélite + Nombres">
          <TileLayer
            attribution='Tiles &copy; Esri'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19} keepBuffer={4}
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      <HybridLabelsManager />
      <FlyToSelected church={selected} />

      {settingLocationFor && onSetLocation && (
        <MapClickHandler church={settingLocationFor} onSetLocation={onSetLocation} />
      )}

      {Object.entries(groups).map(([, parishChurches]) =>
        parishChurches.map((church, idx) => {
          const pos = getCoords(church, idx, parishChurches.length)
          const icon = getIcon(church, selected?.id === church.id)
          return (
            <Marker
              key={church.id}
              position={pos}
              icon={icon}
              eventHandlers={{ click: () => onSelect(church) }}
            >
              <Popup>
                <div className="min-w-[170px]">
                  {church.is_distribution_center && (
                    <div className="text-red-600 text-xs font-bold mb-1">🔴 Distribution Center</div>
                  )}
                  <div className="font-bold text-sm leading-tight">{church.name}</div>
                  {church.pastor_name && <div className="text-gray-600 text-xs mt-1">👤 {church.pastor_name}</div>}
                  <div className="text-gray-500 text-xs mt-0.5">📍 {church.parish}</div>
                  {church.phone && (
                    <a href={`https://wa.me/58${church.phone}`} target="_blank" rel="noreferrer"
                      className="block mt-2 text-green-600 text-xs font-medium hover:underline">
                      📱 WhatsApp →
                    </a>
                  )}
                  <div className={`mt-2 text-xs px-1.5 py-0.5 rounded-full inline-block ${church.geocode_status === 'validado' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {church.geocode_status === 'validado' ? '✓ Validated' : '⏳ Pending'}
                  </div>
                </div>
              </Popup>
            </Marker>
          )
        })
      )}
    </MapContainer>
  )
}
