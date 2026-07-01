import type { Church } from './supabase'

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

export type NewChurch = Partial<Omit<Church, 'id' | 'created_at'>> & { name: string; parish: string }

export async function createChurch(fields: NewChurch): Promise<Church> {
  const res = await fetch('/api/churches', {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error || 'Failed to create church')
  return body.data
}

export async function updateChurch(id: string, fields: Partial<Church>): Promise<Church> {
  const res = await fetch('/api/churches', {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...fields }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error || 'Failed to update church')
  return body.data
}

export async function deleteChurch(id: string): Promise<void> {
  const res = await fetch('/api/churches', {
    method: 'DELETE',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error || 'Failed to delete church')
}

export async function uploadPhoto(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error || 'Failed to upload photo')
  return body.url
}
