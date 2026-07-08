'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Church } from '@/lib/supabase'
import { createChurch, updateChurch, uploadPhoto } from '@/lib/api'
import { IconX, IconMapPin } from '@/lib/icons'
import { useFocusTrap } from '@/lib/useFocusTrap'
import { MARKER_TYPE_LABELS } from '@/lib/locationTypes'

type FormState = {
  name: string
  pastor_name: string
  phone: string
  email: string
  parish: string
  address: string
  notes: string
  marker_type: Church['marker_type']
  is_distribution_center: boolean
  has_starlink: boolean
  distribution_center_id: string
  lat: string
  lng: string
  image_url: string
}

function emptyForm(defaultParish: string): FormState {
  return {
    name: '', pastor_name: '', phone: '', email: '',
    parish: defaultParish, address: '', notes: '',
    marker_type: 'church', is_distribution_center: false, has_starlink: false,
    distribution_center_id: '', lat: '', lng: '', image_url: '',
  }
}

function fromChurch(church: Church): FormState {
  return {
    name: church.name,
    pastor_name: church.pastor_name || '',
    phone: church.phone || '',
    email: church.email || '',
    parish: church.parish,
    address: church.address || '',
    notes: church.notes || '',
    marker_type: church.marker_type,
    is_distribution_center: church.is_distribution_center,
    has_starlink: church.has_starlink,
    distribution_center_id: church.distribution_center_id || '',
    lat: church.lat != null ? String(church.lat) : '',
    lng: church.lng != null ? String(church.lng) : '',
    image_url: church.image_url || '',
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-semibold text-gray-500 uppercase mb-1">{label}</div>
      {children}
    </label>
  )
}

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--olive)]'

interface Props {
  church: Church | null
  centers: Church[]
  parishes: string[]
  onClose: () => void
  onSaved: (saved: Church) => void
  pickingLocation: boolean
  onStartPickLocation: () => void
  onCancelPickLocation: () => void
  pendingCoords: { lat: number; lng: number } | null
}

