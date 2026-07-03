'use client'

import { useCallback, useEffect, useState } from 'react'
import { flushQueue } from './offlineSync'
import { getPendingMutationCount } from './offlineStore'

export function useOfflineStatus() {
  const [online, setOnline] = useState(true)
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)

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
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
    }
  }, [sync, refreshPending])

  return { online, pending, syncing, sync }
}
