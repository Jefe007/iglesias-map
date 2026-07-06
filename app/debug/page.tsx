'use client'

import { useEffect, useState } from 'react'
import { getDb } from '@/lib/offlineDb'

type DebugInfo = {
  online: boolean
  userAgent: string
  displayMode: string
  sw: {
    supported: boolean
    registered: boolean
    scope?: string
    installing?: boolean
    waiting?: boolean
    active?: boolean
    controller: boolean
  }
  caches: { name: string; entries: number }[]
  cachesError?: string
  idb: { churches: number; distributions: number; mutations: number; photos: number } | null
  idbError?: string
}

async function collectDebugInfo(): Promise<DebugInfo> {
  const info: DebugInfo = {
    online: navigator.onLine,
    userAgent: navigator.userAgent,
    displayMode: window.matchMedia('(display-mode: standalone)').matches ? 'standalone (installed)' : 'browser (normal tab)',
    sw: { supported: 'serviceWorker' in navigator, registered: false, controller: !!navigator.serviceWorker?.controller },
    caches: [],
    idb: null,
  }

  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      if (reg) {
        info.sw.registered = true
        info.sw.scope = reg.scope
        info.sw.installing = !!reg.installing
        info.sw.waiting = !!reg.waiting
        info.sw.active = !!reg.active
      }
    } catch { /* ignore */ }
  }

  try {
    const names = await caches.keys()
    info.caches = await Promise.all(
      names.map(async name => {
        const cache = await caches.open(name)
        const keys = await cache.keys()
        return { name, entries: keys.length }
      })
    )
  } catch (err) {
    info.cachesError = (err as Error).message
  }

  try {
    const db = await getDb()
    if (db) {
      info.idb = {
        churches: await db.count('churches'),
        distributions: await db.count('distributions'),
        mutations: await db.count('mutations'),
        photos: await db.count('photos'),
      }
    }
  } catch (err) {
    info.idbError = (err as Error).message
  }

  return info
}

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`font-data text-right ${ok === true ? 'text-emerald-600' : ok === false ? 'text-red-600' : 'text-slate-800'}`}>{value}</span>
    </div>
  )
}

export default function DebugPage() {
  const [info, setInfo] = useState<DebugInfo | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    collectDebugInfo().then(setInfo)
  }, [])

  const raw = info ? JSON.stringify(info, null, 2) : ''

  return (
    <div className="min-h-dvh bg-slate-50 p-4 font-sans-pro text-slate-800">
      <div className="max-w-md mx-auto space-y-4">
        <h1 className="text-lg font-bold text-navy">Offline Diagnostics</h1>
        <p className="text-xs text-slate-500">
          Open this page, check what it says below, and send a screenshot. You can test it with and without a connection.
        </p>

        {!info ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <>
            <section className="bg-white rounded-xl border border-slate-200 p-4">
              <h2 className="text-xs font-semibold uppercase text-slate-400 mb-1">Connection</h2>
              <Row label="navigator.onLine" value={info.online ? 'true' : 'false'} ok={info.online} />
              <Row label="Display mode" value={info.displayMode} />
            </section>

            <section className="bg-white rounded-xl border border-slate-200 p-4">
              <h2 className="text-xs font-semibold uppercase text-slate-400 mb-1">Service Worker</h2>
              <Row label="Supported by browser" value={info.sw.supported ? 'yes' : 'no'} ok={info.sw.supported} />
              <Row label="Registered" value={info.sw.registered ? 'yes' : 'no'} ok={info.sw.registered} />
              {info.sw.registered && (
                <>
                  <Row label="Active" value={info.sw.active ? 'yes' : 'no'} ok={info.sw.active} />
                  <Row label="Waiting to activate" value={info.sw.waiting ? 'yes' : 'no'} />
                  <Row label="Installing" value={info.sw.installing ? 'yes' : 'no'} />
                  <Row label="Controls this page" value={info.sw.controller ? 'yes' : 'no'} ok={info.sw.controller} />
                </>
              )}
            </section>

            <section className="bg-white rounded-xl border border-slate-200 p-4">
              <h2 className="text-xs font-semibold uppercase text-slate-400 mb-1">Saved caches</h2>
              {info.cachesError && <p className="text-xs text-red-600">{info.cachesError}</p>}
              {info.caches.length === 0 ? (
                <p className="text-sm text-amber-600">None — nothing was saved for offline use.</p>
              ) : (
                info.caches.map(c => <Row key={c.name} label={c.name} value={`${c.entries} files`} ok={c.entries > 0} />)
              )}
            </section>

            <section className="bg-white rounded-xl border border-slate-200 p-4">
              <h2 className="text-xs font-semibold uppercase text-slate-400 mb-1">Local data (churches)</h2>
              {info.idbError && <p className="text-xs text-red-600">{info.idbError}</p>}
              {info.idb && (
                <>
                  <Row label="Churches saved" value={String(info.idb.churches)} ok={info.idb.churches > 0} />
                  <Row label="Deliveries saved" value={String(info.idb.distributions)} />
                  <Row label="Changes pending sync" value={String(info.idb.mutations)} />
                </>
              )}
            </section>

            <section className="bg-white rounded-xl border border-slate-200 p-4">
              <h2 className="text-xs font-semibold uppercase text-slate-400 mb-1">Browser</h2>
              <p className="text-xs text-slate-600 break-all">{info.userAgent}</p>
            </section>

            <button
              onClick={() => { navigator.clipboard?.writeText(raw); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
              className="w-full py-2.5 rounded-lg bg-navy text-white text-sm font-medium"
            >
              {copied ? 'Copied ✓' : 'Copy all as text'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