export default function ChurchForm({ church, centers, parishes, onClose, onSaved, pickingLocation, onStartPickLocation, onCancelPickLocation, pendingCoords }: Props) {
  const [form, setForm] = useState<FormState>(() => church ? fromChurch(church) : emptyForm(parishes[0] || ''))
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleEscape = useCallback(() => { if (!saving) onClose() }, [saving, onClose])
  const modalRef = useFocusTrap<HTMLDivElement>(handleEscape)

  useEffect(() => {
    if (pendingCoords) {
      setForm(f => ({ ...f, lat: String(pendingCoords.lat), lng: String(pendingCoords.lng) }))
    }
  }, [pendingCoords])

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }
  }, [previewUrl])

  const availableCenters = centers.filter(c => c.id !== church?.id)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPreviewUrl(URL.createObjectURL(file))
    setUploading(true)
    setError(null)
    try {
      const url = await uploadPhoto(file)
      setForm(f => ({ ...f, image_url: url }))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const isChurch = form.marker_type === 'church'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const fields = {
        name: form.name.trim(),
        // Pastor/email/distribution-center role only apply to churches — force
        // them clear for other point types regardless of stale hidden state
        // (e.g. typed before switching Type away from Church).
        pastor_name: isChurch ? (form.pastor_name.trim() || null) : null,
        phone: form.phone.trim() || null,
        email: isChurch ? (form.email.trim() || null) : null,
        parish: form.parish,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
        marker_type: form.marker_type,
        is_distribution_center: isChurch && form.is_distribution_center,
        // Only meaningful for a hub (a distribution-center church); clear it
        // otherwise so toggling a point back out of that role doesn't leave a
        // stale "has Starlink" flag on a plain church record.
        has_starlink: isChurch && form.is_distribution_center && form.has_starlink,
        distribution_center_id: isChurch && !form.is_distribution_center ? (form.distribution_center_id || null) : null,
        lat: form.lat ? Number(form.lat) : null,
        lng: form.lng ? Number(form.lng) : null,
        geocode_status: (form.lat && form.lng ? 'validado' : (church?.geocode_status ?? 'pendiente')) as Church['geocode_status'],
        image_url: form.image_url || null,
      }
      const saved = church ? await updateChurch(church.id, fields) : await createChurch(fields)
      onSaved(saved)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`fixed inset-0 z-[1400] flex items-end md:items-stretch md:justify-end ${pickingLocation ? 'pointer-events-none' : ''}`}>
      {/* Hidden (not just transparent) while picking a location: this backdrop
          otherwise sits on top of the map and swallows the tap meant for it,
          calling onClose instead of ever reaching Leaflet's click handler.
          Removing the backdrop alone isn't enough — this whole wrapper is a
          fullscreen `fixed inset-0` box, so it still captures every click
          within its area regardless of what's rendered inside it; the
          pointer-events-none above (and -auto below, to keep the visible bar
          itself clickable) is what actually lets clicks reach the map. */}
      {!pickingLocation && <div className="absolute inset-0 bg-black/40" onClick={!saving ? onClose : undefined} />}
      <div ref={modalRef} className={`relative bg-white w-full md:w-[420px] max-h-[88dvh] md:max-h-none md:h-full rounded-t-2xl md:rounded-none shadow-2xl flex flex-col overflow-hidden ${pickingLocation ? 'pointer-events-auto' : ''}`}>
        <div className="bg-navy text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
          <h2 className="font-bold font-sans-pro">{church ? 'Edit' : 'Add'} {MARKER_TYPE_LABELS[form.marker_type]}</h2>
          <button onClick={onClose} disabled={saving} aria-label="Close" className="text-white/70 hover:text-white"><IconX className="w-4 h-4" /></button>
        </div>

        {pickingLocation ? (
          <div className="p-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-sm text-slate-600"><IconMapPin className="w-4 h-4 flex-shrink-0" /> Tap the map to place the pin.</div>
            <button onClick={onCancelPickLocation} className="text-xs font-medium text-slate-500 hover:text-slate-800 whitespace-nowrap">Cancel</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="overflow-y-auto flex-1 p-4 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>
              )}

              <Field label="Name *">
                <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputClass} placeholder="Name" />
              </Field>

              <Field label="Type">
                <select value={form.marker_type} onChange={e => setForm(f => ({ ...f, marker_type: e.target.value as Church['marker_type'] }))} className={inputClass}>
                  <option value="church">Church</option>
                  <option value="hospital">Field hospital</option>
                  <option value="base">Base</option>
                  <option value="deposito">Warehouse</option>
                  <option value="desalinizador">Water desalination plant</option>
                </select>
              </Field>

              <Field label="Parish">
                <input
                  required
                  list="parish-options"
                  value={form.parish}
                  onChange={e => setForm(f => ({ ...f, parish: e.target.value }))}
                  className={inputClass}
                  placeholder="Type or choose a parish"
                />
                <datalist id="parish-options">
                  {parishes.map(p => <option key={p} value={p} />)}
                </datalist>
              </Field>

              {isChurch && (
                <Field label="Pastor's name">
                  <input value={form.pastor_name} onChange={e => setForm(f => ({ ...f, pastor_name: e.target.value }))} className={inputClass} />
                </Field>
              )}

              <Field label="Phone">
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inputClass} placeholder="e.g. 4141234567" />
              </Field>

              {isChurch && (
                <Field label="Email">
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputClass} />
                </Field>
              )}

              <Field label="Address">
                <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className={inputClass} />
              </Field>

              <Field label="Notes">
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className={inputClass} rows={3} />
              </Field>

              <Field label="Photo">
                <div className="flex items-center gap-3">
                  {(previewUrl || form.image_url) && (
                    <img src={previewUrl || form.image_url} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-200" />
                  )}
                  <label className={`cursor-pointer text-sm font-medium hover:underline ${uploading ? 'text-gray-400' : 'text-[var(--olive)]'}`}>
                    {uploading ? 'Uploading…' : (form.image_url ? 'Replace photo' : 'Upload photo')}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} disabled={uploading} />
                  </label>
                </div>
              </Field>

              <Field label="Location">
                <div className="flex gap-2">
                  <input
                    type="number" step="any"
                    value={form.lat}
                    onChange={e => setForm(f => ({ ...f, lat: e.target.value }))}
                    placeholder="Lat" className={inputClass}
                  />
                  <input
                    type="number" step="any"
                    value={form.lng}
                    onChange={e => setForm(f => ({ ...f, lng: e.target.value }))}
                    placeholder="Lng" className={inputClass}
                  />
                </div>
                <button type="button" onClick={onStartPickLocation} className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium bg-yellow-400 text-yellow-900 hover:bg-yellow-500 transition-colors">
                  <IconMapPin className="w-4 h-4" /> Choose on map
                </button>
              </Field>

              {isChurch && (
                <Field label="Role">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.is_distribution_center}
                      onChange={e => setForm(f => ({ ...f, is_distribution_center: e.target.checked }))}
                      className="w-4 h-4"
                      style={{ accentColor: 'var(--olive)' }}
                    />
                    <span className="text-sm text-gray-700">Distribution center</span>
                  </label>
                </Field>
              )}

              {isChurch && form.is_distribution_center && (
                <Field label="Equipment">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.has_starlink}
                      onChange={e => setForm(f => ({ ...f, has_starlink: e.target.checked }))}
                      className="w-4 h-4"
                      style={{ accentColor: 'var(--olive)' }}
                    />
                    <span className="text-sm text-gray-700">Starlink antenna installed</span>
                  </label>
                </Field>
              )}

              {isChurch && !form.is_distribution_center && (
                <Field label="Assigned distribution center">
                  <select value={form.distribution_center_id} onChange={e => setForm(f => ({ ...f, distribution_center_id: e.target.value }))} className={inputClass}>
                    <option value="">— Unassigned —</option>
                    {availableCenters.map(c => <option key={c.id} value={c.id}>{c.name} ({c.parish})</option>)}
                  </select>
                </Field>
              )}
            </div>

            <div className="border-t p-4 flex gap-2 flex-shrink-0">
              <button type="button" onClick={onClose} disabled={saving} className="flex-1 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                Cancel
              </button>
              <button type="submit" disabled={saving || uploading} className="flex-1 py-2 rounded-lg bg-navy text-white text-sm font-medium hover:bg-[var(--navy-700)] transition-colors disabled:opacity-50">
                {saving ? 'Saving…' : (church ? 'Save changes' : `Create ${MARKER_TYPE_LABELS[form.marker_type]}`)}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
