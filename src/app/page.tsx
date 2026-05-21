'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Building2, LayoutDashboard, BedDouble, Users, Receipt, ShieldCheck, Settings, Download, Code2, FilePlus2, Database, RefreshCw, Trash2, AlertTriangle } from 'lucide-react'
import PgDashboard from '@/components/pg-dashboard'
import PgRooms from '@/components/pg-rooms'
import PgGuests from '@/components/pg-guests'
import PgBilling from '@/components/pg-billing'
import PgDeposits from '@/components/pg-deposits'
import { toast } from 'sonner'

const navItems = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { id: 'rooms', label: 'Rooms', icon: BedDouble },
  { id: 'guests', label: 'Guests', icon: Users },
  { id: 'billing', label: 'Billing', icon: Receipt },
  { id: 'deposits', label: 'Deposits', icon: ShieldCheck },
]

export default function Home() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [showSettings, setShowSettings] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [seeding, setSeeding] = useState(false)

  // 2-step warning states
  const [step1Open, setStep1Open] = useState(false)
  const [step1Action, setStep1Action] = useState<'reset' | 'source' | null>(null)
  const [step2Open, setStep2Open] = useState(false)
  const [step2Action, setStep2Action] = useState<'reset' | 'source' | null>(null)
  const [confirmText, setConfirmText] = useState('')

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/export')
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Room_Rent_Report_${new Date().toISOString().split('T')[0]}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Export downloaded!')
    } catch {
      toast.error('Export failed')
    } finally {
      setExporting(false)
    }
  }

  const handleGenerateBills = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/bills/generate', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to generate bills')
        return
      }
      toast.success(data.message)
    } catch {
      toast.error('Failed to generate bills')
    } finally {
      setGenerating(false)
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
      a.download = 'room-rent-source.zip'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Source code downloaded!')
    } catch {
      toast.error('Download failed')
    } finally {
      setDownloading(false)
    }
  }

  const handleResetData = async () => {
    setSeeding(true)
    try {
      const seedRes = await fetch('/api/seed', { method: 'POST' })
      const seedData = await seedRes.json()
      if (!seedRes.ok) {
        toast.error(seedData.error || 'Failed to reset')
        return
      }
      const d = seedData.deleted
      toast.success(`All data cleared! ${d.guests} guests, ${d.bills} bills, ${d.rooms} rooms removed`)
    } catch {
      toast.error('Failed to reset data')
    } finally {
      setSeeding(false)
    }
  }

  // ─── 2-Step Warning Helpers ───

  const openStep1 = (action: 'reset' | 'source') => {
    setStep1Action(action)
    setStep1Open(true)
  }

  const handleStep1Continue = () => {
    setStep1Open(false)
    // After step 1 confirmed, open step 2
    setStep2Action(step1Action)
    setConfirmText('')
    // Small delay so the first dialog closes before second opens
    setTimeout(() => setStep2Open(true), 200)
  }

  const handleStep2Confirm = () => {
    if (confirmText !== 'DELETE') {
      toast.error('Type DELETE to confirm')
      return
    }
    setStep2Open(false)
    if (step2Action === 'reset') {
      handleResetData()
    } else if (step2Action === 'source') {
      handleDownloadSource()
    }
    setStep2Action(null)
    setConfirmText('')
  }

  const step1Config = step1Action === 'reset'
    ? {
        title: '⚠️ Reset All Data?',
        description: 'This will permanently delete ALL rooms, guests, bills, deposits, and electricity readings. This action cannot be undone.',
        icon: <Trash2 className="h-5 w-5 text-red-500" />,
        confirmLabel: 'Continue to Final Step',
        confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
      }
    : {
        title: '⚠️ Download Source Code?',
        description: 'This will create and download a ZIP file of the entire application source code. The file may take a moment to generate.',
        icon: <Code2 className="h-5 w-5 text-amber-500" />,
        confirmLabel: 'Continue to Final Step',
        confirmClass: 'bg-amber-600 hover:bg-amber-700 text-white',
      }

  const step2Config = step2Action === 'reset'
    ? {
        title: '🔒 Final Confirmation: Reset Data',
        description: 'Type DELETE in the box below to permanently erase all data. This is your last chance to cancel.',
        actionLabel: 'Delete All Data',
        actionClass: 'bg-red-600 hover:bg-red-700 text-white',
      }
    : {
        title: '🔒 Final Confirmation: Download Source',
        description: 'Type DELETE in the box below to confirm source code download.',
        actionLabel: 'Download Source Code',
        actionClass: 'bg-amber-600 hover:bg-amber-700 text-white',
      }

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 border-b border-emerald-200 dark:border-emerald-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div
              className="flex items-center gap-2 cursor-pointer select-none"
              onClick={() => setShowSettings(prev => !prev)}
            >
              <div className={`rounded-lg p-1.5 transition-colors duration-300 ${showSettings ? 'bg-red-600' : 'bg-emerald-600'}`}>
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <h1 className={`text-base sm:text-lg font-bold transition-colors duration-300 ${showSettings ? 'text-red-600 dark:text-red-400' : 'text-emerald-900 dark:text-emerald-100'}`}>
                Room Rent
              </h1>
            </div>

            {/* Settings Dropdown - hidden by default, shown on logo click */}
            {showSettings && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-800 dark:text-emerald-400"
                >
                  <Settings className="h-4.5 w-4.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleExport}
                  disabled={exporting}
                  className="gap-2 cursor-pointer"
                >
                  <Download className={`h-4 w-4 ${exporting ? 'animate-bounce' : ''}`} />
                  <span>{exporting ? 'Exporting...' : 'Export Excel'}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleGenerateBills}
                  disabled={generating}
                  className="gap-2 cursor-pointer"
                >
                  <FilePlus2 className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
                  <span>{generating ? 'Generating...' : 'Generate Bills'}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => openStep1('source')}
                  disabled={downloading}
                  className="gap-2 cursor-pointer text-amber-700 dark:text-amber-400"
                >
                  <Code2 className={`h-4 w-4 ${downloading ? 'animate-spin' : ''}`} />
                  <span>{downloading ? 'Zipping...' : 'Source Code'}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => openStep1('reset')}
                  disabled={seeding}
                  variant="destructive"
                  className="gap-2 cursor-pointer"
                >
                  <Database className={`h-4 w-4 ${seeding ? 'animate-spin' : ''}`} />
                  <span>{seeding ? 'Resetting...' : 'Reset Data'}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            )}
          </div>
        </div>
      </header>

      {/* Step 1 Warning Dialog */}
      <AlertDialog open={step1Open} onOpenChange={setStep1Open}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {step1Config.icon}
              {step1Config.title}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {step1Config.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleStep1Continue}
              className={step1Config.confirmClass}
            >
              {step1Config.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Step 2 Confirmation Dialog with Input */}
      <Dialog open={step2Open} onOpenChange={(open) => {
        setStep2Open(open)
        if (!open) {
          setStep2Action(null)
          setConfirmText('')
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
              {step2Config?.title}
            </DialogTitle>
            <DialogDescription>
              {step2Config?.description}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder='Type "DELETE" to confirm'
              className="border-red-300 focus-visible:border-red-500 focus-visible:ring-red-500/30 font-mono text-center text-lg tracking-widest"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground text-center">
              This action cannot be undone
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setStep2Open(false)
                setStep2Action(null)
                setConfirmText('')
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleStep2Confirm}
              disabled={confirmText !== 'DELETE'}
              className={step2Config?.actionClass}
            >
              {step2Config?.actionLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Content */}
      <main className="flex-1 pb-24 sm:pb-24">
        <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
          {activeTab === 'dashboard' && <PgDashboard />}
          {activeTab === 'rooms' && <PgRooms />}
          {activeTab === 'guests' && <PgGuests />}
          {activeTab === 'billing' && <PgBilling />}
          {activeTab === 'deposits' && <PgDeposits />}
        </div>
      </main>

      {/* Fixed Bottom Navigation — always visible on all screen sizes */}
      <nav className="fixed bottom-0 left-0 right-0 z-[9999] bg-white/95 dark:bg-gray-950/95 backdrop-blur-lg border-t border-emerald-200 dark:border-emerald-800 shadow-[0_-2px_16px_rgba(0,0,0,0.12)] will-change-transform" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex items-center justify-around h-16 px-1 max-w-7xl mx-auto">
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
      </nav>
    </div>
  )
}
