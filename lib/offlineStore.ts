import { supabase } from './supabase'
import type { Church, Distribution } from './supabase'
import { getDb, type MutationRecord } from './offlineDb'

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
    const { data, error } = await supabase.from('churches').select('*').order('parish').order('name')
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

export async function getPendingMutationCount(): Promise<number> {
  const db = await getDb()
  if (!db) return 0
  return db.count('mutations')
}
