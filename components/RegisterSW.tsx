'use client'

import { useEffect } from 'react'

export default function RegisterSW() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {})
    // Kick off (or resume) the deep offline-tile download whenever the app
    // opens with a connection — see the 'precache-tiles' handler in sw.js.
    if (navigator.onLine) {
      navigator.serviceWorker.ready
        .then(reg => reg.active?.postMessage('precache-tiles'))
        .catch(() => {})
    }
  }, [])
  return null
}
