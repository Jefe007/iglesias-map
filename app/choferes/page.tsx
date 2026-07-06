'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Driver } from '@/lib/supabase'
import { getDrivers } from '@/lib/offlineStore'
import { createDriver, updateDriver } from '@/lib/api'
import { useEditRole } from '@/lib/useEditRole'
import { showToast } from '@/lib/toast'
import PasscodeGate from '@/components/PasscodeGate'

function AddDriverForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await createDriver({ name, phone })
      showToast('Driver added')
      onSaved()
    } catch (err) {
      showToast((err as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 p-3 bg-gray-50 border-t border-gray-100">
      <input value={name} onChange={e => setName(e.target.value)} required autoFocus
        placeholder="Name" className="flex-1 min-w-[120px] border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <input value={phone} onChange={e => setPhone(e.target.value)} required
        placeholder="Phone" className="flex-1 min-w-[120px] border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <button type="submit" disabled={saving} className="text-sm px-3 py-1.5 rounded-lg bg-navy text-white font-medium disabled:opacity-50">
        {saving ? 'Saving…' : 'Add'}
      </button>
      <button type="button" onClick={onCancel} className="text-sm text-slate-400 hover:text-slate-600">Cancel</button>
    </form>
  )
}

function EditDriverRow({ driver, onSaved, onCancel }: { driver: Driver; onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState(driver.name)
  const [phone, setPhone] = useState(driver.phone)
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await updateDriver(driver.id, { name, phone })
      showToast('Driver updated')
      onSaved()
    } catch (err) {
      showToast((err as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 px-4 py-2.5 bg-blue-50/50">
      <input value={name} onChange={e => setName(e.target.value)} required className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <input value={phone} onChange={e => setPhone(e.target.value)} required className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <button type="submit" disabled={saving} className="text-xs px-2.5 py-1 rounded-md bg-navy text-white font-medium disabled:opacity-50">{saving ? '…' : 'Save'}</button>
      <button type="button" onClick={onCancel} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
    </form>
  )
}

export default function ChoferesPage() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [addingOpen, setAddingOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const { role, unlock, lock } = useEditRole()
  const canEdit = role === 'deposito'

  const fetchDrivers = useCallback(async () => {
    setLoading(true)
    const { data } = await getDrivers()
    setDrivers(data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchDrivers() }, [fetchDrivers])

  const toggleAvailable = async (driver: Driver) => {
    try {
      await updateDriver(driver.id, { available: !driver.available })
      fetchDrivers()
    } catch (err) {
      showToast((err as Error).message, 'error')
    }
  }

  const available = drivers.filter(d => d.available)
  const busy = drivers.filter(d => !d.available)

  return (
    <div className="min-h-dvh bg-gray-50 font-sans-pro">
      <header className="bg-navy text-white px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/" className="text-white/70 hover:text-white text-sm flex-shrink-0">← Home</Link>
          <h1 className="text-sm sm:text-base font-bold truncate">Drivers</h1>
        </div>
        <PasscodeGate role={role} onUnlock={unlock} onLock={lock} />
      </header>

      <div className="max-w-md mx-auto p-4 space-y-4">
        {!canEdit && (
          <p className="text-xs text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-2">
            Read-only. Unlock with the Warehouse/Admin passcode to add drivers or change their availability.
          </p>
        )}

        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <>
            <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
                <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                <h2 className="font-bold text-sm text-slate-800 flex-1">Available</h2>
                <span className="font-data text-xs text-slate-400">{available.length}</span>
              </div>
              {available.length === 0 ? (
                <p className="px-4 py-3 text-xs text-slate-400">No drivers available.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {available.map(d => editingId === d.id ? (
                    <EditDriverRow key={d.id} driver={d} onSaved={() => { setEditingId(null); fetchDrivers() }} onCancel={() => setEditingId(null)} />
                  ) : (
                    <div key={d.id} className="flex items-center gap-2 px-4 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800">{d.name}</div>
                        <a href={`tel:${d.phone}`} className="text-xs text-blue-600 hover:underline">{d.phone}</a>
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button onClick={() => setEditingId(d.id)} className="text-xs text-slate-400 hover:text-slate-700">Edit</button>
                          <button onClick={() => toggleAvailable(d)} className="text-xs text-amber-600 hover:text-amber-800">Mark busy</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {canEdit && !addingOpen && (
                <button onClick={() => setAddingOpen(true)} className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-[var(--olive)] hover:bg-slate-50 border-t border-slate-100">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                  Add driver
                </button>
              )}
              {addingOpen && <AddDriverForm onSaved={() => { setAddingOpen(false); fetchDrivers() }} onCancel={() => setAddingOpen(false)} />}
            </section>

            <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
                <span className="w-2 h-2 rounded-full bg-slate-300 flex-shrink-0" />
                <h2 className="font-bold text-sm text-slate-800 flex-1">Busy</h2>
                <span className="font-data text-xs text-slate-400">{busy.length}</span>
              </div>
              {busy.length === 0 ? (
                <p className="px-4 py-3 text-xs text-slate-400">No busy drivers.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {busy.map(d => editingId === d.id ? (
                    <EditDriverRow key={d.id} driver={d} onSaved={() => { setEditingId(null); fetchDrivers() }} onCancel={() => setEditingId(null)} />
                  ) : (
                    <div key={d.id} className="flex items-center gap-2 px-4 py-2.5 opacity-60">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800">{d.name}</div>
                        <a href={`tel:${d.phone}`} className="text-xs text-blue-600 hover:underline">{d.phone}</a>
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button onClick={() => setEditingId(d.id)} className="text-xs text-slate-400 hover:text-slate-700">Edit</button>
                          <button onClick={() => toggleAvailable(d)} className="text-xs text-emerald-600 hover:text-emerald-800">Mark available</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
