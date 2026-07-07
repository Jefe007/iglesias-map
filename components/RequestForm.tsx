'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Church, Item, Project, ProjectDef, Urgency } from '@/lib/supabase'
import { createRequest } from '@/lib/api'
import { getItems, getProjects } from '@/lib/offlineStore'
import { IconX } from '@/lib/icons'
import { useFocusTrap } from '@/lib/useFocusTrap'

interface Props {
  centers: Church[]
  defaultCenterId?: string
  onClose: () => void
  onSaved: () => void
}

export default function RequestForm({ centers, defaultCenterId, onClose, onSaved }: Props) {
  const [churchId, setChurchId] = useState(defaultCenterId || '')
  const [project, setProject] = useState<Project>('')
  const [itemId, setItemId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [urgency, setUrgency] = useState<Urgency>('normal')
  const [note, setNote] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [projects, setProjects] = useState<ProjectDef[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { getItems().then(({ data }) => setItems(data.filter(i => i.active))) }, [])
  useEffect(() => {
    getProjects().then(({ data }) => {
      const active = data.filter(p => p.active)
      setProjects(active)
      setProject(prev => prev || active[0]?.key || '')
    })
  }, [])

  const handleEscape = useCallback(() => { if (!saving) onClose() }, [saving, onClose])
  const modalRef = useFocusTrap<HTMLDivElement>(handleEscape)

  const lineItems = items.filter(i => i.project === project)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!churchId || !itemId) { setError('Select the center and the item'); return }
    setSaving(true)
    setError(null)
    try {
      await createRequest({
        church_id: churchId,
        project,
        item_id: itemId,
        quantity_needed: quantity ? Number(quantity) : null,
        note: note.trim() || null,
        urgency,
      })
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1450] flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={!saving ? onClose : undefined} />
      <div ref={modalRef} className="relative bg-white w-full md:w-[420px] max-h-[88dvh] rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="bg-navy text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
          <h2 className="font-bold font-sans-pro">New request</h2>
          <button onClick={onClose} disabled={saving} aria-label="Close" className="text-white/70 hover:text-white"><IconX className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="overflow-y-auto flex-1 p-4 space-y-4">
            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}

            <label className="block">
              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Distribution center</div>
              <select required value={churchId} onChange={e => setChurchId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--olive)]">
                <option value="">Select…</option>
                {centers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.parish})</option>)}
              </select>
            </label>

            <div className="flex gap-2">
              <label className="block flex-1">
                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Project</div>
                <select value={project} onChange={e => { setProject(e.target.value); setItemId('') }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--olive)]">
                  {projects.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </label>
              <label className="block flex-1">
                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Item</div>
                <select required value={itemId} onChange={e => setItemId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--olive)]">
                  <option value="">Select…</option>
                  {lineItems.map(it => <option key={it.id} value={it.id}>{it.name} ({it.unit})</option>)}
                </select>
              </label>
            </div>

            <label className="block">
              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Approximate quantity</div>
              <input
                type="number" min="0" step="any"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                placeholder="Optional"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--olive)]"
              />
            </label>

            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Urgency</div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setUrgency('normal')} className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${urgency === 'normal' ? 'bg-navy text-white border-navy' : 'border-gray-300 text-gray-600'}`}>
                  Normal
                </button>
                <button type="button" onClick={() => setUrgency('urgente')} className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${urgency === 'urgente' ? 'bg-red-600 text-white border-red-600' : 'border-gray-300 text-gray-600'}`}>
                  Urgent
                </button>
              </div>
            </div>

            <label className="block">
              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Note</div>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={2}
                placeholder="Additional context (optional)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--olive)]"
              />
            </label>
          </div>

          <div className="border-t p-4 flex gap-2 flex-shrink-0">
            <button type="button" onClick={onClose} disabled={saving} className="flex-1 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 py-2 rounded-lg bg-navy text-white text-sm font-medium hover:bg-[var(--navy-700)] transition-colors disabled:opacity-50">
              {saving ? 'Saving…' : 'Create request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
