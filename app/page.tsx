'use client'

import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { supabase, Church } from '@/lib/supabase'

const ChurchMap = dynamic(() => import('@/components/ChurchMap'), { ssr: false })

const PARISHES = ['Todas', 'Naiguata', 'Carayaca', 'Caraballeda', 'Maiquetia', 'La Guaira', 'Catia La Mar', 'Urimare', 'Soublet']

export default function Home() {
  const [churches, setChurches] = useState<Church[]>([])
  const [parish, setParish] = useState('Todas')
  const [onlyDistribution, setOnlyDistribution] = useState(false)
  const [selected, setSelected] = useState<Church | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchChurches = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('churches').select('*').order('parish').order('name')
    if (parish !== 'Todas') q = q.eq('parish', parish)
    if (onlyDistribution) q = q.eq('is_distribution_center', true)
    const { data } = await q
    setChurches(data || [])
    setLoading(false)
  }, [parish, onlyDistribution])

  useEffect(() => { fetchChurches() }, [fetchChurches])

  const toggleDistribution = async (church: Church) => {
    await supabase
      .from('churches')
      .update({ is_distribution_center: !church.is_distribution_center })
      .eq('id', church.id)
    fetchChurches()
    setSelected(prev => prev?.id === church.id ? { ...prev, is_distribution_center: !prev.is_distribution_center } : prev)
  }

  const distCount = churches.filter(c => c.is_distribution_center).length

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-900 text-white px-4 py-3 flex items-center justify-between shadow-lg z-10">
        <div>
          <h1 className="text-lg font-bold">⛪ Iglesias La Guaira</h1>
          <p className="text-blue-200 text-xs">Centros de Distribución</p>
        </div>
        <div className="text-right text-sm">
          <div className="text-white font-semibold">{churches.length} iglesias</div>
          <div className="text-red-300 text-xs">🔴 {distCount} centros de distribución</div>
        </div>
      </header>

      {/* Filters */}
      <div className="bg-white border-b px-4 py-2 flex gap-3 items-center flex-wrap shadow-sm z-10">
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
          <span>Solo centros de distribución</span>
        </label>

        <div className="ml-auto flex gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="text-red-600 text-base">📍</span> Centro distribución</span>
          <span className="flex items-center gap-1"><span className="text-blue-600 text-base">📍</span> Iglesia</span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Map */}
        <div className="flex-1 relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-20">
              <div className="text-gray-500 text-sm">Cargando mapa...</div>
            </div>
          ) : (
            <ChurchMap churches={churches} selected={selected} onSelect={setSelected} />
          )}
        </div>

        {/* Sidebar panel */}
        <div className="w-72 bg-white border-l overflow-y-auto flex flex-col">
          {selected ? (
            <div className="p-4">
              <button onClick={() => setSelected(null)} className="text-gray-400 text-sm mb-3 hover:text-gray-600">← Volver a lista</button>
              <div className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mb-3 ${selected.is_distribution_center ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                {selected.is_distribution_center ? '🔴 Centro de Distribución' : '🔵 Iglesia'}
              </div>
              <h2 className="font-bold text-gray-900 text-base mb-1">{selected.name}</h2>
              {selected.pastor_name && <p className="text-gray-600 text-sm mb-3">👤 {selected.pastor_name}</p>}
              <div className="space-y-2 text-sm">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-gray-500 text-xs uppercase font-semibold mb-1">Parroquia</div>
                  <div className="text-gray-800">{selected.parish}</div>
                </div>
                {selected.phone && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-gray-500 text-xs uppercase font-semibold mb-1">Teléfono</div>
                    <a href={`tel:+58${selected.phone}`} className="text-blue-600 hover:underline">+58 {selected.phone}</a>
                    <a href={`https://wa.me/58${selected.phone}`} target="_blank" rel="noreferrer" className="ml-3 text-green-600 text-xs hover:underline">WhatsApp →</a>
                  </div>
                )}
                {selected.email && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-gray-500 text-xs uppercase font-semibold mb-1">Correo</div>
                    <a href={`mailto:${selected.email}`} className="text-blue-600 hover:underline break-all">{selected.email}</a>
                  </div>
                )}
              </div>
              <button
                onClick={() => toggleDistribution(selected)}
                className={`mt-4 w-full py-2 rounded-lg text-sm font-medium transition-colors ${selected.is_distribution_center ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-red-600 text-white hover:bg-red-700'}`}
              >
                {selected.is_distribution_center ? 'Quitar como centro de distribución' : '🔴 Marcar como centro de distribución'}
              </button>
            </div>
          ) : (
            <div className="divide-y">
              <div className="p-3 text-xs text-gray-500 uppercase font-semibold bg-gray-50">
                {churches.length} Iglesias encontradas
              </div>
              {churches.map(church => (
                <button
                  key={church.id}
                  onClick={() => setSelected(church)}
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
  )
}
