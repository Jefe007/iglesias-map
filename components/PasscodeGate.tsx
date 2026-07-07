'use client'

import { useState } from 'react'
import type { Role } from '@/lib/api'

interface Props {
  role: Role | null
  onUnlock: (passcode: string) => Promise<boolean>
  onLock: () => void
}

const ROLE_LABEL: Record<Role, string> = { supervision: 'Supervision', deposito: 'Warehouse/Admin' }

// Afordancia de passcode independiente para páginas nuevas (Catálogo, Solicitudes,
// Choferes) que todavía no comparten un nav/layout con app/page.tsx — eso llega en la
// Fase 6. El passcode desbloqueado aquí también aplica en Inicio/Mapa y viceversa.
export default function PasscodeGate({ role, onUnlock, onLock }: Props) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState<null | 'wrong' | 'offline'>(null)
  const [verifying, setVerifying] = useState(false)

  if (role) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="px-2 py-1 rounded-full bg-[var(--olive-50)] text-[var(--olive-600)] font-medium whitespace-nowrap">
          {ROLE_LABEL[role]}
        </span>
        <button onClick={onLock} className="text-slate-400 hover:text-slate-600 underline">Log out</button>
      </div>
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setVerifying(true)
    const ok = await onUnlock(code)
    setVerifying(false)
    if (ok) { setOpen(false); setCode('') } else { setError(navigator.onLine ? 'wrong' : 'offline') }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs font-medium text-[var(--olive)] hover:underline whitespace-nowrap">
        Unlock editing
      </button>
    )
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <form onSubmit={submit} className="flex items-center gap-1.5">
        <input
          type="password"
          autoFocus
          value={code}
          onChange={e => { setCode(e.target.value); setError(null) }}
          placeholder="Passcode"
          className={`border rounded-lg px-2 py-1 text-xs w-28 focus:outline-none focus:ring-2 focus:ring-[var(--olive)] ${error ? 'border-red-400' : 'border-gray-300'}`}
        />
        <button type="submit" disabled={verifying} className="text-xs px-2.5 py-1 rounded-lg bg-navy text-white font-medium disabled:opacity-50">
          {verifying ? '…' : 'Enter'}
        </button>
        <button type="button" onClick={() => { setOpen(false); setError(null) }} className="text-xs text-slate-400 hover:text-slate-600">
          Cancel
        </button>
      </form>
      {error && (
        <p className="text-[10px] text-red-400 whitespace-nowrap">
          {error === 'offline' ? 'No connection — verify this passcode online once first.' : 'Incorrect passcode'}
        </p>
      )}
    </div>
  )
}
