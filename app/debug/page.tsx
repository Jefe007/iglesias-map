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
    displayMode: window.matchMedia('(display-mode: standalone)').matches ? 'standalone (instalada)' : 'browser (pestaña normal)',
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
        <h1 className="text-lg font-bold text-navy">Diagnóstico sin conexión</h1>
        <p className="text-xs text-slate-500">
          Abre esta página, revisa lo que dice abajo, y envía una captura de pantalla. Puedes probarla con y sin conexión.
        </p>

        {!info ? (
          <p className="text-sm text-slate-400">Cargando…</p>
        ) : (
          <>
            <section className="bg-white rounded-xl border border-slate-200 p-4">
              <h2 className="text-xs font-semibold uppercase text-slate-400 mb-1">Conexión</h2>
              <Row label="navigator.onLine" value={info.online ? 'true' : 'false'} ok={info.online} />
              <Row label="Modo de visualización" value={info.displayMode} />
            </section>

            <section className="bg-white rounded-xl border border-slate-200 p-4">
              <h2 className="text-xs font-semibold uppercase text-slate-400 mb-1">Service Worker</h2>
              <Row label="Soportado por el navegador" value={info.sw.supported ? 'sí' : 'no'} ok={info.sw.supported} />
              <Row label="Registrado" value={info.sw.registered ? 'sí' : 'no'} ok={info.sw.registered} />
              {info.sw.registered && (
                <>
                  <Row label="Activo" value={info.sw.active ? 'sí' : 'no'} ok={info.sw.active} />
                  <Row label="Esperando activarse" value={info.sw.waiting ? 'sí' : 'no'} />
                  <Row label="Instalando" value={info.sw.installing ? 'sí' : 'no'} />
                  <Row label="Controla esta página" value={info.sw.controller ? 'sí' : 'no'} ok={info.sw.controller} />
                </>
              )}
            </section>

            <section className="bg-white rounded-xl border border-slate-200 p-4">
              <h2 className="text-xs font-semibold uppercase text-slate-400 mb-1">Cachés guardadas</h2>
              {info.cachesError && <p className="text-xs text-red-600">{info.cachesError}</p>}
              {info.caches.length === 0 ? (
                <p className="text-sm text-amber-600">Ninguna — nada quedó guardado para usar sin conexión.</p>
              ) : (
                info.caches.map(c => <Row key={c.name} label={c.name} value={`${c.entries} archivos`} ok={c.entries > 0} />)
              )}
            </section>

            <section className="bg-white rounded-xl border border-slate-200 p-4">
              <h2 className="text-xs font-semibold uppercase text-slate-400 mb-1">Datos locales (iglesias)</h2>
              {info.idbError && <p className="text-xs text-red-600">{info.idbError}</p>}
              {info.idb && (
                <>
                  <Row label="Iglesias guardadas" value={String(info.idb.churches)} ok={info.idb.churches > 0} />
                  <Row label="Entregas guardadas" value={String(info.idb.distributions)} />
                  <Row label="Cambios pendientes de sincronizar" value={String(info.idb.mutations)} />
                </>
              )}
            </section>

            <section className="bg-white rounded-xl border border-slate-200 p-4">
              <h2 className="text-xs font-semibold uppercase text-slate-400 mb-1">Navegador</h2>
              <p className="text-xs text-slate-600 break-all">{info.userAgent}</p>
            </section>

            <button
              onClick={() => { navigator.clipboard?.writeText(raw); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
              className="w-full py-2.5 rounded-lg bg-navy text-white text-sm font-medium"
            >
              {copied ? 'Copiado ✓' : 'Copiar todo como texto'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
