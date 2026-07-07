import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Church, Distribution, DistributionItem, Driver, Item, Project, ProjectDef, ServiceRequest } from './supabase'

// Denormalizado a un registro por iglesia (no uno por fila church_id+project como en
// Supabase): evita necesitar una clave compuesta en IndexedDB y es la forma en que
// la UI consume el dato de todos modos ("¿qué proyectos tiene activos esta iglesia?").
export type CenterProjectsRecord = { church_id: string; projects: Project[] }

export type MutationRecord = {
  seq?: number
  kind: 'church' | 'distribution' | 'item' | 'center_projects' | 'request' | 'driver' | 'project'
  op: 'create' | 'update' | 'delete'
  id: string
  payload?: Record<string, unknown>
  passcode: string
  createdAt: number
}

export type PendingPhoto = {
  tempId: string
  file: Blob
  createdAt: number
}

interface OfflineSchema extends DBSchema {
  churches: { key: string; value: Church }
  distributions: { key: string; value: Distribution }
  mutations: { key: number; value: MutationRecord }
  photos: { key: string; value: PendingPhoto }
  items: { key: string; value: Item }
  centerProjects: { key: string; value: CenterProjectsRecord }
  distributionItems: { key: string; value: DistributionItem }
  requests: { key: string; value: ServiceRequest }
  drivers: { key: string; value: Driver }
  projects: { key: string; value: ProjectDef }
}

let dbPromise: Promise<IDBPDatabase<OfflineSchema> | null> | null = null

export function getDb(): Promise<IDBPDatabase<OfflineSchema> | null> | null {
  if (typeof window === 'undefined') return null
  if (!dbPromise) {
    const openPromise = openDB<OfflineSchema>('sp-map-offline', 6, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('churches', { keyPath: 'id' })
          db.createObjectStore('distributions', { keyPath: 'id' })
          db.createObjectStore('mutations', { keyPath: 'seq', autoIncrement: true })
          db.createObjectStore('photos', { keyPath: 'tempId' })
        }
        if (oldVersion < 2) {
          db.createObjectStore('items', { keyPath: 'id' })
          db.createObjectStore('centerProjects', { keyPath: 'church_id' })
        }
        if (oldVersion < 3) {
          db.createObjectStore('distributionItems', { keyPath: 'id' })
        }
        if (oldVersion < 4) {
          db.createObjectStore('requests', { keyPath: 'id' })
        }
        if (oldVersion < 5) {
          db.createObjectStore('drivers', { keyPath: 'id' })
        }
        if (oldVersion < 6) {
          db.createObjectStore('projects', { keyPath: 'key' })
        }
      },
      // Without these, a version bump hangs forever if another tab/window
      // still holds the old connection open: the old side never learns it
      // should close, and this side never learns to give up.
      blocked() {
        console.error('IndexedDB upgrade blocked by another open tab — close other tabs of this app and reload.')
      },
      blocking() {
        // A newer version wants to open elsewhere; release our (outdated) connection.
        dbPromise?.then(db => db?.close())
        dbPromise = null
      },
    })
    // IndexedDB can wedge outright (corrupted local storage, an OS-level file
    // lock, a stuck browser storage service) — with no upgrade in progress,
    // no blocked/blocking event ever fires to explain it, and openDB() just
    // never resolves. Every read in offlineStore.ts awaits getDb() with no
    // timeout of its own, so a hang here silently freezes the whole app on a
    // "Loading…" screen. Time out and treat it as "no local cache available"
    // instead — every caller already handles a null db (see the SSR check above).
    dbPromise = Promise.race([
      openPromise,
      new Promise<null>(resolve => setTimeout(() => resolve(null), 6000)),
    ]).catch(() => null)
  }
  return dbPromise
}

export async function enqueueMutation(mutation: Omit<MutationRecord, 'seq'>): Promise<void> {
  const db = await getDb()
  if (!db) return
  await db.add('mutations', mutation as MutationRecord)
}

export async function storePendingPhoto(tempId: string, file: Blob): Promise<void> {
  const db = await getDb()
  if (!db) return
  await db.put('photos', { tempId, file, createdAt: Date.now() })
}
