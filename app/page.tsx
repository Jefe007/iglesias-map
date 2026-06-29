'use client'

import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { supabase, Church } from '@/lib/supabase'

const ChurchMap = dynamic(() => import('@/components/ChurchMap'), { ssr: false })

const PARISHES = ['All', 'Naiguata', 'Carayaca', 'Caraballeda', 'Maiquetia', 'La Guaira', 'Catia La Mar', 'Urimare', 'Soublet']
const ALL_OPTION = 'All'

export default function Home() {
  const [churches, setChurches] = useState<Church[]>([])
  const [parish, setParish] = useState(ALL_OPTION)
  const [onlyDistribution, setOnlyDistribution] = useState(false)
  const [selected, setSelected] = useState<Church | null>(null)
  const [loading, setLoading] = useState(true)
  const [settingLocationFor, setSettingLocationFor] = useState<Church | null>(null)
  const [search, setSearch] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [showRoutes, setShowRoutes] = useState(false)

  const fetchChurches = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('churches').select('*').order('parish').order('name')
    if (parish !== ALL_OPTION) q = q.eq('parish', parish)
    if (onlyDistribution) q = q.eq('is_distribution_center', true)
    const { data } = await q
    setChurches(data || [])
    setLoading(false)
  }, [parish, onlyDistribution])

  useEffect(() => { fetchChurches() }, [fetchChurches])

  const handleSetLocation = async (church: Church, lat: number, lng: number) => {
    await supabase.from('churches').update({ lat, lng, geocode_status: 'validado' }).eq('id', church.id)
    setSettingLocationFor(null)
    fetchChurches()
    setSelected(prev => prev?.id === church.id ? { ...prev, lat, lng, geocode_status: 'validado' } : prev)
  }

  const openChurch = (c: Church) => { setSelected(c); setSheetOpen(true) }

  const centers = churches.filter(c => c.is_distribution_center)

  const reassignCenter = async (church: Church, centerId: string) => {
    await supabase.from('churches').update({ distribution_center_id: centerId || null }).eq('id', church.id)
    fetchChurches()
    setSelected(prev => prev?.id === church.id ? { ...prev, distribution_center_id: centerId || null } : prev)
  }

  const toggleDistribution = async (church: Church) => {
    await supabase
      .from('churches')
      .update({ is_distribution_center: !church.is_distribution_center })
      .eq('id', church.id)
    fetchChurches()
    setSelected(prev => prev?.id === church.id ? { ...prev, is_distribution_center: !prev.is_distribution_center } : prev)
  }

  const distCount = churches.filter(c => c.is_distribution_center).length
  const filtered = search.trim()
    ? churches.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.pastor_name || '').toLowerCase().includes(search.toLowerCase())
      )
    : churches

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-900 text-white px-4 py-3 flex items-center justify-between shadow-lg z-10">
        <div>
          <h1 className="text-lg font-bold">⛪ La Guaira Churches</h1>
          <p className="text-blue-200 text-xs">Distribution Centers</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right text-sm">
            <div className="text-white font-semibold">{churches.length} churches</div>
            <div className="text-red-300 text-xs">🔴 {distCount} distribution centers</div>
          </div>
          <Link
            href="/dashboard"
            className="bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg text-sm font-medium transition-colors border border-white/20 whitespace-nowrap"
          >
            📊 Dashboard
          </Link>
        </div>
      </header>

      {/* Filters */}
      <div className="bg-white border-b px-4 py-2 flex gap-3 items-center flex-wrap shadow-sm z-10">
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
          {PARISHES.map(p => <option key={p}>{p}</option>)}
        </select>

        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyDistribution}
            onChange={e => setOnlyDistribution(e.target.checked)}
            className="w-4 h-4 accent-red-600"
          />
          <span>Distribution only</span>
        </label>

        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showRoutes}
            onChange={e => setShowRoutes(e.target.checked)}
            className="w-4 h-4 accent-indigo-600"
          />
          <span>🛣️ Show routes</span>
        </label>

        <div className="ml-auto flex gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="text-red-600 text-base">📍</span> Distribution</span>
          <span className="flex items-center gap-1"><span className="text-blue-600 text-base">📍</span> Validated</span>
          <span className="flex items-center gap-1"><span className="text-gray-400 text-base">📍</span> Pending</span>
        </div>
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
              <ChurchMap
                churches={filtered}
                allChurches={churches}
                selected={selected}
                onSelect={openChurch}
                onSetLocation={handleSetLocation}
                settingLocationFor={settingLocationFor}
                showRoutes={showRoutes}
              />
            </>
          )}
        </div>

        {/* Sidebar (desktop) / bottom sheet (mobile) */}
        <div
          className={`
            bg-white flex flex-col overflow-hidden
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
              {selected ? selected.name : `${filtered.length} church${filtered.length !== 1 ? 'es' : ''} ${sheetOpen ? '▼' : '▲'}`}
            </span>
          </button>

          <div className="overflow-y-auto flex-1">
          {selected ? (
            <div className="p-4">
              <button onClick={() => setSelected(null)} className="text-gray-400 text-sm mb-3 hover:text-gray-600">← Back to list</button>
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
            </div>
          ) : (
            <div className="divide-y">
              <div className="p-3 text-xs text-gray-500 uppercase font-semibold bg-gray-50">
                {filtered.length} church{filtered.length !== 1 ? 'es' : ''}{search ? ` — "${search}"` : ''}
              </div>
              {filtered.map(church => (
                <button
                  key={church.id}
                  onClick={() => openChurch(church)}
                  className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <span className={`text-base mt-0.5 ${church.is_distribution_center ? 'text-red-600' : 'text-blue-600'}`}>
                      {church.is_distribution_center ? '🔴' : '🔵'}
                    </span>
                    <div>
                      <div className="text-sm font-medium text-gray-900 leading-tight">{church.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{church.pastor_name || '—'}</div>
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
    </div>
  )
}
