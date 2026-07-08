'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Church, Project, ProjectDef, ServiceRequest } from '@/lib/supabase'
import { getChurches, getAllDistributions, getRequests, getCenterProjects, getProjects } from '@/lib/offlineStore'
import { useOfflineStatus } from '@/lib/useOfflineStatus'
import { useEditRole } from '@/lib/useEditRole'
import { IconSearch, IconX, IconUser, IconCompass, IconSatelliteDish } from '@/lib/icons'
import { LOCATION_COLORS } from '@/lib/locationTypes'
import PasscodeGate from '@/components/PasscodeGate'
import NavMenu from '@/components/NavMenu'

function formatRelativeDate(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr + 'T00:00:00').getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  return `${months} month${months !== 1 ? 's' : ''} ago`
}

// Sibling of the card's <Link>, never nested inside it — nested anchors are
// invalid HTML and break hydration.
function GoogleMapsButton({ lat, lng }: { lat: number; lng: number }) {
  return (
    <a
      href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 flex-shrink-0 text-[11px] font-medium text-white bg-[#1a73e8] hover:bg-[#1765cc] px-2.5 py-1 rounded-full transition-colors whitespace-nowrap"
    >
      <IconCompass className="w-3 h-3" /> Google Maps
    </a>
  )
}

export default function InicioPage() {
  const [churches, setChurches] = useState<Church[]>([])
  const [centerProjects, setCenterProjects] = useState<Record<string, Project[]>>({})
  const [projects, setProjects] = useState<ProjectDef[]>([])
  const [lastDelivery, setLastDelivery] = useState<Record<string, string>>({})
  const [pendingRequests, setPendingRequests] = useState<Record<string, { count: number; urgent: boolean }>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const { online, pending, syncing, tileProgress } = useOfflineStatus()
  const { role, unlock, lock } = useEditRole()
  const activeProjects = projects.filter(p => p.active)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: allChurches }, { data: distributions }, { data: requests }, { data: cp }, { data: proj }] = await Promise.all([
      getChurches(), getAllDistributions(), getRequests(), getCenterProjects(), getProjects(),
    ])
    setChurches(allChurches)
    setCenterProjects(cp)
    setProjects(proj)

    const last: Record<string, string> = {}
    for (const d of distributions) {
      if (!last[d.distribution_center_id] || d.distributed_at > last[d.distribution_center_id]) {
        last[d.distribution_center_id] = d.distributed_at
      }
    }
    setLastDelivery(last)

    const pendingByChurch: Record<string, { count: number; urgent: boolean }> = {}
    for (const r of requests) {
      if (r.status !== 'pendiente') continue
      const entry = pendingByChurch[r.church_id] || { count: 0, urgent: false }
      entry.count++
      if (r.urgency === 'urgente') entry.urgent = true
      pendingByChurch[r.church_id] = entry
    }
    setPendingRequests(pendingByChurch)

    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const matchesSearch = (c: Church) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return c.name.toLowerCase().includes(q) || (c.pastor_name || '').toLowerCase().includes(q)
  }

  const centers = churches
    .filter(c => c.is_distribution_center && matchesSearch(c))
    .sort((a, b) => a.name.localeCompare(b.name))
  const hospitals = churches.filter(c => c.marker_type === 'hospital' && matchesSearch(c))
  const waterPoints = churches.filter(c => c.marker_type === 'desalinizador' && matchesSearch(c))

  return (
    <div className="min-h-dvh bg-gray-50 font-sans-pro">
      <header className="bg-navy text-white px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
          <img src="/logosp.jpg" alt="Samaritan's Purse" className="w-9 h-9 rounded-full object-cover border-2 border-white/20 flex-shrink-0" />
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-bold leading-tight truncate">La Guaira Distribution Network</h1>
            <p className="text-white/50 text-[11px] font-data uppercase tracking-wide truncate">Samaritan&apos;s Purse</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <div className={`hidden sm:flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${!online ? 'bg-red-500/20 text-red-200' : pending > 0 ? 'bg-amber-400/20 text-amber-200' : 'bg-white/10 text-white/50'}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${!online ? 'bg-red-400' : pending > 0 ? 'bg-amber-300' : 'bg-emerald-400'}`} />
            {!online ? 'Offline' : syncing ? 'Syncing…' : pending > 0 ? `${pending} pending` : tileProgress ? `Map: ${Math.round(tileProgress.done / tileProgress.total * 100)}%` : 'Online'}
          </div>
          <Link href="/mapa" className="bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap">Map</Link>
          <Link href="/choferes" className="hidden sm:inline-block bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap">Drivers</Link>
          <Link href="/solicitudes" className="hidden sm:inline-block bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap">Requests</Link>
          <Link href="/metricas" className="hidden md:inline-block bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap">Metrics</Link>
          <Link href="/catalogo" className="hidden md:inline-block bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap">Catalog</Link>
          <Link href="/dashboard" className="bg-olive hover:bg-[var(--olive-600)] px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap">Dashboard</Link>
          <NavMenu />
        </div>
      </header>

      <div className="bg-white border-b px-4 py-2.5 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"><IconSearch className="w-3.5 h-3.5" /></span>
          <input
            type="text"
            placeholder="Search center or pastor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg pl-8 pr-3 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><IconX className="w-3 h-3" /></button>
          )}
        </div>
        <PasscodeGate role={role} onUnlock={unlock} onLock={lock} />
      </div>

      <div className="max-w-3xl mx-auto p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500 font-data uppercase tracking-wide">{centers.length} distribution centers</p>
          {role === 'deposito' && (
            <Link href="/mapa?addChurch=1" className="flex items-center gap-1.5 bg-navy text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-[var(--navy-700)] transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
              Add center
            </Link>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <>
            {centers.length === 0 && hospitals.length === 0 && waterPoints.length === 0 ? (
              <p className="text-sm text-slate-400 bg-white border border-slate-200 rounded-lg px-4 py-6 text-center">No results.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {centers.map(church => {
                  const churchProjectKeys = centerProjects[church.id] || []
                  const last = lastDelivery[church.id]
                  const pendingInfo = pendingRequests[church.id]
                  return (
                    <div key={church.id} className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all flex flex-col">
                      <Link href={`/mapa?center=${church.id}`} className="block p-4 pb-2 flex-1">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h2 className="font-bold text-slate-800 text-sm leading-tight">{church.name}</h2>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {church.has_starlink && (
                              <span title="Starlink equipped" className="flex items-center gap-1 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full whitespace-nowrap bg-blue-100 text-blue-700">
                                <IconSatelliteDish className="w-3 h-3" /> Starlink
                              </span>
                            )}
                            {pendingInfo && (
                              <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full whitespace-nowrap ${pendingInfo.urgent ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                {pendingInfo.count} request{pendingInfo.count !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                        {church.pastor_name && (
                          <p className="flex items-center gap-1 text-xs text-slate-500 mb-2"><IconUser className="w-3 h-3" /> {church.pastor_name} · {church.parish}</p>
                        )}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {activeProjects.map(project => {
                            const on = churchProjectKeys.includes(project.key)
                            return (
                              <span
                                key={project.key}
                                className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${on ? 'text-white' : 'bg-slate-100 text-slate-400'}`}
                                style={on ? { background: project.color } : undefined}
                              >
                                {project.label}
                              </span>
                            )
                          })}
                        </div>
                      </Link>
                      <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-1">
                        <p className="text-xs text-slate-400 font-data truncate">
                          {last ? `Last delivery: ${formatRelativeDate(last)}` : 'No deliveries recorded'}
                        </p>
                        {church.lat && church.lng && <GoogleMapsButton lat={Number(church.lat)} lng={Number(church.lng)} />}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {hospitals.length > 0 && (
              <>
                <p className="text-xs text-slate-500 font-data uppercase tracking-wide pt-3">Field hospital</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {hospitals.map(h => (
                    <div key={h.id} className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all flex flex-col">
                      <Link href={`/mapa?center=${h.id}`} className="block p-4 pb-2 flex-1">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="w-6 h-6 rounded-full bg-white border-2 border-red-600 flex items-center justify-center flex-shrink-0">
                            <svg viewBox="0 0 24 24" className="w-3 h-3"><rect x="10" y="3" width="4" height="18" rx="1" fill="#dc2626" /><rect x="3" y="10" width="18" height="4" rx="1" fill="#dc2626" /></svg>
                          </span>
                          <h2 className="font-bold text-slate-800 text-sm leading-tight">{h.name}</h2>
                        </div>
                        <p className="text-xs text-slate-500">{h.parish}{h.notes ? ` · ${h.notes}` : ''}</p>
                      </Link>
                      <div className="flex items-center justify-end px-4 pb-3 pt-1">
                        {h.lat && h.lng && <GoogleMapsButton lat={Number(h.lat)} lng={Number(h.lng)} />}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {waterPoints.length > 0 && (
              <>
                <p className="text-xs text-slate-500 font-data uppercase tracking-wide pt-3">Water points</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {waterPoints.map(w => (
                    <div key={w.id} className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all flex flex-col">
                      <Link href={`/mapa?center=${w.id}`} className="block p-4 pb-2 flex-1">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: LOCATION_COLORS.desalinizador }}>
                            <svg viewBox="0 0 100 100" className="w-3.5 h-3.5"><path d="M50 16 C66 34 78 48 78 60 A32 32 0 0 1 22 60 C22 48 34 34 50 16 Z" fill="#fff" /></svg>
                          </span>
                          <h2 className="font-bold text-slate-800 text-sm leading-tight">{w.name}</h2>
                        </div>
                        <p className="text-xs text-slate-500">{w.parish}{w.notes ? ` · ${w.notes}` : ''}</p>
                      </Link>
                      <div className="flex items-center justify-end px-4 pb-3 pt-1">
                        {w.lat && w.lng && <GoogleMapsButton lat={Number(w.lat)} lng={Number(w.lng)} />}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
