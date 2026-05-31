'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  User,
  Phone,
  Calendar,
  Shield,
  Briefcase,
  Users,
  Camera,
  CreditCard,
  FileText,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  IndianRupee,
  Zap,
  FileDown,
  RefreshCw,
  X,
  Home,
  MapPin,
  Calculator,
} from 'lucide-react'
import { toast } from 'sonner'
import { useLanguage } from '@/lib/i18n'
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
  maintenanceCharge: number
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
  nameHindi: string
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
    monthlyRent: number
    maintenanceCharge: number
    status: string
  }
  securityDeposit: SecurityDeposit | null
  bills: GuestBill[]
  electricityReadings: ElectricityReading[]
}

// ─── Props ───

interface GuestDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  guestId: string | null
  onPaymentSuccess?: () => void
}

// ─── Constants ───

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

// ─── Helpers ───

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

function getInitialColor(name: string): string {
  const colors = [
    'bg-emerald-500',
    'bg-teal-500',
    'bg-cyan-500',
    'bg-violet-500',
    'bg-rose-500',
    'bg-amber-500',
    'bg-pink-500',
    'bg-indigo-500',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

// ─── Component ───

export default function GuestDetailDialog({
  open,
  onOpenChange,
  guestId,
  onPaymentSuccess,
}: GuestDetailDialogProps) {
  const { getGuestName } = useLanguage()
  const [guestDetail, setGuestDetail] = useState<GuestFull | null>(null)
  const [loading, setLoading] = useState(false)

  // Mark Paid dialog state
  const [markPaidOpen, setMarkPaidOpen] = useState(false)
  const [markPaidBill, setMarkPaidBill] = useState<GuestBill | null>(null)
  const [markPaidSubmitting, setMarkPaidSubmitting] = useState(false)
  const [payAmount, setPayAmount] = useState('')

  // Custom Payment dialog state
  const [customPayOpen, setCustomPayOpen] = useState(false)
  const [customPayAmount, setCustomPayAmount] = useState('')
  const [customPaySubmitting, setCustomPaySubmitting] = useState(false)
  const [customPayTotalOutstanding, setCustomPayTotalOutstanding] = useState(0)

  // Electricity update dialog state
  const [elecUpdateOpen, setElecUpdateOpen] = useState(false)
  const [elecNewReading, setElecNewReading] = useState('')
  const [elecSubmitting, setElecSubmitting] = useState(false)

  // Receipt download state
  const [receiptDownloading, setReceiptDownloading] = useState<string | null>(null)

  // ─── Fetch guest detail when guestId changes ───

  useEffect(() => {
    if (open && guestId) {
      setLoading(true)
      setGuestDetail(null)

      fetch(`/api/guests/${guestId}`)
        .then((res) => {
          if (!res.ok) throw new Error('Failed to fetch guest details')
          return res.json()
        })
        .then((data) => setGuestDetail(data))
        .catch(() => {
          toast.error('Failed to load guest details')
          onOpenChange(false)
        })
        .finally(() => setLoading(false))
    }
  }, [open, guestId, onOpenChange])

  // ─── Mark Paid handlers ───

  const openMarkPaid = (bill: GuestBill) => {
    setMarkPaidBill(bill)
    const remaining = bill.totalAmount - (bill.paidAmount || 0)
    setPayAmount(String(remaining))
    setMarkPaidOpen(true)
  }

  const handleMarkPaid = async () => {
    if (!markPaidBill || !guestDetail) return

    try {
      setMarkPaidSubmitting(true)
      const paymentAmt = parseFloat(payAmount) || 0
      const existingPaid = markPaidBill.paidAmount || 0
      const totalPaidAfter = existingPaid + paymentAmt
      const isFullPayment = totalPaidAfter >= markPaidBill.totalAmount

      const payload: Record<string, unknown> = {
        billId: markPaidBill.id,
        status: isFullPayment ? 'Paid' : 'Partially-Paid',
        paymentAmount: paymentAmt,
        previousReading: markPaidBill.previousReading,
        currentReading: markPaidBill.currentReading,
        unitsConsumed: markPaidBill.unitsConsumed,
        ratePerUnit: markPaidBill.ratePerUnit,
        electricityCharge: markPaidBill.electricityCharge,
        isCustomBill: markPaidBill.isCustomBill,
        customTotal: markPaidBill.customTotal,
        manualAdjustment: markPaidBill.manualAdjustment,
        adjustmentReason: markPaidBill.adjustmentReason,
      }

      const res = await fetch('/api/bills', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || 'Failed to process payment')
        return
      }

      if (isFullPayment) {
        toast.success('Bill marked as paid!')
      } else {
        toast.success(`Payment of ${formatCurrency(paymentAmt)} recorded!`)
      }

      setMarkPaidOpen(false)

      // Refresh guest details to reflect payment
      const refreshRes = await fetch(`/api/guests/${guestDetail.id}`)
      if (refreshRes.ok) {
        const refreshed = await refreshRes.json()
        setGuestDetail(refreshed)
      }
      onPaymentSuccess?.()
    } catch {
      toast.error('Failed to process payment')
    } finally {
      setMarkPaidSubmitting(false)
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

      // Refresh guest details
      const refreshRes = await fetch(`/api/guests/${guestDetail.id}`)
      if (refreshRes.ok) {
        const refreshed = await refreshRes.json()
        setGuestDetail(refreshed)
      }
      onPaymentSuccess?.()
    } catch {
      toast.error('Failed to process payment')
    } finally {
      setCustomPaySubmitting(false)
    }
  }

  // ─── Electricity Update handlers ───

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

      toast.success('Electricity reading updated!')
      setElecUpdateOpen(false)

      // Refresh guest details to reflect updated bill
      const refreshRes = await fetch(`/api/guests/${guestDetail.id}`)
      if (refreshRes.ok) {
        const refreshed = await refreshRes.json()
        setGuestDetail(refreshed)
      }
    } catch {
      toast.error('Failed to update electricity reading')
    } finally {
      setElecSubmitting(false)
    }
  }

  // ─── Download Receipt handler ───

  const handleDownloadReceipt = async (billId: string) => {
    setReceiptDownloading(billId)
    try {
      const res = await fetch(`/api/receipt/${billId}`)
      if (!res.ok) throw new Error('Failed to download receipt')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `receipt-${billId.substring(0, 8)}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Receipt downloaded!')
    } catch {
      toast.error('Failed to download receipt')
    } finally {
      setReceiptDownloading(null)
    }
  }

  // ─── Render ───

  return (
    <>
      {/* ═══════════ MAIN GUEST DETAIL DIALOG ═══════════ */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : guestDetail ? (() => {
            // ─── Billing calculations (ACCRUAL-BASED — same as billing page) ───
            const isLive = guestDetail.status === 'Live'
            const nowLocal = new Date()
            const nowLocalStr = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`
            const stayMonths = isLive ? calculateStayMonths(guestDetail.checkInDate, nowLocalStr) : 0
            const stayRemainingDays = isLive ? remainingDaysAfterMonths(guestDetail.checkInDate, stayMonths, nowLocalStr) : 0
            const monthlyRent = guestDetail.room.monthlyRent

            // ─── Accrual-based calculation (SAME formula as pg-billing.tsx) ───
            // Source of truth: ACTUAL bill records capture correct rent per month
            // Total Accrued = (Rent from bills + Unbilled rent) + (Maint from bills + Unbilled maint)
            //                 + Electricity from bills + Adjustments from bills
            // Total Due = Total Accrued - Total Paid
            const currentPeriod = isLive ? getCurrentBillingPeriod(guestDetail.checkInDate, nowLocalStr) : null

            // Bill-records-based calculation (handles rent changes correctly)
            const billCount = guestDetail.bills.length
            const unbilledMonths = Math.max(0, stayMonths - billCount)
            const unbilledRent = unbilledMonths * monthlyRent
            const unbilledMaintenance = unbilledMonths * (guestDetail.room.maintenanceCharge || 0)

            // Sum components from bill records
            const totalRentFromBills = guestDetail.bills.reduce((sum, b) => sum + b.rentAmount, 0)
            const totalMaintenanceFromBills = guestDetail.bills.reduce((sum, b) => sum + (b.maintenanceCharge || 0), 0)
            const totalElectricity = guestDetail.bills.reduce((sum, b) => sum + (b.electricityCharge || 0), 0)
            const totalAdjustments = guestDetail.bills.reduce((sum, b) => sum + (b.manualAdjustment || 0), 0)

            const totalAccruedRent = totalRentFromBills + unbilledRent
            const totalAccruedMaintenance = totalMaintenanceFromBills + unbilledMaintenance

            // Total Paid from all bills (Paid bills: full amount; others: paidAmount so far)
            const totalPaid = guestDetail.bills.reduce((sum, b) => {
              if (b.status === 'Paid') return sum + b.totalAmount
              return sum + (b.paidAmount || 0)
            }, 0)

            const dynamicTotalAccrued = totalAccruedRent + totalAccruedMaintenance + totalElectricity + totalAdjustments
            const totalBalance = Math.max(0, dynamicTotalAccrued - totalPaid)

            // Current / Previous split
            const unpaidBills = guestDetail.bills.filter((b) => b.status !== 'Paid')
            const currentPeriodBill = currentPeriod
              ? guestDetail.bills.find((b) => b.billingMonth === currentPeriod.month && b.billingYear === currentPeriod.year)
              : null

            // Current Bill: remaining on current period's bill, or monthlyRent if no bill exists
            const currentMonthBill = currentPeriodBill
              ? Math.max(0, currentPeriodBill.totalAmount - (currentPeriodBill.paidAmount || 0))
              : (currentPeriod ? monthlyRent + (guestDetail.room.maintenanceCharge || 0) : 0)

            const previousDue = Math.max(0, totalBalance - currentMonthBill)
            const totalOutstanding = totalBalance // Same as totalBalance for the accrual model

            // ─── Electricity details ───
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

            // Total days of stay
            const totalDays = isLive ? (() => {
              const checkIn = new Date(guestDetail.checkInDate.split('T')[0])
              const now = new Date(nowLocalStr)
              const diffTime = Math.abs(now.getTime() - checkIn.getTime())
              return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
            })() : 0

            const initial = getGuestName(guestDetail.name, guestDetail.nameHindi).charAt(0).toUpperCase()
            const colorClass = getInitialColor(guestDetail.name)

            return (
              <div className="flex flex-col max-h-[85vh]">
                {/* ═══ HEADER BANNER (sticky) ═══ */}
                <div className="sticky top-0 z-10 bg-gradient-to-r from-emerald-600 to-teal-600 px-4 sm:px-6 py-4 text-white shrink-0">
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className={`flex size-12 shrink-0 items-center justify-center rounded-full text-lg font-bold bg-white/20 backdrop-blur-sm`}>
                      {initial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate text-lg font-bold">{getGuestName(guestDetail.name, guestDetail.nameHindi)}</h2>
                        {isLive && (
                          <Badge className="bg-emerald-400/30 text-white border-emerald-300/40 text-[10px] px-2 py-0.5 shrink-0">
                            <span className="inline-block size-1.5 rounded-full bg-green-300 mr-1.5 animate-pulse" />
                            Live
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-emerald-100 truncate">
                        Room {guestDetail.room.roomNo} &bull; {guestDetail.room.type} &bull; {formatCurrency(monthlyRent)}/mo
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-white/80 hover:text-white hover:bg-white/10 shrink-0 -mr-2 -mt-6"
                      onClick={() => onOpenChange(false)}
                    >
                      <X className="size-5" />
                    </Button>
                  </div>
                </div>

                {/* ═══ SCROLLABLE CONTENT ═══ */}
                <div className="overflow-y-auto flex-1 px-4 sm:px-6 py-4 space-y-4">

                  {/* ═══ PERSONAL INFORMATION SECTION ═══ */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex size-7 items-center justify-center rounded-md bg-emerald-100">
                        <User className="size-3.5 text-emerald-600" />
                      </div>
                      <span className="text-xs font-bold tracking-wider text-emerald-700 uppercase">Personal Information</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                      <div className="flex items-center gap-2">
                        <Phone className="size-3.5 text-gray-400 shrink-0" />
                        <span className="text-muted-foreground min-w-[70px]">Contact</span>
                        <span className="font-medium truncate">{guestDetail.phone || '—'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Shield className="size-3.5 text-gray-400 shrink-0" />
                        <span className="text-muted-foreground min-w-[70px]">Aadhaar</span>
                        <span className="font-mono font-medium truncate">
                          {guestDetail.aadhaarNo || '—'}
                          {guestDetail.photoLink && (
                            <a
                              href={guestDetail.photoLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 ml-1.5 text-xs text-emerald-700 hover:underline"
                            >
                              <Camera className="size-3" />
                              <ExternalLink className="size-2.5" />
                            </a>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Briefcase className="size-3.5 text-gray-400 shrink-0" />
                        <span className="text-muted-foreground min-w-[70px]">Occupation</span>
                        <span className="font-medium truncate">
                          {guestDetail.occupation || '—'}
                          {guestDetail.workLocation && (
                            <span className="text-muted-foreground">
                              {' '}at <MapPin className="inline size-3" /> {guestDetail.workLocation}
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="size-3.5 text-gray-400 shrink-0" />
                        <span className="text-muted-foreground min-w-[70px]">Members</span>
                        <span className="font-medium">{guestDetail.totalMembers} member{guestDetail.totalMembers !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="size-3.5 text-gray-400 shrink-0" />
                        <span className="text-muted-foreground min-w-[70px]">Emergency</span>
                        <span className="font-medium truncate">{guestDetail.emergencyContact || '—'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Shield className="size-3.5 text-gray-400 shrink-0" />
                        <span className="text-muted-foreground min-w-[70px]">Deposit</span>
                        <span className="font-medium">
                          {formatCurrency(guestDetail.securityDeposit?.amount ?? 0)}
                          {guestDetail.securityDeposit && (
                            <span className="text-xs text-muted-foreground ml-1">({guestDetail.securityDeposit.status})</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* ═══ STAY DETAILS SECTION ═══ */}
                  {isLive && (
                    <>
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <div className="flex size-7 items-center justify-center rounded-md bg-blue-100">
                            <Calendar className="size-3.5 text-blue-600" />
                          </div>
                          <span className="text-xs font-bold tracking-wider text-blue-700 uppercase">Stay Details</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <Card className="border-blue-100 bg-blue-50/40">
                            <CardContent className="p-3 text-center">
                              <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide">Check-in</p>
                              <p className="text-sm font-bold text-gray-800 mt-0.5">{formatDate(guestDetail.checkInDate)}</p>
                            </CardContent>
                          </Card>
                          <Card className="border-emerald-100 bg-emerald-50/40">
                            <CardContent className="p-3 text-center">
                              <p className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wide">Billing Cycle</p>
                              <p className="text-sm font-bold text-gray-800 mt-0.5">{guestDetail.billingCycleDate}{getOrdinalSuffix(guestDetail.billingCycleDate)}</p>
                            </CardContent>
                          </Card>
                          <Card className="border-amber-100 bg-amber-50/40">
                            <CardContent className="p-3 text-center">
                              <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide">Total Stay</p>
                              <p className="text-sm font-bold text-gray-800 mt-0.5">
                                {stayMonths}m{stayRemainingDays > 0 ? ` ${stayRemainingDays}d` : ''}
                              </p>
                            </CardContent>
                          </Card>
                          <Card className="border-violet-100 bg-violet-50/40">
                            <CardContent className="p-3 text-center">
                              <p className="text-[10px] font-semibold text-violet-500 uppercase tracking-wide">Live As Of</p>
                              <p className="text-sm font-bold text-gray-800 mt-0.5">{formatDate(nowLocalStr)}</p>
                            </CardContent>
                          </Card>
                        </div>
                      </div>

                      <Separator />

                      {/* ═══ LIVE BILLING STATUS SECTION ═══ */}
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <div className="flex size-7 items-center justify-center rounded-md bg-red-100">
                            <FileText className="size-3.5 text-red-600" />
                          </div>
                          <span className="text-xs font-bold tracking-wider text-red-700 uppercase">Live Billing Status</span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-3">
                          {totalDays} days &bull; {stayMonths} months &bull; {formatCurrency(monthlyRent)}/mo
                        </p>

                        {/* Step-by-Step Calculation */}
                        <div className="rounded-md bg-white dark:bg-gray-900 border border-emerald-200 dark:border-emerald-800 px-3 py-2 mb-3 text-xs space-y-0.5 font-mono">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Calculator className="h-3.5 w-3.5 text-emerald-500" />
                            <span className="font-semibold text-emerald-800">Step-by-Step Calculation</span>
                          </div>
                          <div className="space-y-0.5 font-mono text-[11px]">
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground w-5">1.</span>
                              <span className="text-emerald-700">Rent (bills):</span>
                              <span>{billCount} bills = <span className="font-semibold">{formatCurrency(totalRentFromBills)}</span></span>
                            </div>
                            {unbilledRent > 0 && (
                              <div className="flex items-center gap-1">
                                <span className="text-muted-foreground w-5"></span>
                                <span className="text-emerald-600/70">+ Unbilled:</span>
                                <span>{unbilledMonths} months × {formatCurrency(monthlyRent)} = <span className="font-semibold">{formatCurrency(unbilledRent)}</span></span>
                              </div>
                            )}
                            {totalAccruedMaintenance > 0 && (
                              <div className="flex items-center gap-1">
                                <span className="text-muted-foreground w-5">2.</span>
                                <span className="text-amber-700">Maintenance:</span>
                                <span>{billCount} bills = {formatCurrency(totalMaintenanceFromBills)}{unbilledMaintenance > 0 ? ` + ${unbilledMonths} × ${formatCurrency(guestDetail.room.maintenanceCharge || 0)} = ` : ' = '}<span className="font-semibold">{formatCurrency(totalAccruedMaintenance)}</span></span>
                              </div>
                            )}
                            {totalElectricity > 0 && (
                              <div className="flex items-center gap-1">
                                <span className="text-muted-foreground w-5">{totalAccruedMaintenance > 0 ? '3' : '2'}.</span>
                                <span className="text-yellow-600">Electricity:</span>
                                <span>+ {formatCurrency(totalElectricity)}</span>
                              </div>
                            )}
                            {totalAdjustments !== 0 && (
                              <div className="flex items-center gap-1">
                                <span className="text-muted-foreground w-5">
                                  {(totalAccruedMaintenance > 0 ? 1 : 0) + (totalElectricity > 0 ? 1 : 0) + 2}.
                                </span>
                                <span className="text-purple-700">Adjustment:</span>
                                <span>{totalAdjustments > 0 ? '+' : ''} {formatCurrency(totalAdjustments)}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1 pt-0.5 border-t border-dashed border-emerald-200 mt-0.5">
                              <span className="text-muted-foreground w-5"></span>
                              <span className="text-emerald-800 font-semibold">Total Accrued:</span>
                              <span className="font-semibold">{formatCurrency(dynamicTotalAccrued)}</span>
                            </div>
                            {totalPaid > 0 && (
                              <div className="flex items-center gap-1">
                                <span className="text-muted-foreground w-5"></span>
                                <span className="text-teal-700">Minus Paid:</span>
                                <span>- {formatCurrency(totalPaid)}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1 pt-0.5 border-t-2 border-red-300 mt-0.5">
                              <span className="text-muted-foreground w-5"></span>
                              <span className="text-red-800 font-bold">Total Due:</span>
                              <span className="text-red-800 font-extrabold text-sm">{formatCurrency(totalBalance)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Three colored billing cards */}
                        <div className="grid grid-cols-3 gap-3 mb-3">
                          <Card className="border-red-200 bg-red-50/60">
                            <CardContent className="p-3 text-center">
                              <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide">Current Bill</p>
                              <p className="text-base font-bold text-red-700 mt-1">{formatCurrency(currentMonthBill)}</p>
                            </CardContent>
                          </Card>
                          <Card className="border-amber-200 bg-amber-50/60">
                            <CardContent className="p-3 text-center">
                              <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide">Previous Due</p>
                              <p className="text-base font-bold text-amber-700 mt-1">{formatCurrency(previousDue)}</p>
                            </CardContent>
                          </Card>
                          <Card className="border-emerald-200 bg-emerald-50/60">
                            <CardContent className="p-3 text-center">
                              <p className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wide">Total Paid</p>
                              <p className="text-base font-bold text-emerald-700 mt-1">{formatCurrency(totalPaid)}</p>
                            </CardContent>
                          </Card>
                        </div>

                        {/* Total Outstanding row */}
                        <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50/40 px-4 py-3">
                          <span className="font-bold text-red-800 text-sm">Total Outstanding</span>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-red-800 text-lg">{formatCurrency(totalOutstanding)}</span>
                            {totalOutstanding > 0 && (
                              <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 px-3 gap-1.5"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openCustomPay(totalOutstanding)
                                }}
                              >
                                <IndianRupee className="size-3.5" />
                                Pay Now
                              </Button>
                            )}
                          </div>
                        </div>

                        {totalOutstanding === 0 && (
                          <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-100 p-2.5 rounded-lg">
                            <CheckCircle2 className="size-3.5 shrink-0" />
                            <span>All dues cleared — no outstanding balance.</span>
                          </div>
                        )}
                      </div>

                      <Separator />

                      {/* ═══ ELECTRICITY SECTION ═══ */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="flex size-7 items-center justify-center rounded-md bg-amber-100">
                              <Zap className="size-3.5 text-amber-600" />
                            </div>
                            <span className="text-xs font-bold tracking-wider text-amber-700 uppercase">Electricity</span>
                          </div>
                          <Button
                            size="sm"
                            className="bg-amber-500 hover:bg-amber-600 text-white text-[10px] sm:text-xs h-7 px-2.5 gap-1"
                            onClick={(e) => {
                              e.stopPropagation()
                              setElecNewReading(String(currReading ?? prevReading ?? openingReading ?? 0))
                              setElecUpdateOpen(true)
                            }}
                          >
                            <Zap className="size-3" />
                            Update
                          </Button>
                        </div>

                        {/* Three electricity info cards */}
                        <div className="grid grid-cols-3 gap-3 mb-3">
                          <Card className="border-amber-100 bg-amber-50/30">
                            <CardContent className="p-3 text-center">
                              <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide">Opening Unit</p>
                              <p className="text-base font-bold text-gray-800 mt-1">{openingReading}</p>
                            </CardContent>
                          </Card>
                          <Card className="border-amber-100 bg-amber-50/30">
                            <CardContent className="p-3 text-center">
                              <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide">Current Unit</p>
                              <p className="text-base font-bold text-gray-800 mt-1">{currReading}</p>
                            </CardContent>
                          </Card>
                          <Card className="border-amber-100 bg-amber-50/30">
                            <CardContent className="p-3 text-center">
                              <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide">Rate / Unit</p>
                              <p className="text-base font-bold text-gray-800 mt-1">{formatCurrency(ratePerUnit)}</p>
                            </CardContent>
                          </Card>
                        </div>

                        {/* Bottom info bar */}
                        <div className="flex items-center justify-between rounded-lg bg-amber-100/80 border border-amber-200 px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <Zap className="size-3.5 text-amber-600" />
                            <span className="text-xs font-semibold text-gray-800">Units: <span className="text-amber-800">{unitsConsumed}</span></span>
                          </div>
                          <div className="text-xs font-bold text-amber-800">
                            Charge: {formatCurrency(elecCharge)}
                          </div>
                        </div>

                        {lastElecReading && (
                          <p className="mt-1.5 text-[10px] text-muted-foreground">
                            Last reading: {lastElecReading.reading} on {formatDate(lastElecReading.readingDate)}
                          </p>
                        )}
                      </div>

                      <Separator />

                      {/* ═══ UNPAID BILLS SECTION ═══ */}
                      {unpaidBills.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <div className="flex size-7 items-center justify-center rounded-md bg-rose-100">
                              <IndianRupee className="size-3.5 text-rose-600" />
                            </div>
                            <span className="text-xs font-bold tracking-wider text-rose-700 uppercase">Unpaid Bills ({unpaidBills.length})</span>
                          </div>
                          <div className="space-y-2">
                            {unpaidBills
                              .sort((a, b) => {
                                if (a.billingYear !== b.billingYear) return a.billingYear - b.billingYear
                                return a.billingMonth - b.billingMonth
                              })
                              .map((bill) => {
                                const remaining = bill.totalAmount - (bill.paidAmount || 0)
                                const isCurrent = currentPeriod
                                  ? bill.billingMonth === currentPeriod.month && bill.billingYear === currentPeriod.year
                                  : false

                                return (
                                  <div
                                    key={bill.id}
                                    className={`flex flex-col gap-2 rounded-lg border p-3 text-sm ${
                                      isCurrent
                                        ? 'border-red-200 bg-red-50/50'
                                        : 'border-gray-100 bg-white/60'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <Badge
                                          className={`text-[10px] px-1.5 py-0 ${
                                            bill.status === 'Overdue'
                                              ? 'bg-red-100 text-red-800 border-red-200'
                                              : 'bg-amber-100 text-amber-800 border-amber-200'
                                          }`}
                                        >
                                          {bill.status}
                                        </Badge>
                                        <span className="font-medium text-gray-800">
                                          {MONTH_NAMES[bill.billingMonth - 1]} {bill.billingYear}
                                        </span>
                                        {isCurrent && (
                                          <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-800 border-blue-200">
                                            Current
                                          </Badge>
                                        )}
                                      </div>
                                      <span className="font-bold text-red-700">{formatCurrency(remaining)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                                        <span>Rent: {formatCurrency(bill.rentAmount)}</span>
                                        {(bill.maintenanceCharge || 0) > 0 && (
                                          <span>Maint: {formatCurrency(bill.maintenanceCharge)}</span>
                                        )}
                                        {bill.electricityCharge > 0 && (
                                          <span>Elec: {formatCurrency(bill.electricityCharge)}</span>
                                        )}
                                        {bill.paidAmount > 0 && (
                                          <span>Paid: {formatCurrency(bill.paidAmount)}</span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-[10px] h-7 px-2"
                                          disabled={receiptDownloading === bill.id}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleDownloadReceipt(bill.id)
                                          }}
                                        >
                                          <FileDown className={`size-3 mr-0.5 ${receiptDownloading === bill.id ? 'animate-bounce' : ''}`} />
                                          Receipt
                                        </Button>
                                        <Button
                                          size="sm"
                                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] h-7 px-2 gap-0.5"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            openMarkPaid(bill)
                                          }}
                                        >
                                          <IndianRupee className="size-3" />
                                          Mark Paid
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                          </div>
                        </div>
                      )}

                      {/* ═══ PAID BILLS SECTION ═══ */}
                      {guestDetail.bills.filter((b) => b.status === 'Paid').length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <div className="flex size-7 items-center justify-center rounded-md bg-emerald-100">
                              <CheckCircle2 className="size-3.5 text-emerald-600" />
                            </div>
                            <span className="text-xs font-bold tracking-wider text-emerald-700 uppercase">Paid Bills ({guestDetail.bills.filter((b) => b.status === 'Paid').length})</span>
                          </div>
                          <div className="space-y-2">
                            {guestDetail.bills
                              .filter((b) => b.status === 'Paid')
                              .sort((a, b) => {
                                if (a.billingYear !== b.billingYear) return b.billingYear - a.billingYear
                                return b.billingMonth - a.billingMonth
                              })
                              .map((bill) => (
                                <div
                                  key={bill.id}
                                  className="flex items-center justify-between gap-3 rounded-lg border border-emerald-100 bg-white/60 p-3 text-sm"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 mb-0.5">
                                      <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-800 border-emerald-200">
                                        Paid
                                      </Badge>
                                      <span className="font-medium text-gray-800">
                                        {MONTH_NAMES[bill.billingMonth - 1]} {bill.billingYear}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                      <span>Rent: {formatCurrency(bill.rentAmount)}</span>
                                      {(bill.maintenanceCharge || 0) > 0 && (
                                        <span>Maint: {formatCurrency(bill.maintenanceCharge)}</span>
                                      )}
                                      {bill.electricityCharge > 0 && (
                                        <span>Elec: {formatCurrency(bill.electricityCharge)}</span>
                                      )}
                                      <span>Total: {formatCurrency(bill.totalAmount)}</span>
                                    </div>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-[10px] h-7 px-2 shrink-0"
                                    disabled={receiptDownloading === bill.id}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleDownloadReceipt(bill.id)
                                    }}
                                  >
                                    <FileDown className={`size-3 mr-0.5 ${receiptDownloading === bill.id ? 'animate-bounce' : ''}`} />
                                    Receipt
                                  </Button>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Checked-out guest info */}
                  {!isLive && (
                    <div className="py-4 text-center text-muted-foreground text-sm">
                      <Home className="size-8 mx-auto mb-2 text-gray-300" />
                      <p>Guest has checked out</p>
                      <p className="text-xs mt-1">Check-in: {formatDate(guestDetail.checkInDate)} &bull; Check-out: {formatDate(guestDetail.checkOutDate)}</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })() : (
            <div className="p-8 text-center text-muted-foreground">
              No guest details found
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════════ MARK PAID DIALOG ═══════════ */}
      <Dialog open={markPaidOpen} onOpenChange={setMarkPaidOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-800">
              <IndianRupee className="h-5 w-5" />
              Mark Bill as Paid
            </DialogTitle>
            <DialogDescription>
              Record payment for this bill
            </DialogDescription>
          </DialogHeader>

          {markPaidBill && (
            <div className="space-y-4 py-2">
              {/* Bill Summary */}
              <Card className="border-amber-200 bg-amber-50/50">
                <CardContent className="p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Period</span>
                    <span className="font-medium">
                      {MONTH_NAMES[markPaidBill.billingMonth - 1]} {markPaidBill.billingYear}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Rent Amount</span>
                    <span className="font-medium">{formatCurrency(markPaidBill.rentAmount)}</span>
                  </div>
                  {markPaidBill.electricityCharge > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Electricity</span>
                      <span className="font-medium">{formatCurrency(markPaidBill.electricityCharge)}</span>
                    </div>
                  )}
                  {markPaidBill.paidAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Already Paid</span>
                      <span className="font-medium text-emerald-700">{formatCurrency(markPaidBill.paidAmount)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between">
                    <span className="font-semibold">Total Amount</span>
                    <span className="font-semibold">{formatCurrency(markPaidBill.totalAmount)}</span>
                  </div>
                  <div className="flex justify-between text-red-700">
                    <span className="font-semibold">Remaining</span>
                    <span className="font-bold">
                      {formatCurrency(markPaidBill.totalAmount - (markPaidBill.paidAmount || 0))}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Payment Amount */}
              <div className="space-y-2">
                <Label htmlFor="payAmount">
                  Payment Amount (₹) <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="payAmount"
                  type="number"
                  min="0"
                  max={markPaidBill.totalAmount - (markPaidBill.paidAmount || 0)}
                  placeholder="Enter payment amount"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="font-mono text-lg border-emerald-200 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30"
                />
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 border-emerald-200 text-emerald-700"
                    onClick={() => setPayAmount(String(markPaidBill.totalAmount - (markPaidBill.paidAmount || 0)))}
                  >
                    Full Amount
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {(() => {
                      const amt = parseFloat(payAmount) || 0
                      const remaining = markPaidBill.totalAmount - (markPaidBill.paidAmount || 0) - amt
                      if (remaining <= 0) return '✓ Full payment — bill will be marked Paid'
                      return `After payment: ${formatCurrency(remaining)} remaining`
                    })()}
                  </p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setMarkPaidOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleMarkPaid}
              disabled={markPaidSubmitting || !payAmount || parseFloat(payAmount) <= 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {markPaidSubmitting ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Confirm Payment
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ CUSTOM PAYMENT DIALOG ═══════════ */}
      <Dialog open={customPayOpen} onOpenChange={setCustomPayOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-800">
              <IndianRupee className="h-5 w-5" />
              Custom Payment
            </DialogTitle>
            <DialogDescription>
              Pay any amount — distributed across bills (oldest first)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Outstanding Summary */}
            <Card className="border-red-200 bg-red-50/50">
              <CardContent className="p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Outstanding</span>
                  <span className="font-bold text-red-800 text-base">
                    {formatCurrency(customPayTotalOutstanding)}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Payment Amount */}
            <div className="space-y-2">
              <Label htmlFor="customPayAmount">
                Payment Amount (₹) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="customPayAmount"
                type="number"
                min="1"
                max={customPayTotalOutstanding}
                placeholder="Enter payment amount"
                value={customPayAmount}
                onChange={(e) => setCustomPayAmount(e.target.value)}
                className="font-mono text-lg border-emerald-200 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30"
              />
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 border-emerald-200 text-emerald-700"
                  onClick={() => setCustomPayAmount(String(customPayTotalOutstanding))}
                >
                  Full Amount
                </Button>
                {customPayTotalOutstanding > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 border-emerald-200 text-emerald-700"
                    onClick={() => setCustomPayAmount(String(Math.ceil(customPayTotalOutstanding / 2)))}
                  >
                    Half
                  </Button>
                )}
              </div>
            </div>

            {/* Payment Preview */}
            {(() => {
              const amt = parseFloat(customPayAmount) || 0
              if (amt <= 0 || !guestDetail) return null

              const effectiveAmt = Math.min(amt, customPayTotalOutstanding)
              const remainingAfter = customPayTotalOutstanding - effectiveAmt

              // Simulate FIFO allocation
              const sortedBills = [...guestDetail.bills]
                .filter((b) => b.status !== 'Paid')
                .sort((a, b) => {
                  if (a.billingYear !== b.billingYear) return a.billingYear - b.billingYear
                  return a.billingMonth - b.billingMonth
                })

              let simRemaining = effectiveAmt
              const allocationPreview: { month: string; allocated: number; billRemaining: number }[] = []

              for (const bill of sortedBills) {
                if (simRemaining <= 0) break
                const billRem = bill.totalAmount - (bill.paidAmount || 0)
                if (billRem <= 0) continue
                const payForThis = Math.min(simRemaining, billRem)
                allocationPreview.push({
                  month: `${MONTH_NAMES[bill.billingMonth - 1]} ${bill.billingYear}`,
                  allocated: payForThis,
                  billRemaining: billRem - payForThis,
                })
                simRemaining -= payForThis
              }

              return (
                <Card className="border-emerald-200 bg-emerald-50/30">
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                      <CreditCard className="size-3.5" />
                      Payment Allocation Preview
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 space-y-1.5 text-sm">
                    {allocationPreview.map((item, i) => (
                      <div key={i} className="flex justify-between items-center">
                        <span className="text-muted-foreground text-xs">
                          → {item.month}
                        </span>
                        <span className="font-medium text-xs">
                          {formatCurrency(item.allocated)}
                          {item.billRemaining > 0 && (
                            <span className="text-amber-700 ml-1">
                              ({formatCurrency(item.billRemaining)} left)
                            </span>
                          )}
                          {item.billRemaining === 0 && (
                            <span className="text-emerald-700 ml-1">✓ Paid</span>
                          )}
                        </span>
                      </div>
                    ))}
                    <Separator className="my-1.5" />
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-xs">You Pay</span>
                      <span className="font-bold text-emerald-800">{formatCurrency(effectiveAmt)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className={`font-semibold text-xs ${remainingAfter > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                        Remaining Due
                      </span>
                      <span className={`font-bold ${remainingAfter > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                        {formatCurrency(remainingAfter)}
                      </span>
                    </div>
                    {remainingAfter === 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-100 p-1.5 rounded mt-1">
                        <CheckCircle2 className="h-3 w-3 shrink-0" />
                        <span>All dues will be cleared!</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
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
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
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
                    <Label htmlFor="elecNewReading">
                      New Meter Reading <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="elecNewReading"
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
    </>
  )
}
