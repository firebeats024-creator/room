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
  checkInDate: string
}

interface Room {
  id: string
  roomNo: string
  floor: number
  type: string
  monthlyRent: number
  status: string
  createdAt: string
  updatedAt: string
  guests: GuestBasic[]
}

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
    monthlyRent: number
    status: string
  }
  securityDeposit: SecurityDeposit | null
  bills: GuestBill[]
  electricityReadings: ElectricityReading[]
}

type RoomStatus = 'Vacant' | 'Occupied' | 'Maintenance'

// ─── Constants ───

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const statusConfig: Record<RoomStatus, { label: string; className: string }> = {
  Vacant: {
    label: 'Vacant',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100',
  },
  Occupied: {
    label: 'Occupied',
    className: 'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100',
  },
  Maintenance: {
    label: 'Maintenance',
    className: 'bg-red-100 text-red-800 border-red-200 hover:bg-red-100',
  },
}

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
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [formRoomNo, setFormRoomNo] = useState('')
  const [formFloor, setFormFloor] = useState('1')
  const [formType, setFormType] = useState('Single')
  const [formRent, setFormRent] = useState('5000')

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
    setCiDeposit(String(room.monthlyRent))
    setCheckInOpen(true)
  }

  const handleCheckIn = async () => {
    if (!checkInRoom) return
    if (!ciName.trim()) {
      toast.error('Guest name is required')
      return
    }

    setCheckInSubmitting(true)
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: ciName.trim(),
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
                Rooms Management
              </h1>
              <p className="text-sm text-gray-500">
                Manage your PG hostel rooms
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
              Refresh
            </Button>

            <Dialog open={dialogOpen} onOpenChange={(open) => {
              setDialogOpen(open)
              if (!open) resetForm()
            }}>
              <Button className="gap-1.5 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
                <Plus className="size-4" />
                Add Room
              </Button>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-emerald-800">
                    <Bed className="size-5" />
                    Add New Room
                  </DialogTitle>
                  <DialogDescription>
                    Enter the details for the new room. Room number must be unique.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-2">
                  <div className="grid gap-2">
                    <Label htmlFor="roomNo">
                      Room Number <span className="text-red-500">*</span>
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
                    <Label htmlFor="floor">Floor</Label>
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
                    <Label>Room Type</Label>
                    <Select value={formType} onValueChange={setFormType}>
                      <SelectTrigger className="w-full border-emerald-200 focus:border-emerald-400 focus:ring-emerald-400/30">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Single">Single</SelectItem>
                        <SelectItem value="Double">Double</SelectItem>
                        <SelectItem value="Triple">Triple</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="rent">Monthly Rent (INR)</Label>
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
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddRoom}
                    disabled={submitting || !formRoomNo.trim()}
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    {submitting ? 'Adding...' : 'Add Room'}
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
                  <p className="text-xs font-medium text-gray-500">Total Rooms</p>
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
                  <p className="text-xs font-medium text-gray-500">Occupied</p>
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
                  <p className="text-xs font-medium text-gray-500">Vacant</p>
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
                  <p className="text-xs font-medium text-gray-500">Maintenance</p>
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
                No rooms yet
              </h3>
              <p className="mb-4 text-sm text-gray-500">
                Get started by adding your first room
              </p>
              <Button
                onClick={() => setDialogOpen(true)}
                className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <Plus className="size-4" />
                Add Room
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
                        <span className="text-gray-800">Room {room.roomNo}</span>
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
                        Floor {room.floor}
                      </span>
                      <span className="text-gray-600">{room.type}</span>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-gray-500">
                        <DollarSign className="size-3.5" />
                        Monthly Rent
                      </span>
                      <span className="font-semibold text-emerald-700">
                        {formatCurrency(room.monthlyRent)}
                      </span>
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
                              {activeGuest.name}
                            </p>
                            <p className="text-xs text-amber-600">
                              Checked in: {formatDate(activeGuest.checkInDate)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-amber-600 group-hover:text-amber-800 shrink-0">
                            <FileText className="size-3" />
                            <span className="hidden sm:inline">Details</span>
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
                            Click to Check-in
                          </p>
                        </div>
                        <p className="text-[10px] text-emerald-500 mt-0.5">
                          Available for booking
                        </p>
                      </div>
                    )}

                    {/* Maintenance room indicator */}
                    {status === 'Maintenance' && (
                      <div className="mt-3 rounded-lg border border-red-100 bg-red-50/50 p-3 text-center">
                        <p className="text-xs font-medium text-red-600">
                          Under maintenance
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
            const totalAccruedRent = stayMonths * monthlyRent

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

                {/* ═══ SECTION 1: Personal Information ═══ */}
                <div className="px-5 py-4 space-y-3">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
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

                {/* ═══ SECTION 3: Live Billing Status ═══ */}
                {isLive && (
                  <div className="px-5 py-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                        <CreditCard className="h-3.5 w-3.5" />
                        Live Billing Status
                      </h4>
                      <span className="text-[10px] text-gray-400">
                        {daysStayed} days · {stayMonths} months × {formatCurrency(monthlyRent)} = {formatCurrency(totalAccruedRent)} accrued
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

                {/* ═══ SECTION 4: Electricity ═══ */}
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

                {/* ═══ SECTION 5: Payment History ═══ */}
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
                                <span>Rent: {formatCurrency(bill.rentAmount)}</span>
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
                              <FileDown className={`h-3 w-3 ${receiptDownloading === bill.id ? 'animate-bounce' : ''}`} />
                              <span className="ml-1">{receiptDownloading === bill.id ? '...' : 'PDF'}</span>
                            </Button>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* ═══ FOOTER: Close Button ═══ */}
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

      {/* ═══════════ CHECK-IN DIALOG (from vacant room click) ═══════════ */}
      <Dialog open={checkInOpen} onOpenChange={setCheckInOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-800">
              <UserPlus className="size-5" />
              Check-in Guest
              {checkInRoom && (
                <Badge variant="outline" className="ml-2 border-emerald-200 text-emerald-700">
                  Room {checkInRoom.roomNo}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Fill in guest details to check them into this room
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
                    <p className="font-semibold text-emerald-800">Room {checkInRoom.roomNo} — {checkInRoom.type}</p>
                    <p className="text-xs text-emerald-600">
                      Floor {checkInRoom.floor} &middot; Rent: {formatCurrency(checkInRoom.monthlyRent)}/month
                    </p>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="ciName">
                    Guest Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="ciName"
                    placeholder="Full name"
                    value={ciName}
                    onChange={(e) => setCiName(e.target.value)}
                    className="border-emerald-200 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="ciPhone">Phone</Label>
                    <Input
                      id="ciPhone"
                      placeholder="Mobile number"
                      value={ciPhone}
                      onChange={(e) => setCiPhone(e.target.value)}
                      className="border-emerald-200 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="ciAadhaar">Aadhaar No</Label>
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
                    <Label htmlFor="ciOccupation">Occupation</Label>
                    <Input
                      id="ciOccupation"
                      placeholder="Job / Work"
                      value={ciOccupation}
                      onChange={(e) => setCiOccupation(e.target.value)}
                      className="border-emerald-200 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="ciWorkLoc">Work Location</Label>
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
                    <Label htmlFor="ciEmergency">Emergency Contact</Label>
                    <Input
                      id="ciEmergency"
                      placeholder="Name & Phone"
                      value={ciEmergency}
                      onChange={(e) => setCiEmergency(e.target.value)}
                      className="border-emerald-200 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="ciMembers">Total Members</Label>
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
                  <Label htmlFor="ciPhotoLink">Photo Link</Label>
                  <Input
                    id="ciPhotoLink"
                    placeholder="URL to guest photo (optional)"
                    value={ciPhotoLink}
                    onChange={(e) => setCiPhotoLink(e.target.value)}
                    className="border-emerald-200 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30"
                  />
                </div>

                <Separator className="my-1" />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="ciDate">
                      Check-in Date <span className="text-red-500">*</span>
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
                    <Label htmlFor="ciMeterReading">Opening Meter Reading</Label>
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
                    <Label htmlFor="ciRatePerUnit">Rate per Unit (₹)</Label>
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
                      Security Deposit (₹)
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
                    <p className="text-[10px] text-muted-foreground">Set 0 for no deposit</p>
                  </div>
                </div>

                {/* Payment Preview */}
                <Card className="border-emerald-200 bg-emerald-50/30">
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                      <CreditCard className="size-3.5" />
                      Payment Preview
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Monthly Rent</span>
                      <span className="font-medium">{formatCurrency(checkInRoom.monthlyRent)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Security Deposit
                        {parseFloat(ciDeposit) === checkInRoom.monthlyRent && (
                          <span className="text-[10px] ml-1">(1 month rent)</span>
                        )}
                        {parseFloat(ciDeposit) === 0 && (
                          <span className="text-[10px] ml-1 text-amber-600">(No deposit)</span>
                        )}
                      </span>
                      <span className="font-medium">{formatCurrency(parseFloat(ciDeposit) || 0)}</span>
                    </div>
                    <Separator className="my-1.5" />
                    <div className="flex justify-between font-semibold text-emerald-800">
                      <span>Total Initial Payment</span>
                      <span>{formatCurrency(checkInRoom.monthlyRent + (parseFloat(ciDeposit) || 0))}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCheckInOpen(false)} className="border-emerald-200">
              Cancel
            </Button>
            <Button
              onClick={handleCheckIn}
              disabled={checkInSubmitting || !ciName.trim()}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {checkInSubmitting ? 'Checking in...' : (
                <>
                  <UserPlus className="mr-1.5 size-4" />
                  Check-in Guest
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
    </div>
  )
}
