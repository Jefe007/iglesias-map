import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Project = 'water' | 'food' | 'nfi'
export type Unit = 'litros' | 'kg' | 'unidades' | 'cajas' | 'paquetes'
export type Urgency = 'normal' | 'urgente'
export type RequestStatus = 'pendiente' | 'preparada' | 'entregada'

export const PROJECT_LABELS: Record<Project, string> = { water: 'Water', food: 'Food', nfi: 'NFI' }
export const PROJECT_COLORS: Record<Project, string> = { water: '#0891b2', food: '#ea580c', nfi: '#7c3aed' }

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
