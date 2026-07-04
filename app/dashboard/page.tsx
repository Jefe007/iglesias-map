'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Church, Distribution } from '@/lib/supabase'
import { getChurches, getAllDistributions } from '@/lib/offlineStore'

type DistributionWithCenter = Distribution & { center: { name: string; parish: string } | null }

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
  users: (c: string) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
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
  const [distributions, setDistributions] = useState<DistributionWithCenter[]>([])

  useEffect(() => {
    getChurches().then(({ data }) => {
      setChurches(data)
      setLoading(false)
    })
    Promise.all([getAllDistributions(), getChurches()]).then(([distResult, churchResult]) => {
      const centerById = new Map(churchResult.data.map(c => [c.id, { name: c.name, parish: c.parish }]))
      setDistributions(distResult.data.map(d => ({ ...d, center: centerById.get(d.distribution_center_id) || null })))
    })
  }, [])

  const hospital = churches.find(c => c.marker_type === 'hospital') || null
  const churchRecords = churches.filter(c => c.marker_type !== 'hospital')

  const total = churchRecords.length
  const centers = churchRecords.filter(c => c.is_distribution_center)
  const regular = churchRecords.filter(c => !c.is_distribution_center)
  const validated = churchRecords.filter(c => c.geocode_status === 'validado').length
  const pending = total - validated
  const validatedPct = total ? Math.round((validated / total) * 100) : 0

  const byParish = Object.entries(
    churchRecords.reduce<Record<string, number>>((acc, c) => {
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

  const totalDistributions = distributions.length
  const totalFamiliesServed = distributions.reduce((sum, d) => sum + (d.families_served || 0), 0)
  const recentDistributions = distributions.slice(0, 8)

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#F8FAFC] text-slate-400 font-sans-pro">
        <div className="flex items-center gap-3">
          <span className="w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
          Cargando panel…
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-[#F8FAFC] font-sans-pro text-slate-800">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/logosp.jpg" alt="Samaritan's Purse" className="w-10 h-10 rounded-full object-cover border border-slate-200 flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold tracking-tight leading-none text-navy truncate">Red de Distribución La Guaira</h1>
              <p className="text-slate-400 text-xs mt-1 font-data truncate">SAMARITAN&apos;S PURSE · PANEL</p>
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-navy hover:bg-[var(--navy-700)] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--olive)] focus-visible:ring-offset-2 flex-shrink-0"
          >
            {Icon.map} Abrir Mapa
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-7 space-y-6">
        {/* KPI grid */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Total de Iglesias" value={total} icon={Icon.church} tint="#1b2a4a" />
          <KpiCard label="Centros de Distribución" value={centers.length} icon={Icon.package} tint="#ea580c" />
          <KpiCard label="Validadas" value={validated} delta={`${validatedPct}%`} icon={Icon.pin} tint="#059669" />
          <KpiCard label="Pendientes" value={pending} delta={`${100 - validatedPct}%`} icon={Icon.clock} tint="#d97706" />
        </section>

        {/* Validation progress */}
        <section className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-end justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-700">Validación de Ubicación</h2>
              <p className="text-xs text-slate-400 mt-0.5">Coordenadas verificadas por GPS vs. aproximaciones por parroquia</p>
            </div>
            <span className="font-data text-2xl font-bold text-emerald-600 leading-none">{validatedPct}<span className="text-base">%</span></span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden flex">
            <div className="h-full bg-emerald-500 transition-[width] duration-700" style={{ width: `${validatedPct}%` }} />
            <div className="h-full bg-amber-400/70 transition-[width] duration-700" style={{ width: `${100 - validatedPct}%` }} />
          </div>
          <div className="flex justify-between mt-2 text-xs font-data text-slate-500">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> {validated} validadas</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" /> {pending} pendientes</span>
          </div>
        </section>

        {/* Field hospital highlight */}
        {hospital && (
          <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex flex-col sm:flex-row">
              {hospital.image_url && (
                <div className="sm:w-72 sm:flex-shrink-0 h-44 sm:h-auto relative">
                  <img src={hospital.image_url} alt={hospital.name}
                    onError={e => { e.currentTarget.style.display = 'none' }}
                    className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-5 flex-1 flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <img src="/logosp.jpg" alt="Samaritan's Purse"
                    className="w-8 h-8 rounded-full object-cover border border-slate-200" />
                  <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[#80873318] text-[#5f6526]">
                    Hospital de Campaña
                  </span>
                </div>
                <h2 className="text-base font-bold text-slate-900">{hospital.name}</h2>
                <p className="text-sm text-slate-500 mt-1">{hospital.notes}</p>
                <div className="mt-auto pt-4 grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-lg px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Parroquia</div>
                    <div className="text-sm text-slate-700">{hospital.parish}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Coordenadas</div>
                    <div className="text-sm text-slate-700 font-data">{Number(hospital.lat).toFixed(4)}, {Number(hospital.lng).toFixed(4)}</div>
                  </div>
                </div>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${hospital.lat},${hospital.lng}`}
                  target="_blank" rel="noreferrer"
                  className="mt-3 inline-flex items-center justify-center gap-2 bg-[#808733] hover:bg-[#6b7029] text-white text-sm font-medium py-2 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#808733] focus-visible:ring-offset-2"
                >
                  {Icon.pin('white')} Abrir en Google Maps
                </a>
              </div>
            </div>
          </section>
        )}

        {/* Distribution log */}
        <section className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-1">Ayuda Entregada</h2>
          <p className="text-xs text-slate-400 mb-4">Registro de entregas de alimentos y agua en los centros de distribución</p>
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div className="bg-slate-50 rounded-lg p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#ea580c14' }}>
                {Icon.package('#ea580c')}
              </div>
              <div>
                <div className="font-data text-2xl font-bold text-slate-900 leading-none tabular-nums">{totalDistributions}</div>
                <div className="text-xs text-slate-500 mt-1">Entregas registradas</div>
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#05966914' }}>
                {Icon.users('#059669')}
              </div>
              <div>
                <div className="font-data text-2xl font-bold text-slate-900 leading-none tabular-nums">{totalFamiliesServed}</div>
                <div className="text-xs text-slate-500 mt-1">Familias atendidas</div>
              </div>
            </div>
          </div>
          {recentDistributions.length === 0 ? (
            <p className="text-xs text-slate-400">Aún no se han registrado entregas. Se registran desde el mapa, al seleccionar un centro de distribución en modo edición.</p>
          ) : (
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Entregas recientes</div>
              {recentDistributions.map(d => (
                <div key={d.id} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 last:border-0">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{d.center?.name || 'Centro desconocido'}</div>
                    <div className="text-xs text-slate-500 truncate">{d.items}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs font-data text-slate-500">
                      {new Date(d.distributed_at + 'T00:00:00').toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })}
                    </div>
                    {d.families_served != null && (
                      <div className="text-xs text-slate-400">{d.families_served} familias</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="grid lg:grid-cols-2 gap-5">
          {/* Coverage */}
          <section className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-1">Cobertura por Centro</h2>
            <p className="text-xs text-slate-400 mb-4">Iglesias asignadas a cada centro de distribución</p>
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
                  {unassigned} iglesia{unassigned !== 1 ? 's' : ''} sin asignar
                </div>
              )}
            </div>
          </section>

          {/* By parish */}
          <section className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-1">Iglesias por Parroquia</h2>
            <p className="text-xs text-slate-400 mb-4">{byParish.length} parroquias en La Guaira</p>
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
          {total} IGLESIAS · {byParish.length} PARROQUIAS · {centers.length} CENTROS
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
