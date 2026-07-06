import { roleForPasscode } from '@/lib/serverAuth'

export async function POST(request: Request) {
  const { passcode } = await request.json()
  const role = typeof passcode === 'string' ? roleForPasscode(passcode) : null
  return Response.json({ ok: role !== null, role })
}
