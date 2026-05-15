'use client'

import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Building2, LayoutDashboard, BedDouble, Users, Receipt, ShieldCheck, Download, Code2 } from 'lucide-react'
import PgDashboard from '@/components/pg-dashboard'
import PgRooms from '@/components/pg-rooms'
import PgGuests from '@/components/pg-guests'
import PgBilling from '@/components/pg-billing'
import PgDeposits from '@/components/pg-deposits'

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
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-emerald-600 p-1.5">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <h1 className="text-lg font-bold text-emerald-900 dark:text-emerald-100">
                PG Hostel Manager
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadSource}
                disabled={downloading}
                className="gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
              >
                <Code2 className={`h-4 w-4 ${downloading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{downloading ? 'Zipping...' : 'Source Code'}</span>
              </Button>
              <Button
                size="sm"
                onClick={handleExport}
                disabled={exporting}
                className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
              >
                <Download className={`h-4 w-4 ${exporting ? 'animate-bounce' : ''}`} />
                <span className="hidden sm:inline">{exporting ? 'Exporting...' : 'Export'}</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="border-b border-emerald-100 dark:border-emerald-900 bg-emerald-50/30 dark:bg-emerald-950/10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-transparent h-12 p-0 gap-1">
              <TabsTrigger
                value="dashboard"
                className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-md h-9 px-3 gap-1.5 rounded-md text-sm"
              >
                <LayoutDashboard className="h-4 w-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </TabsTrigger>
              <TabsTrigger
                value="rooms"
                className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-md h-9 px-3 gap-1.5 rounded-md text-sm"
              >
                <BedDouble className="h-4 w-4" />
                <span className="hidden sm:inline">Rooms</span>
              </TabsTrigger>
              <TabsTrigger
                value="guests"
                className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-md h-9 px-3 gap-1.5 rounded-md text-sm"
              >
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Guests</span>
              </TabsTrigger>
              <TabsTrigger
                value="billing"
                className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-md h-9 px-3 gap-1.5 rounded-md text-sm"
              >
                <Receipt className="h-4 w-4" />
                <span className="hidden sm:inline">Billing</span>
              </TabsTrigger>
              <TabsTrigger
                value="deposits"
                className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-md h-9 px-3 gap-1.5 rounded-md text-sm"
              >
                <ShieldCheck className="h-4 w-4" />
                <span className="hidden sm:inline">Deposits</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {activeTab === 'dashboard' && <PgDashboard />}
          {activeTab === 'rooms' && <PgRooms />}
          {activeTab === 'guests' && <PgGuests />}
          {activeTab === 'billing' && <PgBilling />}
          {activeTab === 'deposits' && <PgDeposits />}
        </div>
      </main>

      {/* Sticky Footer */}
      <footer className="mt-auto border-t border-emerald-100 dark:border-emerald-900 bg-emerald-50/30 dark:bg-emerald-950/10">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs text-muted-foreground">
            PG Hostel Manager — Streamlined hostel management
          </p>
        </div>
      </footer>
    </div>
  )
}
