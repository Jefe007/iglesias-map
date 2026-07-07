import type { Church, Distribution, Driver, Item, Project, RequestStatus, ServiceRequest, Urgency } from './supabase'
import { enqueueMutation, storePendingPhoto } from './offlineDb'

const PASSCODE_KEY = 'sp-map-edit-passcode'
const ROLE_KEY = 'sp-map-edit-role'

export type Role = 'supervision' | 'deposito'

// localStorage (no sessionStorage): la clave debe sobrevivir a cerrar la app para
// que el modo edición siga funcionando en campo sin señal. El servidor revalida la
// clave en cada mutación al sincronizar, así que una clave inválida nunca escribe.
function readStored(key: string): string | null {
  if (typeof window === 'undefined') return null
  const value = localStorage.getItem(key)
  if (value !== null) return value
  // Migración: sesiones desbloqueadas antes de este cambio vivían en sessionStorage.
  const legacy = sessionStorage.getItem(key)
  if (legacy !== null) localStorage.setItem(key, legacy)
  return legacy
}

export function getStoredPasscode(): string | null {
  return readStored(PASSCODE_KEY)
}

export function setStoredPasscode(passcode: string) {
  localStorage.setItem(PASSCODE_KEY, passcode)
}

export function clearStoredPasscode() {
  localStorage.removeItem(PASSCODE_KEY)
  localStorage.removeItem(ROLE_KEY)
  sessionStorage.removeItem(PASSCODE_KEY)
  sessionStorage.removeItem(ROLE_KEY)
}

// Depósito/Admin es superconjunto de Supervisión (ver lib/serverAuth.ts#roleForPasscode).
export function getStoredRole(): Role | null {
  return readStored(ROLE_KEY) as Role | null
}

export async function verifyPasscode(passcode: string): Promise<boolean> {
  try {
    const res = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode }),
    })
    const { ok, role } = await res.json()
    if (ok && role) localStorage.setItem(ROLE_KEY, role)
    return ok
  } catch (err) {
    if (!isNetworkFailure(err)) throw err
    // Sin red: aceptar solo una clave ya verificada online antes en este dispositivo.
    return passcode === getStoredPasscode() && getStoredRole() !== null
  }
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
    if (!res.ok) throw new Error(body.error || 'Could not create the church')
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
    if (!res.ok) throw new Error(body.error || 'Could not update the church')
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
    if (!res.ok) throw new Error(body.error || 'Could not delete the church')
  } catch (err) {
    if (!isNetworkFailure(err)) throw err
    await enqueueMutation({ kind: 'church', op: 'delete', id, passcode: getStoredPasscode() || '', createdAt: Date.now() })
  }
}

export type NewDistributionLine = { project: Project; item_id: string; quantity: number }

export type NewDistribution = {
  distribution_center_id: string
  distributed_at: string
  families_served: number | null
  notes: string | null
  lines: NewDistributionLine[]
}

// Una entrega = una cabecera (distributions) + varias líneas (distribution_items),
// creadas juntas en una sola mutación encolable. Si está offline, las líneas quedan
// dentro del payload encolado y solo se reflejan en distribution_items al sincronizar
// (ver lib/offlineStore.ts#getAllDistributionItems) — la cabecera sí se ve de inmediato.
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
    if (!res.ok) throw new Error(body.error || 'Could not register the delivery')
    return body.data
  } catch (err) {
    if (!isNetworkFailure(err)) throw err
    await enqueueMutation({ kind: 'distribution', op: 'create', id, payload, passcode: getStoredPasscode() || '', createdAt: Date.now() })
    return { created_at: new Date().toISOString(), items: null, ...fields, id } as unknown as Distribution
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
    if (!res.ok) throw new Error(body.error || 'Could not delete the record')
  } catch (err) {
    if (!isNetworkFailure(err)) throw err
    await enqueueMutation({ kind: 'distribution', op: 'delete', id, passcode: getStoredPasscode() || '', createdAt: Date.now() })
  }
}

export type NewItem = { project: Project; name: string; unit: Item['unit'] }

