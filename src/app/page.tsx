'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Building2, LayoutDashboard, BedDouble, Users, Receipt, ShieldCheck, Download, Code2 } from 'lucide-react'
import PgDashboard from '@/components/pg-dashboard'
import PgRooms from '@/components/pg-rooms'
import PgGuests from '@/components/pg-guests'
import PgBilling from '@/components/pg-billing'
import PgDeposits from '@/components/pg-deposits'

const navItems = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { id: 'rooms', label: 'Rooms', icon: BedDouble },
  { id: 'guests', label: 'Guests', icon: Users },
  { id: 'billing', label: 'Billing', icon: Receipt },
  { id: 'deposits', label: 'Deposits', icon: ShieldCheck },
]

export default function Home() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [exporting, setExporting] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/export')
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `PG_Hostel_Report_${new Date().toISOString().split('T')[0]}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      // silent fail
    } finally {
      setExporting(false)
    }
  }

  const handleDownloadSource = async () => {
    setDownloading(true)
    try {
      const res = await fetch('/api/download')
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'pg-hostel-manager-source.zip'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      // silent fail
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 border-b border-emerald-200 dark:border-emerald-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-emerald-600 p-1.5">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <h1 className="text-base sm:text-lg font-bold text-emerald-900 dark:text-emerald-100">
                PG Hostel Manager
              </h1>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadSource}
                disabled={downloading}
                className="gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 h-8"
              >
                <Code2 className={`h-3.5 w-3.5 ${downloading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{downloading ? 'Zipping...' : 'Source Code'}</span>
              </Button>
              <Button
                size="sm"
                onClick={handleExport}
                disabled={exporting}
                className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm h-8"
              >
                <Download className={`h-3.5 w-3.5 ${exporting ? 'animate-bounce' : ''}`} />
                <span className="hidden sm:inline">{exporting ? 'Exporting...' : 'Export'}</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 pb-20 sm:pb-[4.5rem]">
        <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
          {activeTab === 'dashboard' && <PgDashboard />}
          {activeTab === 'rooms' && <PgRooms />}
          {activeTab === 'guests' && <PgGuests />}
          {activeTab === 'billing' && <PgBilling />}
          {activeTab === 'deposits' && <PgDeposits />}
        </div>
      </main>

      {/* Fixed Bottom Navigation — always visible on all screen sizes */}
      <nav className="fixed bottom-0 left-0 right-0 z-[100] bg-white/95 dark:bg-gray-950/95 backdrop-blur-lg border-t border-emerald-200 dark:border-emerald-800 shadow-[0_-2px_16px_rgba(0,0,0,0.12)]">
        <div className="flex items-center justify-around h-16 px-1">
          {navItems.map((item) => {
            const isActive = activeTab === item.id
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`
                  flex flex-col items-center justify-center gap-0.5 py-1.5 px-2 sm:px-3 min-w-[52px] sm:min-w-[56px] rounded-lg
                  transition-all duration-200 relative
                  ${isActive
                    ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40'
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 active:bg-gray-50 dark:active:bg-gray-800'
                  }
                `}
              >
                {/* Active indicator line */}
                {isActive && (
                  <span className="absolute top-0.5 left-1/2 -translate-x-1/2 w-8 h-[3px] bg-emerald-600 dark:bg-emerald-400 rounded-full" />
                )}
                <Icon className={`h-[22px] w-[22px] transition-transform duration-200 ${isActive ? 'scale-110' : ''}`} />
                <span className={`text-[10px] sm:text-[11px] leading-tight font-semibold ${isActive ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>
                  {item.label}
                </span>
              </button>
            )
          })}
        </div>
        {/* iOS safe area padding */}
        <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
      </nav>
    </div>
  )
}
