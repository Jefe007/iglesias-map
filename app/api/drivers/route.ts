import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isAuthorized } from '@/lib/serverAuth'

export async function POST(request: Request) {
  if (!isAuthorized(request, ['deposito'])) return Response.json({ error: 'Not authorized' }, { status: 401 })

  const body = await request.json()
  const { data, error } = await supabaseAdmin.from('drivers').insert(body).select().single()

  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ data })
}

export async function PATCH(request: Request) {
  if (!isAuthorized(request, ['deposito'])) return Response.json({ error: 'Not authorized' }, { status: 401 })

  const { id, ...fields } = await request.json()
  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('drivers')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ data })
}