export async function createItem(fields: NewItem): Promise<Item> {
  const id = crypto.randomUUID()
  const payload = { id, ...fields }
  try {
    const res = await fetch('/api/items', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'Could not create the item')
    return body.data
  } catch (err) {
    if (!isNetworkFailure(err)) throw err
    await enqueueMutation({ kind: 'item', op: 'create', id, payload, passcode: getStoredPasscode() || '', createdAt: Date.now() })
    return { active: true, created_at: new Date().toISOString(), ...payload } as Item
  }
}

export async function updateItem(id: string, fields: Partial<Item>): Promise<Item> {
  try {
    const res = await fetch('/api/items', {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...fields }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'Could not update the item')
    return body.data
  } catch (err) {
    if (!isNetworkFailure(err)) throw err
    await enqueueMutation({ kind: 'item', op: 'update', id, payload: fields, passcode: getStoredPasscode() || '', createdAt: Date.now() })
    return { id, ...fields } as Item
  }
}

// A diferencia de las iglesias/entregas, esto no se encola offline: es una acción de
// configuración poco frecuente (ver lib/offlineStore.ts#getCenterProjects), así que
// simplemente falla con un error claro si no hay red, en vez de sumar la complejidad
// de fusionar mutaciones pendientes sobre una tabla sin id propio.
export async function setCenterProjects(churchId: string, projects: Project[]): Promise<void> {
  const res = await fetch('/api/center-projects', {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ church_id: churchId, projects }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error || 'Could not save the active projects')
}

export type NewRequest = {
  church_id: string
  project: Project
  item_id: string
  quantity_needed: number | null
  note: string | null
  urgency: Urgency
}

export async function createRequest(fields: NewRequest): Promise<ServiceRequest> {
  const id = crypto.randomUUID()
  const payload = { id, status: 'pendiente' as RequestStatus, ...fields }
  try {
    const res = await fetch('/api/requests', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'Could not create the request')
    return body.data
  } catch (err) {
    if (!isNetworkFailure(err)) throw err
    await enqueueMutation({ kind: 'request', op: 'create', id, payload, passcode: getStoredPasscode() || '', createdAt: Date.now() })
    const now = new Date().toISOString()
    return { created_at: now, updated_at: now, ...payload } as ServiceRequest
  }
}

export async function updateRequestStatus(id: string, status: RequestStatus): Promise<ServiceRequest> {
  try {
    const res = await fetch('/api/requests', {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'Could not update the request')
    return body.data
  } catch (err) {
    if (!isNetworkFailure(err)) throw err
    await enqueueMutation({ kind: 'request', op: 'update', id, payload: { status }, passcode: getStoredPasscode() || '', createdAt: Date.now() })
    return { id, status } as ServiceRequest
  }
}

export type NewDriver = { name: string; phone: string }

export async function createDriver(fields: NewDriver): Promise<Driver> {
  const id = crypto.randomUUID()
  const payload = { id, available: true, ...fields }
  try {
    const res = await fetch('/api/drivers', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'Could not create the driver')
    return body.data
  } catch (err) {
    if (!isNetworkFailure(err)) throw err
    await enqueueMutation({ kind: 'driver', op: 'create', id, payload, passcode: getStoredPasscode() || '', createdAt: Date.now() })
    return { updated_at: new Date().toISOString(), ...payload } as Driver
  }
}

export async function updateDriver(id: string, fields: Partial<Driver>): Promise<Driver> {
  try {
    const res = await fetch('/api/drivers', {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...fields }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'Could not update the driver')
    return body.data
  } catch (err) {
    if (!isNetworkFailure(err)) throw err
    await enqueueMutation({ kind: 'driver', op: 'update', id, payload: fields, passcode: getStoredPasscode() || '', createdAt: Date.now() })
    return { id, ...fields } as Driver
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
    if (!res.ok) throw new Error(body.error || 'Could not upload the photo')
    return body.url
  } catch (err) {
    if (!isNetworkFailure(err)) throw err
    const tempId = crypto.randomUUID()
    await storePendingPhoto(tempId, file)
    return `pending-photo:${tempId}`
  }
}
