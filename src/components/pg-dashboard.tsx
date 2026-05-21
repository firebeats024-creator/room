'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Home,
  Users,
  DollarSign,
  Clock,
  Shield,
  AlertCircle,
  RefreshCw,
  BedDouble,
  CheckCircle2,
  XCircle,
  Download,
  CreditCard,
  Calendar,
  IndianRupee,
  Settings,
  Zap,
  AlertTriangle,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import {
  calculateStayMonths,
  getDateComponents,
  getCurrentBillingPeriod,
  remainingDaysAfterMonths,
} from '@/lib/billing-utils'

// ─── Types ───

interface GuestBill {
  id: string
  totalAmount: number
  paidAmount: number
  status: string
  rentAmount: number
  electricityCharge: number
  billingMonth: number
  billingYear: number
  dueDate: string
  previousReading: number
  currentReading: number
  unitsConsumed: number
  ratePerUnit: number
  isCustomBill: boolean
  customTotal: number | null
  manualAdjustment: number
  adjustmentReason: string
}

interface SecurityDeposit {
  id: string
  guestId: string
  amount: number
  status: string
  deductedAmount: number
  notes: string
}

interface ElectricityReading {
  id: string
  reading: number
  readingDate: string
}

interface GuestFull {
  id: string
  name: string
  phone: string
  aadhaarNo: string
  emergencyContact: string
  occupation: string
  workLocation: string
  totalMembers: number
  photoLink: string
  roomId: string
  checkInDate: string
  checkOutDate: string | null
  billingCycleDate: number
  status: string
  room: {
    id: string
    roomNo: string
    floor: number
    type: string
    baseRent: number
    monthlyRent: number
    status: string
  }
  securityDeposit: SecurityDeposit | null
  bills: GuestBill[]
  electricityReadings: ElectricityReading[]
}

interface DashboardData {
  totalRooms: number
  occupiedRooms: number
  vacantRooms: number
  maintenanceRooms: number
  activeGuests: number
  totalRevenue: number
  overdueBills: number
  overdueAmount: number
  activeDeposits: number
  totalDepositAmount: number
  recentGuests: {
    id: string
    name: string
    phone: string
    checkInDate: string
    status: string
    billingCycleDate: number
    room: {
      roomNo: string
      type: string
      baseRent: number
      monthlyRent: number
    }
    billing: {
      totalAccruedRent: number
      totalPaid: number
      totalOutstanding: number
      currentMonthBill: number
      previousDue: number
      stayMonths: number
    }
  }[]
  revenueByMonth: Record<number, number>
  occupancyRate: number
}

