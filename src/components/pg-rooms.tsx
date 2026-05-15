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
} from 'lucide-react'
import { toast } from 'sonner'
import {
  calculateStayMonths,
  daysBetween,
  getDateComponents,
  getCurrentBillingPeriod,
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

  // ─── Render ───

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50/50 via-white to-teal-50/30">
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
                        ? 'border-emerald-100 hover:border-emerald-200'
                        : 'border-red-100 hover:border-red-200'
                  }`}
                  onClick={() => {
                    if (status === 'Occupied' && activeGuest) {
                      openGuestDetail(activeGuest.id)
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

                    {/* Vacant room indicator */}
                    {status === 'Vacant' && (
                      <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 text-center">
                        <p className="text-xs font-medium text-emerald-600">
                          Available for check-in
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
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-emerald-800">
              Guest Details
            </DialogTitle>
            <DialogDescription>
              Complete guest information & live billing status
            </DialogDescription>
          </DialogHeader>

          {guestDetailLoading ? (
            <div className="space-y-4 py-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : guestDetail ? (() => {
            // ─── Billing calculations ───
            const isLive = guestDetail.status === 'Live'
            const now = new Date()
            const stayMonths = isLive ? calculateStayMonths(guestDetail.checkInDate, now) : 0
            const stayDays = isLive ? daysBetween(guestDetail.checkInDate, now) : 0
            const monthlyRent = guestDetail.room.monthlyRent
            const totalAccruedRent = stayMonths * monthlyRent

            const totalPaid = guestDetail.bills.reduce((sum, b) =>
              sum + (b.status === 'Paid' ? b.totalAmount : (b.paidAmount || 0)), 0)

            const totalBalance = Math.max(0, totalAccruedRent - totalPaid)

            const currentPeriod = isLive ? getCurrentBillingPeriod(guestDetail.checkInDate, now) : null
            const currentPeriodBill = currentPeriod
              ? guestDetail.bills.find((b) => b.billingMonth === currentPeriod.month && b.billingYear === currentPeriod.year)
              : null

            const currentMonthBill = currentPeriodBill
              ? Math.max(0, currentPeriodBill.totalAmount - (currentPeriodBill.paidAmount || 0))
              : (currentPeriod ? monthlyRent : 0)

            const previousDue = Math.max(0, totalBalance - currentMonthBill)

            // Unpaid bills for the Mark Paid feature
            const unpaidBills = guestDetail.bills.filter((b) => b.status !== 'Paid')

            return (
              <div className="space-y-4 py-2">
                {/* ═══ SECTION 1: Guest Profile Information ═══ */}
                <Card className="border-emerald-200 bg-emerald-50/30">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5">
                      <FileText className="h-4 w-4" />
                      Guest Profile Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-2 text-sm">
                    <div className="grid grid-cols-[120px_1fr] gap-y-2.5">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        Guest Name
                      </span>
                      <span className="font-semibold">{guestDetail.name}</span>

                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5" />
                        Contact
                      </span>
                      <span className="font-medium">{guestDetail.phone || '—'}</span>

                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5" />
                        Identity
                      </span>
                      <span className="font-medium">
                        <span className="font-mono">{guestDetail.aadhaarNo || '—'}</span>
                        {guestDetail.photoLink && (
                          <a
                            href={guestDetail.photoLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 ml-2 text-xs text-emerald-700 hover:underline"
                          >
                            <Camera className="h-3 w-3" />
                            View Photo
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                      </span>

                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Briefcase className="h-3.5 w-3.5" />
                        Job/Work
                      </span>
                      <span className="font-medium">
                        {guestDetail.occupation || '—'}
                        {guestDetail.workLocation && (
                          <span className="text-muted-foreground">
                            {' '}at{' '}
                            <span className="inline-flex items-center gap-0.5">
                              <MapPin className="h-3 w-3" />
                              {guestDetail.workLocation}
                            </span>
                          </span>
                        )}
                      </span>

                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        Members
                      </span>
                      <span className="font-medium">
                        {guestDetail.totalMembers} member{guestDetail.totalMembers !== 1 ? 's' : ''}
                      </span>

                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Emergency
                      </span>
                      <span className="font-medium">{guestDetail.emergencyContact || '—'}</span>

                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Home className="h-3.5 w-3.5" />
                        Room
                      </span>
                      <span className="font-medium">
                        {guestDetail.room.roomNo} ({guestDetail.room.type}) &middot; Rent: {formatCurrency(monthlyRent)}
                      </span>

                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5" />
                        Deposit
                      </span>
                      <span className="font-medium">
                        {formatCurrency(guestDetail.securityDeposit?.amount ?? 0)}
                        {guestDetail.securityDeposit && (
                          <span className="text-xs text-muted-foreground ml-1.5">
                            ({guestDetail.securityDeposit.status})
                          </span>
                        )}
                      </span>

                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        Check-in
                      </span>
                      <span className="font-medium">{formatDate(guestDetail.checkInDate)}</span>

                      <span className="text-muted-foreground">Check-out</span>
                      <span className="font-medium">{formatDate(guestDetail.checkOutDate)}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* ═══ SECTION 2: Live Billing Status ═══ */}
                {isLive && (
                  <Card className="border-red-200 bg-red-50/30">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
                        <CreditCard className="h-4 w-4" />
                        Live Billing Status
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-2 text-sm">
                      <div className="grid grid-cols-[140px_1fr] gap-y-2.5">
                        <span className="text-muted-foreground">Check-in Date</span>
                        <span className="font-medium">{formatDate(guestDetail.checkInDate)}</span>

                        <span className="text-muted-foreground">Total Stay</span>
                        <span className="font-semibold text-amber-800">
                          {stayMonths} Month{stayMonths !== 1 ? 's' : ''} {stayDays} Day{stayDays !== 1 ? 's' : ''}
                          <span className="text-xs text-muted-foreground font-normal ml-1">(live)</span>
                        </span>

                        <span className="text-muted-foreground">Monthly Rent</span>
                        <span className="font-medium">{formatCurrency(monthlyRent)}</span>

                        <span className="text-muted-foreground">Accrued Rent</span>
                        <span className="font-medium">{formatCurrency(totalAccruedRent)}
                          <span className="text-xs text-muted-foreground ml-1">({stayMonths} × {formatCurrency(monthlyRent)})</span>
                        </span>

                        <span className="text-muted-foreground">Total Paid</span>
                        <span className="font-medium text-emerald-700">{formatCurrency(totalPaid)}</span>
                      </div>

                      <Separator className="my-2" />

                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Current Month Bill</span>
                        <span className="font-medium text-amber-800">
                          {formatCurrency(currentMonthBill)}
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Previous Due</span>
                        <span className={`font-medium ${previousDue > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                          {formatCurrency(previousDue)}
                        </span>
                      </div>

                      <Separator className="my-1 border-dashed border-red-300" />

                      <div className="flex justify-between items-center py-1">
                        <span className="font-bold text-red-800">Total Outstanding</span>
                        <span className="font-bold text-red-800 text-base">
                          {formatCurrency(totalBalance)}
                        </span>
                      </div>

                      {totalBalance === 0 && (
                        <div className="mt-1 flex items-start gap-1.5 text-xs text-emerald-700 bg-emerald-100 p-2 rounded">
                          <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          <span>All dues cleared — no outstanding balance.</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* ═══ SECTION 3: Unpaid Bills with Mark Paid ═══ */}
                {unpaidBills.length > 0 && (
                  <Card className="border-amber-200 bg-amber-50/30">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-sm font-semibold text-amber-700 flex items-center gap-1.5">
                        <IndianRupee className="h-4 w-4" />
                        Unpaid Bills ({unpaidBills.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-2">
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
                              className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-sm ${
                                isCurrent
                                  ? 'border-red-200 bg-red-50/50'
                                  : 'border-amber-100 bg-white/60'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1">
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
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  <span>Rent: {formatCurrency(bill.rentAmount)}</span>
                                  {bill.electricityCharge > 0 && (
                                    <span>Elec: {formatCurrency(bill.electricityCharge)}</span>
                                  )}
                                  {bill.paidAmount > 0 && (
                                    <span>Paid: {formatCurrency(bill.paidAmount)}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <div className="text-right">
                                  <p className="font-bold text-red-700">{formatCurrency(remaining)}</p>
                                  <p className="text-[10px] text-muted-foreground">remaining</p>
                                </div>
                                <Button
                                  size="sm"
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    openMarkPaid(bill)
                                  }}
                                >
                                  <IndianRupee className="h-3 w-3 mr-1" />
                                  Mark Paid
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                    </CardContent>
                  </Card>
                )}
              </div>
            )
          })() : (
            <div className="py-8 text-center text-muted-foreground">
              No guest details found
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setGuestDetailOpen(false)}>
              Close
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
    </div>
  )
}
