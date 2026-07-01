'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import type { Map as LeafletMap } from 'leaflet'
import { supabase, Church } from '@/lib/supabase'
import { updateChurch, deleteChurch, verifyPasscode, getStoredPasscode, setStoredPasscode } from '@/lib/api'

const ChurchMap = dynamic(() => import('@/components/ChurchMap'), { ssr: false })
const ChurchForm = dynamic(() => import('@/components/ChurchForm'), { ssr: false })

const DEFAULT_PARISHES = ['Naiguata', 'Carayaca', 'Caraballeda', 'Maiquetia', 'La Guaira', 'Catia La Mar', 'Urimare', 'Soublet', 'Caracas']
const ALL_OPTION = 'All'

type LayerKey = 'churches' | 'distribution' | 'hospital'
type Layers = Record<LayerKey, boolean>

function layerOf(c: Church): LayerKey {
  if (c.marker_type === 'hospital') return 'hospital'
  if (c.is_distribution_center) return 'distribution'
  return 'churches'
}

export default function Home() {
  const [churches, setChurches] = useState<Church[]>([])
  const [parish, setParish] = useState(ALL_OPTION)
  const [layers, setLayers] = useState<Layers>({ churches: true, distribution: true, hospital: true })
  const [layersOpen, setLayersOpen] = useState(false)
  const [selected, setSelected] = useState<Church | null>(null)
  const [loading, setLoading] = useState(true)
  const [settingLocationFor, setSettingLocationFor] = useState<Church | null>(null)
  const [search, setSearch] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [showRoutes, setShowRoutes] = useState(false)
  const mapRef = useRef<LeafletMap | null>(null)

  // Edit mode / passcode
  const [editMode, setEditMode] = useState(false)
  const [passcodeModalOpen, setPasscodeModalOpen] = useState(false)
  const [passcodeInput, setPasscodeInput] = useState('')
  const [passcodeError, setPasscodeError] = useState(false)
  const [verifying, setVerifying] = useState(false)

  // Add/Edit form
  const [formOpen, setFormOpen] = useState(false)
  const [formChurch, setFormChurch] = useState<Church | null>(null)
  const [pickingForForm, setPickingForForm] = useState(false)
  const [pickedCoords, setPickedCoords] = useState<{ lat: number; lng: number } | null>(null)

  // Delete confirmation
  const [confirmDeleteChurch, setConfirmDeleteChurch] = useState<Church | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchChurches = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('churches').select('*').order('parish').order('name')
    if (parish !== ALL_OPTION) q = q.eq('parish', parish)
    const { data } = await q
    setChurches(data || [])
    setLoading(false)
  }, [parish])

  useEffect(() => { fetchChurches() }, [fetchChurches])

  useEffect(() => {
    const invalidate = () => mapRef.current?.invalidateSize()
    window.addEventListener('beforeprint', invalidate)
    window.addEventListener('afterprint', invalidate)
    return () => {
      window.removeEventListener('beforeprint', invalidate)
      window.removeEventListener('afterprint', invalidate)
    }
  }, [])

  const [exportTime, setExportTime] = useState('')
  const handleExportPdf = () => {
    setExportTime(new Date().toLocaleString())
    window.print()
  }

  const handleSetLocation = async (church: Church, lat: number, lng: number) => {
    try {
      await updateChurch(church.id, { lat, lng, geocode_status: 'validado' })
      setSettingLocationFor(null)
      fetchChurches()
      setSelected(prev => prev?.id === church.id ? { ...prev, lat, lng, geocode_status: 'validado' } : prev)
    } catch (e) {
      alert((e as Error).message)
    }
  }

  const openChurch = (c: Church) => { setSelected(c); setSheetOpen(true) }

  const centers = churches.filter(c => c.is_distribution_center)
  const parishOptions = Array.from(new Set([...DEFAULT_PARISHES, ...churches.map(c => c.parish)])).sort()

  const reassignCenter = async (church: Church, centerId: string) => {
    try {
      await updateChurch(church.id, { distribution_center_id: centerId || null })
      fetchChurches()
      setSelected(prev => prev?.id === church.id ? { ...prev, distribution_center_id: centerId || null } : prev)
    } catch (e) {
      alert((e as Error).message)
    }
  }

  const toggleDistribution = async (church: Church) => {
    try {
      await updateChurch(church.id, { is_distribution_center: !church.is_distribution_center })
      fetchChurches()
      setSelected(prev => prev?.id === church.id ? { ...prev, is_distribution_center: !prev.is_distribution_center } : prev)
    } catch (e) {
      alert((e as Error).message)
    }
  }

  const activateEditMode = async () => {
    const stored = getStoredPasscode()
    if (stored) {
      const ok = await verifyPasscode(stored)
      if (ok) { setEditMode(true); return }
    }
    setPasscodeModalOpen(true)
  }

  const submitPasscode = async (e: React.FormEvent) => {
    e.preventDefault()
    setVerifying(true)
    const ok = await verifyPasscode(passcodeInput)
    setVerifying(false)
    if (ok) {
      setStoredPasscode(passcodeInput)
      setEditMode(true)
      setPasscodeModalOpen(false)
      setPasscodeInput('')
      setPasscodeError(false)
    } else {
      setPasscodeError(true)
    }
  }

  const openAddChurch = () => {
    setPickedCoords(null)
    setFormChurch(null)
    setFormOpen(true)
  }

  const openEditChurch = (church: Church) => {
    setPickedCoords(null)
    setFormChurch(church)
    setFormOpen(true)
  }

  const closeForm = () => {
    setFormOpen(false)
    setFormChurch(null)
    setPickingForForm(false)
    setPickedCoords(null)
  }

  const handleDeleteConfirmed = async () => {
    if (!confirmDeleteChurch) return
    setDeleting(true)
    try {
      await deleteChurch(confirmDeleteChurch.id)
      setConfirmDeleteChurch(null)
      setSelected(null)
      fetchChurches()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setDeleting(false)
    }
  }

  const distCount = churches.filter(c => c.is_distribution_center).length
  const churchCount = churches.filter(c => c.marker_type !== 'hospital').length
  const filtered = churches.filter(c => {
    if (!layers[layerOf(c)]) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return c.name.toLowerCase().includes(q) || (c.pastor_name || '').toLowerCase().includes(q)
    }
    return true
  })

  const layerMeta: { key: LayerKey; label: string; color: string; count: number }[] = [
    { key: 'churches',     label: 'Churches',             color: '#2563eb', count: churches.filter(c => layerOf(c) === 'churches').length },
    { key: 'distribution', label: 'Distribution centers', color: '#dc2626', count: churches.filter(c => layerOf(c) === 'distribution').length },
    { key: 'hospital',     label: 'Field hospital',       color: '#7c8729', count: churches.filter(c => layerOf(c) === 'hospital').length },
  ]
  const activeLayers = (Object.keys(layers) as LayerKey[]).filter(k => layers[k]).length

  const activeLayerLabels = layerMeta.filter(l => layers[l.key]).map(l => l.label).join(', ') || 'None'

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Print-only header (shown only in the exported PDF) */}
      <div className="hidden print:flex items-center gap-2.5 px-2 py-3 border-b border-gray-200">
        <img src="/logosp.jpg" alt="Samaritan's Purse" className="w-9 h-9 rounded-full object-cover" />
        <div className="flex-1">
          <h1 className="text-base font-bold leading-tight font-sans-pro text-navy">La Guaira Distribution Network</h1>
          <p className="text-gray-500 text-[11px] uppercase tracking-wide">Samaritan&apos;s Purse</p>
        </div>
        <div className="text-[11px] text-gray-500 text-right">
          <div>Parish: {parish} · Layers: {activeLayerLabels} · Routes: {showRoutes ? 'On' : 'Off'}</div>
          <div>Generated {exportTime}</div>
        </div>
      </div>

      {/* Header */}
      <header className="bg-navy text-white px-4 py-3 flex items-center justify-between shadow-lg z-10 print:hidden">
        <div className="flex items-center gap-2.5">
          <img src="/logosp.jpg" alt="Samaritan's Purse" className="w-9 h-9 rounded-full object-cover border-2 border-white/20" />
          <div>
            <h1 className="text-base font-bold leading-tight font-sans-pro">La Guaira Distribution Network</h1>
            <p className="text-white/50 text-[11px] font-data uppercase tracking-wide">Samaritan&apos;s Purse</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-sm hidden sm:block">
            <div className="text-white font-semibold font-data">{churchCount} churches</div>
            <div className="text-white/50 text-xs font-data">{distCount} distribution centers</div>
          </div>
          <button
            onClick={editMode ? () => setEditMode(false) : activateEditMode}
            title={editMode ? 'Exit edit mode' : 'Enter edit mode'}
            className={`p-2 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${editMode ? 'bg-olive text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
          >
            {editMode ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            )}
          </button>
          <Link
            href="/dashboard"
            className="bg-olive hover:bg-[var(--olive-600)] px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            Dashboard
          </Link>
        </div>
      </header>

      {/* Filters */}
      <div className="bg-white border-b px-4 py-2 flex gap-3 items-center flex-wrap shadow-sm relative z-[1100] print:hidden">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            placeholder="Search church or pastor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg pl-8 pr-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">✕</button>
          )}
        </div>

        <select
          value={parish}
          onChange={e => setParish(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option>{ALL_OPTION}</option>
          {parishOptions.map(p => <option key={p}>{p}</option>)}
        </select>

        {/* Layers multi-select dropdown */}
        <div className="relative">
          <button
            onClick={() => setLayersOpen(o => !o)}
            className="flex items-center gap-2 border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white hover:border-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--olive)] transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-slate-500">
              <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.84zM2 12l8.58 3.91a2 2 0 0 0 1.66 0L22 12M2 17l8.58 3.91a2 2 0 0 0 1.66 0L22 17" />
            </svg>
            <span className="font-medium text-slate-700">Layers</span>
            <span className="font-data text-xs bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">{activeLayers}/3</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-3.5 h-3.5 text-slate-400 transition-transform ${layersOpen ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>

          {layersOpen && (
            <>
              <div className="fixed inset-0 z-[1200]" onClick={() => setLayersOpen(false)} />
              <div className="absolute left-0 top-full mt-1.5 w-60 bg-white rounded-xl shadow-xl border border-slate-200 p-1.5 z-[1300]">
                <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Show on map</div>
                {layerMeta.map(({ key, label, color, count }) => {
                  const on = layers[key]
                  return (
                    <button
                      key={key}
                      onClick={() => setLayers(l => ({ ...l, [key]: !l[key] }))}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-50 transition-colors text-left"
                    >
                      <span className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${on ? 'border-transparent' : 'border-slate-300'}`} style={on ? { background: color } : undefined}>
                        {on && <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="w-3 h-3"><path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                      </span>
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className={`text-sm flex-1 ${on ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>{label}</span>
                      <span className="font-data text-xs text-slate-400">{count}</span>
                    </button>
                  )
                })}
                <div className="flex gap-1 px-1.5 pt-1.5 mt-1 border-t border-slate-100">
                  <button onClick={() => setLayers({ churches: true, distribution: true, hospital: true })} className="flex-1 text-xs py-1.5 rounded-md text-slate-600 hover:bg-slate-100 transition-colors">All</button>
                  <button onClick={() => setLayers({ churches: false, distribution: false, hospital: false })} className="flex-1 text-xs py-1.5 rounded-md text-slate-600 hover:bg-slate-100 transition-colors">None</button>
                </div>
              </div>
            </>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showRoutes}
            onChange={e => setShowRoutes(e.target.checked)}
            className="w-4 h-4"
            style={{ accentColor: 'var(--olive)' }}
          />
          <span className="text-slate-700">Show routes</span>
        </label>

        <button
          onClick={handleExportPdf}
          title="Export the current map view as a PDF"
          className="flex items-center gap-1.5 border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white hover:border-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--olive)] transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-slate-500">
            <path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
          </svg>
          <span className="font-medium text-slate-700 hidden sm:inline">Export PDF</span>
        </button>

        {editMode && (
          <button
            onClick={openAddChurch}
            className="ml-auto flex items-center gap-1.5 bg-navy text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-[var(--navy-700)] transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            Add church
          </button>
        )}
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Map */}
        <div className="flex-1 relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-20">
              <div className="text-gray-500 text-sm">Loading map...</div>
            </div>
          ) : (
            <>
              {settingLocationFor && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-yellow-400 text-yellow-900 px-4 py-2 rounded-full text-xs sm:text-sm font-semibold shadow-lg max-w-[90%] text-center">
                  📍 Click on the map to pin: <strong>{settingLocationFor.name}</strong>
                  <button onClick={() => setSettingLocationFor(null)} className="ml-3 text-yellow-700 hover:text-yellow-900">✕</button>
                </div>
              )}
              {pickingForForm && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-yellow-400 text-yellow-900 px-4 py-2 rounded-full text-xs sm:text-sm font-semibold shadow-lg max-w-[90%] text-center">
                  📍 Tap the map to place the pin
                  <button onClick={() => setPickingForForm(false)} className="ml-3 text-yellow-700 hover:text-yellow-900">✕</button>
                </div>
              )}
              <ChurchMap
                churches={filtered}
                allChurches={churches}
                selected={selected}
                onSelect={openChurch}
                onSetLocation={handleSetLocation}
                settingLocationFor={settingLocationFor}
                showRoutes={showRoutes}
                pickingLocation={pickingForForm}
                onPickLocation={(lat, lng) => { setPickedCoords({ lat, lng }); setPickingForForm(false) }}
                onMapReady={map => { mapRef.current = map }}
              />
            </>
          )}
        </div>

        {/* Sidebar (desktop) / bottom sheet (mobile) */}
        <div
          className={`
            bg-white flex flex-col overflow-hidden print:hidden
            md:static md:w-72 md:border-l md:shadow-none md:rounded-none md:max-h-none md:translate-y-0
            fixed inset-x-0 bottom-0 z-[1100] rounded-t-2xl shadow-2xl max-h-[78vh]
            transition-transform duration-300 ease-out
            ${sheetOpen || selected ? 'translate-y-0' : 'translate-y-[calc(100%-3.25rem)]'}
          `}
        >
          {/* Mobile handle */}
          <button
            onClick={() => { setSheetOpen(o => !o); if (selected) setSelected(null) }}
            className="md:hidden flex flex-col items-center gap-1 py-2 border-b border-gray-100 active:bg-gray-50"
          >
            <span className="w-10 h-1 rounded-full bg-gray-300" />
            <span className="text-xs font-semibold text-gray-600">
              {selected ? selected.name : `${filtered.length} ${filtered.length !== 1 ? 'points' : 'point'} ${sheetOpen ? '▼' : '▲'}`}
            </span>
          </button>

          <div className="overflow-y-auto flex-1">
          {selected && selected.marker_type === 'hospital' ? (
            <div className="p-4">
              <button onClick={() => setSelected(null)} className="text-gray-400 text-sm mb-3 hover:text-gray-600">← Back to list</button>
              {selected.image_url && (
                <img src={selected.image_url} alt={selected.name}
                  onError={e => { e.currentTarget.style.display = 'none' }}
                  className="w-full h-44 object-cover rounded-xl mb-3 border border-slate-200" />
              )}
              <div className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-[#80873322] text-[#5f6526] mb-2">
                🏥 Field Hospital
              </div>
              <h2 className="font-bold text-gray-900 text-base mb-1">{selected.name}</h2>
              <div className="space-y-2 text-sm mt-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-gray-500 text-xs uppercase font-semibold mb-1">Parish</div>
                  <div className="text-gray-800">{selected.parish}</div>
                </div>
                {selected.notes && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-gray-500 text-xs uppercase font-semibold mb-1">About</div>
                    <div className="text-gray-800">{selected.notes}</div>
                  </div>
                )}
                {selected.lat && selected.lng && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${selected.lat},${selected.lng}`}
                    target="_blank" rel="noreferrer"
                    className="block text-center bg-[#808733] hover:bg-[#6b7029] text-white py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    🧭 Open in Google Maps
                  </a>
                )}
              </div>
              {editMode && (
                <div className="flex gap-2 mt-4">
                  <button onClick={() => openEditChurch(selected)} className="flex-1 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50">Edit</button>
                  <button onClick={() => setConfirmDeleteChurch(selected)} className="flex-1 py-2 rounded-lg border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50">Delete</button>
                </div>
              )}
            </div>
          ) : selected ? (
            <div className="p-4">
              <button onClick={() => setSelected(null)} className="text-gray-400 text-sm mb-3 hover:text-gray-600">← Back to list</button>
              {selected.image_url && (
                <img src={selected.image_url} alt={selected.name}
                  onError={e => { e.currentTarget.style.display = 'none' }}
                  className="w-full h-40 object-cover rounded-xl mb-3 border border-slate-200" />
              )}
              <div className="flex gap-2 flex-wrap mb-3">
                <div className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${selected.is_distribution_center ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                  {selected.is_distribution_center ? '🔴 Distribution Center' : '🔵 Church'}
                </div>
                <div className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${selected.geocode_status === 'validado' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                  {selected.geocode_status === 'validado' ? '📍 Location validated' : '⏳ Location pending'}
                </div>
              </div>
              <h2 className="font-bold text-gray-900 text-base mb-1">{selected.name}</h2>
              {selected.pastor_name && <p className="text-gray-600 text-sm mb-3">👤 {selected.pastor_name}</p>}
              <div className="space-y-2 text-sm">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-gray-500 text-xs uppercase font-semibold mb-1">Parish</div>
                  <div className="text-gray-800">{selected.parish}</div>
                </div>
                {!selected.is_distribution_center && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-gray-500 text-xs uppercase font-semibold mb-1">Distribution Center</div>
                    {editMode ? (
                      <select
                        value={selected.distribution_center_id || ''}
                        onChange={e => reassignCenter(selected, e.target.value)}
                        className="w-full bg-white border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">— Unassigned —</option>
                        {centers.map(c => (
                          <option key={c.id} value={c.id}>{c.name} ({c.parish})</option>
                        ))}
                      </select>
                    ) : (
                      <div className="text-gray-800">{centers.find(c => c.id === selected.distribution_center_id)?.name || '— Unassigned —'}</div>
                    )}
                  </div>
                )}
                {selected.phone && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-gray-500 text-xs uppercase font-semibold mb-1">Phone</div>
                    <a href={`tel:+58${selected.phone}`} className="text-blue-600 hover:underline">+58 {selected.phone}</a>
                    <a href={`https://wa.me/58${selected.phone}`} target="_blank" rel="noreferrer" className="ml-3 text-green-600 text-xs hover:underline">WhatsApp →</a>
                  </div>
                )}
                {selected.email && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-gray-500 text-xs uppercase font-semibold mb-1">Email</div>
                    <a href={`mailto:${selected.email}`} className="text-blue-600 hover:underline break-all">{selected.email}</a>
                  </div>
                )}
              </div>
              {editMode && (
                <>
                  <button
                    onClick={() => toggleDistribution(selected)}
                    className={`mt-4 w-full py-2 rounded-lg text-sm font-medium transition-colors ${selected.is_distribution_center ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-red-600 text-white hover:bg-red-700'}`}
                  >
                    {selected.is_distribution_center ? 'Remove as distribution center' : '🔴 Mark as distribution center'}
                  </button>
                  {selected.geocode_status !== 'validado' && (
                    <button
                      onClick={() => setSettingLocationFor(selected)}
                      className="mt-2 w-full py-2 rounded-lg text-sm font-medium bg-yellow-400 text-yellow-900 hover:bg-yellow-500 transition-colors"
                    >
                      📍 Pin location manually on map
                    </button>
                  )}
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => openEditChurch(selected)} className="flex-1 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50">Edit</button>
                    <button onClick={() => setConfirmDeleteChurch(selected)} className="flex-1 py-2 rounded-lg border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50">Delete</button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="divide-y">
              <div className="p-3 text-xs text-gray-500 uppercase font-semibold bg-gray-50">
                {filtered.length} {filtered.length !== 1 ? 'points' : 'point'}{search ? ` — "${search}"` : ''}
              </div>
              {filtered.map(church => (
                <button
                  key={church.id}
                  onClick={() => openChurch(church)}
                  className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-base mt-0.5">
                      {church.marker_type === 'hospital' ? '🏥' : church.is_distribution_center ? '🔴' : '🔵'}
                    </span>
                    <div>
                      <div className="text-sm font-medium text-gray-900 leading-tight">{church.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {church.marker_type === 'hospital' ? 'Samaritan’s Purse' : (church.pastor_name || '—')}
                      </div>
                      <div className="text-xs text-gray-400">{church.parish}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Passcode modal */}
      {passcodeModalOpen && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={submitPasscode} className="bg-white rounded-xl shadow-2xl p-5 w-full max-w-xs">
            <h3 className="font-bold text-gray-900 mb-1">Edit mode</h3>
            <p className="text-xs text-gray-500 mb-3">Enter the passcode to add, edit, or delete churches.</p>
            <input
              type="password"
              autoFocus
              value={passcodeInput}
              onChange={e => { setPasscodeInput(e.target.value); setPasscodeError(false) }}
              className={`w-full border rounded-lg px-3 py-2 text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-[var(--olive)] ${passcodeError ? 'border-red-400' : 'border-gray-300'}`}
              placeholder="Passcode"
            />
            {passcodeError && <p className="text-xs text-red-600 mb-2">Incorrect passcode</p>}
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={() => { setPasscodeModalOpen(false); setPasscodeInput(''); setPasscodeError(false) }} className="flex-1 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={verifying} className="flex-1 py-2 rounded-lg bg-navy text-white text-sm font-medium hover:bg-[var(--navy-700)] disabled:opacity-50">{verifying ? 'Checking…' : 'Unlock'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDeleteChurch && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-5 w-full max-w-xs">
            <h3 className="font-bold text-gray-900 mb-1">Delete church?</h3>
            <p className="text-sm text-gray-600 mb-4">This will permanently remove <strong>{confirmDeleteChurch.name}</strong> and its routes from the map.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDeleteChurch(null)} disabled={deleting} className="flex-1 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button onClick={handleDeleteConfirmed} disabled={deleting} className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50">{deleting ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit church form */}
      {formOpen && (
        <ChurchForm
          church={formChurch}
          centers={centers}
          parishes={parishOptions}
          onClose={closeForm}
          onSaved={() => { setFormOpen(false); setFormChurch(null); setPickingForForm(false); setPickedCoords(null); fetchChurches() }}
          pickingLocation={pickingForForm}
          onStartPickLocation={() => { setSettingLocationFor(null); setPickingForForm(true) }}
          onCancelPickLocation={() => setPickingForForm(false)}
          pendingCoords={pickedCoords}
        />
      )}
    </div>
  )
}
