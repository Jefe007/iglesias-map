'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Church, Item, Project, ServiceRequest, RequestStatus, PROJECT_LABELS, PROJECT_COLORS } from '@/lib/supabase'
import { getChurches, getItems, getRequests } from '@/lib/offlineStore'
import { updateRequestStatus } from '@/lib/api'
import { useEditRole } from '@/lib/useEditRole'
import { showToast } from '@/lib/toast'
import PasscodeGate from '@/components/PasscodeGate'
import RequestForm from '@/components/RequestForm'

const PROJECTS: Project[] = ['water', 'food', 'nfi']
const STATUSES: RequestStatus[] = ['pendiente', 'preparada', 'entregada']
const STATUS_LABELS: Record<RequestStatus, string> = { pendiente: 'Pending', preparada: 'Prepared', entregada: 'Delivered' }
const NEXT_STATUS: Record<RequestStatus, RequestStatus | null> = { pendiente: 'preparada', preparada: 'entregada', entregada: null }
const NEXT_LABEL: Record<RequestStatus, string> = { pendiente: 'Mark prepared', preparada: 'Mark delivered', entregada: '' }

export default function SolicitudesPage() {
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [churches, setChurches] = useState<Church[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [statusTab, setStatusTab] = useState<RequestStatus>('pendiente')
  const [filterCenter, setFilterCenter] = useState('')
  const [filterProject, setFilterProject] = useState<Project | ''>('')
  const [formOpen, setFormOpen] = useState(false)
  const { role, unlock, lock } = useEditRole()
  const canCreate = role !== null
  const canResolve = role === 'deposito'

  const centers = churches.filter(c => c.is_distribution_center)
  const churchName = (id: string) => churches.find(c => c.id === id)?.name || '—'
  const itemInfo = (id: string) => items.find(i => i.id === id)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: reqs }, { data: ch }, { data: it }] = await Promise.all([getRequests(), getChurches(), getItems()])
    setRequests(reqs)
    setChurches(ch)
    setItems(it)
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const advance = async (r: ServiceRequest) => {
    const next = NEXT_STATUS[r.status]
    if (!next) return
    try {
      await updateRequestStatus(r.id, next)
      showToast(next === 'preparada' ? 'Marked as prepared' : 'Marked as delivered')
      fetchAll()
    } catch (e) {
      showToast((e as Error).message, 'error')
    }
  }

  const countFor = (s: RequestStatus) => requests.filter(r => r.status === s).length

  const filtered = requests
    .filter(r => r.status === statusTab)
    .filter(r => !filterCenter || r.church_id === filterCenter)
    .filter(r => !filterProject || r.project === filterProject)
    .sort((a, b) => {
      if (a.urgency !== b.urgency) return a.urgency === 'urgente' ? -1 : 1
      return a.created_at.localeCompare(b.created_at)
    })

  return (
    <div className="min-h-dvh bg-gray-50 font-sans-pro">
      <header className="bg-navy text-white px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/" className="text-white/70 hover:text-white text-sm flex-shrink-0">← Home</Link>
          <h1 className="text-sm sm:text-base font-bold truncate">Requests</h1>
        </div>
        <PasscodeGate role={role} onUnlock={unlock} onLock={lock} />
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1">
            {STATUSES.map(s => (
              <button
                key={s}
                onClick={() => setStatusTab(s)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${statusTab === s ? 'bg-navy text-white' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                {STATUS_LABELS[s]} <span className="font-data">({countFor(s)})</span>
              </button>
            ))}
          </div>
          {canCreate && (
            <button onClick={() => setFormOpen(true)} className="ml-auto flex items-center gap-1.5 bg-navy text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-[var(--navy-700)] transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
              New request
            </button>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          <select value={filterCenter} onChange={e => setFilterCenter(e.target.value)} className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All centers</option>
            {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={filterProject} onChange={e => setFilterProject(e.target.value as Project | '')} className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All projects</option>
            {PROJECTS.map(p => <option key={p} value={p}>{PROJECT_LABELS[p]}</option>)}
          </select>
        </div>

        {!canCreate && (
          <p className="text-xs text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-2">
            Read-only. Unlock with your passcode to create requests (Supervision) or resolve them (Warehouse/Admin).
          </p>
        )}

        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-400 bg-white border border-slate-200 rounded-lg px-4 py-6 text-center">
            No {STATUS_LABELS[statusTab].toLowerCase()} requests.
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map(r => {
              const item = itemInfo(r.item_id)
              return (
                <div key={r.id} className={`bg-white rounded-xl border p-3.5 ${r.urgency === 'urgente' ? 'border-red-300' : 'border-slate-200'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PROJECT_COLORS[r.project] }} />
                        <span className="font-bold text-sm text-slate-800">{item?.name || 'Item'}</span>
                        {r.quantity_needed != null && <span className="text-xs font-data text-slate-500">{r.quantity_needed} {item?.unit}</span>}
                        {r.urgency === 'urgente' && <span className="text-[10px] font-semibold uppercase bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">Urgent</span>}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{churchName(r.church_id)}</div>
                      {r.note && <div className="text-xs text-slate-400 mt-1">{r.note}</div>}
                    </div>
                    {canResolve && NEXT_STATUS[r.status] && (
                      <button onClick={() => advance(r)} className="text-xs font-medium text-[var(--olive)] hover:underline whitespace-nowrap flex-shrink-0">
                        {NEXT_LABEL[r.status]}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {formOpen && (
        <RequestForm centers={centers} onClose={() => setFormOpen(false)} onSaved={() => { showToast('Request created'); setFormOpen(false); fetchAll() }} />
      )}
    </div>
  )
}
