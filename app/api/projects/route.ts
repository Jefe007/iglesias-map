import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isAuthorized } from '@/lib/serverAuth'

export async function POST(request: Request) {
  if (!isAuthorized(request, ['deposito'])) return Response.json({ error: 'Not authorized' }, { status: 401 })

  const body = await request.json()
  const { data, error } = await supabaseAdmin.from('projects').insert(body).select().single()

  if (error) {
    const message = error.code === '23505' ? 'A project with that name already exists' : error.message
    return Response.json({ error: message }, { status: 400 })
  }
  return Response.json({ data })
}

export async function PATCH(request: Request) {
  if (!isAuthorized(request, ['deposito'])) return Response.json({ error: 'Not authorized' }, { status: 401 })

  const { key, ...fields } = await request.json()
  if (!key) return Response.json({ error: 'Missing key' }, { status: 400 })

  const { data, error } = await supabaseAdmin.from('projects').update(fields).eq('key', key).select().single()

  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ data })
}
