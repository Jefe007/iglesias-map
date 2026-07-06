import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Church, Distribution, DistributionItem, Driver, Item, Project, ServiceRequest } from './supabase'

// Denormalizado a un registro por iglesia (no uno por fila church_id+project como en
// Supabase): evita necesitar una clave compuesta en IndexedDB y es la forma en que
// la UI consume el dato de todos modos ("¿qué proyectos tiene activos esta iglesia?").
export type CenterProjectsRecord = { church_id: string; projects: Project[] }

export type MutationRecord = {
  seq?: number
  kind: 'church' | 'distribution' | 'item' | 'center_projects' | 'request' | 'driver'
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
}

let dbPromise: Promise<IDBPDatabase<OfflineSchema>> | null = null

export function getDb() {
  if (typeof window === 'undefined') return null
  if (!dbPromise) {
    dbPromise = openDB<OfflineSchema>('sp-map-offline', 5, {
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
      },
    })
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
