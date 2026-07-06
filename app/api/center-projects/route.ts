import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isAuthorized } from '@/lib/serverAuth'

// Reemplaza el conjunto completo de proyectos activos de un centro (no hay
// PATCH incremental: la UI siempre manda la lista completa de checkboxes marcados).
export async function PUT(request: Request) {
  if (!isAuthorized(request, ['deposito'])) return Response.json({ error: 'Not authorized' }, { status: 401 })

  const { church_id, projects } = await request.json()
  if (!church_id) return Response.json({ error: 'Missing church_id' }, { status: 400 })

  const { error: deleteError } = await supabaseAdmin.from('center_projects').delete().eq('church_id', church_id)
  if (deleteError) return Response.json({ error: deleteError.message }, { status: 400 })

  const rows = (projects || []).map((project: string) => ({ church_id, project }))
  if (rows.length > 0) {
    const { error: insertError } = await supabaseAdmin.from('center_projects').insert(rows)
    if (insertError) return Response.json({ error: insertError.message }, { status: 400 })
  }

  return Response.json({ ok: true })
}
