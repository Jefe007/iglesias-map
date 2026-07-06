'use client'

import { useCallback, useEffect, useState } from 'react'
import { getStoredRole, setStoredPasscode, clearStoredPasscode, verifyPasscode, type Role } from './api'

// Lee/gestiona el rol desbloqueado (Supervisión/Depósito) para páginas nuevas que
// todavía no comparten un layout/nav con app/page.tsx (eso llega en la Fase 6). El
// passcode desbloqueado en cualquier página aplica a todas: se guarda en sessionStorage.
export function useEditRole() {
  // Arranca en null (igual que el render del servidor, que no tiene sessionStorage) y
  // se actualiza en un efecto tras montar — leerlo síncrono en el estado inicial
  // producía un mismatch de hidratación en cuanto había un rol ya guardado.
  const [role, setRole] = useState<Role | null>(null)
  useEffect(() => { setRole(getStoredRole()) }, [])

  const unlock = useCallback(async (passcode: string): Promise<boolean> => {
    const ok = await verifyPasscode(passcode)
    if (ok) {
      setStoredPasscode(passcode)
      setRole(getStoredRole())
    }
    return ok
  }, [])

  const lock = useCallback(() => {
    clearStoredPasscode()
    setRole(null)
  }, [])

  return { role, unlock, lock }
}
