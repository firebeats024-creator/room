'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
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
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Plus,
  Home,
  RefreshCw,
  Bed,
  DollarSign,
  User,
  Phone,
  Calendar,
  Shield,
  Briefcase,
  MapPin,
  Users,
  Camera,
  CreditCard,
  FileText,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  IndianRupee,
  UserPlus,
  Zap,
  FileDown,
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

interface GuestBasic {
  id: string
  name: string
  nameHindi: string
  checkInDate: string
}

interface Room {
  id: string
  roomNo: string
  floor: number
  type: string
  baseRent: number
  monthlyRent: number
  maintenanceCharge: number
  status: string
  createdAt: string
  updatedAt: string
  guests: GuestBasic[]
  rentChanges?: {
    id: string
    oldRent: number
    newRent: number
    effectiveDate: string
    reason: string
  }[]
}

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

interface MemberHistoryEntry {
  id: string
  oldMemberCount: number
  newMemberCount: number
  effectiveDate: string
  reason: string
  createdAt: string
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
    baseRent: number
    monthlyRent: number
    maintenanceCharge: number
    status: string
  }
  securityDeposit: SecurityDeposit | null
  bills: GuestBill[]
  electricityReadings: ElectricityReading[]
  memberHistory: MemberHistoryEntry[]
}

type RoomStatus = 'Vacant' | 'Occupied' | 'Maintenance'

// ─── Constants ───

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

// statusConfig moved inside the component to use t() for i18n

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

// ─── Skeleton ───

function RoomCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-24" />
      </CardContent>
    </Card>
  )
}

// ─── Component ───

