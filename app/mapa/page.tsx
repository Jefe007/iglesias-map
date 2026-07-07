'use client'

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { Map as LeafletMap } from 'leaflet'
import { Church, Distribution, DistributionItem, Item, Project, PROJECT_LABELS, PROJECT_COLORS } from '@/lib/supabase'
import { updateChurch, deleteChurch, verifyPasscode, getStoredPasscode, setStoredPasscode, deleteDistribution, getStoredRole, setCenterProjects } from '@/lib/api'
import { getChurches as getChurchesOffline, getDistributionsForCenter, getCenterProjects, getAllDistributionItems, getItems } from '@/lib/offlineStore'
import { useOfflineStatus } from '@/lib/useOfflineStatus'
import { showToast } from '@/lib/toast'
import { IconSearch, IconX, IconMapPin, IconHospital, IconCompass, IconUser, IconUsers, IconClock } from '@/lib/icons'
import MapLegend from '@/components/MapLegend'
import DriversPanel from '@/components/DriversPanel'
import NavMenu from '@/components/NavMenu'
import { useFocusTrap } from '@/lib/useFocusTrap'
import { isSpecialLocation, LOCATION_LABELS, LOCATION_COLORS } from '@/lib/locationTypes'

const ChurchMap = dynamic(() => import('@/components/ChurchMap'), { ssr: false })
const ChurchForm = dynamic(() => import('@/components/ChurchForm'), { ssr: false })
const DistributionForm = dynamic(() => import('@/components/DistributionForm'), { ssr: false })

const DEFAULT_PARISHES = ['Naiguata', 'Carayaca', 'Caraballeda', 'Maiquetia', 'La Guaira', 'Catia La Mar', 'Urimare', 'Soublet', 'Caracas']
const ALL_OPTION = 'All'
const ALL_PROJECTS: Project[] = ['water', 'food', 'nfi']

type LayerKey = 'churches' | 'distribution' | 'hospital' | 'base' | 'deposito' | 'desalinizador'
type Layers = Record<LayerKey, boolean>

const DEFAULT_LAYERS: Layers = { churches: true, distribution: true, hospital: true, base: true, deposito: true, desalinizador: true }

function layerOf(c: Church): LayerKey {
  if (c.marker_type === 'hospital' || c.marker_type === 'base' || c.marker_type === 'deposito' || c.marker_type === 'desalinizador') return c.marker_type
  if (c.is_distribution_center) return 'distribution'
  return 'churches'
}

export default function MapaPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-dvh bg-gray-50 text-gray-500 text-sm">Loading map...</div>}>
      <MapaPageInner />
    </Suspense>
  )
}

