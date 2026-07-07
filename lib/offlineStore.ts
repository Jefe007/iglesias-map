import { supabase } from './supabase'
import type { Church, Distribution, DistributionItem, Driver, Item, Project, ProjectDef, ServiceRequest } from './supabase'
import { getDb, type MutationRecord } from './offlineDb'

// "Offline" en campo casi nunca es un rechazo limpio: una señal débil deja la
// petición colgada durante decenas de segundos antes de fallar, y el fallback a
// IndexedDB (el catch de cada lectura) solo se dispara cuando el fetch termina.
// Abortar a los 8s convierte "pantalla colgada en Loading…" en "datos locales".
function readTimeoutSignal(ms = 8000): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms)
  const controller = new AbortController()
  setTimeout(() => controller.abort(), ms)
  return controller.signal
}

function applyMutations<T extends { id: string }>(base: T[], mutations: MutationRecord[], kind: MutationRecord['kind']): T[] {
  const byId = new Map(base.map(row => [row.id, row]))
  const ordered = mutations.filter(m => m.kind === kind).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
  for (const m of ordered) {
    if (m.op === 'delete') {
      byId.delete(m.id)
      continue
    }
    const existing = byId.get(m.id)
    byId.set(m.id, { ...(existing as object || {}), ...(m.payload || {}), id: m.id } as T)
  }
  return Array.from(byId.values())
}

export async function getChurches(): Promise<{ data: Church[]; offline: boolean }> {
  const db = await getDb()
  let base: Church[] = []
  let offline = false
  try {
    const { data, error } = await supabase.from('churches').select('*').order('parish').order('name').abortSignal(readTimeoutSignal())
    if (error) throw error
    base = data || []
    if (db) {
      const tx = db.transaction('churches', 'readwrite')
      await tx.store.clear()
      await Promise.all(base.map(row => tx.store.put(row)))
      await tx.done
    }
  } catch {
    offline = true
    base = db ? await db.getAll('churches') : []
  }
  const mutations = db ? await db.getAll('mutations') : []
  return { data: applyMutations(base, mutations, 'church'), offline }
}

export async function getAllDistributions(): Promise<{ data: Distribution[]; offline: boolean }> {
  const db = await getDb()
  let base: Distribution[] = []
  let offline = false
  try {
    const { data, error } = await supabase
      .from('distributions')
      .select('*')
      .order('distributed_at', { ascending: false })
      .abortSignal(readTimeoutSignal())
    if (error) throw error
    base = data || []
    if (db) {
      const tx = db.transaction('distributions', 'readwrite')
      await tx.store.clear()
      await Promise.all(base.map(row => tx.store.put(row)))
      await tx.done
    }
  } catch {
    offline = true
    base = db ? await db.getAll('distributions') : []
  }
  const mutations = db ? await db.getAll('mutations') : []
  return { data: applyMutations(base, mutations, 'distribution'), offline }
}

export async function getDistributionsForCenter(centerId: string): Promise<{ data: Distribution[]; offline: boolean }> {
  const { data, offline } = await getAllDistributions()
  return {
    data: data
      .filter(d => d.distribution_center_id === centerId)
      .sort((a, b) => b.distributed_at.localeCompare(a.distributed_at)),
    offline,
  }
}

// Sin capa de mutaciones pendientes: mientras una entrega creada offline no se
// sincronice, sus líneas no aparecen aquí todavía (la cabecera en getAllDistributions
// sí aparece de inmediato). Ver la nota en lib/api.ts#createDistribution.
export async function getAllDistributionItems(): Promise<{ data: DistributionItem[]; offline: boolean }> {
  const db = await getDb()
  let base: DistributionItem[] = []
  let offline = false
  try {
    const { data, error } = await supabase.from('distribution_items').select('*').abortSignal(readTimeoutSignal())
    if (error) throw error
    base = data || []
    if (db) {
      const tx = db.transaction('distributionItems', 'readwrite')
      await tx.store.clear()
      await Promise.all(base.map(row => tx.store.put(row)))
      await tx.done
    }
  } catch {
    offline = true
    base = db ? await db.getAll('distributionItems') : []
  }
  return { data: base, offline }
}

