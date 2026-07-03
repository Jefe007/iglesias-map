import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Church, Distribution } from './supabase'

export type MutationRecord = {
  seq?: number
  kind: 'church' | 'distribution'
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
}

let dbPromise: Promise<IDBPDatabase<OfflineSchema>> | null = null

export function getDb() {
  if (typeof window === 'undefined') return null
  if (!dbPromise) {
    dbPromise = openDB<OfflineSchema>('sp-map-offline', 1, {
      upgrade(db) {
        db.createObjectStore('churches', { keyPath: 'id' })
        db.createObjectStore('distributions', { keyPath: 'id' })
        db.createObjectStore('mutations', { keyPath: 'seq', autoIncrement: true })
        db.createObjectStore('photos', { keyPath: 'tempId' })
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
