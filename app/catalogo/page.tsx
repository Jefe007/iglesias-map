'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Item, ProjectDef, Unit, PROJECT_COLOR_PALETTE } from '@/lib/supabase'
import { getItems, getProjects } from '@/lib/offlineStore'
import { createItem, updateItem, createProject, updateProject } from '@/lib/api'
import { useEditRole } from '@/lib/useEditRole'
import { showToast } from '@/lib/toast'
import PasscodeGate from '@/components/PasscodeGate'
import NavMenu from '@/components/NavMenu'

const UNITS: Unit[] = ['litros', 'kg', 'unidades', 'cajas', 'paquetes']
const UNIT_LABELS: Record<Unit, string> = { litros: 'Liters', kg: 'Kg', unidades: 'Units', cajas: 'Boxes', paquetes: 'Packages' }

function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

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

function AddItemForm({ projects, defaultProjectKey, onSaved, onCancel }: {
  projects: ProjectDef[]; defaultProjectKey: string; onSaved: () => void; onCancel: () => void
}) {
  const [project, setProject] = useState(defaultProjectKey)
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
      <select value={project} onChange={e => setProject(e.target.value)}
        className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
        {projects.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
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

function ColorSwatches({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {PROJECT_COLOR_PALETTE.map(color => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          aria-label={`Color ${color}`}
          className={`w-5 h-5 rounded-full flex-shrink-0 border-2 transition-transform ${value === color ? 'border-slate-700 scale-110' : 'border-transparent'}`}
          style={{ background: color }}
        />
      ))}
    </div>
  )
}

function EditProjectRow({ project, onSaved, onCancel }: { project: ProjectDef; onSaved: () => void; onCancel: () => void }) {
  const [label, setLabel] = useState(project.label)
  const [color, setColor] = useState(project.color)
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await updateProject(project.key, { label, color })
      showToast('Project updated')
      onSaved()
    } catch (err) {
      showToast((err as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-blue-50/50">
      <input value={label} onChange={e => setLabel(e.target.value)} required
        className="flex-1 min-w-[100px] border border-gray-300 rounded-md px-2 py-1 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <ColorSwatches value={color} onChange={setColor} />
      <button type="submit" disabled={saving} className="text-xs px-2.5 py-1 rounded-md bg-navy text-white font-medium disabled:opacity-50 flex-shrink-0">
        {saving ? '…' : 'Save'}
      </button>
      <button type="button" onClick={onCancel} className="text-xs text-slate-400 hover:text-slate-600 flex-shrink-0">Cancel</button>
    </form>
  )
}

function AddProjectForm({ existingKeys, nextSortOrder, onSaved, onCancel }: {
  existingKeys: Set<string>; nextSortOrder: number; onSaved: () => void; onCancel: () => void
}) {
  const [label, setLabel] = useState('')
  const [color, setColor] = useState(PROJECT_COLOR_PALETTE[0])
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const key = slugify(label)
    if (!key) { showToast('Enter a project name', 'error'); return }
    if (existingKeys.has(key)) { showToast('A project with that name already exists', 'error'); return }
    setSaving(true)
    try {
      await createProject({ key, label: label.trim(), color, sort_order: nextSortOrder })
      showToast('Project added')
      onSaved()
    } catch (err) {
      showToast((err as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-3 bg-white rounded-xl border border-dashed border-slate-300 p-4">
      <input value={label} onChange={e => setLabel(e.target.value)} required autoFocus
        placeholder="New project name (e.g. Shelters)"
        className="flex-1 min-w-[160px] border border-gray-300 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <ColorSwatches value={color} onChange={setColor} />
      <button type="submit" disabled={saving} className="text-sm px-3 py-1.5 rounded-lg bg-navy text-white font-medium disabled:opacity-50">
        {saving ? 'Adding…' : 'Add project'}
      </button>
      <button type="button" onClick={onCancel} className="text-sm text-slate-400 hover:text-slate-600">Cancel</button>
    </form>
  )
}

export default function CatalogoPage() {
  const [projects, setProjects] = useState<ProjectDef[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingProjectKey, setEditingProjectKey] = useState<string | null>(null)
  const [addingProject, setAddingProject] = useState<string | null>(null)
  const [addingNewProject, setAddingNewProject] = useState(false)
  const { role, unlock, lock } = useEditRole()
  const canEdit = role === 'deposito'

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: proj }, { data: it }] = await Promise.all([getProjects(), getItems()])
    setProjects(proj)
    setItems(it)
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const visibleProjects = useMemo(
    () => projects.filter(p => showInactive || p.active),
    [projects, showInactive]
  )
  const activeProjects = useMemo(() => projects.filter(p => p.active), [projects])
  const nextSortOrder = useMemo(() => Math.max(0, ...projects.map(p => p.sort_order)) + 1, [projects])
  const existingKeys = useMemo(() => new Set(projects.map(p => p.key)), [projects])

  const toggleItemActive = async (item: Item) => {
    try {
      await updateItem(item.id, { active: !item.active })
      showToast(item.active ? 'Item deactivated' : 'Item reactivated')
      fetchAll()
    } catch (err) {
      showToast((err as Error).message, 'error')
    }
  }

  const toggleProjectActive = async (project: ProjectDef) => {
    try {
      await updateProject(project.key, { active: !project.active })
      showToast(project.active ? 'Project deactivated' : 'Project reactivated')
      fetchAll()
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
            Read-only. Unlock with the Warehouse/Admin passcode to add, edit, or deactivate projects and items.
          </p>
        )}

        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <>
            {visibleProjects.map(project => {
              const projectItems = items
                .filter(i => i.project === project.key && (showInactive || i.active))
                .sort((a, b) => a.name.localeCompare(b.name))
              return (
                <section key={project.key} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  {editingProjectKey === project.key ? (
                    <EditProjectRow project={project} onSaved={() => { setEditingProjectKey(null); fetchAll() }} onCancel={() => setEditingProjectKey(null)} />
                  ) : (
                    <div className={`flex items-center gap-2 px-4 py-3 border-b border-slate-100 ${!project.active ? 'opacity-50' : ''}`}>
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: project.color }} />
                      <h2 className="font-bold text-sm text-slate-800 flex-1">{project.label}</h2>
                      {!project.active && <span className="text-[10px] uppercase font-semibold text-slate-400">Deactivated</span>}
                      {canEdit && (
                        <div className="flex items-center gap-2.5 flex-shrink-0">
                          {project.active && (
                            <button onClick={() => setAddingProject(project.key)} className="flex items-center gap-1 text-xs font-medium text-[var(--olive)] hover:underline">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                              Add item
                            </button>
                          )}
                          <button onClick={() => setEditingProjectKey(project.key)} className="text-xs text-slate-400 hover:text-slate-700">Edit</button>
                          <button onClick={() => toggleProjectActive(project)} className={`text-xs ${project.active ? 'text-red-500 hover:text-red-700' : 'text-emerald-600 hover:text-emerald-800'}`}>
                            {project.active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {projectItems.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-slate-400">No items yet.</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {projectItems.map(item => (
                        editingId === item.id ? (
                          <EditItemRow key={item.id} item={item} onSaved={() => { setEditingId(null); fetchAll() }} onCancel={() => setEditingId(null)} />
                        ) : (
                          <div key={item.id} className={`flex items-center gap-2 px-4 py-2.5 ${!item.active ? 'opacity-50' : ''}`}>
                            <span className="text-sm text-slate-800 flex-1">{item.name}</span>
                            <span className="text-xs font-data text-slate-400">{UNIT_LABELS[item.unit]}</span>
                            {!item.active && <span className="text-[10px] uppercase font-semibold text-slate-400">Deactivated</span>}
                            {canEdit && (
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <button onClick={() => setEditingId(item.id)} className="text-xs text-slate-400 hover:text-slate-700">Edit</button>
                                <button onClick={() => toggleItemActive(item)} className={`text-xs ${item.active ? 'text-red-500 hover:text-red-700' : 'text-emerald-600 hover:text-emerald-800'}`}>
                                  {item.active ? 'Deactivate' : 'Reactivate'}
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      ))}
                    </div>
                  )}

                  {addingProject === project.key && (
                    <AddItemForm projects={activeProjects} defaultProjectKey={project.key} onSaved={() => { setAddingProject(null); fetchAll() }} onCancel={() => setAddingProject(null)} />
                  )}
                </section>
              )
            })}

            {canEdit && (
              addingNewProject ? (
                <AddProjectForm
                  existingKeys={existingKeys}
                  nextSortOrder={nextSortOrder}
                  onSaved={() => { setAddingNewProject(false); fetchAll() }}
                  onCancel={() => setAddingNewProject(false)}
                />
              ) : (
                <button
                  onClick={() => setAddingNewProject(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-3 rounded-xl border border-dashed border-slate-300 text-sm font-medium text-[var(--olive)] hover:bg-white transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                  New project
                </button>
              )
            )}
          </>
        )}

        <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="w-3.5 h-3.5" />
          Show deactivated projects and items
        </label>
      </div>
    </div>
  )
}
