import { IconHospital } from '@/lib/icons'
import { LOCATION_LABELS, LOCATION_COLORS, type SpecialLocationType } from '@/lib/locationTypes'

const ROWS: { color: string; label: string }[] = [
  { color: '#2563eb', label: 'Church' },
  { color: '#94a3b8', label: 'Church (location pending)' },
  { color: '#dc2626', label: 'Distribution center' },
]

const LOCATION_TYPES: SpecialLocationType[] = ['base', 'deposito', 'desalinizador']

export default function MapLegend() {
  return (
    <div className="absolute bottom-16 md:bottom-3 left-2 md:left-3 z-[900] bg-white/95 backdrop-blur-sm rounded-lg shadow-md border border-slate-200 px-2.5 md:px-3 py-2 text-xs text-slate-700 space-y-1.5 max-w-[calc(100vw-1rem)]">
      {ROWS.map(row => (
        <div key={row.label} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: row.color }} />
          <span>{row.label}</span>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full flex items-center justify-center flex-shrink-0 bg-[#808733]">
          <IconHospital className="w-2 h-2 text-white" />
        </span>
        <span>Field hospital</span>
      </div>
      {LOCATION_TYPES.map(type => (
        <div key={type} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: LOCATION_COLORS[type] }} />
          <span>{LOCATION_LABELS[type]}</span>
        </div>
      ))}
    </div>
  )
}
