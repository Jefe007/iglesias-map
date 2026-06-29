'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, Church } from '@/lib/supabase'

const CENTER_COLORS = ['#7c3aed', '#0891b2', '#db2777', '#ea580c']

/* ---- Lucide-style inline SVG icons (1.75 stroke, 24px) ---- */
const Icon = {
  church: (c: string) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M12 2v6M9 5h6M12 8l-6 4v9h12v-9z" /><path d="M9 21v-5h6v5" /><path d="M6 12L3 14v7h3M18 12l3 2v7h-3" />
    </svg>
  ),
  package: (c: string) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M16.5 9.4 7.5 4.21M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="m3.3 7 8.7 5 8.7-5M12 22V12" />
    </svg>
  ),
  pin: (c: string) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />
    </svg>
  ),
  clock: (c: string) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
    </svg>
  ),
  map: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0zM15 5.764v15M9 3.236v15" />
    </svg>
  ),
}

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

  const byParish = Object.entries(
    churches.reduce<Record<string, number>>((acc, c) => {
      acc[c.parish] = (acc[c.parish] || 0) + 1
      return acc
    }, {})
  ).sort((a, b) => b[1] - a[1])
  const maxParish = Math.max(1, ...byParish.map(([, n]) => n))

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
      <div className="min-h-dvh flex items-center justify-center bg-[#F8FAFC] text-slate-400 font-sans-pro">
        <div className="flex items-center gap-3">
          <span className="w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
          Loading dashboard…
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-[#F8FAFC] font-sans-pro text-slate-800">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white">
              {Icon.church('white')}
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight leading-none">La Guaira Distribution Network</h1>
              <p className="text-slate-400 text-xs mt-1 font-data">DASHBOARD · OVERVIEW</p>
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {Icon.map} Open Map
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-7 space-y-6">
        {/* KPI grid */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Total Churches" value={total} icon={Icon.church} tint="#2563EB" />
          <KpiCard label="Distribution Centers" value={centers.length} icon={Icon.package} tint="#ea580c" />
          <KpiCard label="Validated" value={validated} delta={`${validatedPct}%`} icon={Icon.pin} tint="#059669" />
          <KpiCard label="Pending" value={pending} delta={`${100 - validatedPct}%`} icon={Icon.clock} tint="#d97706" />
        </section>

        {/* Validation progress */}
        <section className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-end justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-700">Location Validation</h2>
              <p className="text-xs text-slate-400 mt-0.5">GPS-verified coordinates vs. parish approximations</p>
            </div>
            <span className="font-data text-2xl font-bold text-emerald-600 leading-none">{validatedPct}<span className="text-base">%</span></span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden flex">
            <div className="h-full bg-emerald-500 transition-[width] duration-700" style={{ width: `${validatedPct}%` }} />
            <div className="h-full bg-amber-400/70 transition-[width] duration-700" style={{ width: `${100 - validatedPct}%` }} />
          </div>
          <div className="flex justify-between mt-2 text-xs font-data text-slate-500">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> {validated} validated</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" /> {pending} pending</span>
          </div>
        </section>

        <div className="grid lg:grid-cols-2 gap-5">
          {/* Coverage */}
          <section className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-1">Coverage by Center</h2>
            <p className="text-xs text-slate-400 mb-4">Churches assigned to each distribution hub</p>
            <div className="space-y-3.5">
              {coverage.map(({ center, color, count }) => (
                <div key={center.id} className="group">
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: color }} />
                      <span className="font-medium text-slate-700 truncate">{center.name}</span>
                    </div>
                    <span className="font-data font-semibold text-slate-900 ml-2 tabular-nums">{count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${(count / maxCoverage) * 100}%`, background: color }} />
                  </div>
                </div>
              ))}
              {unassigned > 0 && (
                <div className="text-xs text-amber-600 pt-3 mt-1 border-t border-slate-100 font-data">
                  {unassigned} church{unassigned !== 1 ? 'es' : ''} unassigned
                </div>
              )}
            </div>
          </section>

          {/* By parish */}
          <section className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-1">Churches by Parish</h2>
            <p className="text-xs text-slate-400 mb-4">{byParish.length} parishes across La Guaira</p>
            <div className="space-y-2.5">
              {byParish.map(([parish, n]) => (
                <div key={parish} className="flex items-center gap-3">
                  <span className="text-sm text-slate-600 w-28 flex-shrink-0 truncate">{parish}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-blue-600 transition-[width] duration-700" style={{ width: `${(n / maxParish) * 100}%` }} />
                  </div>
                  <span className="font-data text-sm font-semibold text-slate-900 w-6 text-right tabular-nums">{n}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <footer className="text-center text-xs text-slate-400 font-data pt-2">
          {total} CHURCHES · {byParish.length} PARISHES · {centers.length} CENTERS
        </footer>
      </main>
    </div>
  )
}

function KpiCard({ label, value, delta, icon, tint }: {
  label: string
  value: number
  delta?: string
  icon: (c: string) => React.ReactNode
  tint: string
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 transition-shadow hover:shadow-md hover:shadow-slate-200/60">
      <div className="flex items-center justify-between mb-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${tint}14` }}>
          {icon(tint)}
        </div>
        {delta && (
          <span className="font-data text-xs font-semibold px-1.5 py-0.5 rounded" style={{ color: tint, background: `${tint}14` }}>
            {delta}
          </span>
        )}
      </div>
      <div className="font-data text-3xl font-bold text-slate-900 leading-none tabular-nums">{value}</div>
      <div className="text-xs text-slate-500 mt-1.5 font-medium">{label}</div>
    </div>
  )
}
