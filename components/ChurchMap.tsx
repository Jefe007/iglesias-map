'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, LayersControl } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
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

const makeIcon = (color: string) => new L.Icon({
  iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

const redIcon  = makeIcon('red')
const blueIcon = makeIcon('blue')
const greyIcon = makeIcon('grey')

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
    map.flyTo(target, 15, { duration: 0.8 })
  }, [church, map])
  return null
}

function MapClickHandler({ church, onSetLocation }: { church: Church; onSetLocation: (c: Church, lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onSetLocation(church, e.latlng.lat, e.latlng.lng) } })
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
      zoomControl={true}
      preferCanvas={true}
    >
      <LayersControl position="topright">
        {/* Street map */}
        <LayersControl.BaseLayer checked name="Mapa">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
            keepBuffer={4}
          />
        </LayersControl.BaseLayer>

        {/* Satellite — Esri World Imagery (free, no API key) */}
        <LayersControl.BaseLayer name="Satélite">
          <TileLayer
            attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
            keepBuffer={4}
          />
        </LayersControl.BaseLayer>

        {/* Hybrid: satellite + labels */}
        <LayersControl.BaseLayer name="Satélite + Nombres">
          <TileLayer
            attribution='Tiles &copy; Esri'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
            keepBuffer={4}
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      <FlyToSelected church={selected} />

      {settingLocationFor && onSetLocation && (
        <MapClickHandler church={settingLocationFor} onSetLocation={onSetLocation} />
      )}

      <MarkerClusterGroup
        chunkedLoading
        maxClusterRadius={50}
        spiderfyOnMaxZoom={true}
        showCoverageOnHover={false}
        zoomToBoundsOnClick={true}
      >
        {Object.entries(groups).map(([, parishChurches]) =>
          parishChurches.map((church, idx) => {
            const pos = getCoords(church, idx, parishChurches.length)
            const icon = church.is_distribution_center ? redIcon
              : church.geocode_status === 'validado' ? blueIcon
              : greyIcon
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
                      <div className="text-red-600 text-xs font-bold mb-1">🔴 Centro de Distribución</div>
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
                      {church.geocode_status === 'validado' ? '✓ Validado' : '⏳ Pendiente'}
                    </div>
                  </div>
                </Popup>
              </Marker>
            )
          })
        )}
      </MarkerClusterGroup>
    </MapContainer>
  )
}
