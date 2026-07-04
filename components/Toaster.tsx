'use client'

import { useEffect, useState } from 'react'
import { subscribeToasts, dismissToast, type Toast } from '@/lib/toast'
import { IconCheck, IconX } from '@/lib/icons'

export default function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => subscribeToasts(setToasts), [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0 z-[2000] flex flex-col gap-2 w-[calc(100%-2rem)] sm:w-80">
      {toasts.map(t => (
        <div
          key={t.id}
          role="status"
          className={`flex items-start gap-2.5 rounded-lg px-3.5 py-3 shadow-lg text-sm font-medium text-white ${t.kind === 'error' ? 'bg-red-600' : 'bg-[var(--navy)]'}`}
        >
          <span className="mt-0.5 flex-shrink-0">
            {t.kind === 'error' ? <IconX className="w-4 h-4" /> : <IconCheck className="w-4 h-4" />}
          </span>
          <span className="flex-1">{t.message}</span>
          <button onClick={() => dismissToast(t.id)} aria-label="Cerrar notificación" className="flex-shrink-0 text-white/60 hover:text-white">
            <IconX className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
