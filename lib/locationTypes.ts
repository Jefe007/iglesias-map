import type { Church } from './supabase'

export type SpecialLocationType = 'base' | 'deposito' | 'desalinizador'

export function isSpecialLocation(marker_type: Church['marker_type']): marker_type is SpecialLocationType {
  return marker_type === 'base' || marker_type === 'deposito' || marker_type === 'desalinizador'
}

export const LOCATION_LABELS: Record<SpecialLocationType, string> = {
  base: 'Base',
  deposito: 'Warehouse',
  desalinizador: 'Water Desalination Plant',
}

// All marker types, not just the "special" ones — used wherever the church
// add/edit form needs to label or title itself by whatever type is selected.
export const MARKER_TYPE_LABELS: Record<Church['marker_type'], string> = {
  church: 'Church',
  hospital: 'Field Hospital',
  ...LOCATION_LABELS,
}

// The desalination plant intentionally shares its tone with the Water project's default color (#0891b2).
export const LOCATION_COLORS: Record<SpecialLocationType, string> = {
  base: '#1b2a4a',
  deposito: '#64748b',
  desalinizador: '#0891b2',
}