export async function getItems(): Promise<{ data: Item[]; offline: boolean }> {
  const db = await getDb()
  let base: Item[] = []
  let offline = false
  try {
    const { data, error } = await supabase.from('items').select('*').order('project').order('name').abortSignal(readTimeoutSignal())
    if (error) throw error
    base = data || []
    if (db) {
      const tx = db.transaction('items', 'readwrite')
      await tx.store.clear()
      await Promise.all(base.map(row => tx.store.put(row)))
      await tx.done
    }
  } catch {
    offline = true
    base = db ? await db.getAll('items') : []
  }
  const mutations = db ? await db.getAll('mutations') : []
  return { data: applyMutations(base, mutations, 'item'), offline }
}

// Al igual que getCenterProjects, sin capa de mutaciones pendientes: crear o editar un
// proyecto (ver lib/api.ts#createProject) es una acción de configuración poco frecuente,
// no algo que el equipo de campo necesite hacer sin señal.
export async function getProjects(): Promise<{ data: ProjectDef[]; offline: boolean }> {
  const db = await getDb()
  let base: ProjectDef[] = []
  let offline = false
  try {
    const { data, error } = await supabase.from('projects').select('*').order('sort_order').abortSignal(readTimeoutSignal())
    if (error) throw error
    base = data || []
    if (db) {
      const tx = db.transaction('projects', 'readwrite')
      await tx.store.clear()
      await Promise.all(base.map(row => tx.store.put(row)))
      await tx.done
    }
  } catch {
    offline = true
    base = db ? await db.getAll('projects') : []
  }
  return { data: base, offline }
}

// A diferencia de churches/distributions, los cambios de proyectos activos por centro
// requieren conexión (ver lib/api.ts#setCenterProjects) — es una acción de configuración
// poco frecuente, no algo que el equipo de campo necesite hacer sin señal. Por eso esta
// lectura solo cachea para poder mostrar los badges offline, sin capa de mutaciones pendientes.
export async function getCenterProjects(): Promise<{ data: Record<string, Project[]>; offline: boolean }> {
  const db = await getDb()
  let rows: { church_id: string; project: Project }[] = []
  let offline = false
  try {
    const { data, error } = await supabase.from('center_projects').select('church_id, project').abortSignal(readTimeoutSignal())
    if (error) throw error
    rows = data || []
    if (db) {
      const grouped = new Map<string, Project[]>()
      for (const row of rows) grouped.set(row.church_id, [...(grouped.get(row.church_id) || []), row.project])
      const tx = db.transaction('centerProjects', 'readwrite')
      await tx.store.clear()
      await Promise.all(Array.from(grouped, ([church_id, projects]) => tx.store.put({ church_id, projects })))
      await tx.done
    }
  } catch {
    offline = true
    const records = db ? await db.getAll('centerProjects') : []
    return { data: Object.fromEntries(records.map(r => [r.church_id, r.projects])), offline }
  }
  const data: Record<string, Project[]> = {}
  for (const row of rows) data[row.church_id] = [...(data[row.church_id] || []), row.project]
  return { data, offline }
}

export async function getRequests(): Promise<{ data: ServiceRequest[]; offline: boolean }> {
  const db = await getDb()
  let base: ServiceRequest[] = []
  let offline = false
  try {
    const { data, error } = await supabase.from('requests').select('*').order('created_at', { ascending: false }).abortSignal(readTimeoutSignal())
    if (error) throw error
    base = data || []
    if (db) {
      const tx = db.transaction('requests', 'readwrite')
      await tx.store.clear()
      await Promise.all(base.map(row => tx.store.put(row)))
      await tx.done
    }
  } catch {
    offline = true
    base = db ? await db.getAll('requests') : []
  }
  const mutations = db ? await db.getAll('mutations') : []
  return { data: applyMutations(base, mutations, 'request'), offline }
}

export async function getDrivers(): Promise<{ data: Driver[]; offline: boolean }> {
  const db = await getDb()
  let base: Driver[] = []
  let offline = false
  try {
    const { data, error } = await supabase.from('drivers').select('*').order('name').abortSignal(readTimeoutSignal())
    if (error) throw error
    base = data || []
    if (db) {
      const tx = db.transaction('drivers', 'readwrite')
      await tx.store.clear()
      await Promise.all(base.map(row => tx.store.put(row)))
      await tx.done
    }
  } catch {
    offline = true
    base = db ? await db.getAll('drivers') : []
  }
  const mutations = db ? await db.getAll('mutations') : []
  return { data: applyMutations(base, mutations, 'driver'), offline }
}

export async function getPendingMutationCount(): Promise<number> {
  const db = await getDb()
  if (!db) return 0
  return db.count('mutations')
}
