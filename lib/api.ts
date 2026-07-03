import type { Church, Distribution } from './supabase'
import { enqueueMutation, storePendingPhoto } from './offlineDb'

const PASSCODE_KEY = 'sp-map-edit-passcode'

export function getStoredPasscode(): string | null {
  if (typeof window === 'undefined') return null
  return sessionStorage.getItem(PASSCODE_KEY)
}

export function setStoredPasscode(passcode: string) {
  sessionStorage.setItem(PASSCODE_KEY, passcode)
}

export function clearStoredPasscode() {
  sessionStorage.removeItem(PASSCODE_KEY)
}

export async function verifyPasscode(passcode: string): Promise<boolean> {
  const res = await fetch('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode }),
  })
  const { ok } = await res.json()
  return ok
}

function authHeaders(): HeadersInit {
  const passcode = getStoredPasscode() || ''
  return { 'x-edit-passcode': passcode }
}

// A request that never reaches the server (offline, DNS failure, connection
// refused, etc.) makes fetch() reject. A request that reaches the server and
// gets a non-2xx response resolves normally — that's a real error (bad auth,
// validation) and must not be queued for later retry.
function isNetworkFailure(err: unknown): boolean {
  return err instanceof TypeError
}

export type NewChurch = Partial<Omit<Church, 'id' | 'created_at'>> & { name: string; parish: string }

export async function createChurch(fields: NewChurch): Promise<Church> {
  const id = crypto.randomUUID()
  const payload = { id, ...fields }
  try {
    const res = await fetch('/api/churches', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'No se pudo crear la iglesia')
    return body.data
  } catch (err) {
    if (!isNetworkFailure(err)) throw err
    await enqueueMutation({ kind: 'church', op: 'create', id, payload, passcode: getStoredPasscode() || '', createdAt: Date.now() })
    return { created_at: new Date().toISOString(), pastor_name: null, phone: null, email: null, address: null, lat: null, lng: null, is_distribution_center: false, notes: null, geocode_status: 'pendiente', distribution_center_id: null, marker_type: 'church', image_url: null, ...payload } as Church
  }
}

export async function updateChurch(id: string, fields: Partial<Church>): Promise<Church> {
  try {
    const res = await fetch('/api/churches', {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...fields }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'No se pudo actualizar la iglesia')
    return body.data
  } catch (err) {
    if (!isNetworkFailure(err)) throw err
    await enqueueMutation({ kind: 'church', op: 'update', id, payload: fields, passcode: getStoredPasscode() || '', createdAt: Date.now() })
    return { id, ...fields } as Church
  }
}

export async function deleteChurch(id: string): Promise<void> {
  try {
    const res = await fetch('/api/churches', {
      method: 'DELETE',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'No se pudo eliminar la iglesia')
  } catch (err) {
    if (!isNetworkFailure(err)) throw err
    await enqueueMutation({ kind: 'church', op: 'delete', id, passcode: getStoredPasscode() || '', createdAt: Date.now() })
  }
}

export type NewDistribution = {
  distribution_center_id: string
  distributed_at: string
  items: string
  families_served: number | null
  notes: string | null
}

export async function createDistribution(fields: NewDistribution): Promise<Distribution> {
  const id = crypto.randomUUID()
  const payload = { id, ...fields }
  try {
    const res = await fetch('/api/distributions', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'No se pudo registrar la entrega')
    return body.data
  } catch (err) {
    if (!isNetworkFailure(err)) throw err
    await enqueueMutation({ kind: 'distribution', op: 'create', id, payload, passcode: getStoredPasscode() || '', createdAt: Date.now() })
    return { created_at: new Date().toISOString(), ...payload } as Distribution
  }
}

export async function deleteDistribution(id: string): Promise<void> {
  try {
    const res = await fetch('/api/distributions', {
      method: 'DELETE',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'No se pudo eliminar el registro')
  } catch (err) {
    if (!isNetworkFailure(err)) throw err
    await enqueueMutation({ kind: 'distribution', op: 'delete', id, passcode: getStoredPasscode() || '', createdAt: Date.now() })
  }
}

export async function uploadPhoto(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'No se pudo subir la foto')
    return body.url
  } catch (err) {
    if (!isNetworkFailure(err)) throw err
    const tempId = crypto.randomUUID()
    await storePendingPhoto(tempId, file)
    return `pending-photo:${tempId}`
  }
}
