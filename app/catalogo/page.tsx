'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Item, Project, Unit, PROJECT_LABELS, PROJECT_COLORS } from '@/lib/supabase'
import { getItems } from '@/lib/offlineStore'
import { createItem, updateItem } from '@/lib/api'
import { useEditRole } from '@/lib/useEditRole'
import { showToast } from '@/lib/toast'
import PasscodeGate from '@/components/PasscodeGate'
import NavMenu from '@/components/NavMenu'

const PROJECTS: Project[] = ['water', 'food', 'nfi']
const UNITS: Unit[] = ['litros', 'kg', 'unidades', 'cajas', 'paquetes']
const UNIT_LABELS: Record<Unit, string> = { litros: 'Liters', kg: 'Kg', unidades: 'Units', cajas: 'Boxes', paquetes: 'Packages' }

function EditItemRow({ item, onSaved, onCancel }: { item: Item; onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState(item.name)
  const [unit, setUnit] = useState<Unit>(item.unit)
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await updateItem(item.id, { name, unit })
      showToast('Item updated')
      onSaved()
    } catch (err) {
      showToast((err as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 py-2 px-3 bg-blue-50/50">
      <input value={name} onChange={e => setName(e.target.value)} required
        className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <select value={unit} onChange={e => setUnit(e.target.value as Unit)}
        className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
        {UNITS.map(u => <option key={u} value={u}>{UNIT_LABELS[u]}</option>)}
      </select>
      <button type="submit" disabled={saving} className="text-xs px-2.5 py-1 rounded-md bg-navy text-white font-medium disabled:opacity-50">
        {saving ? '…' : 'Save'}
      </button>
      <button type="button" onClick={onCancel} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
    </form>
  )
}

function AddItemForm({ defaultProject, onSaved, onCancel }: { defaultProject: Project; onSaved: () => void; onCancel: () => void }) {
  const [project, setProject] = useState<Project>(defaultProject)
  const [name, setName] = useState('')
  const [unit, setUnit] = useState<Unit>('unidades')
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await createItem({ project, name, unit })
      showToast('Item added')
      onSaved()
    } catch (err) {
      showToast((err as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 py-3 px-3 bg-gray-50 border-t border-gray-100">
      <select value={project} onChange={e => setProject(e.target.value as Project)}
        className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
        {PROJECTS.map(p => <option key={p} value={p}>{PROJECT_LABELS[p]}</option>)}
      </select>
      <input value={name} onChange={e => setName(e.target.value)} required autoFocus
        placeholder="Item name" className="flex-1 min-w-[140px] border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <select value={unit} onChange={e => setUnit(e.target.value as Unit)}
        className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
        {UNITS.map(u => <option key={u} value={u}>{UNIT_LABELS[u]}</option>)}
      </select>
      <button type="submit" disabled={saving} className="text-sm px-3 py-1.5 rounded-lg bg-navy text-white font-medium disabled:opacity-50">
        {saving ? 'Saving…' : 'Add'}
      </button>
      <button type="button" onClick={onCancel} className="text-sm text-slate-400 hover:text-slate-600">Cancel</button>
    </form>
  )
}

export default function CatalogoPage() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addingProject, setAddingProject] = useState<Project | null>(null)
  const { role, unlock, lock } = useEditRole()
  const canEdit = role === 'deposito'

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const { data } = await getItems()
    setItems(data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  const toggleActive = async (item: Item) => {
    try {
      await updateItem(item.id, { active: !item.active })
      showToast(item.active ? 'Item deactivated' : 'Item reactivated')
      fetchItems()
    } catch (err) {
      showToast((err as Error).message, 'error')
    }
  }

  return (
    <div className="min-h-dvh bg-gray-50 font-sans-pro">
      <header className="bg-navy text-white px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/" className="text-white/70 hover:text-white text-sm flex-shrink-0">← Home</Link>
          <h1 className="text-sm sm:text-base font-bold truncate">Item Catalog</h1>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <PasscodeGate role={role} onUnlock={unlock} onLock={lock} />
          <NavMenu />
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-5">
        {!canEdit && (
          <p className="text-xs text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-2">
            Read-only. Unlock with the Warehouse/Admin passcode to add, edit, or deactivate items.
          </p>
        )}

        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          PROJECTS.map(project => {
            const projectItems = items
              .filter(i => i.project === project && (showInactive || i.active))
              .sort((a, b) => a.name.localeCompare(b.name))
            return (
              <section key={project} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PROJECT_COLORS[project] }} />
                  <h2 className="font-bold text-sm text-slate-800 flex-1">{PROJECT_LABELS[project]}</h2>
                  {canEdit && (
                    <button onClick={() => setAddingProject(project)} className="flex items-center gap-1 text-xs font-medium text-[var(--olive)] hover:underline">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                      Add item
                    </button>
                  )}
                </div>

                {projectItems.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-slate-400">No items yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {projectItems.map(item => (
                      editingId === item.id ? (
                        <EditItemRow key={item.id} item={item} onSaved={() => { setEditingId(null); fetchItems() }} onCancel={() => setEditingId(null)} />
                      ) : (
                        <div key={item.id} className={`flex items-center gap-2 px-4 py-2.5 ${!item.active ? 'opacity-50' : ''}`}>
                          <span className="text-sm text-slate-800 flex-1">{item.name}</span>
                          <span className="text-xs font-data text-slate-400">{UNIT_LABELS[item.unit]}</span>
                          {!item.active && <span className="text-[10px] uppercase font-semibold text-slate-400">Deactivated</span>}
                          {canEdit && (
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button onClick={() => setEditingId(item.id)} className="text-xs text-slate-400 hover:text-slate-700">Edit</button>
                              <button onClick={() => toggleActive(item)} className={`text-xs ${item.active ? 'text-red-500 hover:text-red-700' : 'text-emerald-600 hover:text-emerald-800'}`}>
                                {item.active ? 'Deactivate' : 'Reactivate'}
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    ))}
                  </div>
                )}

                {addingProject === project && (
                  <AddItemForm defaultProject={project} onSaved={() => { setAddingProject(null); fetchItems() }} onCancel={() => setAddingProject(null)} />
                )}
              </section>
            )
          })
        )}

        <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="w-3.5 h-3.5" />
          Show deactivated items
        </label>
      </div>
    </div>
  )
}
