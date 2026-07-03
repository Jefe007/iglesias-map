import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isAuthorized } from '@/lib/serverAuth'

const MAX_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export async function POST(request: Request) {
  if (!isAuthorized(request)) return Response.json({ error: 'No autorizado' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file')

  if (!(file instanceof File)) return Response.json({ error: 'Falta el archivo' }, { status: 400 })
  if (!ALLOWED_TYPES.includes(file.type)) return Response.json({ error: 'Tipo de archivo no válido' }, { status: 400 })
  if (file.size > MAX_SIZE) return Response.json({ error: 'El archivo es demasiado grande' }, { status: 400 })

  const ext = file.type.split('/')[1]
  const path = `${crypto.randomUUID()}.${ext}`

  const { error } = await supabaseAdmin.storage
    .from('church-photos')
    .upload(path, file, { contentType: file.type })

  if (error) return Response.json({ error: error.message }, { status: 400 })

  const { data } = supabaseAdmin.storage.from('church-photos').getPublicUrl(path)
  return Response.json({ url: data.publicUrl })
}
