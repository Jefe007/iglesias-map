'use client'

import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Church } from '@/lib/supabase'

// Fix Leaflet default icons
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

const blueIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

// Parish coordinates for La Guaira region
const PARISH_COORDS: Record<string, [number, number]> = {
  'Naiguata':    [10.6095, -66.7424],
  'Carayaca':    [10.5833, -67.0667],
  'Caraballeda': [10.6167, -66.8667],
  'Maiquetia':   [10.5997, -66.9650],
  'La Guaira':   [10.6017, -66.9297],
  'Catia La Mar':[10.6013, -67.0297],
  'Urimare':     [10.5900, -66.8200],
  'Soublet':     [10.6050, -66.8500],
}

// Spread churches within same parish so markers don't overlap
function getCoords(church: Church, index: number, total: number): [number, number] {
  if (church.lat && church.lng) return [Number(church.lat), Number(church.lng)]
  const base = PARISH_COORDS[church.parish] || [10.6017, -66.9297]
  const angle = (index / total) * 2 * Math.PI
  const spread = Math.min(0.008, 0.003 * Math.sqrt(total))
  return [
    base[0] + spread * Math.cos(angle),
    base[1] + spread * Math.sin(angle),
  ]
}

function FlyToSelected({ church }: { church: Church | null }) {
  const map = useMap()
  useEffect(() => {
    if (!church) return
    const coords = PARISH_COORDS[church.parish] || [10.6017, -66.9297]
    map.flyTo(coords, 14, { duration: 1 })
  }, [church, map])
  return null
}

interface Props {
  churches: Church[]
  selected: Church | null
  onSelect: (church: Church) => void
}

// Group churches by parish to compute spread index
function groupByParish(churches: Church[]) {
  const groups: Record<string, Church[]> = {}
  for (const c of churches) {
    if (!groups[c.parish]) groups[c.parish] = []
    groups[c.parish].push(c)
  }
  return groups
}

export default function ChurchMap({ churches, selected, onSelect }: Props) {
  const groups = groupByParish(churches)

  return (
    <MapContainer
      center={[10.6017, -66.9297]}
      zoom={11}
      style={{ height: '100%', width: '100%' }}
      zoomControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <FlyToSelected church={selected} />

      {Object.entries(groups).map(([parish, parishChurches]) =>
        parishChurches.map((church, idx) => {
          const pos = getCoords(church, idx, parishChurches.length)
          return (
            <Marker
              key={church.id}
              position={pos}
              icon={church.is_distribution_center ? redIcon : blueIcon}
              eventHandlers={{ click: () => onSelect(church) }}
            >
              <Popup>
                <div className="min-w-[160px]">
                  {church.is_distribution_center && (
                    <div className="text-red-600 text-xs font-bold mb-1">🔴 Centro de Distribución</div>
                  )}
                  <div className="font-bold text-sm">{church.name}</div>
                  {church.pastor_name && <div className="text-gray-600 text-xs mt-1">👤 {church.pastor_name}</div>}
                  <div className="text-gray-500 text-xs mt-0.5">📍 {church.parish}</div>
                  {church.phone && (
                    <a href={`https://wa.me/58${church.phone}`} target="_blank" rel="noreferrer"
                      className="block mt-2 text-green-600 text-xs hover:underline">
                      📱 WhatsApp: {church.phone}
                    </a>
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