function MapaPageInner() {
  const searchParams = useSearchParams()
  const [allChurches, setAllChurches] = useState<Church[]>([])
  const [parish, setParish] = useState(ALL_OPTION)
  const [layers, setLayers] = useState<Layers>(DEFAULT_LAYERS)
  const [layersOpen, setLayersOpen] = useState(false)
  const [selected, setSelected] = useState<Church | null>(null)
  const [loading, setLoading] = useState(true)
  const [settingLocationFor, setSettingLocationFor] = useState<Church | null>(null)
  const [search, setSearch] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [showRoutes, setShowRoutes] = useState(false)
  const mapRef = useRef<LeafletMap | null>(null)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const sheetDrag = useRef<{ startY: number; startOffset: number; dragging: boolean } | null>(null)
  const suppressSheetClick = useRef(false)

  // Edit mode / passcode
  const [editMode, setEditMode] = useState(false)
  const [passcodeModalOpen, setPasscodeModalOpen] = useState(false)
  const [passcodeInput, setPasscodeInput] = useState('')
  const [passcodeError, setPasscodeError] = useState(false)
  const [verifying, setVerifying] = useState(false)

  // Add/Edit form
  const [formOpen, setFormOpen] = useState(false)
  const [formChurch, setFormChurch] = useState<Church | null>(null)
  const [pickingForForm, setPickingForForm] = useState(false)
  const [pickedCoords, setPickedCoords] = useState<{ lat: number; lng: number } | null>(null)

  // Delete confirmation
  const [confirmDeleteChurch, setConfirmDeleteChurch] = useState<Church | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Distribution log (for the selected distribution center)
  const [distributions, setDistributions] = useState<Distribution[]>([])
  const [distributionItems, setDistributionItems] = useState<DistributionItem[]>([])
  const [itemsCatalog, setItemsCatalog] = useState<Item[]>([])
  const [distributionsLoading, setDistributionsLoading] = useState(false)
  const [distributionFormOpen, setDistributionFormOpen] = useState(false)
  const [confirmDeleteDistribution, setConfirmDeleteDistribution] = useState<Distribution | null>(null)
  const [deletingDistribution, setDeletingDistribution] = useState(false)

  const { online, pending, syncing } = useOfflineStatus()

  const [centerProjects, setCenterProjectsState] = useState<Record<string, Project[]>>({})
  const [savingProjects, setSavingProjects] = useState(false)
  // Starts false (same as the server, with no access to sessionStorage) and is
  // corrected in an effect after mount, to avoid a hydration mismatch.
  const [canManageProjects, setCanManageProjects] = useState(false)
  useEffect(() => { setCanManageProjects(getStoredRole() === 'deposito') }, [])

  const fetchChurches = useCallback(async () => {
    setLoading(true)
    const { data } = await getChurchesOffline()
    setAllChurches(data)
    setLoading(false)
  }, [])

  const fetchCenterProjects = useCallback(async () => {
    const { data } = await getCenterProjects()
    setCenterProjectsState(data)
  }, [])

  useEffect(() => { fetchCenterProjects() }, [fetchCenterProjects])
  useEffect(() => { getItems().then(({ data }) => setItemsCatalog(data)) }, [])

  const toggleCenterProject = async (church: Church, project: Project) => {
    const current = centerProjects[church.id] || []
    const next = current.includes(project) ? current.filter(p => p !== project) : [...current, project]
    setSavingProjects(true)
    try {
      await setCenterProjects(church.id, next)
      setCenterProjectsState(prev => ({ ...prev, [church.id]: next }))
    } catch (e) {
      showToast((e as Error).message, 'error')
    } finally {
      setSavingProjects(false)
    }
  }

  const churches = parish === ALL_OPTION ? allChurches : allChurches.filter(c => c.parish === parish)

  useEffect(() => { fetchChurches() }, [fetchChurches])

  const wasSyncing = useRef(false)
  useEffect(() => {
    if (wasSyncing.current && !syncing) fetchChurches()
    wasSyncing.current = syncing
  }, [syncing, fetchChurches])

  const hadPending = useRef(false)
  useEffect(() => {
    if (pending > 0) hadPending.current = true
    else if (hadPending.current) {
      showToast('Sync complete')
      hadPending.current = false
    }
  }, [pending])

  const fetchDistributions = useCallback(async (centerId: string) => {
    setDistributionsLoading(true)
    const [{ data }, { data: allLines }] = await Promise.all([getDistributionsForCenter(centerId), getAllDistributionItems()])
    setDistributions(data)
    const ids = new Set(data.map(d => d.id))
    setDistributionItems(allLines.filter(l => ids.has(l.distribution_id)))
    setDistributionsLoading(false)
  }, [])

  useEffect(() => {
    if (selected && selected.is_distribution_center) {
      fetchDistributions(selected.id)
    } else {
      setDistributions([])
    }
  }, [selected, fetchDistributions])

  const handleDeleteDistributionConfirmed = async () => {
    if (!confirmDeleteDistribution) return
    setDeletingDistribution(true)
    try {
      await deleteDistribution(confirmDeleteDistribution.id)
      setConfirmDeleteDistribution(null)
      if (selected) fetchDistributions(selected.id)
      showToast('Delivery deleted')
    } catch (e) {
      showToast((e as Error).message, 'error')
    } finally {
      setDeletingDistribution(false)
    }
  }

  const [exportPreviewMode, setExportPreviewMode] = useState(false)
  const [exportTime, setExportTime] = useState('')
  const [exporting, setExporting] = useState(false)
  const exportAreaRef = useRef<HTMLDivElement | null>(null)

  // Re-fit the map whenever the chrome (header/filters/sidebar) is hidden or shown,
  // since hiding it changes the map container's available size. Leaflet's own
  // re-pan on invalidateSize() can misfire when the container jumps size (e.g.
  // right after a high-zoom flyTo), so pin the view back explicitly afterward.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const center = map.getCenter()
    const zoom = map.getZoom()
    const id = requestAnimationFrame(() => {
      map.invalidateSize()
      map.setView(center, zoom, { animate: false })
    })
    return () => cancelAnimationFrame(id)
  }, [exportPreviewMode])

  const handleStartExportPreview = () => {
    setExportTime(new Date().toLocaleString())
    setExportPreviewMode(true)
  }
  const handleCancelExportPreview = () => setExportPreviewMode(false)

  const handleConfirmExportPdf = async () => {
    const node = exportAreaRef.current
    if (!node) return
    setExporting(true)
    // Hide Leaflet's on-map controls so the exported file only shows the map itself.
    const controls = node.querySelectorAll<HTMLElement>('.leaflet-control-zoom, .leaflet-control-layers')
    controls.forEach(el => { el.style.visibility = 'hidden' })
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas-pro'),
        import('jspdf'),
      ])
      const canvas = await html2canvas(node, { useCORS: true, backgroundColor: '#ffffff', scale: 2 })
      const imgData = canvas.toDataURL('image/jpeg', 0.92)
      const pdf = new jsPDF({
        orientation: canvas.width >= canvas.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height],
      })
      pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height)
      pdf.save('la-guaira-distribution-map.pdf')
      setExportPreviewMode(false)
      showToast('PDF downloaded')
    } catch (err) {
      showToast('Could not generate the PDF: ' + (err as Error).message, 'error')
    } finally {
      controls.forEach(el => { el.style.visibility = '' })
      setExporting(false)
    }
  }

  const handleSetLocation = async (church: Church, lat: number, lng: number) => {
    try {
      await updateChurch(church.id, { lat, lng, geocode_status: 'validado' })
      setSettingLocationFor(null)
      fetchChurches()
      setSelected(prev => prev?.id === church.id ? { ...prev, lat, lng, geocode_status: 'validado' } : prev)
      showToast('Location saved')
    } catch (e) {
      showToast((e as Error).message, 'error')
    }
  }

  const openChurch = useCallback((c: Church) => { setSelected(c); setSheetOpen(true) }, [])

  const centers = churches.filter(c => c.is_distribution_center)
  const parishOptions = Array.from(new Set([...DEFAULT_PARISHES, ...churches.map(c => c.parish)])).sort()

  const reassignCenter = async (church: Church, centerId: string) => {
    try {
      await updateChurch(church.id, { distribution_center_id: centerId || null })
      fetchChurches()
      setSelected(prev => prev?.id === church.id ? { ...prev, distribution_center_id: centerId || null } : prev)
    } catch (e) {
      showToast((e as Error).message, 'error')
    }
  }

  const toggleDistribution = async (church: Church) => {
    try {
      await updateChurch(church.id, { is_distribution_center: !church.is_distribution_center })
      fetchChurches()
      setSelected(prev => prev?.id === church.id ? { ...prev, is_distribution_center: !prev.is_distribution_center } : prev)
    } catch (e) {
      showToast((e as Error).message, 'error')
    }
  }

  const activateEditMode = useCallback(async () => {
    const stored = getStoredPasscode()
    if (stored) {
      const ok = await verifyPasscode(stored)
      if (ok) { setEditMode(true); setCanManageProjects(getStoredRole() === 'deposito'); return }
    }
    setPasscodeModalOpen(true)
  }, [])

  const submitPasscode = async (e: React.FormEvent) => {
    e.preventDefault()
    setVerifying(true)
    const ok = await verifyPasscode(passcodeInput)
    setVerifying(false)
    if (ok) {
      setStoredPasscode(passcodeInput)
      setEditMode(true)
      setCanManageProjects(getStoredRole() === 'deposito')
      setPasscodeModalOpen(false)
      setPasscodeInput('')
      setPasscodeError(false)
    } else {
      setPasscodeError(true)
    }
  }

  const openAddChurch = useCallback(() => {
    setPickedCoords(null)
    setFormChurch(null)
    setFormOpen(true)
  }, [])

  const openEditChurch = (church: Church) => {
    setPickedCoords(null)
    setFormChurch(church)
    setFormOpen(true)
  }

  const closeForm = () => {
    setFormOpen(false)
    setFormChurch(null)
    setPickingForForm(false)
    setPickedCoords(null)
  }

  // Deep links from Home: /mapa?center=<id> selects a center,
  // /mapa?addChurch=1 unlocks edit mode (if a passcode is stored) and opens the add form.
  const appliedCenterParam = useRef<string | null>(null)
  useEffect(() => {
    const centerId = searchParams.get('center')
    if (centerId && centerId !== appliedCenterParam.current && allChurches.length > 0) {
      const church = allChurches.find(c => c.id === centerId)
      if (church) { openChurch(church); appliedCenterParam.current = centerId }
    }
  }, [searchParams, allChurches, openChurch])

  const appliedAddChurchParam = useRef(false)
  useEffect(() => {
    if (searchParams.get('addChurch') === '1' && !appliedAddChurchParam.current) {
      appliedAddChurchParam.current = true
      activateEditMode()
    }
  }, [searchParams, activateEditMode])
  useEffect(() => {
    if (editMode && searchParams.get('addChurch') === '1') openAddChurch()
  }, [editMode, searchParams, openAddChurch])

  const handleDeleteConfirmed = async () => {
    if (!confirmDeleteChurch) return
    setDeleting(true)
    try {
      await deleteChurch(confirmDeleteChurch.id)
      setConfirmDeleteChurch(null)
      setSelected(null)
      fetchChurches()
      showToast('Church deleted')
    } catch (e) {
      showToast((e as Error).message, 'error')
    } finally {
      setDeleting(false)
    }
  }

  const closePasscodeModal = useCallback(() => {
    setPasscodeModalOpen(false); setPasscodeInput(''); setPasscodeError(false)
  }, [])
  const passcodeModalRef = useFocusTrap<HTMLFormElement>(closePasscodeModal)

  const cancelDeleteChurch = useCallback(() => { if (!deleting) setConfirmDeleteChurch(null) }, [deleting])
  const confirmDeleteChurchRef = useFocusTrap<HTMLDivElement>(cancelDeleteChurch)

  const cancelDeleteDistribution = useCallback(() => { if (!deletingDistribution) setConfirmDeleteDistribution(null) }, [deletingDistribution])
  const confirmDeleteDistributionRef = useFocusTrap<HTMLDivElement>(cancelDeleteDistribution)

  const distCount = churches.filter(c => c.is_distribution_center).length
  const churchCount = churches.filter(c => c.marker_type !== 'hospital').length
  const filtered = churches.filter(c => {
    if (!layers[layerOf(c)]) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return c.name.toLowerCase().includes(q) || (c.pastor_name || '').toLowerCase().includes(q)
    }
    return true
  })

  // While searching (and nothing is explicitly selected), fly the map to the
  // top match without opening its detail panel, so results stay browsable.
  const focusChurch = selected ?? (search.trim() && filtered.length ? filtered[0] : null)

  const layerMeta: { key: LayerKey; label: string; color: string; count: number }[] = [
    { key: 'churches',      label: 'Churches',              color: '#2563eb', count: churches.filter(c => layerOf(c) === 'churches').length },
    { key: 'distribution',  label: 'Distribution centers',  color: '#dc2626', count: churches.filter(c => layerOf(c) === 'distribution').length },
    { key: 'hospital',      label: 'Field hospital',        color: '#7c8729', count: churches.filter(c => layerOf(c) === 'hospital').length },
    { key: 'base',          label: LOCATION_LABELS.base,          color: LOCATION_COLORS.base,          count: churches.filter(c => layerOf(c) === 'base').length },
    { key: 'deposito',      label: LOCATION_LABELS.deposito,      color: LOCATION_COLORS.deposito,      count: churches.filter(c => layerOf(c) === 'deposito').length },
    { key: 'desalinizador', label: LOCATION_LABELS.desalinizador, color: LOCATION_COLORS.desalinizador, count: churches.filter(c => layerOf(c) === 'desalinizador').length },
  ]
  const activeLayers = (Object.keys(layers) as LayerKey[]).filter(k => layers[k]).length

  const activeLayerLabels = layerMeta.filter(l => layers[l.key]).map(l => l.label).join(', ') || 'None'

  // Drag-to-open/close for the mobile bottom sheet. Only the "is this a real
  // drag" case is handled here — a plain tap falls through to the button's
  // onClick untouched, so keyboard/mouse activation keeps working exactly as
  // before. 3.25rem below matches the handle height baked into the sheet's
  // collapsed translate-y class.
  const sheetClosedOffset = () => {
    const el = sheetRef.current
    return el ? el.getBoundingClientRect().height - 52 : 0
  }
  const handleSheetPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    sheetDrag.current = { startY: e.clientY, startOffset: sheetOpen || selected ? 0 : sheetClosedOffset(), dragging: false }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* not all pointer types support capture; drag still works without it */ }
  }
  const handleSheetPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const state = sheetDrag.current
    const el = sheetRef.current
    if (!state || !el) return
    const deltaY = e.clientY - state.startY
    if (!state.dragging) {
      if (Math.abs(deltaY) < 6) return
      state.dragging = true
      el.style.transitionProperty = 'none'
    }
    e.preventDefault()
    const closedOffset = sheetClosedOffset()
    const next = Math.min(Math.max(state.startOffset + deltaY, 0), closedOffset)
    el.style.transform = `translateY(${next}px)`
  }
  const handleSheetPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const state = sheetDrag.current
    const el = sheetRef.current
    sheetDrag.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* no-op if it was never captured */ }
    if (!state || !el || !state.dragging) return
    el.style.transitionProperty = ''
    el.style.transform = ''
    suppressSheetClick.current = true
    // Fixed thumb-distance thresholds rather than "past halfway": the sheet
    // can be nearly full-screen when open, and requiring a drag across half
    // of that would make closing it impractically far to swipe.
    const deltaY = e.clientY - state.startY
    const wasOpen = state.startOffset === 0
    const shouldOpen = wasOpen ? deltaY < 100 : deltaY < -60
    setSheetOpen(shouldOpen)
    if (!shouldOpen && selected) setSelected(null)
  }
  const handleSheetPointerCancel = () => {
    sheetDrag.current = null
    const el = sheetRef.current
    if (el) { el.style.transitionProperty = ''; el.style.transform = '' }
  }
  const handleSheetClick = () => {
    if (suppressSheetClick.current) { suppressSheetClick.current = false; return }
    setSheetOpen(o => !o)
    if (selected) setSelected(null)
  }

  return (
    <div className="flex flex-col h-dvh bg-gray-50">
      {/* Header */}
      <header className={`bg-navy text-white px-4 py-3 flex items-center justify-between shadow-lg z-10 ${exportPreviewMode ? 'hidden' : ''}`}>
        <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
          <img src="/logosp.jpg" alt="Samaritan's Purse" className="w-9 h-9 rounded-full object-cover border-2 border-white/20 flex-shrink-0" />
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-bold leading-tight font-sans-pro truncate">La Guaira Distribution Network</h1>
            <p className="text-white/50 text-[11px] font-data uppercase tracking-wide truncate">Samaritan&apos;s Purse</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${!online ? 'bg-red-500/20 text-red-200' : pending > 0 ? 'bg-amber-400/20 text-amber-200' : 'bg-white/10 text-white/50'}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${!online ? 'bg-red-400' : pending > 0 ? 'bg-amber-300' : 'bg-emerald-400'}`} />
            <span className="hidden sm:inline">
              {!online ? 'Offline' : syncing ? 'Syncing…' : pending > 0 ? `${pending} pending change${pending !== 1 ? 's' : ''}` : 'Online'}
            </span>
          </div>
          <div className="text-right text-sm hidden sm:block">
            <div className="text-white font-semibold font-data">{churchCount} churches</div>
            <div className="text-white/50 text-xs font-data">{distCount} distribution centers</div>
          </div>
          <button
            onClick={editMode ? () => setEditMode(false) : activateEditMode}
            title={editMode ? 'Exit edit mode' : 'Enter edit mode'}
            aria-label={editMode ? 'Exit edit mode' : 'Enter edit mode'}
            className={`p-2 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${editMode ? 'bg-olive text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
          >
            {editMode ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            )}
          </button>
          <Link
            href="/"
            className="hidden sm:inline-block bg-white/10 hover:bg-white/20 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            Home
          </Link>
          <Link
            href="/choferes"
            className="hidden sm:inline-block bg-white/10 hover:bg-white/20 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            Drivers
          </Link>
          <Link
            href="/solicitudes"
            className="hidden sm:inline-block bg-white/10 hover:bg-white/20 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            Requests
          </Link>
          <Link
            href="/metricas"
            className="hidden md:inline-block bg-white/10 hover:bg-white/20 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            Metrics
          </Link>
          <Link
            href="/catalogo"
            className="hidden sm:inline-block bg-white/10 hover:bg-white/20 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            Catalog
          </Link>
          <Link
            href="/dashboard"
            className="bg-olive hover:bg-[var(--olive-600)] px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            Dashboard
          </Link>
          <NavMenu />
        </div>
      </header>

      {/* Filters */}
      <div className={`bg-white border-b px-4 py-2 flex gap-3 items-center flex-wrap shadow-sm relative z-[1100] ${exportPreviewMode ? 'hidden' : ''}`}>
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"><IconSearch className="w-3.5 h-3.5" /></span>
          <input
            type="text"
            placeholder="Search church or pastor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg pl-8 pr-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><IconX className="w-3 h-3" /></button>
          )}
        </div>

        <select
          value={parish}
          onChange={e => setParish(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value={ALL_OPTION}>All parishes</option>
          {parishOptions.map(p => <option key={p}>{p}</option>)}
        </select>

        {/* Layers multi-select dropdown */}
        <div className="relative">
          <button
            onClick={() => setLayersOpen(o => !o)}
            className="flex items-center gap-2 border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white hover:border-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--olive)] transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-slate-500">
              <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.84zM2 12l8.58 3.91a2 2 0 0 0 1.66 0L22 12M2 17l8.58 3.91a2 2 0 0 0 1.66 0L22 17" />
            </svg>
            <span className="font-medium text-slate-700">Layers</span>
            <span className="font-data text-xs bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">{activeLayers}/{layerMeta.length}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-3.5 h-3.5 text-slate-400 transition-transform ${layersOpen ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>

          {layersOpen && (
            <>
              <div className="fixed inset-0 z-[1200]" onClick={() => setLayersOpen(false)} />
              <div className="absolute left-0 top-full mt-1.5 w-60 bg-white rounded-xl shadow-xl border border-slate-200 p-1.5 z-[1300]">
                <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Show on map</div>
                {layerMeta.map(({ key, label, color, count }) => {
                  const on = layers[key]
                  return (
                    <button
                      key={key}
                      onClick={() => setLayers(l => ({ ...l, [key]: !l[key] }))}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-50 transition-colors text-left"
                    >
                      <span className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${on ? 'border-transparent' : 'border-slate-300'}`} style={on ? { background: color } : undefined}>
                        {on && <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="w-3 h-3"><path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                      </span>
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className={`text-sm flex-1 ${on ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>{label}</span>
                      <span className="font-data text-xs text-slate-400">{count}</span>
                    </button>
                  )
                })}
                <div className="flex gap-1 px-1.5 pt-1.5 mt-1 border-t border-slate-100">
                  <button onClick={() => setLayers({ churches: true, distribution: true, hospital: true, base: true, deposito: true, desalinizador: true })} className="flex-1 text-xs py-1.5 rounded-md text-slate-600 hover:bg-slate-100 transition-colors">All</button>
                  <button onClick={() => setLayers({ churches: false, distribution: false, hospital: false, base: false, deposito: false, desalinizador: false })} className="flex-1 text-xs py-1.5 rounded-md text-slate-600 hover:bg-slate-100 transition-colors">None</button>
                </div>
              </div>
            </>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showRoutes}
            onChange={e => setShowRoutes(e.target.checked)}
            className="w-4 h-4"
            style={{ accentColor: 'var(--olive)' }}
          />
          <span className="text-slate-700">Show routes</span>
        </label>

        <button
          onClick={handleStartExportPreview}
          title="Preview and export the current map as a PDF"
          className="flex items-center gap-1.5 border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white hover:border-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--olive)] transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-slate-500">
            <path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
          </svg>
          <span className="font-medium text-slate-700 hidden sm:inline">Export PDF</span>
        </button>

        <DriversPanel />

        {editMode && (
          <button
            onClick={openAddChurch}
            className="ml-auto flex items-center gap-1.5 bg-navy text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-[var(--navy-700)] transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            Add church
          </button>
        )}
      </div>

      {/* Export preview controls (not part of the captured area) */}
      {exportPreviewMode && (
        <div className="bg-navy text-white px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between gap-2 shadow-lg flex-shrink-0">
          <div className="min-w-0">
            <div className="font-semibold text-xs sm:text-sm whitespace-nowrap">Export preview</div>
            <div className="text-white/60 text-[11px] hidden sm:block">This is exactly what will be saved as a PDF. Pan or zoom the map, then click Download PDF.</div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={handleCancelExportPreview} disabled={exporting} className="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button onClick={handleConfirmExportPdf} disabled={exporting} className="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium bg-olive hover:bg-[var(--olive-600)] transition-colors whitespace-nowrap disabled:opacity-50">
              {exporting ? 'Generating…' : 'Download PDF'}
            </button>
          </div>
        </div>
      )}

      {/* Export capture area: this header + the map are what gets saved to the PDF */}
      <div ref={exportAreaRef} className="flex flex-col flex-1 overflow-hidden">
        <div className={`items-center gap-2.5 px-3 py-2 border-b border-gray-200 flex-shrink-0 ${exportPreviewMode ? 'flex' : 'hidden'}`}>
          <img src="/logosp.jpg" alt="Samaritan's Purse" className="w-8 h-8 rounded-full object-cover" />
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold leading-tight font-sans-pro text-navy">La Guaira Distribution Network</h1>
            <p className="text-gray-500 text-[10px] uppercase tracking-wide">Samaritan&apos;s Purse</p>
          </div>
          <div className="text-[10px] text-gray-500 text-right flex-shrink-0">
            <div>Parish: {parish === ALL_OPTION ? 'All' : parish} · Layers: {activeLayerLabels} · Routes: {showRoutes ? 'Yes' : 'No'}</div>
            <div>Generated on {exportTime}</div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex flex-1 overflow-hidden relative">
        {/* Map */}
        <div className="flex-1 relative">
          {loading && allChurches.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-20">
              <div className="text-gray-500 text-sm">Loading map...</div>
            </div>
          ) : (
            <>
              {settingLocationFor && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-1.5 bg-yellow-400 text-yellow-900 px-4 py-2 rounded-full text-xs sm:text-sm font-semibold shadow-lg max-w-[90%] text-center">
                  <IconMapPin className="w-4 h-4 flex-shrink-0" /> Click on the map to place: <strong>{settingLocationFor.name}</strong>
                  <button onClick={() => setSettingLocationFor(null)} aria-label="Cancel" className="ml-1 text-yellow-700 hover:text-yellow-900"><IconX className="w-3.5 h-3.5" /></button>
                </div>
              )}
              {pickingForForm && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-1.5 bg-yellow-400 text-yellow-900 px-4 py-2 rounded-full text-xs sm:text-sm font-semibold shadow-lg max-w-[90%] text-center">
                  <IconMapPin className="w-4 h-4 flex-shrink-0" /> Tap the map to place the pin
                  <button onClick={() => setPickingForForm(false)} aria-label="Cancel" className="ml-1 text-yellow-700 hover:text-yellow-900"><IconX className="w-3.5 h-3.5" /></button>
                </div>
              )}
              <ChurchMap
                churches={filtered}
                allChurches={churches}
                selected={selected}
                focusChurch={focusChurch}
                onSelect={openChurch}
                onSetLocation={handleSetLocation}
                settingLocationFor={settingLocationFor}
                showRoutes={showRoutes}
                pickingLocation={pickingForForm}
                onPickLocation={(lat, lng) => { setPickedCoords({ lat, lng }); setPickingForForm(false) }}
                onMapReady={map => { mapRef.current = map }}
              />
              <MapLegend />
            </>
          )}
        </div>

        {/* Sidebar (desktop) / bottom sheet (mobile) */}
        <div
          ref={sheetRef}
          className={`
            bg-white flex flex-col overflow-hidden print:hidden
            md:static md:w-72 md:border-l md:shadow-none md:rounded-none md:max-h-none md:translate-y-0
            fixed inset-x-0 bottom-0 z-[1100] rounded-t-2xl shadow-2xl max-h-[78dvh]
            transition-transform duration-300 ease-out
            ${exportPreviewMode ? 'hidden' : ''}
            ${sheetOpen || selected ? 'translate-y-0' : 'translate-y-[calc(100%-3.25rem)]'}
          `}
        >
          {/* Mobile handle — tap toggles (onClick), drag follows the finger and snaps open/closed */}
          <button
            onClick={handleSheetClick}
            onPointerDown={handleSheetPointerDown}
            onPointerMove={handleSheetPointerMove}
            onPointerUp={handleSheetPointerUp}
            onPointerCancel={handleSheetPointerCancel}
            className="md:hidden flex flex-col items-center gap-1 py-2 border-b border-gray-100 active:bg-gray-50 touch-none select-none"
          >
            <span className="w-10 h-1 rounded-full bg-gray-300" />
            <span className="text-xs font-semibold text-gray-600">
              {selected ? selected.name : `${filtered.length} ${filtered.length !== 1 ? 'points' : 'point'} ${sheetOpen ? '▼' : '▲'}`}
            </span>
          </button>

          <div className="overflow-y-auto flex-1">
          {selected && selected.marker_type === 'hospital' ? (
            <div className="p-4">
              <button onClick={() => setSelected(null)} className="text-gray-400 text-sm mb-3 hover:text-gray-600">← Back to list</button>
              {selected.image_url && (
                <img src={selected.image_url} alt={selected.name}
                  onError={e => { e.currentTarget.style.display = 'none' }}
                  className="w-full h-44 object-cover rounded-xl mb-3 border border-slate-200" />
              )}
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#80873322] text-[#5f6526] mb-2">
                <IconHospital className="w-3.5 h-3.5" /> Field Hospital
              </div>
              <h2 className="font-bold text-gray-900 text-base mb-1">{selected.name}</h2>
              <div className="space-y-2 text-sm mt-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-gray-500 text-xs uppercase font-semibold mb-1">Parish</div>
                  <div className="text-gray-800">{selected.parish}</div>
                </div>
                {selected.notes && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-gray-500 text-xs uppercase font-semibold mb-1">About</div>
                    <div className="text-gray-800">{selected.notes}</div>
                  </div>
                )}
                {selected.lat && selected.lng && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${selected.lat},${selected.lng}`}
                    target="_blank" rel="noreferrer"
                    className="flex items-center justify-center gap-1.5 bg-[#808733] hover:bg-[#6b7029] text-white py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    <IconCompass className="w-4 h-4" /> Open in Google Maps
                  </a>
                )}
              </div>
              {editMode && (
                <div className="flex gap-2 mt-4">
                  <button onClick={() => openEditChurch(selected)} className="flex-1 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50">Edit</button>
                  <button onClick={() => setConfirmDeleteChurch(selected)} className="flex-1 py-2 rounded-lg border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50">Delete</button>
                </div>
              )}
            </div>
          ) : selected && isSpecialLocation(selected.marker_type) ? (
            <div className="p-4">
              <button onClick={() => setSelected(null)} className="text-gray-400 text-sm mb-3 hover:text-gray-600">← Back to list</button>
              {selected.image_url && (
                <img src={selected.image_url} alt={selected.name}
                  onError={e => { e.currentTarget.style.display = 'none' }}
                  className="w-full h-44 object-cover rounded-xl mb-3 border border-slate-200" />
              )}
              <div
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium mb-2"
                style={{ background: `${LOCATION_COLORS[selected.marker_type]}18`, color: LOCATION_COLORS[selected.marker_type] }}
              >
                {LOCATION_LABELS[selected.marker_type]}
              </div>
              <h2 className="font-bold text-gray-900 text-base mb-1">{selected.name}</h2>
              <div className="space-y-2 text-sm mt-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-gray-500 text-xs uppercase font-semibold mb-1">Parish</div>
                  <div className="text-gray-800">{selected.parish}</div>
                </div>
                {selected.address && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-gray-500 text-xs uppercase font-semibold mb-1">Address</div>
                    <div className="text-gray-800">{selected.address}</div>
                  </div>
                )}
                {selected.phone && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-gray-500 text-xs uppercase font-semibold mb-1">Phone</div>
                    <a href={`tel:+58${selected.phone}`} className="text-blue-600 hover:underline">+58 {selected.phone}</a>
                  </div>
                )}
                {selected.notes && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-gray-500 text-xs uppercase font-semibold mb-1">About</div>
                    <div className="text-gray-800">{selected.notes}</div>
                  </div>
                )}
                {selected.lat && selected.lng && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${selected.lat},${selected.lng}`}
                    target="_blank" rel="noreferrer"
                    className="flex items-center justify-center gap-1.5 text-white py-2 rounded-lg text-sm font-medium transition-colors"
                    style={{ background: LOCATION_COLORS[selected.marker_type] }}
                  >
                    <IconCompass className="w-4 h-4" /> Open in Google Maps
                  </a>
                )}
              </div>
              {editMode && (
                <div className="flex gap-2 mt-4">
                  <button onClick={() => openEditChurch(selected)} className="flex-1 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50">Edit</button>
                  <button onClick={() => setConfirmDeleteChurch(selected)} className="flex-1 py-2 rounded-lg border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50">Delete</button>
                </div>
              )}
            </div>
          ) : selected ? (
            <div className="p-4">
              <button onClick={() => setSelected(null)} className="text-gray-400 text-sm mb-3 hover:text-gray-600">← Back to list</button>
              {selected.image_url && (
                <img src={selected.image_url} alt={selected.name}
                  onError={e => { e.currentTarget.style.display = 'none' }}
                  className="w-full h-40 object-cover rounded-xl mb-3 border border-slate-200" />
              )}
              <div className="flex gap-2 flex-wrap mb-3">
                <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${selected.is_distribution_center ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${selected.is_distribution_center ? 'bg-red-600' : 'bg-blue-600'}`} />
                  {selected.is_distribution_center ? 'Distribution Center' : 'Church'}
                </div>
                <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${selected.geocode_status === 'validado' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                  {selected.geocode_status === 'validado' ? <IconMapPin className="w-3 h-3" /> : <IconClock className="w-3 h-3" />}
                  {selected.geocode_status === 'validado' ? 'Location verified' : 'Location pending'}
                </div>
              </div>
              <h2 className="font-bold text-gray-900 text-base mb-1">{selected.name}</h2>
              {selected.pastor_name && <p className="flex items-center gap-1.5 text-gray-600 text-sm mb-3"><IconUser className="w-3.5 h-3.5" /> {selected.pastor_name}</p>}
              <div className="space-y-2 text-sm">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-gray-500 text-xs uppercase font-semibold mb-1">Parish</div>
                  <div className="text-gray-800">{selected.parish}</div>
                </div>
                {!selected.is_distribution_center && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-gray-500 text-xs uppercase font-semibold mb-1">Distribution Center</div>
                    {editMode ? (
                      <select
                        value={selected.distribution_center_id || ''}
                        onChange={e => reassignCenter(selected, e.target.value)}
                        className="w-full bg-white border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">— Unassigned —</option>
                        {centers.map(c => (
                          <option key={c.id} value={c.id}>{c.name} ({c.parish})</option>
                        ))}
                      </select>
                    ) : (
                      <div className="text-gray-800">{centers.find(c => c.id === selected.distribution_center_id)?.name || '— Unassigned —'}</div>
                    )}
                  </div>
                )}
                {selected.phone && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-gray-500 text-xs uppercase font-semibold mb-1">Phone</div>
                    <a href={`tel:+58${selected.phone}`} className="text-blue-600 hover:underline">+58 {selected.phone}</a>
                    <a href={`https://wa.me/58${selected.phone}`} target="_blank" rel="noreferrer" className="ml-3 text-green-600 text-xs hover:underline">WhatsApp →</a>
                  </div>
                )}
                {selected.email && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-gray-500 text-xs uppercase font-semibold mb-1">Email</div>
                    <a href={`mailto:${selected.email}`} className="text-blue-600 hover:underline break-all">{selected.email}</a>
                  </div>
                )}
              </div>

              {selected.is_distribution_center && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-gray-500 text-xs uppercase font-semibold">Active projects</div>
                    {savingProjects && <span className="text-[10px] text-slate-400">Saving…</span>}
                  </div>
                  <div className="flex gap-1.5 flex-wrap mb-1">
                    {ALL_PROJECTS.map(project => {
                      const on = (centerProjects[selected.id] || []).includes(project)
                      return (
                        <button
                          key={project}
                          disabled={!canManageProjects}
                          onClick={() => toggleCenterProject(selected, project)}
                          className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${on ? 'text-white border-transparent' : 'text-slate-500 border-slate-300 bg-white'} ${!canManageProjects ? 'cursor-default' : 'hover:opacity-90'}`}
                          style={on ? { background: PROJECT_COLORS[project] } : undefined}
                        >
                          {PROJECT_LABELS[project]}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {selected.is_distribution_center && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-gray-500 text-xs uppercase font-semibold">Delivery log</div>
                    {editMode && (
                      <button
                        onClick={() => setDistributionFormOpen(true)}
                        className="text-xs font-medium text-[var(--olive)] hover:underline"
                      >
                        + Log delivery
                      </button>
                    )}
                  </div>
                  {distributionsLoading ? (
                    <div className="text-xs text-gray-400 py-2">Loading…</div>
                  ) : distributions.length === 0 ? (
                    <div className="text-xs text-gray-400 py-2">No deliveries recorded at this center yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {distributions.map(d => (
                        <div key={d.id} className="bg-gray-50 rounded-lg p-3 text-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-gray-800 font-medium">
                              {new Date(d.distributed_at + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </div>
                            {editMode && (
                              <button onClick={() => setConfirmDeleteDistribution(d)} aria-label="Delete record" className="text-gray-300 hover:text-red-500 flex-shrink-0"><IconX className="w-3.5 h-3.5" /></button>
                            )}
                          </div>
                          {d.items && <div className="text-gray-700 text-xs mt-1">{d.items}</div>}
                          {distributionItems.filter(l => l.distribution_id === d.id).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {distributionItems.filter(l => l.distribution_id === d.id).map(line => {
                                const item = itemsCatalog.find(i => i.id === line.item_id)
                                return (
                                  <span key={line.id} className="inline-flex items-center gap-1 text-[11px] bg-white border border-slate-200 rounded-full px-2 py-0.5 text-slate-700">
                                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: PROJECT_COLORS[line.project] }} />
                                    {item?.name || 'Item'} · {line.quantity} {item?.unit}
                                  </span>
                                )
                              })}
                            </div>
                          )}
                          {d.families_served != null && (
                            <div className="flex items-center gap-1 text-gray-500 text-xs mt-1"><IconUsers className="w-3.5 h-3.5" /> {d.families_served} families served</div>
                          )}
                          {d.notes && <div className="text-gray-400 text-xs mt-1">{d.notes}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {editMode && (
                <>
                  <button
                    onClick={() => toggleDistribution(selected)}
                    className={`mt-4 w-full py-2 rounded-lg text-sm font-medium transition-colors ${selected.is_distribution_center ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-red-600 text-white hover:bg-red-700'}`}
                  >
                    {selected.is_distribution_center ? 'Remove as distribution center' : 'Mark as distribution center'}
                  </button>
                  {selected.geocode_status !== 'validado' && (
                    <button
                      onClick={() => setSettingLocationFor(selected)}
                      className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium bg-yellow-400 text-yellow-900 hover:bg-yellow-500 transition-colors"
                    >
                      <IconMapPin className="w-4 h-4" /> Set location manually on map
                    </button>
                  )}
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => openEditChurch(selected)} className="flex-1 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50">Edit</button>
                    <button onClick={() => setConfirmDeleteChurch(selected)} className="flex-1 py-2 rounded-lg border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50">Delete</button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="divide-y">
              <div className="p-3 text-xs text-gray-500 uppercase font-semibold bg-gray-50">
                {filtered.length} {filtered.length !== 1 ? 'points' : 'point'}{search ? ` — "${search}"` : ''}
              </div>
              {filtered.map(church => (
                <button
                  key={church.id}
                  onClick={() => openChurch(church)}
                  className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-1.5 flex-shrink-0">
                      {church.marker_type === 'hospital' ? (
                        <IconHospital className="w-3.5 h-3.5 text-[#808733]" />
                      ) : isSpecialLocation(church.marker_type) ? (
                        <span className="block w-2 h-2 rounded-full" style={{ background: LOCATION_COLORS[church.marker_type] }} />
                      ) : (
                        <span className={`block w-2 h-2 rounded-full ${church.is_distribution_center ? 'bg-red-600' : 'bg-blue-600'}`} />
                      )}
                    </span>
                    <div>
                      <div className="text-sm font-medium text-gray-900 leading-tight">{church.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {church.marker_type === 'hospital' ? 'Samaritan’s Purse' : isSpecialLocation(church.marker_type) ? LOCATION_LABELS[church.marker_type] : (church.pastor_name || '—')}
                      </div>
                      <div className="text-xs text-gray-400">{church.parish}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          </div>
        </div>
        </div>
      </div>

      {/* Passcode modal */}
      {passcodeModalOpen && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/40 p-4">
          <form ref={passcodeModalRef} onSubmit={submitPasscode} className="bg-white rounded-xl shadow-2xl p-5 w-full max-w-xs">
            <h3 className="font-bold text-gray-900 mb-1">Edit mode</h3>
            <p className="text-xs text-gray-500 mb-3">Enter the passcode to add, edit, or delete churches.</p>
            <input
              type="password"
              autoFocus
              value={passcodeInput}
              onChange={e => { setPasscodeInput(e.target.value); setPasscodeError(false) }}
              className={`w-full border rounded-lg px-3 py-2 text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-[var(--olive)] ${passcodeError ? 'border-red-400' : 'border-gray-300'}`}
              placeholder="Passcode"
            />
            {passcodeError && (
              <p className="text-xs text-red-600 mb-2">
                {typeof navigator !== 'undefined' && !navigator.onLine
                  ? 'No connection — verify this passcode online once first.'
                  : 'Incorrect passcode'}
              </p>
            )}
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={() => { setPasscodeModalOpen(false); setPasscodeInput(''); setPasscodeError(false) }} className="flex-1 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={verifying} className="flex-1 py-2 rounded-lg bg-navy text-white text-sm font-medium hover:bg-[var(--navy-700)] disabled:opacity-50">{verifying ? 'Verifying…' : 'Unlock'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDeleteChurch && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/40 p-4">
          <div ref={confirmDeleteChurchRef} className="bg-white rounded-xl shadow-2xl p-5 w-full max-w-xs">
            <h3 className="font-bold text-gray-900 mb-1">Delete church?</h3>
            <p className="text-sm text-gray-600 mb-4">This will permanently delete <strong>{confirmDeleteChurch.name}</strong> and its routes from the map.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDeleteChurch(null)} disabled={deleting} className="flex-1 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button onClick={handleDeleteConfirmed} disabled={deleting} className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50">{deleting ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit church form */}
      {formOpen && (
        <ChurchForm
          church={formChurch}
          centers={centers}
          parishes={parishOptions}
          onClose={closeForm}
          onSaved={() => {
            showToast(formChurch ? 'Church updated' : 'Church created')
            setFormOpen(false); setFormChurch(null); setPickingForForm(false); setPickedCoords(null); fetchChurches()
          }}
          pickingLocation={pickingForForm}
          onStartPickLocation={() => { setSettingLocationFor(null); setPickingForForm(true) }}
          onCancelPickLocation={() => setPickingForForm(false)}
          pendingCoords={pickedCoords}
        />
      )}

      {/* Register a distribution event */}
      {distributionFormOpen && selected && (
        <DistributionForm
          center={selected}
          onClose={() => setDistributionFormOpen(false)}
          onSaved={() => { showToast('Delivery logged'); setDistributionFormOpen(false); fetchDistributions(selected.id) }}
        />
      )}

      {/* Delete distribution confirmation */}
      {confirmDeleteDistribution && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/40 p-4">
          <div ref={confirmDeleteDistributionRef} className="bg-white rounded-xl shadow-2xl p-5 w-full max-w-xs">
            <h3 className="font-bold text-gray-900 mb-1">Delete this record?</h3>
            <p className="text-sm text-gray-600 mb-4">This delivery will be permanently removed from the history.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDeleteDistribution(null)} disabled={deletingDistribution} className="flex-1 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button onClick={handleDeleteDistributionConfirmed} disabled={deletingDistribution} className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50">{deletingDistribution ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
