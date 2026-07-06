import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isAuthorized } from '@/lib/serverAuth'

export async function POST(request: Request) {
  if (!isAuthorized(request, ['deposito'])) return Response.json({ error: 'Not authorized' }, { status: 401 })

  const { lines, ...header } = await request.json()
  const { data, error } = await supabaseAdmin.from('distributions').insert(header).select().single()
  if (error) return Response.json({ error: error.message }, { status: 400 })

  if (Array.isArray(lines) && lines.length > 0) {
    const rows = lines.map((l: { project: string; item_id: string; quantity: number }) => ({
      distribution_id: data.id, project: l.project, item_id: l.item_id, quantity: l.quantity,
    }))
    const { error: linesError } = await supabaseAdmin.from('distribution_items').insert(rows)
    if (linesError) return Response.json({ error: linesError.message }, { status: 400 })
  }

  return Response.json({ data })
}

export async function DELETE(request: Request) {
  if (!isAuthorized(request, ['deposito'])) return Response.json({ error: 'Not authorized' }, { status: 401 })

  const { id } = await request.json()
  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await supabaseAdmin.from('distributions').delete().eq('id', id)

  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ ok: true })
}
