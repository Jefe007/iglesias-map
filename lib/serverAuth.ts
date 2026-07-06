export type Role = 'supervision' | 'deposito'

// Depósito/Admin es superconjunto de Supervisión: su passcode desbloquea
// también las acciones que solo requieren el rol de Supervisión.
export function roleForPasscode(passcode: string): Role | null {
  if (!passcode) return null
  if (passcode === process.env.DEPOSITO_PASSCODE) return 'deposito'
  if (passcode === process.env.SUPERVISION_PASSCODE) return 'supervision'
  return null
}

export function isAuthorized(request: Request, allowed: Role[] = ['supervision', 'deposito']): boolean {
  const passcode = request.headers.get('x-edit-passcode') || ''
  const role = roleForPasscode(passcode)
  if (!role) return false
  if (role === 'deposito') return true
  return allowed.includes(role)
}
