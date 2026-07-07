'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { Church, DistributionItem, Distribution, Item, Project, ProjectDef, projectMap } from '@/lib/supabase'
import { getChurches, getAllDistributions, getAllDistributionItems, getItems, getProjects } from '@/lib/offlineStore'
import { showToast } from '@/lib/toast'
import NavMenu from '@/components/NavMenu'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

type JoinedLine = {
  centerId: string
  centerName: string
  project: Project
  itemId: string
  itemName: string
  unit: string
  quantity: number
  distributedAt: string
}

type TableRow = {
  centerId: string
  centerName: string
  project: Project
  itemId: string
  itemName: string
  unit: string
  total: number
  lastDelivery: string
}

function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function downloadCsv(rows: TableRow[], filename: string, projectByKey: Record<string, ProjectDef>) {
  const header = ['Center', 'Project', 'Item', 'Quantity', 'Unit', 'Last Delivery']
  const lines = rows.map(r => [
    r.centerName, projectByKey[r.project]?.label || r.project, r.itemName, String(r.total), r.unit, r.lastDelivery,
  ].map(v => `"${v.replace(/"/g, '""')}"`).join(','))
  const csv = [header.join(','), ...lines].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function MetricasPage() {
  const [churches, setChurches] = useState<Church[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [projects, setProjects] = useState<ProjectDef[]>([])
  const [distributions, setDistributions] = useState<Distribution[]>([])
  const [lines, setLines] = useState<DistributionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const [filterCenter, setFilterCenter] = useState('')
  const [filterProject, setFilterProject] = useState<Project | ''>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const captureRef = useRef<HTMLDivElement | null>(null)
  const projectByKey = projectMap(projects)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: ch }, { data: dist }, { data: dLines }, { data: it }, { data: proj }] = await Promise.all([
      getChurches(), getAllDistributions(), getAllDistributionItems(), getItems(), getProjects(),
    ])
    setChurches(ch.filter(c => c.is_distribution_center))
    setDistributions(dist)
    setLines(dLines)
    setItems(it)
    setProjects(proj)
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const centers = useMemo(() => [...churches].sort((a, b) => a.name.localeCompare(b.name)), [churches])

  const joined: JoinedLine[] = useMemo(() => {
    const distById = new Map(distributions.map(d => [d.id, d]))
    const churchById = new Map(churches.map(c => [c.id, c]))
    const itemById = new Map(items.map(i => [i.id, i]))
    const rows: JoinedLine[] = []
    for (const line of lines) {
      const dist = distById.get(line.distribution_id)
      if (!dist) continue
      const center = churchById.get(dist.distribution_center_id)
      const item = itemById.get(line.item_id)
      rows.push({
        centerId: dist.distribution_center_id,
        centerName: center?.name || 'Unknown center',
        project: line.project,
        itemId: line.item_id,
        itemName: item?.name || 'Item',
        unit: item?.unit || '',
        quantity: line.quantity,
        distributedAt: dist.distributed_at,
      })
    }
    return rows
  }, [lines, distributions, churches, items])

  const filtered = joined.filter(l => {
    if (filterCenter && l.centerId !== filterCenter) return false
    if (filterProject && l.project !== filterProject) return false
    if (dateFrom && l.distributedAt < dateFrom) return false
    if (dateTo && l.distributedAt > dateTo) return false
    return true
  })

  const tableRows: TableRow[] = useMemo(() => {
    const groups = new Map<string, TableRow>()
    for (const l of filtered) {
      const key = `${l.centerId}|${l.project}|${l.itemId}`
      const existing = groups.get(key)
      if (existing) {
        existing.total += l.quantity
        if (l.distributedAt > existing.lastDelivery) existing.lastDelivery = l.distributedAt
      } else {
        groups.set(key, {
          centerId: l.centerId, centerName: l.centerName, project: l.project,
          itemId: l.itemId, itemName: l.itemName, unit: l.unit,
          total: l.quantity, lastDelivery: l.distributedAt,
        })
      }
    }
    return Array.from(groups.values()).sort((a, b) =>
      a.centerName.localeCompare(b.centerName) || a.project.localeCompare(b.project) || a.itemName.localeCompare(b.itemName)
    )
  }, [filtered])

  // Conteo de líneas de entrega por mes y proyecto — no se suma la cantidad porque
  // un mismo proyecto mezcla unidades distintas (ej. Food tiene kg y litros a la vez),
  // así que un total sumado sería engañoso. Esto muestra actividad/frecuencia real.
  const chartData = useMemo(() => {
    const byMonth = new Map<string, Record<string, number>>()
    for (const l of filtered) {
      const month = l.distributedAt.slice(0, 7)
      const entry = byMonth.get(month) || {}
      entry[l.project] = (entry[l.project] || 0) + 1
      byMonth.set(month, entry)
    }
    const months = Array.from(byMonth.keys()).sort()
    return {
      labels: months.map(monthLabel),
      datasets: projects.map(project => ({
        label: project.label,
        data: months.map(m => byMonth.get(m)?.[project.key] || 0),
        backgroundColor: project.color,
      })),
    }
  }, [filtered, projects])

  const handleExportPdf = async () => {
    const node = captureRef.current
    if (!node) return
    setExporting(true)
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas-pro'),
        import('jspdf'),
      ])
      const canvas = await html2canvas(node, { useCORS: true, backgroundColor: '#ffffff', scale: 2 })
      const imgData = canvas.toDataURL('image/jpeg', 0.92)
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [canvas.width, canvas.height] })
      pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height)
      pdf.save('metricas-la-guaira.pdf')
      showToast('PDF downloaded')
    } catch (err) {
      showToast('Could not generate the PDF: ' + (err as Error).message, 'error')
    } finally {
      setExporting(false)
    }
  }

  const handleExportCsv = () => {
    if (tableRows.length === 0) { showToast('No data to export', 'error'); return }
    downloadCsv(tableRows, 'metricas-la-guaira.csv', projectByKey)
    showToast('Excel/CSV downloaded')
  }

  return (
    <div className="min-h-dvh bg-gray-50 font-sans-pro">
      <header className="bg-navy text-white px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/" className="text-white/70 hover:text-white text-sm flex-shrink-0">← Home</Link>
          <h1 className="text-sm sm:text-base font-bold truncate">Metrics</h1>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={handleExportCsv} className="text-xs sm:text-sm bg-white/10 hover:bg-white/20 px-2.5 sm:px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap">
            Excel/CSV
          </button>
          <button onClick={handleExportPdf} disabled={exporting} className="text-xs sm:text-sm bg-olive hover:bg-[var(--olive-600)] px-2.5 sm:px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 whitespace-nowrap">
            {exporting ? 'Generating…' : 'PDF'}
          </button>
          <NavMenu />
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <div className="flex gap-2 flex-wrap bg-white border border-slate-200 rounded-lg p-3">
          <select value={filterCenter} onChange={e => setFilterCenter(e.target.value)} className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All centers</option>
            {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={filterProject} onChange={e => setFilterProject(e.target.value)} className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All projects</option>
            {projects.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            From
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            To
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <div ref={captureRef} className="space-y-4 bg-gray-50">
            <section className="bg-white rounded-xl border border-slate-200 p-4">
              <h2 className="font-bold text-sm text-slate-800 mb-1">Delivery lines per month</h2>
              <p className="text-xs text-slate-400 mb-3">Number of distinct items delivered per project (does not sum quantities, which mix units like kg and liters).</p>
              {chartData.labels.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">No deliveries recorded yet.</p>
              ) : (
                <Bar
                  data={chartData}
                  options={{
                    responsive: true,
                    scales: { x: { stacked: true }, y: { stacked: true, ticks: { precision: 0 } } },
                    plugins: { legend: { position: 'bottom' } },
                  }}
                />
              )}
            </section>

            <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <h2 className="font-bold text-sm text-slate-800">Totals by center, project, and item</h2>
              </div>
              {tableRows.length === 0 ? (
                <p className="text-xs text-slate-400 px-4 py-6 text-center">No deliveries recorded with these filters.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[10px] uppercase text-slate-400 font-semibold border-b border-slate-100">
                        <th className="px-4 py-2">Center</th>
                        <th className="px-4 py-2">Project</th>
                        <th className="px-4 py-2">Item</th>
                        <th className="px-4 py-2 text-right">Quantity</th>
                        <th className="px-4 py-2">Last Delivery</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {tableRows.map(row => (
                        <tr key={`${row.centerId}|${row.project}|${row.itemId}`}>
                          <td className="px-4 py-2 text-slate-700">{row.centerName}</td>
                          <td className="px-4 py-2">
                            <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: projectByKey[row.project]?.color }} />
                              {projectByKey[row.project]?.label || row.project}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-slate-700">{row.itemName}</td>
                          <td className="px-4 py-2 text-right font-data text-slate-800">{row.total} {row.unit}</td>
                          <td className="px-4 py-2 font-data text-slate-500">
                            {new Date(row.lastDelivery + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
