'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Church, Project, ProjectDef, ServiceRequest } from '@/lib/supabase'
import { getChurches, getAllDistributions, getRequests, getCenterProjects, getProjects } from '@/lib/offlineStore'
import { useOfflineStatus } from '@/lib/useOfflineStatus'
import { useEditRole } from '@/lib/useEditRole'
import { IconSearch, IconX, IconUser } from '@/lib/icons'
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
    setChurches(allChurches.filter(c => c.is_distribution_center))
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

  const filtered = churches
    .filter(c => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return c.name.toLowerCase().includes(q) || (c.pastor_name || '').toLowerCase().includes(q)
    })
    .sort((a, b) => a.name.localeCompare(b.name))

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
          <p className="text-xs text-slate-500 font-data uppercase tracking-wide">{filtered.length} distribution centers</p>
          {role === 'deposito' && (
            <Link href="/mapa?addChurch=1" className="flex items-center gap-1.5 bg-navy text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-[var(--navy-700)] transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
              Add center
            </Link>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-400 bg-white border border-slate-200 rounded-lg px-4 py-6 text-center">No results.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map(church => {
              const churchProjectKeys = centerProjects[church.id] || []
              const last = lastDelivery[church.id]
              const pendingInfo = pendingRequests[church.id]
              return (
                <Link
                  key={church.id}
                  href={`/mapa?center=${church.id}`}
                  className="bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-300 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h2 className="font-bold text-slate-800 text-sm leading-tight">{church.name}</h2>
                    {pendingInfo && (
                      <span className={`flex-shrink-0 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full whitespace-nowrap ${pendingInfo.urgent ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {pendingInfo.count} request{pendingInfo.count !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {church.pastor_name && (
                    <p className="flex items-center gap-1 text-xs text-slate-500 mb-2"><IconUser className="w-3 h-3" /> {church.pastor_name} · {church.parish}</p>
                  )}
                  <div className="flex items-center gap-1.5 flex-wrap mb-2">
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
                  <p className="text-xs text-slate-400 font-data">
                    {last ? `Last delivery: ${formatRelativeDate(last)}` : 'No deliveries recorded'}
                  </p>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
