'use client'

import { useCallback, useEffect, useState } from 'react'
import { flushQueue } from './offlineSync'
import { getPendingMutationCount } from './offlineStore'

export type TileProgress = { done: number; total: number } | null

export function useOfflineStatus() {
  const [online, setOnline] = useState(true)
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [tileProgress, setTileProgress] = useState<TileProgress>(null)

  const refreshPending = useCallback(async () => {
    setPending(await getPendingMutationCount())
  }, [])

  const sync = useCallback(async () => {
    setSyncing(true)
    await flushQueue()
    await refreshPending()
    setSyncing(false)
  }, [refreshPending])

  useEffect(() => {
    setOnline(navigator.onLine)
    refreshPending()

    const handleOnline = () => { setOnline(true); sync() }
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    if (navigator.onLine) sync()

    const interval = setInterval(refreshPending, 5000)

    // Surfaces the SW's background tile/asset warm-up (see public/sw.js) so the
    // field team can tell when it's actually safe to lose signal, instead of
    // finding out mid-use that a zoom level or region never finished caching.
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'tile-progress') return
      const { done, total } = event.data as { done: number; total: number }
      setTileProgress(done >= total ? null : { done, total })
    }
    navigator.serviceWorker?.addEventListener('message', handleMessage)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
      navigator.serviceWorker?.removeEventListener('message', handleMessage)
    }
  }, [sync, refreshPending])

  return { online, pending, syncing, sync, tileProgress }
}
