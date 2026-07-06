import { getDb, type MutationRecord } from './offlineDb'

async function resolvePendingPhoto(payload: Record<string, unknown> | undefined, passcode: string): Promise<Record<string, unknown> | undefined> {
  if (!payload) return payload
  const imageUrl = payload.image_url
  if (typeof imageUrl !== 'string' || !imageUrl.startsWith('pending-photo:')) return payload

  const tempId = imageUrl.slice('pending-photo:'.length)
  const db = await getDb()
  const pending = db ? await db.get('photos', tempId) : undefined
  if (!pending) return { ...payload, image_url: null }

  const formData = new FormData()
  formData.append('file', pending.file)
  const res = await fetch('/api/upload', { method: 'POST', headers: { 'x-edit-passcode': passcode }, body: formData })
  const body = await res.json()
  if (!res.ok) return { ...payload, image_url: null }

  if (db) await db.delete('photos', tempId)
  return { ...payload, image_url: body.url }
}

async function replay(m: MutationRecord): Promise<void> {
  const payload = await resolvePendingPhoto(m.payload, m.passcode)
  const headers = { 'x-edit-passcode': m.passcode, 'Content-Type': 'application/json' }
  const urls: Record<MutationRecord['kind'], string> = {
    church: '/api/churches',
    distribution: '/api/distributions',
    item: '/api/items',
    center_projects: '/api/center-projects',
    request: '/api/requests',
    driver: '/api/drivers',
  }
  const url = urls[m.kind]

  const res = await (
    m.op === 'create' ? fetch(url, { method: 'POST', headers, body: JSON.stringify({ ...payload, id: m.id }) }) :
    m.op === 'update' ? fetch(url, { method: 'PATCH', headers, body: JSON.stringify({ id: m.id, ...payload }) }) :
    fetch(url, { method: 'DELETE', headers, body: JSON.stringify({ id: m.id }) })
  )

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Could not sync ${m.kind} ${m.op}`)
  }
}

export async function flushQueue(): Promise<{ synced: number; failed: number }> {
  const db = await getDb()
  if (!db) return { synced: 0, failed: 0 }

  let synced = 0
  let failed = 0
  for (;;) {
    const all = await db.getAll('mutations')
    if (all.length === 0) break
    const next = all.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))[0]
    try {
      await replay(next)
      await db.delete('mutations', next.seq!)
      synced++
    } catch (err) {
      if (err instanceof TypeError) break // still offline — retry on next reconnect
      await db.delete('mutations', next.seq!)
      failed++
      console.error('Could not sync a pending change, discarding:', next, err)
    }
  }
  return { synced, failed }
}