export default function PGRooms() {
  const { t, getGuestName } = useLanguage()

  const statusConfig: Record<RoomStatus, { label: string; className: string }> = {
    Vacant: {
      label: t('status_vacant'),
      className: 'bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100',
    },
    Occupied: {
      label: t('status_occupied'),
      className: 'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100',
    },
    Maintenance: {
      label: t('status_maintenance'),
      className: 'bg-red-100 text-red-800 border-red-200 hover:bg-red-100',
    },
  }

  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [formRoomNo, setFormRoomNo] = useState('')
  const [formFloor, setFormFloor] = useState('1')
  const [formType, setFormType] = useState('Single')
  const [formRent, setFormRent] = useState('5000')
  const [formMaintenanceCharge, setFormMaintenanceCharge] = useState('0')

  // Edit maintenance charge dialog state
  const [editMaintenanceOpen, setEditMaintenanceOpen] = useState(false)
  const [editMaintenanceRoom, setEditMaintenanceRoom] = useState<Room | null>(null)
  const [editMaintenanceCharge, setEditMaintenanceCharge] = useState('0')
  const [editMaintenanceSubmitting, setEditMaintenanceSubmitting] = useState(false)

  // Guest details dialog state
  const [guestDetailOpen, setGuestDetailOpen] = useState(false)
  const [guestDetail, setGuestDetail] = useState<GuestFull | null>(null)
  const [guestDetailLoading, setGuestDetailLoading] = useState(false)

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

  // Check-in dialog state
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [checkInRoom, setCheckInRoom] = useState<Room | null>(null)
  const [checkInSubmitting, setCheckInSubmitting] = useState(false)
  const [ciName, setCiName] = useState('')
  const [ciNameHindi, setCiNameHindi] = useState('')
  const [ciPhone, setCiPhone] = useState('')
  const [ciAadhaar, setCiAadhaar] = useState('')
  const [ciEmergency, setCiEmergency] = useState('')
  const [ciOccupation, setCiOccupation] = useState('')
  const [ciWorkLoc, setCiWorkLoc] = useState('')
  const [ciMembers, setCiMembers] = useState('1')
  const [ciPhotoLink, setCiPhotoLink] = useState('')
  const [ciDate, setCiDate] = useState(() => new Date().toISOString().split('T')[0])
  const [ciMeterReading, setCiMeterReading] = useState('')
  const [ciRatePerUnit, setCiRatePerUnit] = useState('10')
  const [ciDeposit, setCiDeposit] = useState('')

  // Rent Update dialog state
  const [rentUpdateOpen, setRentUpdateOpen] = useState(false)
  const [rentUpdateRoom, setRentUpdateRoom] = useState<Room | null>(null)
  const [rentUpdateNewRent, setRentUpdateNewRent] = useState('')
  const [rentUpdateEffectiveDate, setRentUpdateEffectiveDate] = useState('')
  const [rentUpdateReason, setRentUpdateReason] = useState('')
  const [rentUpdateSubmitting, setRentUpdateSubmitting] = useState(false)

  // Member Update dialog state
  const [memberUpdateOpen, setMemberUpdateOpen] = useState(false)
  const [memberUpdateNewCount, setMemberUpdateNewCount] = useState('')
  const [memberUpdateEffectiveDate, setMemberUpdateEffectiveDate] = useState('')
  const [memberUpdateReason, setMemberUpdateReason] = useState('')
  const [memberUpdateSubmitting, setMemberUpdateSubmitting] = useState(false)

  // ─── Fetch rooms ───

  const fetchRooms = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/rooms')
      if (!res.ok) throw new Error('Failed to fetch rooms')
      const data = await res.json()
      setRooms(data)
    } catch (err) {
      console.error('Error fetching rooms:', err)
      toast.error('Failed to load rooms')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRooms()
  }, [fetchRooms])

  // ─── Summary stats ───

  const totalRooms = rooms.length
  const occupiedCount = rooms.filter((r) => r.status === 'Occupied').length
  const vacantCount = rooms.filter((r) => r.status === 'Vacant').length
  const maintenanceCount = rooms.filter((r) => r.status === 'Maintenance').length

  // ─── Reset form ───

  const resetForm = () => {
    setFormRoomNo('')
    setFormFloor('1')
    setFormType('Single')
    setFormRent('5000')
    setFormMaintenanceCharge('0')
  }

  // ─── Add room ───

  const handleAddRoom = async () => {
    if (!formRoomNo.trim()) {
      toast.error('Room number is required')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomNo: formRoomNo.trim(),
          floor: parseInt(formFloor) || 1,
          type: formType,
          monthlyRent: parseFloat(formRent) || 5000,
          maintenanceCharge: parseFloat(formMaintenanceCharge) || 0,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to add room')
      }

      toast.success(`Room ${formRoomNo} added successfully`)
      resetForm()
      setDialogOpen(false)
      fetchRooms()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add room'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Check-in from vacant room ───

  const openCheckIn = (room: Room) => {
    setCheckInRoom(room)
    setCiName('')
    setCiNameHindi('')
    setCiPhone('')
    setCiAadhaar('')
    setCiEmergency('')
    setCiOccupation('')
    setCiWorkLoc('')
    setCiMembers('1')
    setCiPhotoLink('')
    setCiDate(new Date().toISOString().split('T')[0])
    setCiMeterReading('')
    setCiRatePerUnit('10')
    setCiDeposit(String(room.baseRent))
    setCheckInOpen(true)
  }

  const handleCheckIn = async () => {
    if (!checkInRoom) return
    if (!ciName.trim()) {
      toast.error('Tenant name is required')
      return
    }

    setCheckInSubmitting(true)
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: ciName.trim(),
          nameHindi: ciNameHindi.trim(),
          phone: ciPhone.trim(),
          aadhaarNo: ciAadhaar.trim(),
          emergencyContact: ciEmergency.trim(),
          occupation: ciOccupation.trim(),
          workLocation: ciWorkLoc.trim(),
          totalMembers: parseInt(ciMembers) || 1,
          photoLink: ciPhotoLink.trim(),
          roomId: checkInRoom.id,
          checkInDate: ciDate,
          openingMeterReading: parseFloat(ciMeterReading) || 0,
          ratePerUnit: parseFloat(ciRatePerUnit) || 10,
          ...(ciDeposit !== '' ? { securityDeposit: parseFloat(ciDeposit) || 0 } : {}),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Check-in failed')
      }

      toast.success(`${ciName} checked into Room ${checkInRoom.roomNo}!`)
      setCheckInOpen(false)
      setCheckInRoom(null)
      fetchRooms()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Check-in failed'
      toast.error(message)
    } finally {
      setCheckInSubmitting(false)
    }
  }

  // ─── Open guest detail dialog (click on occupied room) ───

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
      toast.error('Failed to load guest details')
      setGuestDetailOpen(false)
    } finally {
      setGuestDetailLoading(false)
    }
  }

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
      fetchRooms()
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
      fetchRooms()
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

      toast.success(data._wasUpdated ? 'Electricity reading corrected!' : 'Electricity reading updated!')
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

  // ─── Rent Update handler ───

  const handleRentUpdate = async () => {
    if (!rentUpdateRoom) return
    const newRent = parseFloat(rentUpdateNewRent) || 0
    if (newRent <= 0) {
      toast.error('Rent must be greater than 0')
      return
    }
    if (!rentUpdateEffectiveDate) {
      toast.error('Effective date is required')
      return
    }

    setRentUpdateSubmitting(true)
    try {
      const res = await fetch(`/api/rooms/${rentUpdateRoom.id}/update-rent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newRent,
          effectiveDate: rentUpdateEffectiveDate,
          reason: rentUpdateReason,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to update rent')
        return
      }

      toast.success(
        data.isBaseRentUpdate
          ? `Default rent updated from ₹${data.oldRent} to ₹${data.newRent}!`
          : `Rent updated from ₹${data.oldRent} to ₹${data.newRent}! ${data.guestsAffected} tenant(s) affected.`
      )
      setRentUpdateOpen(false)
      fetchRooms() // Refresh rooms
    } catch {
      toast.error('Failed to update rent')
    } finally {
      setRentUpdateSubmitting(false)
    }
  }

  // ─── Edit Maintenance Charge handler ───

  const handleEditMaintenance = async () => {
    if (!editMaintenanceRoom) return
    const newCharge = parseFloat(editMaintenanceCharge) || 0
    if (newCharge < 0) {
      toast.error('Maintenance charge cannot be negative')
      return
    }

    setEditMaintenanceSubmitting(true)
    try {
      const res = await fetch('/api/rooms', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: editMaintenanceRoom.id,
          maintenanceCharge: newCharge,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to update maintenance charge')
        return
      }

      toast.success(`Maintenance charge for Room ${editMaintenanceRoom.roomNo} updated to ${formatCurrency(newCharge)}`)
      setEditMaintenanceOpen(false)
      fetchRooms()
    } catch {
      toast.error('Failed to update maintenance charge')
    } finally {
      setEditMaintenanceSubmitting(false)
    }
  }

  // ─── Member Update handler ───

  const handleMemberUpdate = async () => {
    if (!guestDetail) return
    const newCount = parseInt(memberUpdateNewCount) || 0
    if (newCount < 1) {
      toast.error('Member count must be at least 1')
      return
    }
    if (newCount === guestDetail.totalMembers) {
      toast.error('New member count is same as current')
      return
    }
    if (!memberUpdateEffectiveDate) {
      toast.error('Effective date is required')
      return
    }

    setMemberUpdateSubmitting(true)
    try {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestId: guestDetail.id,
          newMemberCount: newCount,
          effectiveDate: memberUpdateEffectiveDate,
          reason: memberUpdateReason,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to update members')
        return
      }

      toast.success(data.message || `Members updated: ${data.oldMemberCount} → ${data.newMemberCount}`)
      setMemberUpdateOpen(false)

      // Refresh guest details
      const refreshRes = await fetch(`/api/guests/${guestDetail.id}`)
      if (refreshRes.ok) {
        const refreshed = await refreshRes.json()
        setGuestDetail(refreshed)
      }
      fetchRooms()
    } catch {
      toast.error('Failed to update members')
    } finally {
      setMemberUpdateSubmitting(false)
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
    <div className="bg-gradient-to-br from-emerald-50/50 via-white to-teal-50/30">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
              <Home className="size-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                {t('rooms_management')}
              </h1>
              <p className="text-sm text-gray-500">
                {t('rooms_manage')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchRooms}
              disabled={loading}
              className="gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
            >
              <RefreshCw
                className={`size-3.5 ${loading ? 'animate-spin' : ''}`}
              />
              {t('rooms_refresh')}
            </Button>

            <Dialog open={dialogOpen} onOpenChange={(open) => {
              setDialogOpen(open)
              if (!open) resetForm()
            }}>
              <Button className="gap-1.5 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
                <Plus className="size-4" />
                {t('rooms_add_room')}
              </Button>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-emerald-800">
                    <Bed className="size-5" />
                    {t('rooms_add_new_room')}
                  </DialogTitle>
                  <DialogDescription>
                    Enter the details for the new room. Room number must be unique.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-2">
                  <div className="grid gap-2">
                    <Label htmlFor="roomNo">
                      {t('rooms_room_no')} <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="roomNo"
                      placeholder="e.g. 101"
                      value={formRoomNo}
                      onChange={(e) => setFormRoomNo(e.target.value)}
                      className="border-emerald-200 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="floor">{t('rooms_floor')}</Label>
                    <Input
                      id="floor"
                      type="number"
                      min="0"
                      placeholder="1"
                      value={formFloor}
                      onChange={(e) => setFormFloor(e.target.value)}
                      className="border-emerald-200 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label>{t('rooms_room_type')}</Label>
                    <Select value={formType} onValueChange={setFormType}>
                      <SelectTrigger className="w-full border-emerald-200 focus:border-emerald-400 focus:ring-emerald-400/30">
                        <SelectValue placeholder={t('rooms_select_type')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Single">{t('rooms_single')}</SelectItem>
                        <SelectItem value="Double">{t('rooms_double')}</SelectItem>
                        <SelectItem value="Triple">{t('rooms_triple')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="rent">{t('rooms_monthly_rent')}</Label>
                    <Input
                      id="rent"
                      type="number"
                      min="0"
                      placeholder="5000"
                      value={formRent}
                      onChange={(e) => setFormRent(e.target.value)}
                      className="border-emerald-200 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="maintenanceCharge">{t('rooms_maintenance_charge')}</Label>
                    <Input
                      id="maintenanceCharge"
                      type="number"
                      min="0"
                      placeholder="0"
                      value={formMaintenanceCharge}
                      onChange={(e) => setFormMaintenanceCharge(e.target.value)}
                      className="border-emerald-200 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30"
                    />
                    <p className="text-xs text-muted-foreground">{t('rooms_maintenance_hint')}</p>
                  </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDialogOpen(false)
                      resetForm()
                    }}
                    className="border-emerald-200"
                  >
                    {t('rooms_cancel')}
                  </Button>
                  <Button
                    onClick={handleAddRoom}
                    disabled={submitting || !formRoomNo.trim()}
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    {submitting ? t('rooms_adding') : t('rooms_add_room')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Summary Bar */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="border-emerald-100 bg-white/80 shadow-sm backdrop-blur-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-100">
                  <Home className="size-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">{t('rooms_total_rooms')}</p>
                  <p className="text-xl font-bold text-gray-900">{totalRooms}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-amber-100 bg-white/80 shadow-sm backdrop-blur-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-amber-100">
                  <User className="size-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">{t('rooms_occupied')}</p>
                  <p className="text-xl font-bold text-amber-700">{occupiedCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-emerald-100 bg-white/80 shadow-sm backdrop-blur-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-100">
                  <Bed className="size-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">{t('rooms_vacant')}</p>
                  <p className="text-xl font-bold text-emerald-700">{vacantCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-red-100 bg-white/80 shadow-sm backdrop-blur-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-red-100">
                  <RefreshCw className="size-4 text-red-500" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">{t('rooms_maintenance')}</p>
                  <p className="text-xl font-bold text-red-600">{maintenanceCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Room Grid */}
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <RoomCardSkeleton key={i} />
            ))}
          </div>
        ) : rooms.length === 0 ? (
          <Card className="border-dashed border-emerald-200 bg-white/60">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-emerald-100">
                <Home className="size-8 text-emerald-400" />
              </div>
              <h3 className="mb-1 text-lg font-semibold text-gray-700">
                {t('rooms_no_rooms')}
              </h3>
              <p className="mb-4 text-sm text-gray-500">
                {t('rooms_get_started')}
              </p>
              <Button
                onClick={() => setDialogOpen(true)}
                className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <Plus className="size-4" />
                {t('rooms_add_room')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => {
              const status = room.status as RoomStatus
              const config = statusConfig[status] || statusConfig.Vacant
              const activeGuest = room.guests?.[0]

              return (
                <Card
                  key={room.id}
                  className={`group overflow-hidden bg-white/90 shadow-sm backdrop-blur-sm transition-all duration-200 hover:shadow-md ${
                    status === 'Occupied'
                      ? 'border-amber-100 hover:border-amber-300 cursor-pointer'
                      : status === 'Vacant'
                        ? 'border-emerald-100 hover:border-emerald-300 cursor-pointer'
                        : 'border-red-100 hover:border-red-200'
                  }`}
                  onClick={() => {
                    if (status === 'Occupied' && activeGuest) {
                      openGuestDetail(activeGuest.id)
                    } else if (status === 'Vacant') {
                      openCheckIn(room)
                    }
                  }}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <div
                          className={`flex size-8 items-center justify-center rounded-md text-sm font-bold ${
                            status === 'Vacant'
                              ? 'bg-emerald-100 text-emerald-700'
                              : status === 'Occupied'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-red-100 text-red-600'
                          }`}
                        >
                          {room.roomNo}
                        </div>
                        <span className="text-gray-800">{t('rooms_room')} {room.roomNo}</span>
                      </CardTitle>
                      <Badge
                        variant="outline"
                        className={config.className}
                      >
                        {config.label}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-2.5 pb-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-gray-500">
                        <Bed className="size-3.5" />
                        {t('rooms_floor')} {room.floor}
                      </span>
                      <span className="text-gray-600">{room.type}</span>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-gray-500">
                        <DollarSign className="size-3.5" />
                        {status === 'Vacant' ? t('rooms_default_rent') : t('rooms_rent')}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-emerald-700">
                          {formatCurrency(status === 'Vacant' ? room.baseRent : room.monthlyRent)}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50"
                          onClick={(e) => {
                            e.stopPropagation()
                            setRentUpdateRoom(room)
                            setRentUpdateNewRent(String(status === 'Vacant' ? room.baseRent : room.monthlyRent))
                            setRentUpdateEffectiveDate(new Date().toISOString().split('T')[0])
                            setRentUpdateReason('')
                            setRentUpdateOpen(true)
                          }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                        </Button>
                      </div>
                    </div>

                    {/* Rent change history indicator — only show for occupied rooms with rent changes */}
                    {status === 'Occupied' && room.rentChanges && room.rentChanges.length > 0 && (
                      <div className="flex items-center gap-1 text-[10px] text-gray-400 mt-0.5">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        {room.rentChanges.length} {room.rentChanges.length > 1 ? t('rooms_rent_changes_plural') : t('rooms_rent_changes')} · {t('rooms_base_rent')} {formatCurrency(room.baseRent)}
                      </div>
                    )}
                    {/* For vacant rooms, show base rent info if monthlyRent was different */}
                    {status === 'Vacant' && room.baseRent !== room.monthlyRent && (
                      <div className="flex items-center gap-1 text-[10px] text-emerald-500 mt-0.5">
                        <DollarSign className="size-3" />
                        {t('rooms_default_rent_info')}: {formatCurrency(room.baseRent)}
                      </div>
                    )}

                    {/* Maintenance Charge row */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-gray-500">
                        <svg xmlns="http://www.w3.org/2000/svg" className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                        {t('rooms_maintenance_charge')}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className={`font-semibold ${room.maintenanceCharge > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                          {room.maintenanceCharge > 0 ? formatCurrency(room.maintenanceCharge) : '—'}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-gray-400 hover:text-orange-600 hover:bg-orange-50"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditMaintenanceRoom(room)
                            setEditMaintenanceCharge(String(room.maintenanceCharge || 0))
                            setEditMaintenanceOpen(true)
                          }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                        </Button>
                      </div>
                    </div>

                    {/* Guest info for occupied rooms — clickable */}
                    {status === 'Occupied' && activeGuest && (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3 transition-colors group-hover:bg-amber-100/70 group-hover:border-amber-300">
                        <div className="flex items-start gap-2">
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-700">
                            <User className="size-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-amber-900">
                              {getGuestName(activeGuest.name, activeGuest.nameHindi)}
                            </p>
                            <p className="text-xs text-amber-600">
                              {t('rooms_checked_in')}: {formatDate(activeGuest.checkInDate)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-amber-600 group-hover:text-amber-800 shrink-0">
                            <FileText className="size-3" />
                            <span className="hidden sm:inline">{t('guest_details')}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Vacant room indicator — clickable to check-in */}
                    {status === 'Vacant' && (
                      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-center transition-colors group-hover:bg-emerald-100/70 group-hover:border-emerald-300">
                        <div className="flex items-center justify-center gap-1.5">
                          <UserPlus className="size-3.5 text-emerald-600" />
                          <p className="text-xs font-semibold text-emerald-700">
                            {t('rooms_click_checkin')}
                          </p>
                        </div>
                        <p className="text-[10px] text-emerald-500 mt-0.5">
                          {t('rooms_available_booking')}
                        </p>
                      </div>
                    )}

                    {/* Maintenance room indicator */}
                    {status === 'Maintenance' && (
                      <div className="mt-3 rounded-lg border border-red-100 bg-red-50/50 p-3 text-center">
                        <p className="text-xs font-medium text-red-600">
                          {t('rooms_under_maintenance')}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* ═══════════ GUEST DETAILS DIALOG ═══════════ */}
      <Dialog open={guestDetailOpen} onOpenChange={setGuestDetailOpen}>
        <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto p-0 gap-0">
          {/* Visually hidden title for screen reader accessibility */}
          <DialogTitle className="sr-only">Tenant Details</DialogTitle>
          <DialogDescription className="sr-only">View tenant details and billing information</DialogDescription>
          {guestDetailLoading ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : guestDetail ? (() => {
            // ─── Billing calculations ───
            const isLive = guestDetail.status === 'Live'
            const nowLocal = new Date()
            const nowLocalStr = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`
            const stayMonths = isLive ? calculateStayMonths(guestDetail.checkInDate, nowLocalStr) : 0
            const stayRemainingDays = isLive ? remainingDaysAfterMonths(guestDetail.checkInDate, stayMonths, nowLocalStr) : 0
            const monthlyRent = guestDetail.room.monthlyRent
            const daysStayed = isLive ? Math.floor((nowLocal.getTime() - new Date(guestDetail.checkInDate).getTime()) / (1000 * 60 * 60 * 24)) : 0

            // ─── Bill-based outstanding calculation ───
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

            return (
              <div className="divide-y divide-gray-100">
                {/* ═══ HEADER: Guest Profile ═══ */}
                <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-5 py-4 text-white">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex size-11 items-center justify-center rounded-full bg-white/20 text-lg font-bold">
                        {getGuestName(guestDetail.name, guestDetail.nameHindi).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-base font-bold leading-tight">{getGuestName(guestDetail.name, guestDetail.nameHindi)}</h3>
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
                      {isLive ? t('guest_live') : t('guest_checked_out')}
                    </Badge>
                  </div>
                </div>

                {/* ═══ SECTION 1: Personal Information ═══ */}
                <div className="px-5 py-4 space-y-3">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    {t('guest_personal_info')}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                    <div className="flex justify-between sm:block">
                      <span className="text-gray-400 text-xs sm:text-sm">{t('guest_contact')}</span>
                      <p className="font-medium text-gray-800 sm:mt-0.5">{guestDetail.phone || '—'}</p>
                    </div>
                    <div className="flex justify-between sm:block">
                      <span className="text-gray-400 text-xs sm:text-sm">{t('guest_aadhaar')}</span>
                      <p className="font-medium text-gray-800 font-mono sm:mt-0.5">{guestDetail.aadhaarNo || '—'}</p>
                    </div>
                    <div className="flex justify-between sm:block">
                      <span className="text-gray-400 text-xs sm:text-sm">{t('guest_occupation')}</span>
                      <p className="font-medium text-gray-800 sm:mt-0.5">
                        {guestDetail.occupation || '—'}
                        {guestDetail.workLocation && <span className="text-gray-400"> at {guestDetail.workLocation}</span>}
                      </p>
                    </div>
                    <div className="flex justify-between sm:block">
                      <span className="text-gray-400 text-xs sm:text-sm">{t('guest_members_label')}</span>
                      <div className="flex items-center gap-1.5 sm:mt-0.5">
                        <p className="font-medium text-gray-800">{guestDetail.totalMembers} {guestDetail.totalMembers !== 1 ? t('guest_members') : t('guest_member')}</p>
                        {isLive && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 shrink-0"
                            onClick={(e) => {
                              e.stopPropagation()
                              setMemberUpdateNewCount(String(guestDetail.totalMembers))
                              setMemberUpdateEffectiveDate(new Date().toISOString().split('T')[0])
                              setMemberUpdateReason('')
                              setMemberUpdateOpen(true)
                            }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between sm:block">
                      <span className="text-gray-400 text-xs sm:text-sm">{t('guest_emergency_contact')}</span>
                      <p className="font-medium text-gray-800 sm:mt-0.5">{guestDetail.emergencyContact || '—'}</p>
                    </div>
                    <div className="flex justify-between sm:block">
                      <span className="text-gray-400 text-xs sm:text-sm">{t('guest_security_deposit')}</span>
                      <p className="font-medium text-gray-800 sm:mt-0.5">
                        {formatCurrency(guestDetail.securityDeposit?.amount ?? 0)}
                        {guestDetail.securityDeposit && (
                          <span className="text-gray-400 text-xs ml-1">({guestDetail.securityDeposit.status})</span>
                        )}
                      </p>
                    </div>
                  </div>
                  {guestDetail.photoLink && (
                    <a
                      href={guestDetail.photoLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-emerald-600 hover:underline"
                    >
                      <Camera className="h-3 w-3" />
                      View Photo
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </div>

                {/* ═══ SECTION 2: Stay Details ═══ */}
                <div className="px-5 py-4 bg-gray-50/60 space-y-3">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    {t('guest_stay_details')}
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-lg bg-white border border-gray-100 p-2.5">
                      <p className="text-[10px] text-gray-400 mb-0.5">{t('guest_check_in')}</p>
                      <p className="text-sm font-semibold text-gray-800">{formatDate(guestDetail.checkInDate)}</p>
                    </div>
                    <div className="rounded-lg bg-white border border-gray-100 p-2.5">
                      <p className="text-[10px] text-gray-400 mb-0.5">{t('guest_billing_cycle')}</p>
                      <p className="text-sm font-semibold text-gray-800">{guestDetail.billingCycleDate}{getOrdinalSuffix(guestDetail.billingCycleDate)}</p>
                    </div>
                    {isLive && (
                      <div className="rounded-lg bg-white border border-gray-100 p-2.5">
                        <p className="text-[10px] text-gray-400 mb-0.5">{t('guest_total_stay')}</p>
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
                        <p className="text-[10px] text-gray-400 mb-0.5">{t('guest_check_out')}</p>
                        <p className="text-sm font-semibold text-amber-700">{formatDate(guestDetail.checkOutDate)}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* ═══ SECTION 3: Live Billing Status ═══ */}
                {isLive && (
                  <div className="px-5 py-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                        <CreditCard className="h-3.5 w-3.5" />
                        {t('guest_live_billing_status')}
                      </h4>
                      <span className="text-[10px] text-gray-400">
                        {daysStayed} {t('guest_days')} · {formatCurrency(totalAccruedRent)} {t('guest_total_accrued')}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="rounded-lg bg-red-50 border border-red-100 p-2.5 text-center">
                        <p className="text-[10px] text-red-400 mb-0.5">{t('guest_current_bill')}</p>
                        <p className="text-sm font-bold text-red-700">{formatCurrency(currentMonthBill)}</p>
                      </div>
                      <div className="rounded-lg bg-amber-50 border border-amber-100 p-2.5 text-center">
                        <p className="text-[10px] text-amber-500 mb-0.5">{t('guest_previous_due')}</p>
                        <p className="text-sm font-bold text-amber-700">{formatCurrency(previousDue)}</p>
                      </div>
                      <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-2.5 text-center">
                        <p className="text-[10px] text-emerald-500 mb-0.5">{t('guest_total_paid')}</p>
                        <p className="text-sm font-bold text-emerald-700">{formatCurrency(totalPaid)}</p>
                      </div>
                    </div>

                    {totalOutstanding > 0 ? (
                      <div className="flex items-center justify-between bg-red-50 rounded-lg p-3 border border-red-200">
                        <div>
                          <p className="text-xs font-semibold text-red-800">{t('guest_total_outstanding')}</p>
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
                          {t('guest_pay_now')}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 p-3 rounded-lg border border-emerald-200">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <span className="font-medium">{t('guest_all_dues_cleared')}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* ═══ SECTION 4: Electricity ═══ */}
                {isLive && (
                  <div className="px-5 py-4 bg-amber-50/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Zap className="h-3.5 w-3.5" />
                        {t('guest_electricity')}
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
                        <span className="hidden sm:inline">{t('guest_update')}</span>
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="rounded-lg bg-white border border-gray-100 p-2.5 text-center">
                        <p className="text-[10px] text-gray-400 mb-0.5">{t('guest_opening_unit')}</p>
                        <p className="text-sm font-bold font-mono text-emerald-700">{openingReading}</p>
                      </div>
                      <div className="rounded-lg bg-white border border-gray-100 p-2.5 text-center">
                        <p className="text-[10px] text-gray-400 mb-0.5">{t('guest_current_unit')}</p>
                        <p className="text-sm font-bold font-mono text-gray-800">{currReading}</p>
                      </div>
                      <div className="rounded-lg bg-white border border-gray-100 p-2.5 text-center">
                        <p className="text-[10px] text-gray-400 mb-0.5">{t('guest_rate_per_unit')}</p>
                        <p className="text-sm font-bold font-mono text-gray-800">₹{ratePerUnit}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between bg-white rounded-lg p-3 border border-amber-200">
                      <div className="flex items-center gap-2 text-sm">
                        <Zap className="h-4 w-4 text-amber-500" />
                        <span className="text-gray-500">{t('guest_units')}: <span className="font-semibold text-gray-800">{unitsConsumed}</span></span>
                      </div>
                      <div className="text-sm">
                        <span className="text-gray-500">{t('guest_charge')}: </span>
                        <span className="font-bold text-amber-700">{formatCurrency(elecCharge)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* ═══ SECTION 5: Payment History ═══ */}
                {guestDetail.bills.filter((b) => b.status === 'Paid').length > 0 && (
                  <div className="px-5 py-4 space-y-3">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {t('guest_payment_history')} ({guestDetail.bills.filter((b) => b.status === 'Paid').length})
                    </h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {guestDetail.bills
                        .filter((b) => b.status === 'Paid')
                        .sort((a, b) => {
                          if (a.billingYear !== b.billingYear) return b.billingYear - a.billingYear
                          return b.billingMonth - a.billingMonth
                        })
                        .map((bill) => (
                          <div
                            key={bill.id}
                            className="flex items-center justify-between gap-2 rounded-lg border border-emerald-100 bg-emerald-50/40 p-2.5"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <Badge className="text-[9px] px-1.5 py-0 bg-emerald-100 text-emerald-700 border-emerald-200">
                                  Paid
                                </Badge>
                                <span className="text-sm font-medium text-gray-800">
                                  {MONTH_NAMES[bill.billingMonth - 1]} {bill.billingYear}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                <span>{t('guest_rent')}: {formatCurrency(bill.rentAmount)}</span>
                                {bill.electricityCharge > 0 && (
                                  <span>{t('guest_elec')}: {formatCurrency(bill.electricityCharge)}</span>
                                )}
                                <span>{t('guest_total')}: {formatCurrency(bill.totalAmount)}</span>
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
                              <FileDown className={`h-3 w-3 ${receiptDownloading === bill.id ? 'animate-bounce' : ''}`} />
                              <span className="ml-1">{receiptDownloading === bill.id ? '...' : 'PDF'}</span>
                            </Button>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* ═══ SECTION 6: Member History ═══ */}
                {guestDetail.memberHistory && guestDetail.memberHistory.length > 0 && (
                  <div className="px-5 py-4 space-y-3">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      Member History
                    </h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {[...guestDetail.memberHistory]
                        .sort((a, b) => {
                          const da = new Date(a.effectiveDate).getTime()
                          const db2 = new Date(b.effectiveDate).getTime()
                          return db2 - da
                        })
                        .map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-blue-100 bg-blue-50/40 p-2.5"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <Badge className={`text-[9px] px-1.5 py-0 ${
                                entry.newMemberCount < entry.oldMemberCount
                                  ? 'bg-red-100 text-red-700 border-red-200'
                                  : 'bg-blue-100 text-blue-700 border-blue-200'
                              }`}>
                                {entry.oldMemberCount} → {entry.newMemberCount}
                              </Badge>
                              <span className="text-sm font-medium text-gray-800">
                                {formatDate(entry.effectiveDate)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-gray-400">
                              {entry.reason && <span>{entry.reason}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ═══ FOOTER: Close Button ═══ */}
                <div className="px-5 py-3 bg-gray-50/60 flex justify-end">
                  <Button variant="outline" onClick={() => setGuestDetailOpen(false)} className="border-gray-200 text-gray-600 hover:bg-gray-100 text-xs h-8">
                    {t('close')}
                  </Button>
                </div>
              </div>
            )
          })() : (
            <div className="p-8 text-center text-gray-400">
              No tenant details found
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════════ CHECK-IN DIALOG (from vacant room click) ═══════════ */}
      <Dialog open={checkInOpen} onOpenChange={setCheckInOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-800">
              <UserPlus className="size-5" />
              {t('checkin_guest')}
              {checkInRoom && (
                <Badge variant="outline" className="ml-2 border-emerald-200 text-emerald-700">
                  {t('rooms_room')} {checkInRoom.roomNo}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Fill in tenant details to check them into this room
            </DialogDescription>
          </DialogHeader>

          {checkInRoom && (
            <div className="space-y-4 py-2">
              {/* Room Info Summary */}
              <Card className="border-emerald-200 bg-emerald-50/30">
                <CardContent className="p-3 flex items-center gap-3 text-sm">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-100">
                    <Bed className="size-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-emerald-800">{t('rooms_room')} {checkInRoom.roomNo} — {checkInRoom.type}</p>
                    <p className="text-xs text-emerald-600">
                      {t('rooms_floor')} {checkInRoom.floor} &middot; {t('guest_rent')}: {formatCurrency(checkInRoom.monthlyRent)}/mo
                    </p>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="ciName">
                    {t('checkin_full_name')} <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="ciName"
                    placeholder="Full name"
                    value={ciName}
                    onChange={(e) => setCiName(e.target.value)}
                    className="border-emerald-200 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="ciNameHindi">{t('checkin_name_hindi')}</Label>
                  <Input
                    id="ciNameHindi"
                    placeholder={t('checkin_enter_name_hindi')}
                    value={ciNameHindi}
                    onChange={(e) => setCiNameHindi(e.target.value)}
                    className="border-emerald-200 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="ciPhone">{t('guest_contact')}</Label>
                    <Input
                      id="ciPhone"
                      placeholder="Mobile number"
                      value={ciPhone}
                      onChange={(e) => setCiPhone(e.target.value)}
                      className="border-emerald-200 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="ciAadhaar">{t('guest_aadhaar')}</Label>
                    <Input
                      id="ciAadhaar"
                      placeholder="Aadhaar number"
                      value={ciAadhaar}
                      onChange={(e) => setCiAadhaar(e.target.value)}
                      className="border-emerald-200 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="ciOccupation">{t('guest_occupation')}</Label>
                    <Input
                      id="ciOccupation"
                      placeholder="Job / Work"
                      value={ciOccupation}
                      onChange={(e) => setCiOccupation(e.target.value)}
                      className="border-emerald-200 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="ciWorkLoc">{t('checkin_work_location')}</Label>
                    <Input
                      id="ciWorkLoc"
                      placeholder="Office / Area"
                      value={ciWorkLoc}
                      onChange={(e) => setCiWorkLoc(e.target.value)}
                      className="border-emerald-200 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="ciEmergency">{t('guest_emergency_contact')}</Label>
                    <Input
                      id="ciEmergency"
                      placeholder="Name & Phone"
                      value={ciEmergency}
                      onChange={(e) => setCiEmergency(e.target.value)}
                      className="border-emerald-200 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="ciMembers">{t('checkin_total_members')}</Label>
                    <Input
                      id="ciMembers"
                      type="number"
                      min="1"
                      value={ciMembers}
                      onChange={(e) => setCiMembers(e.target.value)}
                      className="border-emerald-200 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="ciPhotoLink">{t('checkin_photo_link')}</Label>
                  <Input
                    id="ciPhotoLink"
                    placeholder="URL to tenant photo (optional)"
                    value={ciPhotoLink}
                    onChange={(e) => setCiPhotoLink(e.target.value)}
                    className="border-emerald-200 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30"
                  />
                </div>

                <Separator className="my-1" />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="ciDate">
                      {t('guest_check_in')} {t('checkin_date')} <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="ciDate"
                      type="date"
                      value={ciDate}
                      onChange={(e) => setCiDate(e.target.value)}
                      className="border-emerald-200 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="ciMeterReading">{t('checkin_opening_reading')}</Label>
                    <Input
                      id="ciMeterReading"
                      type="number"
                      min="0"
                      placeholder="0"
                      value={ciMeterReading}
                      onChange={(e) => setCiMeterReading(e.target.value)}
                      className="border-emerald-200 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="ciRatePerUnit">{t('checkin_rate_per_unit')}</Label>
                    <Input
                      id="ciRatePerUnit"
                      type="number"
                      min="0"
                      value={ciRatePerUnit}
                      onChange={(e) => setCiRatePerUnit(e.target.value)}
                      className="border-emerald-200 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="ciDeposit" className="flex items-center gap-1.5">
                      <Shield className="size-3.5" />
                      {t('guest_security_deposit')} (₹)
                    </Label>
                    <Input
                      id="ciDeposit"
                      type="number"
                      min="0"
                      placeholder="0 = No deposit"
                      value={ciDeposit}
                      onChange={(e) => setCiDeposit(e.target.value)}
                      className="border-emerald-200 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30"
                    />
                    <p className="text-[10px] text-muted-foreground">{t('checkin_select_room_first')}</p>
                  </div>
                </div>

                {/* Payment Preview */}
                <Card className="border-emerald-200 bg-emerald-50/30">
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                      <CreditCard className="size-3.5" />
                      {t('checkin_payment_preview')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('checkin_monthly_rent')}</span>
                      <span className="font-medium">{formatCurrency(checkInRoom.monthlyRent)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t('guest_security_deposit')}
                        {parseFloat(ciDeposit) === checkInRoom.monthlyRent && (
                          <span className="text-[10px] ml-1">{t('checkin_default_rent_info')}</span>
                        )}
                        {parseFloat(ciDeposit) === 0 && (
                          <span className="text-[10px] ml-1 text-amber-600">{t('checkin_no_deposit')}</span>
                        )}
                      </span>
                      <span className="font-medium">{formatCurrency(parseFloat(ciDeposit) || 0)}</span>
                    </div>
                    <Separator className="my-1.5" />
                    <div className="flex justify-between font-semibold text-emerald-800">
                      <span>{t('checkin_total_initial')}</span>
                      <span>{formatCurrency(checkInRoom.monthlyRent + (parseFloat(ciDeposit) || 0))}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCheckInOpen(false)} className="border-emerald-200">
              {t('checkin_cancel')}
            </Button>
            <Button
              onClick={handleCheckIn}
              disabled={checkInSubmitting || !ciName.trim()}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {checkInSubmitting ? t('checkin_checking_in') : (
                <>
                  <UserPlus className="mr-1.5 size-4" />
                  {t('checkin_guest')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ MARK PAID DIALOG ═══════════ */}
      <Dialog open={markPaidOpen} onOpenChange={setMarkPaidOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-800">
              <IndianRupee className="h-5 w-5" />
              {t('pay_mark_paid')}
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
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 border-emerald-200 text-emerald-700"
                      onClick={() => setCustomPayAmount(String(Math.ceil(customPayTotalOutstanding / 2)))}
                    >
                      Half
                    </Button>
                  </>
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
              // Use ?? to properly handle 0 as a valid reading
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

      {/* ═══════════ EDIT MAINTENANCE CHARGE DIALOG ═══════════ */}
      <Dialog open={editMaintenanceOpen} onOpenChange={setEditMaintenanceOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-700">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
              {t('rooms_edit_maintenance')} — Room {editMaintenanceRoom?.roomNo}
            </DialogTitle>
            <DialogDescription>
              {t('rooms_edit_maintenance_desc')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Current charge */}
            <Card className="border-gray-200 bg-gray-50/50">
              <CardContent className="p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('rooms_current_maintenance')}</span>
                  <span className="font-semibold text-gray-800">
                    {editMaintenanceRoom ? formatCurrency(editMaintenanceRoom.maintenanceCharge || 0) : '—'}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* New charge */}
            <div className="space-y-2">
              <Label htmlFor="editMaintenanceCharge">
                {t('rooms_new_maintenance')} (₹)
              </Label>
              <Input
                id="editMaintenanceCharge"
                type="number"
                min="0"
                placeholder="0"
                value={editMaintenanceCharge}
                onChange={(e) => setEditMaintenanceCharge(e.target.value)}
                className="font-mono text-lg border-orange-200 focus-visible:border-orange-400 focus-visible:ring-orange-400/30"
              />
              <p className="text-[10px] text-muted-foreground">
                {t('rooms_maintenance_hint')}
              </p>
            </div>

            {/* Preview */}
            {(() => {
              const newCharge = parseFloat(editMaintenanceCharge) || 0
              const oldCharge = editMaintenanceRoom?.maintenanceCharge || 0
              if (newCharge === oldCharge) return null
              const diff = newCharge - oldCharge
              return (
                <Card className={`border ${diff > 0 ? 'border-amber-200 bg-amber-50/30' : 'border-emerald-200 bg-emerald-50/30'}`}>
                  <CardContent className="p-4 space-y-1.5 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground text-xs">{t('rooms_current_maintenance')}</span>
                      <span className="font-medium text-xs">{formatCurrency(oldCharge)}/mo</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground text-xs">{t('rooms_new_maintenance')}</span>
                      <span className="font-medium text-xs">{formatCurrency(newCharge)}/mo</span>
                    </div>
                    <Separator className="my-1.5" />
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-xs">{t('rooms_maintenance_diff')}</span>
                      <span className={`font-bold text-xs ${diff > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {diff > 0 ? '+' : ''}{formatCurrency(diff)}/mo
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )
            })()}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditMaintenanceOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              onClick={handleEditMaintenance}
              disabled={editMaintenanceSubmitting}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {editMaintenanceSubmitting ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  {t('saving')}
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                  {t('save')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ RENT UPDATE DIALOG ═══════════ */}
      <Dialog open={rentUpdateOpen} onOpenChange={setRentUpdateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700">
              <DollarSign className="h-5 w-5" />
              {rentUpdateRoom?.status === 'Vacant' ? 'Update Default Rent' : 'Update Rent'} — Room {rentUpdateRoom?.roomNo}
            </DialogTitle>
            <DialogDescription>
              {rentUpdateRoom?.status === 'Vacant'
                ? 'Change the default rent for this room. This will be the rent for the next tenant.'
                : 'Change the monthly rent. Existing bills will NOT be affected. New rent applies from the effective date.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Current rent */}
            <Card className="border-gray-200 bg-gray-50/50">
              <CardContent className="p-4 space-y-2 text-sm">
                {rentUpdateRoom?.status === 'Vacant' ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Default Rent</span>
                      <span className="font-semibold text-gray-800">{rentUpdateRoom ? formatCurrency(rentUpdateRoom.baseRent) : '—'}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      This is the rent that will apply to the next tenant who checks in.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Current Monthly Rent</span>
                      <span className="font-semibold text-gray-800">{rentUpdateRoom ? formatCurrency(rentUpdateRoom.monthlyRent) : '—'}</span>
                    </div>
                    {rentUpdateRoom && rentUpdateRoom.baseRent !== rentUpdateRoom.monthlyRent && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Base/Default Rent</span>
                        <span className="text-gray-500">{formatCurrency(rentUpdateRoom.baseRent)}</span>
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      Base rent resets automatically when tenant checks out
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            {/* New Rent */}
            <div className="space-y-2">
              <Label htmlFor="rentUpdateNewRent">
                New Monthly Rent (₹) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="rentUpdateNewRent"
                type="number"
                min="1"
                placeholder="Enter new monthly rent"
                value={rentUpdateNewRent}
                onChange={(e) => setRentUpdateNewRent(e.target.value)}
                className="font-mono text-lg border-emerald-200 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30"
              />
            </div>

            {/* Effective Date */}
            <div className="space-y-2">
              <Label htmlFor="rentUpdateEffectiveDate">
                Effective Date <span className="text-red-500">*</span>
              </Label>
              <Input
                id="rentUpdateEffectiveDate"
                type="date"
                value={rentUpdateEffectiveDate}
                onChange={(e) => setRentUpdateEffectiveDate(e.target.value)}
                className="border-emerald-200 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30"
              />
              <p className="text-[10px] text-muted-foreground">
                Bills for this month and after will use the new rent
              </p>
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <Label htmlFor="rentUpdateReason">
                Reason (optional)
              </Label>
              <Input
                id="rentUpdateReason"
                placeholder="e.g., Rent reduction, room change..."
                value={rentUpdateReason}
                onChange={(e) => setRentUpdateReason(e.target.value)}
              />
            </div>

            {/* Preview */}
            {(() => {
              const newRent = parseFloat(rentUpdateNewRent) || 0
              const oldRent = rentUpdateRoom?.monthlyRent || 0
              if (newRent <= 0 || newRent === oldRent) return null
              const diff = newRent - oldRent
              return (
                <Card className={`border ${diff > 0 ? 'border-amber-200 bg-amber-50/30' : 'border-emerald-200 bg-emerald-50/30'}`}>
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                      <DollarSign className="size-3.5" />
                      Rent Change Preview
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 space-y-1.5 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground text-xs">Old Rent</span>
                      <span className="font-medium text-xs">{formatCurrency(oldRent)}/mo</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground text-xs">New Rent</span>
                      <span className="font-medium text-xs">{formatCurrency(newRent)}/mo</span>
                    </div>
                    <Separator className="my-1.5" />
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-xs">Difference</span>
                      <span className={`font-bold text-xs ${diff > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {diff > 0 ? '+' : ''}{formatCurrency(diff)}/mo
                      </span>
                    </div>
                    {rentUpdateEffectiveDate && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Applies from {rentUpdateEffectiveDate} onwards
                      </p>
                    )}
                  </CardContent>
                </Card>
              )
            })()}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRentUpdateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRentUpdate}
              disabled={rentUpdateSubmitting || !rentUpdateNewRent || parseFloat(rentUpdateNewRent) <= 0 || !rentUpdateEffectiveDate}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {rentUpdateSubmitting ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <DollarSign className="mr-2 h-4 w-4" />
                  Update Rent
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ MEMBER UPDATE DIALOG ═══════════ */}
      <Dialog open={memberUpdateOpen} onOpenChange={setMemberUpdateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700">
              <Users className="h-5 w-5" />
              Update Members — {guestDetail ? getGuestName(guestDetail.name, guestDetail.nameHindi) : ''}
            </DialogTitle>
            <DialogDescription>
              Change the number of members in this room. Rent remains unchanged.
            </DialogDescription>
          </DialogHeader>

          {guestDetail && (
            <div className="space-y-4 py-2">
              {/* Current member info */}
              <Card className="border-blue-200 bg-blue-50/30">
                <CardContent className="p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current Members</span>
                    <span className="font-semibold text-gray-800">{guestDetail.totalMembers} member{guestDetail.totalMembers !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current Rent</span>
                    <span className="font-semibold text-gray-800">{formatCurrency(guestDetail.room.monthlyRent)}/mo <span className="text-[10px] text-muted-foreground font-normal">(unchanged)</span></span>
                  </div>
                </CardContent>
              </Card>

              {/* New Member Count */}
              <div className="space-y-2">
                <Label htmlFor="memberUpdateNewCount">
                  New Member Count <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="memberUpdateNewCount"
                  type="number"
                  min="1"
                  max="20"
                  placeholder="Enter new member count"
                  value={memberUpdateNewCount}
                  onChange={(e) => setMemberUpdateNewCount(e.target.value)}
                  className="font-mono text-lg border-emerald-200 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30"
                />
              </div>

              {/* Effective Date */}
              <div className="space-y-2">
                <Label htmlFor="memberUpdateEffectiveDate">
                  Effective Date <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="memberUpdateEffectiveDate"
                  type="date"
                  value={memberUpdateEffectiveDate}
                  onChange={(e) => setMemberUpdateEffectiveDate(e.target.value)}
                  className="border-emerald-200 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30"
                />
                <p className="text-[10px] text-muted-foreground">
                  The new member count will be recorded from this date
                </p>
              </div>

              {/* Reason */}
              <div className="space-y-2">
                <Label htmlFor="memberUpdateReason">
                  Reason (optional)
                </Label>
                <Input
                  id="memberUpdateReason"
                  placeholder="e.g., 1 member left, 2 members added..."
                  value={memberUpdateReason}
                  onChange={(e) => setMemberUpdateReason(e.target.value)}
                />
              </div>

              {/* Preview */}
              {(() => {
                const newCount = parseInt(memberUpdateNewCount) || 0
                const oldCount = guestDetail.totalMembers
                if (newCount < 1 || newCount === oldCount) return null
                const change = newCount - oldCount
                return (
                  <Card className="border-blue-200 bg-blue-50/30">
                    <CardHeader className="pb-1 pt-3 px-4">
                      <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                        <Users className="size-3.5" />
                        Member Change Preview
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-3 space-y-1.5 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground text-xs">Members</span>
                        <span className="font-medium text-xs">{oldCount} → {newCount} ({change > 0 ? '+' : ''}{change})</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground text-xs">Rent</span>
                        <span className="font-medium text-xs">{formatCurrency(guestDetail.room.monthlyRent)}/mo (no change)</span>
                      </div>
                      {memberUpdateEffectiveDate && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Applies from {memberUpdateEffectiveDate} onwards
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )
              })()}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setMemberUpdateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleMemberUpdate}
              disabled={memberUpdateSubmitting || !memberUpdateNewCount || parseInt(memberUpdateNewCount) < 1 || parseInt(memberUpdateNewCount) === guestDetail?.totalMembers || !memberUpdateEffectiveDate}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {memberUpdateSubmitting ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Users className="mr-2 h-4 w-4" />
                  Update Members
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
