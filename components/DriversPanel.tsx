'use client'

import { useEffect, useState } from 'react'
import { Driver } from '@/lib/supabase'
import { getDrivers } from '@/lib/offlineStore'

export default function DriversPanel() {
  const [open, setOpen] = useState(false)
  const [drivers, setDrivers] = useState<Driver[]>([])

  useEffect(() => { getDrivers().then(({ data }) => setDrivers(data)) }, [])

  const available = drivers.filter(d => d.available)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white hover:border-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--olive)] transition-colors"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-slate-500">
          <path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.5a1 1 0 0 0-1 .8L3.5 12H2a1 1 0 0 0-1 1v3h3" />
          <circle cx="7" cy="16" r="2" /><circle cx="17" cy="16" r="2" />
        </svg>
        <span className="font-medium text-slate-700 hidden sm:inline">Drivers</span>
        <span className="font-data text-xs bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">{available.length}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[1200]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1.5 w-64 bg-white rounded-xl shadow-xl border border-slate-200 p-1.5 z-[1300]">
            <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Available drivers</div>
            {available.length === 0 ? (
              <p className="px-2.5 py-2 text-xs text-slate-400">None available right now.</p>
            ) : (
              available.map(d => (
                <div key={d.id} className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg hover:bg-slate-50">
                  <span className="text-sm text-slate-800">{d.name}</span>
                  <a href={`tel:${d.phone}`} className="text-xs text-blue-600 hover:underline whitespace-nowrap">{d.phone}</a>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
