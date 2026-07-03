import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
  marker_type: 'church' | 'hospital'
  image_url: string | null
  created_at: string
}

export type Distribution = {
  id: string
  distribution_center_id: string
  distributed_at: string
  items: string
  families_served: number | null
  notes: string | null
  created_at: string
}
