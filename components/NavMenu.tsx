'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IconMenu, IconX } from '@/lib/icons'

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/mapa', label: 'Map' },
  { href: '/choferes', label: 'Drivers' },
  { href: '/solicitudes', label: 'Requests' },
  { href: '/metricas', label: 'Metrics' },
  { href: '/catalogo', label: 'Catalog' },
  { href: '/dashboard', label: 'Dashboard' },
]

const TRIGGER_CLASS = {
  dark: 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white',
  light: 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700',
}

interface Props {
  variant?: 'dark' | 'light'
}

// Mobile-only fallback for the per-page nav links, which are hidden below the
// sm/md breakpoints to keep the header from overflowing on small screens —
// without this, sections like Requests or Catalog were unreachable on mobile.
export default function NavMenu({ variant = 'dark' }: Props) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  return (
    <div className="relative sm:hidden">
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close menu' : 'Open menu'}
        className={`p-2 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--olive)] ${TRIGGER_CLASS[variant]}`}
      >
        {open ? <IconX className="w-4 h-4" /> : <IconMenu className="w-4 h-4" />}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[1400]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 w-48 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-[1500]">
            {LINKS.map(link => {
              const active = pathname === link.href
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={`block px-4 py-2 text-sm transition-colors ${active ? 'text-navy font-semibold bg-slate-50' : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  {link.label}
                </Link>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
