'use client'

import { useCallback, useState } from 'react'
import type { Church } from '@/lib/supabase'
import { createDistribution } from '@/lib/api'
import { IconX } from '@/lib/icons'
import { useFocusTrap } from '@/lib/useFocusTrap'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

interface Props {
  center: Church
  onClose: () => void
  onSaved: () => void
}

export default function DistributionForm({ center, onClose, onSaved }: Props) {
  const [distributedAt, setDistributedAt] = useState(todayIso())
  const [items, setItems] = useState('')
  const [familiesServed, setFamiliesServed] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleEscape = useCallback(() => { if (!saving) onClose() }, [saving, onClose])
  const modalRef = useFocusTrap<HTMLDivElement>(handleEscape)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!items.trim()) return
    setSaving(true)
    setError(null)
    try {
      await createDistribution({
        distribution_center_id: center.id,
        distributed_at: distributedAt,
        items: items.trim(),
        families_served: familiesServed ? Number(familiesServed) : null,
        notes: notes.trim() || null,
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
          <div>
            <h2 className="font-bold font-sans-pro">Registrar entrega</h2>
            <p className="text-white/60 text-xs mt-0.5">{center.name}</p>
          </div>
          <button onClick={onClose} disabled={saving} aria-label="Cerrar" className="text-white/70 hover:text-white"><IconX className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="overflow-y-auto flex-1 p-4 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>
            )}

            <label className="block">
              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Fecha</div>
              <input
                type="date"
                required
                value={distributedAt}
                onChange={e => setDistributedAt(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--olive)]"
              />
            </label>

            <label className="block">
              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">¿Qué se entregó? *</div>
              <textarea
                required
                value={items}
                onChange={e => setItems(e.target.value)}
                rows={3}
                placeholder="Ej: 50 cajas de agua, 30 bolsas de arroz"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--olive)]"
              />
            </label>

            <label className="block">
              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Familias atendidas</div>
              <input
                type="number"
                min="0"
                step="1"
                value={familiesServed}
                onChange={e => setFamiliesServed(e.target.value)}
                placeholder="Ej: 45"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--olive)]"
              />
            </label>

            <label className="block">
              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Notas</div>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--olive)]"
              />
            </label>
          </div>

          <div className="border-t p-4 flex gap-2 flex-shrink-0">
            <button type="button" onClick={onClose} disabled={saving} className="flex-1 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="flex-1 py-2 rounded-lg bg-navy text-white text-sm font-medium hover:bg-[var(--navy-700)] transition-colors disabled:opacity-50">
              {saving ? 'Guardando…' : 'Guardar entrega'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
