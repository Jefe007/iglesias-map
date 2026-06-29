'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, Church } from '@/lib/supabase'

const CENTER_COLORS = ['#7c3aed', '#0891b2', '#db2777', '#ea580c']

export default function Dashboard() {
  const [churches, setChurches] = useState<Church[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('churches').select('*').then(({ data }) => {
      setChurches(data || [])
      setLoading(false)
    })
  }, [])

  const total = churches.length
  const centers = churches.filter(c => c.is_distribution_center)
  const regular = churches.filter(c => !c.is_distribution_center)
  const validated = churches.filter(c => c.geocode_status === 'validado').length
  const pending = total - validated
  const validatedPct = total ? Math.round((validated / total) * 100) : 0

  // Per-parish breakdown
  const byParish = Object.entries(
    churches.reduce<Record<string, number>>((acc, c) => {
      acc[c.parish] = (acc[c.parish] || 0) + 1
      return acc
    }, {})
  ).sort((a, b) => b[1] - a[1])
  const maxParish = Math.max(1, ...byParish.map(([, n]) => n))

  // Coverage per distribution center
  const coverage = centers
    .map((center, i) => ({
      center,
      color: CENTER_COLORS[i % CENTER_COLORS.length],
      count: regular.filter(c => c.distribution_center_id === center.id).length,
    }))
    .sort((a, b) => b.count - a.count)
  const maxCoverage = Math.max(1, ...coverage.map(c => c.count))
  const unassigned = regular.filter(c => !c.distribution_center_id).length

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400">
        Loading dashboard…
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-800 text-white">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">⛪ La Guaira Churches</h1>
            <p className="text-blue-200 text-sm mt-0.5">Distribution Network · Dashboard</p>
          </div>
          <Link
            href="/"
            className="bg-white/10 hover:bg-white/20 backdrop-blur px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-white/20"
          >
            🗺️ Open Map
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* KPI cards */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Total Churches"
            value={total}
            icon="⛪"
            accent="from-blue-500 to-blue-600"
          />
          <KpiCard
            label="Distribution Centers"
            value={centers.length}
            icon="📦"
            accent="from-red-500 to-rose-600"
          />
          <KpiCard
            label="Validated Locations"
            value={validated}
            sub={`${validatedPct}% of total`}
            icon="📍"
            accent="from-emerald-500 to-green-600"
          />
          <KpiCard
            label="Pending Locations"
            value={pending}
            sub={`${100 - validatedPct}% of total`}
            icon="⏳"
            accent="from-amber-500 to-orange-500"
          />
        </section>

        {/* Geocoding progress */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-800">Location Validation Progress</h2>
            <span className="text-2xl font-bold text-emerald-600">{validatedPct}%</span>
          </div>
          <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-green-500 rounded-full transition-all duration-700"
              style={{ width: `${validatedPct}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-slate-500">
            <span>{validated} validated</span>
            <span>{pending} pending</span>
          </div>
        </section>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Coverage per center */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <h2 className="font-semibold text-slate-800 mb-4">Coverage by Distribution Center</h2>
            <div className="space-y-4">
              {coverage.map(({ center, color, count }) => (
                <div key={center.id}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="font-medium text-slate-700 truncate">{center.name}</span>
                    </div>
                    <span className="text-slate-500 font-semibold ml-2">{count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${(count / maxCoverage) * 100}%`, background: color }}
                    />
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">{center.parish}</div>
                </div>
              ))}
              {unassigned > 0 && (
                <div className="text-xs text-amber-600 pt-2 border-t border-slate-100">
                  ⚠️ {unassigned} church{unassigned !== 1 ? 'es' : ''} not assigned to any center
                </div>
              )}
            </div>
          </section>

          {/* By parish */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <h2 className="font-semibold text-slate-800 mb-4">Churches by Parish</h2>
            <div className="space-y-3">
              {byParish.map(([parish, n]) => (
                <div key={parish}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium text-slate-700">{parish}</span>
                    <span className="text-slate-500 font-semibold">{n}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-700"
                      style={{ width: `${(n / maxParish) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <footer className="text-center text-xs text-slate-400 pt-4">
          {total} churches · {byParish.length} parishes · {centers.length} distribution centers
        </footer>
      </main>
    </div>
  )
}

function KpiCard({ label, value, sub, icon, accent }: {
  label: string
  value: number
  sub?: string
  icon: string
  accent: string
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 relative overflow-hidden">
      <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${accent}`} />
      <div className="flex items-start justify-between">
        <div>
          <div className="text-3xl font-bold text-slate-800 tabular-nums">{value}</div>
          <div className="text-xs text-slate-500 mt-1 font-medium uppercase tracking-wide">{label}</div>
          {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
        </div>
        <div className={`text-2xl w-11 h-11 rounded-xl bg-gradient-to-br ${accent} flex items-center justify-center shadow-sm`}>
          <span className="grayscale-0">{icon}</span>
        </div>
      </div>
    </div>
  )
}