// ─── Helpers ───

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const { year, month, day } = getDateComponents(dateStr)
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
}

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`
}

function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]
}

// ─── Skeletons ───

function StatCardSkeleton() {
  return (
    <Card className="py-4">
      <CardHeader className="pb-0 pt-0">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="size-8 rounded-md" />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Skeleton className="h-8 w-16 mb-1" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  )
}

function GuestCardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-14 rounded-lg" />
        <Skeleton className="h-14 rounded-lg" />
        <Skeleton className="h-14 rounded-lg" />
      </div>
    </div>
  )
}

// ─── Component ───

export default function PgDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  // Guest detail dialog state
  const [guestDetailOpen, setGuestDetailOpen] = useState(false)
  const [guestDetail, setGuestDetail] = useState<GuestFull | null>(null)
  const [guestDetailLoading, setGuestDetailLoading] = useState(false)

  // Custom Payment dialog state
  const [customPayOpen, setCustomPayOpen] = useState(false)
  const [customPayAmount, setCustomPayAmount] = useState('')
  const [customPaySubmitting, setCustomPaySubmitting] = useState(false)
  const [customPayTotalOutstanding, setCustomPayTotalOutstanding] = useState(0)

  // Electricity update dialog state
  const [elecUpdateOpen, setElecUpdateOpen] = useState(false)
  const [elecNewReading, setElecNewReading] = useState('')
  const [elecSubmitting, setElecSubmitting] = useState(false)

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard')
      if (!res.ok) throw new Error('Failed to fetch dashboard data')
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

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

  // ─── Open guest detail ───
  const openGuestDetail = async (guestId: string) => {
    setGuestDetailLoading(true)
    setGuestDetailOpen(true)
    setGuestDetail(null)

    try {
      const res = await fetch(`/api/guests/${guestId}`)
      if (!res.ok) throw new Error('Failed to fetch guest details')
      const data = await res.json()
      setGuestDetail(data)
    } catch {
      setGuestDetailOpen(false)
    } finally {
      setGuestDetailLoading(false)
    }
  }

  // ─── Custom Payment handlers ───
  const openCustomPay = (totalOutstanding: number) => {
    setCustomPayTotalOutstanding(totalOutstanding)
    setCustomPayAmount('')
    setCustomPayOpen(true)
  }

  const handleCustomPay = async () => {
    if (!guestDetail) return
    const amount = parseFloat(customPayAmount) || 0
    if (amount <= 0) {
      toast.error('Enter a valid payment amount')
      return
    }

    setCustomPaySubmitting(true)
    try {
      const res = await fetch('/api/bills/custom-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestId: guestDetail.id,
          paymentAmount: amount,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to process payment')
        return
      }

      if (data.remainingAfterPayment === 0) {
        toast.success(`Payment of ${formatCurrency(amount)} recorded — all dues cleared!`)
      } else {
        toast.success(`Payment of ${formatCurrency(amount)} recorded! Remaining: ${formatCurrency(data.remainingAfterPayment)}`)
      }

      setCustomPayOpen(false)

      // Refresh guest details to reflect payment
      const detailRes = await fetch(`/api/guests/${guestDetail.id}`)
      if (detailRes.ok) {
        const freshData = await detailRes.json()
        setGuestDetail(freshData)
      }

      // Refresh dashboard data too
      fetchDashboard()
    } catch {
      toast.error('Failed to process payment')
    } finally {
      setCustomPaySubmitting(false)
    }
  }

  // ─── Electricity update handler ───
  const handleElecUpdate = async () => {
    if (!guestDetail) return
    const newReading = parseFloat(elecNewReading) || 0
    if (newReading < 0) {
      toast.error('Reading must be 0 or more')
      return
    }

    setElecSubmitting(true)
    try {
      const res = await fetch('/api/electricity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestId: guestDetail.id,
          reading: newReading,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Failed to update reading')
        return
      }

      toast.success(data._wasUpdated ? 'Electricity reading corrected!' : 'Electricity reading updated!')
      setElecUpdateOpen(false)

      // Refresh guest details to reflect updated bill
      const refreshRes = await fetch(`/api/guests/${guestDetail.id}`)
      if (refreshRes.ok) {
        const refreshed = await refreshRes.json()
        setGuestDetail(refreshed)
      }

      // Refresh dashboard data
      fetchDashboard()
    } catch {
      toast.error('Failed to update electricity reading')
    } finally {
      setElecSubmitting(false)
    }
  }

  // ─── Filter guests with due bills ───
  const guestsWithDue = data?.recentGuests.filter(g => g.billing.totalOutstanding > 0) ?? []

  const statCards = data
    ? [
        {
          title: 'Total Rooms',
          value: data.totalRooms,
          subtitle: `${data.occupancyRate}% occupancy`,
          icon: Home,
          color: 'text-emerald-600',
          bg: 'bg-emerald-50 dark:bg-emerald-950/40',
        },
        {
          title: 'Occupied',
          value: data.occupiedRooms,
          subtitle: `${data.activeGuests} active guests`,
          icon: CheckCircle2,
          color: 'text-teal-600',
          bg: 'bg-teal-50 dark:bg-teal-950/40',
        },
        {
          title: 'Vacant',
          value: data.vacantRooms,
          subtitle: `${data.maintenanceRooms} maintenance`,
          icon: BedDouble,
          color: 'text-amber-600',
          bg: 'bg-amber-50 dark:bg-amber-950/40',
        },
        {
          title: 'Monthly Revenue',
          value: formatCurrency(data.totalRevenue),
          subtitle: 'Total collected revenue',
          icon: DollarSign,
          color: 'text-emerald-600',
          bg: 'bg-emerald-50 dark:bg-emerald-950/40',
        },
        {
          title: 'Due Bills (Overdue)',
          value: data.overdueBills,
          subtitle: `Total due: ${formatCurrency(data.overdueAmount)}`,
          icon: AlertCircle,
          color: 'text-rose-600',
          bg: 'bg-rose-50 dark:bg-rose-950/40',
        },
        {
          title: 'Active Deposits',
          value: data.activeDeposits,
          subtitle: formatCurrency(data.totalDepositAmount) + ' held',
          icon: Shield,
          color: 'text-violet-600',
          bg: 'bg-violet-50 dark:bg-violet-950/40',
        },
      ]
    : []

  return (
    <div className="space-y-6">
      {/* Header with Gear Icon Dropdown */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Dashboard
        </h2>
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
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              onClick={fetchDashboard}
              disabled={loading}
              className="gap-2 cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleExport}
              disabled={exporting}
              className="gap-2 cursor-pointer"
            >
              <Download className={`h-4 w-4 ${exporting ? 'animate-bounce' : ''}`} />
              <span>{exporting ? 'Exporting...' : 'Export Excel'}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/40">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="size-5 text-rose-600" />
            <p className="text-sm text-rose-700 dark:text-rose-400">
              {error}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchDashboard}
              className="ml-auto text-rose-600 hover:text-rose-700"
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stat Cards — 2 per row on mobile */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <StatCardSkeleton key={i} />
            ))
          : statCards.map((card) => (
              <Card key={card.title} className="py-3 sm:py-4">
                <CardHeader className="pb-0 pt-0 px-4 sm:px-6">
                  <div className="flex items-center justify-between">
                    <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                      {card.title}
                    </p>
                    <div className={`rounded-md p-1.5 sm:p-2 ${card.bg}`}>
                      <card.icon className={`size-3.5 sm:size-4 ${card.color}`} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 px-4 sm:px-6">
                  <div className="text-lg sm:text-2xl font-bold tracking-tight">
                    {card.value}
                  </div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">
                    {card.subtitle}
                  </p>
                </CardContent>
              </Card>
            ))}
      </div>

      {/* ═══ Guests with Due Bills ═══ */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <AlertCircle className="size-5 text-red-500" />
          <h3 className="text-lg font-semibold">Due Guests</h3>
          {data && (
            <Badge variant="outline" className="border-red-200 text-red-700 text-xs">
              {guestsWithDue.length}
            </Badge>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <GuestCardSkeleton key={i} />
            ))}
          </div>
        ) : guestsWithDue.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {guestsWithDue.map((guest) => (
              <div
                key={guest.id}
                onClick={() => openGuestDetail(guest.id)}
                className="rounded-xl border border-red-100 bg-white shadow-sm hover:shadow-md hover:border-red-300 transition-all duration-200 cursor-pointer overflow-hidden group"
              >
                {/* Guest header — highlighted name & room */}
                <div className="bg-gradient-to-r from-red-600 to-rose-600 px-4 py-3 text-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-9 items-center justify-center rounded-full bg-white/20 text-sm font-bold shrink-0">
                        {guest.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-extrabold text-[15px] truncate tracking-tight">{guest.name}</p>
                        <p className="text-red-100 text-[12px] font-semibold">
                          Room {guest.room.roomNo} · {guest.room.type}
                        </p>
                      </div>
                    </div>
                    <Badge className="shrink-0 text-[9px] px-1.5 py-0 bg-red-400/30 text-white border-red-300/40">
                      DUE
                    </Badge>
                  </div>
                </div>

                {/* Billing info */}
                <div className="p-3 space-y-2.5">
                  {/* Accrued / Paid summary */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatCurrency(guest.billing.totalAccruedRent)} <span className="text-emerald-700 font-semibold">accrued</span>
                    </span>
                    <span className="text-emerald-600 font-medium">
                      Paid: {formatCurrency(guest.billing.totalPaid)}
                    </span>
                  </div>

                  {/* 3-column billing cards */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-red-50 border border-red-100 p-2 text-center">
                      <p className="text-[10px] text-red-400 mb-0.5">Current Bill</p>
                      <p className="text-xs font-bold text-red-700">{formatCurrency(guest.billing.currentMonthBill)}</p>
                    </div>
                    <div className="rounded-lg bg-amber-50 border border-amber-100 p-2 text-center">
                      <p className="text-[10px] text-amber-500 mb-0.5">Previous Due</p>
                      <p className="text-xs font-bold text-amber-700">{formatCurrency(guest.billing.previousDue)}</p>
                    </div>
                    <div className="rounded-lg bg-orange-50 border border-orange-100 p-2 text-center">
                      <p className="text-[10px] text-orange-500 mb-0.5">Total Due</p>
                      <p className="text-xs font-bold text-orange-700">{formatCurrency(guest.billing.totalOutstanding)}</p>
                    </div>
                  </div>

                  {/* Stay info row */}
                  <div className="flex items-center justify-between text-[11px] text-gray-400 border-t border-gray-50 pt-2">
                    <span>Check-in: {formatDate(guest.checkInDate)}</span>
                    <span>Cycle: {guest.billingCycleDate}{getOrdinalSuffix(guest.billingCycleDate)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Card className="border-dashed border-gray-200 bg-gray-50/50">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CheckCircle2 className="size-10 text-emerald-300 mb-3" />
              <p className="text-sm text-gray-400">
                No due guests — all bills are paid! 🎉
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ═══════════ GUEST DETAILS DIALOG (with Pay Now + Electricity Update) ═══════════ */}
      <Dialog open={guestDetailOpen} onOpenChange={setGuestDetailOpen}>
        <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto p-0 gap-0">
          {/* Visually hidden title for screen reader accessibility */}
          <DialogTitle className="sr-only">Guest Details</DialogTitle>
          <DialogDescription className="sr-only">View guest details and billing information</DialogDescription>
          {guestDetailLoading ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : guestDetail ? (() => {
            const isLive = guestDetail.status === 'Live'
            const nowLocal = new Date()
            const nowLocalStr = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`
            const stayMonths = isLive ? calculateStayMonths(guestDetail.checkInDate, nowLocalStr) : 0
            const stayRemainingDays = isLive ? remainingDaysAfterMonths(guestDetail.checkInDate, stayMonths, nowLocalStr) : 0
            const monthlyRent = guestDetail.room.monthlyRent
            const daysStayed = isLive ? Math.floor((nowLocal.getTime() - new Date(guestDetail.checkInDate).getTime()) / (1000 * 60 * 60 * 24)) : 0

            const currentPeriod = isLive ? getCurrentBillingPeriod(guestDetail.checkInDate, nowLocalStr) : null
            const unpaidBills = guestDetail.bills.filter((b) => b.status !== 'Paid')
            const totalPaid = guestDetail.bills.reduce((sum, b) => sum + (b.paidAmount || 0), 0)
            const totalOutstanding = unpaidBills.reduce((sum, b) => sum + Math.max(0, b.totalAmount - (b.paidAmount || 0)), 0)
            const currentPeriodBill = currentPeriod
              ? guestDetail.bills.find((b) => b.billingMonth === currentPeriod.month && b.billingYear === currentPeriod.year)
              : null
            const currentMonthBill = currentPeriodBill
              ? Math.max(0, currentPeriodBill.totalAmount - (currentPeriodBill.paidAmount || 0))
              : (currentPeriod ? monthlyRent : 0)
            const previousDue = Math.max(0, totalOutstanding - currentMonthBill)

            // Calculate totalAccruedRent: sum of bill rentAmounts for billed months,
            // plus current rent for the unbilled current period
            const billedRentTotal = guestDetail.bills.reduce((sum, b) => sum + b.rentAmount, 0)
            const hasCurrentBill = currentPeriodBill != null
            const totalAccruedRent = hasCurrentBill
              ? billedRentTotal
              : billedRentTotal + monthlyRent

            const lastElecReading = guestDetail.electricityReadings?.[0]
            const firstBill = guestDetail.bills[0] || null
            const openingReading = firstBill?.previousReading ?? lastElecReading?.reading ?? 0
            const sortedBills = [...guestDetail.bills].sort((a, b) => {
              if (a.billingYear !== b.billingYear) return b.billingYear - a.billingYear
              return b.billingMonth - a.billingMonth
            })
            const lastBill = sortedBills[0] || null
            const prevReading = currentPeriodBill?.previousReading
              ?? (lastBill?.currentReading ?? lastBill?.previousReading ?? openingReading ?? 0)
            const currReading = currentPeriodBill?.currentReading ?? (lastElecReading?.reading ?? prevReading)
            const unitsConsumed = currentPeriodBill?.unitsConsumed ?? Math.max(0, currReading - prevReading)
            const ratePerUnit = currentPeriodBill?.ratePerUnit ?? (lastBill?.ratePerUnit ?? 10)
            const elecCharge = currentPeriodBill?.electricityCharge ?? (unitsConsumed * ratePerUnit)

            return (
              <div className="divide-y divide-gray-100">
                {/* Header */}
                <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-5 py-4 text-white">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex size-11 items-center justify-center rounded-full bg-white/20 text-lg font-bold">
                        {guestDetail.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-base font-bold leading-tight">{guestDetail.name}</h3>
                        <p className="text-emerald-100 text-xs mt-0.5">
                          Room {guestDetail.room.roomNo} · {guestDetail.room.type} · {formatCurrency(monthlyRent)}/mo
                        </p>
                      </div>
                    </div>
                    <Badge className={`shrink-0 text-[10px] px-2 py-0.5 ${
                      isLive
                        ? 'bg-emerald-400/30 text-white border-emerald-300/40'
                        : 'bg-amber-400/30 text-white border-amber-300/40'
                    }`}>
                      {isLive ? '● Live' : 'Checked Out'}
                    </Badge>
                  </div>
                </div>

                {/* Personal Information */}
                <div className="px-5 py-4 space-y-3">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    Personal Information
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                    <div className="flex justify-between sm:block">
                      <span className="text-gray-400 text-xs sm:text-sm">Contact</span>
                      <p className="font-medium text-gray-800 sm:mt-0.5">{guestDetail.phone || '—'}</p>
                    </div>
                    <div className="flex justify-between sm:block">
                      <span className="text-gray-400 text-xs sm:text-sm">Aadhaar</span>
                      <p className="font-medium text-gray-800 font-mono sm:mt-0.5">{guestDetail.aadhaarNo || '—'}</p>
                    </div>
                    <div className="flex justify-between sm:block">
                      <span className="text-gray-400 text-xs sm:text-sm">Occupation</span>
                      <p className="font-medium text-gray-800 sm:mt-0.5">
                        {guestDetail.occupation || '—'}
                        {guestDetail.workLocation && <span className="text-gray-400"> at {guestDetail.workLocation}</span>}
                      </p>
                    </div>
                    <div className="flex justify-between sm:block">
                      <span className="text-gray-400 text-xs sm:text-sm">Members</span>
                      <p className="font-medium text-gray-800 sm:mt-0.5">{guestDetail.totalMembers} member{guestDetail.totalMembers !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="flex justify-between sm:block">
                      <span className="text-gray-400 text-xs sm:text-sm">Emergency Contact</span>
                      <p className="font-medium text-gray-800 sm:mt-0.5">{guestDetail.emergencyContact || '—'}</p>
                    </div>
                    <div className="flex justify-between sm:block">
                      <span className="text-gray-400 text-xs sm:text-sm">Security Deposit</span>
                      <p className="font-medium text-gray-800 sm:mt-0.5">
                        {formatCurrency(guestDetail.securityDeposit?.amount ?? 0)}
                        {guestDetail.securityDeposit && (
                          <span className="text-gray-400 text-xs ml-1">({guestDetail.securityDeposit.status})</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Stay Details */}
                <div className="px-5 py-4 bg-gray-50/60 space-y-3">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Stay Details
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-lg bg-white border border-gray-100 p-2.5">
                      <p className="text-[10px] text-gray-400 mb-0.5">Check-in</p>
                      <p className="text-sm font-semibold text-gray-800">{formatDate(guestDetail.checkInDate)}</p>
                    </div>
                    <div className="rounded-lg bg-white border border-gray-100 p-2.5">
                      <p className="text-[10px] text-gray-400 mb-0.5">Billing Cycle</p>
                      <p className="text-sm font-semibold text-gray-800">{guestDetail.billingCycleDate}{getOrdinalSuffix(guestDetail.billingCycleDate)}</p>
                    </div>
                    {isLive && (
                      <div className="rounded-lg bg-white border border-gray-100 p-2.5">
                        <p className="text-[10px] text-gray-400 mb-0.5">Total Stay</p>
                        <p className="text-sm font-semibold text-gray-800">
                          {stayMonths}m{stayRemainingDays > 0 ? ` ${stayRemainingDays}d` : ''}
                        </p>
                      </div>
                    )}
                    {isLive && (
                      <div className="rounded-lg bg-white border border-gray-100 p-2.5">
                        <p className="text-[10px] text-gray-400 mb-0.5">Live As Of</p>
                        <p className="text-sm font-semibold text-emerald-700">{formatDate(nowLocalStr)}</p>
                      </div>
                    )}
                    {guestDetail.checkOutDate && (
                      <div className="rounded-lg bg-white border border-gray-100 p-2.5">
                        <p className="text-[10px] text-gray-400 mb-0.5">Check-out</p>
                        <p className="text-sm font-semibold text-amber-700">{formatDate(guestDetail.checkOutDate)}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Live Billing Status */}
                {isLive && (
                  <div className="px-5 py-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                        <CreditCard className="h-3.5 w-3.5" />
                        Live Billing Status
                      </h4>
                      <span className="text-[10px] text-gray-400">
                        {daysStayed} days · {formatCurrency(totalAccruedRent)} total accrued
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="rounded-lg bg-red-50 border border-red-100 p-2.5 text-center">
                        <p className="text-[10px] text-red-400 mb-0.5">Current Bill</p>
                        <p className="text-sm font-bold text-red-700">{formatCurrency(currentMonthBill)}</p>
                      </div>
                      <div className="rounded-lg bg-amber-50 border border-amber-100 p-2.5 text-center">
                        <p className="text-[10px] text-amber-500 mb-0.5">Previous Due</p>
                        <p className="text-sm font-bold text-amber-700">{formatCurrency(previousDue)}</p>
                      </div>
                      <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-2.5 text-center">
                        <p className="text-[10px] text-emerald-500 mb-0.5">Total Paid</p>
                        <p className="text-sm font-bold text-emerald-700">{formatCurrency(totalPaid)}</p>
                      </div>
                    </div>

                    {totalOutstanding > 0 ? (
                      <div className="flex items-center justify-between bg-red-50 rounded-lg p-3 border border-red-200">
                        <div>
                          <p className="text-xs font-semibold text-red-800">Total Outstanding</p>
                          <p className="text-lg font-bold text-red-800">{formatCurrency(totalOutstanding)}</p>
                        </div>
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 px-3"
                          onClick={(e) => {
                            e.stopPropagation()
                            openCustomPay(totalOutstanding)
                          }}
                        >
                          <IndianRupee className="h-3.5 w-3.5 mr-1" />
                          Pay Now
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 p-3 rounded-lg border border-emerald-200">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <span className="font-medium">All dues cleared — no outstanding balance.</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Electricity — with Update button */}
                {isLive && (
                  <div className="px-5 py-4 bg-amber-50/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Zap className="h-3.5 w-3.5" />
                        Electricity
                      </h4>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-amber-300 text-amber-700 hover:bg-amber-100 text-[10px] sm:text-xs h-7 px-2 sm:px-2.5"
                        onClick={(e) => {
                          e.stopPropagation()
                          setElecNewReading(String(currReading ?? prevReading ?? openingReading ?? 0))
                          setElecUpdateOpen(true)
                        }}
                      >
                        <Zap className="h-3 w-3 sm:mr-1" />
                        <span className="hidden sm:inline">Update</span>
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="rounded-lg bg-white border border-gray-100 p-2.5 text-center">
                        <p className="text-[10px] text-gray-400 mb-0.5">Opening Unit</p>
                        <p className="text-sm font-bold font-mono text-emerald-700">{openingReading}</p>
                      </div>
                      <div className="rounded-lg bg-white border border-gray-100 p-2.5 text-center">
                        <p className="text-[10px] text-gray-400 mb-0.5">Current Unit</p>
                        <p className="text-sm font-bold font-mono text-gray-800">{currReading}</p>
                      </div>
                      <div className="rounded-lg bg-white border border-gray-100 p-2.5 text-center">
                        <p className="text-[10px] text-gray-400 mb-0.5">Rate/Unit</p>
                        <p className="text-sm font-bold font-mono text-gray-800">₹{ratePerUnit}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between bg-white rounded-lg p-3 border border-amber-200">
                      <div className="flex items-center gap-2 text-sm">
                        <Zap className="h-4 w-4 text-amber-500" />
                        <span className="text-gray-500">Units: <span className="font-semibold text-gray-800">{unitsConsumed}</span></span>
                      </div>
                      <div className="text-sm">
                        <span className="text-gray-500">Charge: </span>
                        <span className="font-bold text-amber-700">{formatCurrency(elecCharge)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Payment History */}
                {guestDetail.bills.filter((b) => b.status === 'Paid').length > 0 && (
                  <div className="px-5 py-4 space-y-3">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Payment History ({guestDetail.bills.filter((b) => b.status === 'Paid').length})
                    </h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {guestDetail.bills
                        .filter((b) => b.status === 'Paid')
                        .sort((a, b) => {
                          if (a.billingYear !== b.billingYear) return b.billingYear - a.billingYear
                          return b.billingMonth - a.billingMonth
                        })
                        .map((bill) => (
                          <div key={bill.id} className="flex items-center justify-between gap-2 rounded-lg border border-emerald-100 bg-emerald-50/40 p-2.5">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <Badge className="text-[9px] px-1.5 py-0 bg-emerald-100 text-emerald-700 border-emerald-200">Paid</Badge>
                                <span className="text-sm font-medium text-gray-800">{MONTH_NAMES[bill.billingMonth - 1]} {bill.billingYear}</span>
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                <span>Rent: {formatCurrency(bill.rentAmount)}</span>
                                {bill.electricityCharge > 0 && <span>Elec: {formatCurrency(bill.electricityCharge)}</span>}
                                <span>Total: {formatCurrency(bill.totalAmount)}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div className="px-5 py-3 bg-gray-50/60 flex justify-end">
                  <Button variant="outline" onClick={() => setGuestDetailOpen(false)} className="border-gray-200 text-gray-600 hover:bg-gray-100 text-xs h-8">
                    Close
                  </Button>
                </div>
              </div>
            )
          })() : (
            <div className="p-8 text-center text-gray-400">
              No guest details found
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════════ CUSTOM PAYMENT DIALOG ═══════════ */}
      <Dialog open={customPayOpen} onOpenChange={setCustomPayOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-emerald-600" />
              Custom Payment
            </DialogTitle>
            <DialogDescription>
              Pay any amount — distributed across bills (oldest first)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Outstanding display */}
            <div className="flex items-center justify-between bg-red-50 rounded-lg p-3 border border-red-200">
              <span className="text-sm text-red-700 font-medium">Total Outstanding</span>
              <span className="text-lg font-bold text-red-800">
                {formatCurrency(customPayTotalOutstanding)}
              </span>
            </div>

            {/* Payment Amount */}
            <div className="space-y-2">
              <Label htmlFor="dashCustomPayAmount">
                Payment Amount (₹) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="dashCustomPayAmount"
                type="number"
                min="1"
                max={customPayTotalOutstanding}
                placeholder="Enter payment amount"
                value={customPayAmount}
                onChange={(e) => setCustomPayAmount(e.target.value)}
              />
              {/* Quick-fill buttons */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 flex-1"
                  onClick={() => setCustomPayAmount(String(customPayTotalOutstanding))}
                >
                  Full Amount
                </Button>
                {customPayTotalOutstanding > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 flex-1"
                    onClick={() => setCustomPayAmount(String(Math.ceil(customPayTotalOutstanding / 2)))}
                  >
                    Half Amount
                  </Button>
                )}
              </div>
            </div>

            {/* Payment Preview */}
            {(() => {
              const amt = parseFloat(customPayAmount) || 0
              if (amt <= 0) return null
              const effectiveAmt = Math.min(amt, customPayTotalOutstanding)
              const remainingAfter = customPayTotalOutstanding - effectiveAmt
              return (
                <div className="rounded-lg border border-gray-200 p-3 space-y-2 bg-gray-50/50">
                  <p className="text-xs font-semibold text-gray-600">Payment Preview</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">You Pay</span>
                    <span className="font-semibold text-emerald-700">{formatCurrency(effectiveAmt)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Remaining After</span>
                    <span className={`font-semibold ${remainingAfter > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {formatCurrency(remainingAfter)}
                    </span>
                  </div>
                  {remainingAfter === 0 && (
                    <p className="text-[10px] text-emerald-600 font-medium">✓ Full payment — all dues will be cleared!</p>
                  )}
                </div>
              )
            })()}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCustomPayOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCustomPay}
              disabled={customPaySubmitting || !customPayAmount || parseFloat(customPayAmount) <= 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {customPaySubmitting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <IndianRupee className="h-4 w-4 mr-1" />
                  Confirm Payment
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ ELECTRICITY UPDATE DIALOG ═══════════ */}
      <Dialog open={elecUpdateOpen} onOpenChange={setElecUpdateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-700">
              <Zap className="h-5 w-5" />
              Update Electricity Reading
            </DialogTitle>
            <DialogDescription>
              Enter the current meter reading — units & charge will auto-calculate
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {guestDetail && (() => {
              const bill = guestDetail.bills.find((b) => {
                if (!guestDetail) return false
                const now = new Date()
                const period = getCurrentBillingPeriod(guestDetail.checkInDate, now)
                return period && b.billingMonth === period.month && b.billingYear === period.year
              })
              const lastElec = guestDetail.electricityReadings?.[0]
              const previousRd = bill?.previousReading ?? (lastElec?.reading ?? 0)
              const rate = bill?.ratePerUnit ?? 10
              const newRd = parseFloat(elecNewReading) || 0
              const units = Math.max(0, newRd - previousRd)
              const charge = units * rate

              return (
                <>
                  {/* Current Reading Summary */}
                  <Card className="border-yellow-200 bg-yellow-50/50">
                    <CardContent className="p-4 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Previous Reading</span>
                        <span className="font-medium">{previousRd}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Rate per Unit</span>
                        <span className="font-medium">{formatCurrency(rate)}</span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* New Reading Input */}
                  <div className="space-y-2">
                    <Label htmlFor="dashElecNewReading">
                      New Meter Reading <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="dashElecNewReading"
                      type="number"
                      min={previousRd}
                      placeholder="Enter current meter reading"
                      value={elecNewReading}
                      onChange={(e) => setElecNewReading(e.target.value)}
                      className="font-mono text-lg border-yellow-200 focus-visible:border-yellow-400 focus-visible:ring-yellow-400/30"
                    />
                  </div>

                  {/* Auto-calculated Preview */}
                  {newRd > previousRd && (
                    <Card className="border-emerald-200 bg-emerald-50/30">
                      <CardHeader className="pb-1 pt-3 px-4">
                        <CardTitle className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                          <Zap className="size-3.5" />
                          Auto-calculated Preview
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-3 space-y-1.5 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground text-xs">Units Consumed</span>
                          <span className="font-medium text-xs">{units} ({newRd} − {previousRd})</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground text-xs">Electricity Charge</span>
                          <span className="font-medium text-xs">{formatCurrency(charge)} ({units} × {formatCurrency(rate)})</span>
                        </div>
                        <Separator className="my-1.5" />
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-xs">Added to Bill</span>
                          <span className="font-bold text-emerald-800">{formatCurrency(charge)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {newRd > 0 && newRd < previousRd && (
                    <div className="flex items-center gap-1.5 text-xs text-red-700 bg-red-100 p-2 rounded">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <span>New reading ({newRd}) cannot be less than previous ({previousRd})</span>
                    </div>
                  )}
                </>
              )
            })()}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setElecUpdateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleElecUpdate}
              disabled={elecSubmitting || !elecNewReading || parseFloat(elecNewReading) < 0}
              className="bg-yellow-600 hover:bg-yellow-700 text-white"
            >
              {elecSubmitting ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Zap className="mr-2 h-4 w-4" />
                  Update Reading
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
