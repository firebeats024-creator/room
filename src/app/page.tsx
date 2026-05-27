'use client'

import { useState, useEffect } from 'react'
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
import { Building2, LayoutDashboard, BedDouble, Users, Receipt, ShieldCheck, Settings, Download, Code2, FilePlus2, Database, RefreshCw, Trash2, AlertTriangle, LogOut, Languages } from 'lucide-react'
import PgDashboard from '@/components/pg-dashboard'
import PgRooms from '@/components/pg-rooms'
import PgGuests from '@/components/pg-guests'
import PgBilling from '@/components/pg-billing'
import PgDeposits from '@/components/pg-deposits'
import AdminLogin from '@/components/admin-login'
import AdminManager from '@/components/admin-manager'
import { LanguageProvider, useLanguage } from '@/lib/i18n'
import { toast } from 'sonner'

function AppContent() {
  const { t, lang, setLang } = useLanguage()
  
  const navItems = [
    { id: 'dashboard', label: t('nav_home'), icon: LayoutDashboard },
    { id: 'rooms', label: t('nav_rooms'), icon: BedDouble },
    { id: 'guests', label: t('nav_guests'), icon: Users },
    { id: 'billing', label: t('nav_billing'), icon: Receipt },
    { id: 'deposits', label: t('nav_deposits'), icon: ShieldCheck },
  ]

  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authChecking, setAuthChecking] = useState(true)
  const [adminName, setAdminName] = useState('Admin')
  const [adminId, setAdminId] = useState('')
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

  // Helper: get auth headers
  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  // Check auth on mount
  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const headers = getAuthHeaders()
      const res = await fetch('/api/auth/check', { headers })
      const data = await res.json()
      if (data.authenticated) {
        setIsAuthenticated(true)
        setAdminName(data.user?.name || localStorage.getItem('admin_name') || 'Admin')
        setAdminId(data.user?.adminId || '')
      } else {
        setIsAuthenticated(false)
        localStorage.removeItem('admin_token')
        localStorage.removeItem('admin_name')
      }
    } catch {
      setIsAuthenticated(false)
    } finally {
      setAuthChecking(false)
    }
  }

  const handleLoginSuccess = (token: string, name: string) => {
    setIsAuthenticated(true)
    setAdminName(name)
    checkAuth()
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // ignore
    }
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_name')
    setIsAuthenticated(false)
    setAdminName('Admin')
    toast.success(lang === 'hi' ? 'सफलतापूर्वक लॉगआउट' : 'Logged out successfully')
  }

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-emerald-50">
        <div className="flex items-center gap-2 text-emerald-600">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span className="text-sm font-medium">{t('loading')}</span>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <AdminLogin onLoginSuccess={handleLoginSuccess} />
  }

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
      toast.success(lang === 'hi' ? 'एक्सपोर्ट डाउनलोड हुआ!' : 'Export downloaded!')
    } catch {
      toast.error(lang === 'hi' ? 'एक्सपोर्ट विफल' : 'Export failed')
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
      toast.success(lang === 'hi' ? 'सोर्स कोड डाउनलोड हुआ!' : 'Source code downloaded!')
    } catch {
      toast.error(lang === 'hi' ? 'डाउनलोड विफल' : 'Download failed')
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
      toast.success(lang === 'hi'
        ? `सारा डेटा साफ़! ${d.guests} किराएदार, ${d.bills} बिल, ${d.rooms} कमरे हटाए`
        : `All data cleared! ${d.guests} guests, ${d.bills} bills, ${d.rooms} rooms removed`
      )
      // Refresh the page to reload all components with empty data
      setTimeout(() => {
        window.location.reload()
      }, 1500)
    } catch {
      toast.error(lang === 'hi' ? 'डेटा रीसेट विफल' : 'Failed to reset data')
    } finally {
      setSeeding(false)
    }
  }

  const openStep1 = (action: 'reset' | 'source') => {
    setStep1Action(action)
    setStep1Open(true)
  }

  const handleStep1Continue = () => {
    setStep1Open(false)
    setStep2Action(step1Action)
    setConfirmText('')
    setTimeout(() => setStep2Open(true), 200)
  }

  const handleStep2Confirm = () => {
    if (confirmText !== 'DELETE') {
      toast.error(lang === 'hi' ? 'पुष्टि के लिए DELETE टाइप करें' : 'Type DELETE to confirm')
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
        title: t('reset_step1_title'),
        description: t('reset_step1_desc'),
        icon: <Trash2 className="h-5 w-5 text-red-500" />,
        confirmLabel: t('reset_continue'),
        confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
      }
    : {
        title: t('source_step1_title'),
        description: t('source_step1_desc'),
        icon: <Code2 className="h-5 w-5 text-amber-500" />,
        confirmLabel: t('reset_continue'),
        confirmClass: 'bg-amber-600 hover:bg-amber-700 text-white',
      }

  const step2Config = step2Action === 'reset'
    ? {
        title: t('reset_step2_title'),
        description: t('reset_step2_desc'),
        actionLabel: t('reset_delete_all'),
        actionClass: 'bg-red-600 hover:bg-red-700 text-white',
      }
    : {
        title: t('source_step2_title'),
        description: t('source_step2_desc'),
        actionLabel: t('source_download'),
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

            <div className="flex items-center gap-2">
              {/* Admin name badge */}
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 rounded-full px-2.5 py-1">
                <ShieldCheck className="h-3 w-3 text-emerald-500" />
                <span className="font-medium text-gray-700">{adminName}</span>
              </div>

              {/* Language Toggle */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}
                className="h-8 gap-1.5 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-800 dark:text-emerald-400"
              >
                <Languages className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{lang === 'en' ? 'हिन्दी' : 'English'}</span>
              </Button>

              {/* Settings & Admin button */}
              <Button
                variant={showSettings ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowSettings(prev => !prev)}
                className={`h-8 gap-1.5 text-xs ${
                  showSettings
                    ? 'bg-red-600 hover:bg-red-700 text-white border-red-600'
                    : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-800 dark:text-emerald-400'
                }`}
              >
                {showSettings ? <Building2 className="h-3.5 w-3.5" /> : <Settings className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{showSettings ? t('header_close') : t('header_admin')}</span>
              </Button>

              {/* Settings Dropdown */}
              {showSettings && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">{t('header_actions')}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleExport}
                    disabled={exporting}
                    className="gap-2 cursor-pointer"
                  >
                    <Download className={`h-4 w-4 ${exporting ? 'animate-bounce' : ''}`} />
                    <span>{exporting ? t('header_exporting') : t('header_export_excel')}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleGenerateBills}
                    disabled={generating}
                    className="gap-2 cursor-pointer"
                  >
                    <FilePlus2 className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
                    <span>{generating ? t('header_generating') : t('header_generate_bills')}</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => openStep1('source')}
                    disabled={downloading}
                    className="gap-2 cursor-pointer text-amber-700 dark:text-amber-400"
                  >
                    <Code2 className={`h-4 w-4 ${downloading ? 'animate-spin' : ''}`} />
                    <span>{downloading ? t('header_zipping') : t('header_source_code')}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => openStep1('reset')}
                    disabled={seeding}
                    variant="destructive"
                    className="gap-2 cursor-pointer"
                  >
                    <Database className={`h-4 w-4 ${seeding ? 'animate-spin' : ''}`} />
                    <span>{seeding ? t('header_resetting') : t('header_reset_data')}</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="gap-2 cursor-pointer text-red-600 dark:text-red-400"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>{t('header_logout')}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              )}

              {/* Logout button */}
              {!showSettings && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50"
                  title={t('header_logout')}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              )}
            </div>
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
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleStep1Continue}
              className={step1Config.confirmClass}
            >
              {step1Config.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Step 2 Confirmation Dialog */}
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
              placeholder={t('reset_type_delete')}
              className="border-red-300 focus-visible:border-red-500 focus-visible:ring-red-500/30 font-mono text-center text-lg tracking-widest"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground text-center">
              {t('reset_cannot_undo')}
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
              {t('cancel')}
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
          {showSettings ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <Settings className="h-5 w-5" />
                <h2 className="text-lg font-bold">{t('header_settings_admin')}</h2>
              </div>
              <AdminManager
                token={localStorage.getItem('admin_token') || ''}
                currentAdminName={adminName}
                currentAdminId={adminId}
              />
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && <PgDashboard />}
              {activeTab === 'rooms' && <PgRooms />}
              {activeTab === 'guests' && <PgGuests />}
              {activeTab === 'billing' && <PgBilling />}
              {activeTab === 'deposits' && <PgDeposits />}
            </>
          )}
        </div>
      </main>

      {/* Fixed Bottom Navigation */}
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

export default function Home() {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  )
}
