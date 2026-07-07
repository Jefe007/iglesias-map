import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// A free-form key referencing projects.key (see ProjectDef below) — not a fixed
// union anymore. Water/food/nfi are just the seeded rows; Depósito/Admin can add
// more (e.g. "shelters") from the Catálogo page.
export type Project = string
export type Unit = 'litros' | 'kg' | 'unidades' | 'cajas' | 'paquetes'
export type Urgency = 'normal' | 'urgente'
export type RequestStatus = 'pendiente' | 'preparada' | 'entregada'

export type ProjectDef = {
  key: string
  label: string
  color: string
  sort_order: number
  active: boolean
  created_at: string
}

// Small, distinct palette offered when creating a new project — avoids navy
// (reserved for brand chrome) and stays visually distinct from existing colors.
export const PROJECT_COLOR_PALETTE = ['#0891b2', '#ea580c', '#7c3aed', '#16a34a', '#db2777', '#ca8a04', '#4f46e5', '#0d9488']

export function projectMap(projects: ProjectDef[]): Record<string, ProjectDef> {
  return Object.fromEntries(projects.map(p => [p.key, p]))
}

export type Church = {
  id: string
  name: string
  pastor_name: string | null
  phone: string | null
  email: string | null
  parish: string
  address: string | null
  lat: number | null
  lng: number | null
  is_distribution_center: boolean
  notes: string | null
  geocode_status: 'validado' | 'pendiente' | 'aproximado' | null
  distribution_center_id: string | null
  marker_type: 'church' | 'hospital' | 'base' | 'deposito' | 'desalinizador'
  image_url: string | null
  created_at: string
}

export type Distribution = {
  id: string
  distribution_center_id: string
  distributed_at: string
  items: string | null
  families_served: number | null
  notes: string | null
  created_at: string
}

export type CenterProject = {
  church_id: string
  project: Project
}

export type Item = {
  id: string
  project: Project
  name: string
  unit: Unit
  active: boolean
  created_at: string
}

export type DistributionItem = {
  id: string
  distribution_id: string
  project: Project
  item_id: string
  quantity: number
  created_at: string
}

export type ServiceRequest = {
  id: string
  church_id: string
  project: Project
  item_id: string
  quantity_needed: number | null
  note: string | null
  urgency: Urgency
  status: RequestStatus
  created_at: string
  updated_at: string
}

export type Driver = {
  id: string
  name: string
  phone: string
  available: boolean
  updated_at: string
}
