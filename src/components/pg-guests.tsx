'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  UserPlus, LogOut, Eye, Phone, Home, Calendar, Shield, RefreshCw, AlertTriangle, Zap,
  Briefcase, MapPin, Users, Camera, CreditCard, FileText, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  calculateStayMonths,
  daysBetween,
  getDateComponents,
  getCurrentBillingPeriod,
} from '@/lib/billing-utils';

// ---------- Types ----------

interface Room {
  id: string;
  roomNo: string;
  floor: number;
  type: string;
  monthlyRent: number;
  status: string;
  guests: { id: string; name: string }[];
}

interface GuestBill {
  id: string;
  totalAmount: number;
  paidAmount: number;
  status: string;
  rentAmount: number;
  electricityCharge: number;
  billingMonth: number;
  billingYear: number;
  dueDate: string;
}

interface SecurityDeposit {
  id: string;
  guestId: string;
  amount: number;
  status: string;
  deductedAmount: number;
  notes: string;
}

interface Guest {
  id: string;
  name: string;
  phone: string;
  aadhaarNo: string;
  emergencyContact: string;
  occupation: string;
  workLocation: string;
  totalMembers: number;
  photoLink: string;
  roomId: string;
  checkInDate: string;
  checkOutDate: string | null;
  billingCycleDate: number;
  status: string;
  room: {
    id: string;
    roomNo: string;
    floor: number;
    type: string;
    monthlyRent: number;
    status: string;
  };
  securityDeposit: SecurityDeposit | null;
  bills: GuestBill[];
}

interface UnpaidBillItem {
  id: string;
  billingMonth: number;
  billingYear: number;
  totalAmount: number;
  rentAmount: number;
  electricityCharge: number;
  status: string;
}

interface CheckoutSummary {
  guestName: string;
  roomNo: string;
  checkInDate: string;
  checkOutDate: string;
  totalMonths: number;
  monthlyRent: number;
  totalRent: number;
  totalBilled: number;
  totalPaid: number;
  totalBalance: number;
  remainingRent: number;
  electricityCharge?: number;
  unitsConsumed?: number;
  depositAmount: number;
  depositStatus: string;
  depositAlreadyProcessed: boolean;
  depositDeducted: number;
  depositRefund: number;
  totalDues: number;
  netAmount: number;
  netAmountLabel: string;
  unpaidBills: UnpaidBillItem[];
}

// ---------- Helpers ----------

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const { year, month, day } = getDateComponents(dateStr);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ---------- Component ----------

export default function PgGuests() {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');

  // Check-in state
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [checkinSubmitting, setCheckinSubmitting] = useState(false);
  const [vacantRooms, setVacantRooms] = useState<Room[]>([]);
  const [checkinForm, setCheckinForm] = useState({
    name: '',
    phone: '',
    aadhaarNo: '',
    emergencyContact: '',
    occupation: '',
    workLocation: '',
    totalMembers: '1',
    photoLink: '',
    roomId: '',
    checkInDate: toISODate(new Date()),
    openingMeterReading: '',
    ratePerUnit: '10',
  });

  // Check-out state
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [checkoutGuest, setCheckoutGuest] = useState<Guest | null>(null);
  const [checkoutDate, setCheckoutDate] = useState(toISODate(new Date()));
  const [currentMeterReading, setCurrentMeterReading] = useState('');
  const [lastMeterReading, setLastMeterReading] = useState(0);
  const [electricityRate] = useState(10);

  // Checkout result
  const [resultOpen, setResultOpen] = useState(false);
  const [checkoutResult, setCheckoutResult] = useState<CheckoutSummary | null>(null);

  // View details
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsGuest, setDetailsGuest] = useState<Guest | null>(null);

  // ---------- Data fetching ----------

  const fetchGuests = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/guests');
      if (!res.ok) throw new Error('Failed to fetch guests');
      const data = await res.json();
      setGuests(data);
    } catch {
      toast.error('Failed to fetch guests');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchVacantRooms = useCallback(async () => {
    try {
      const res = await fetch('/api/rooms');
      if (!res.ok) throw new Error('Failed to fetch rooms');
      const data: Room[] = await res.json();
      setVacantRooms(data.filter((r) => r.status === 'Vacant'));
    } catch {
      toast.error('Failed to fetch rooms');
    }
  }, []);

  const fetchLastReading = useCallback(async (guestId: string) => {
    try {
      const res = await fetch(`/api/electricity?guestId=${guestId}`);
      if (!res.ok) return 0;
      const readings = await res.json();
      if (readings.length > 0) return readings[0].reading;
      return 0;
    } catch {
      return 0;
    }
  }, []);

  useEffect(() => {
    fetchGuests();
  }, [fetchGuests]);

  // ---------- Filtered guests ----------

  const filteredGuests = guests.filter((g) => {
    if (activeTab === 'live') return g.status === 'Live';
    if (activeTab === 'checkedout') return g.status === 'Checked-out';
    return true;
  });

  const liveCount = guests.filter((g) => g.status === 'Live').length;
  const checkedOutCount = guests.filter((g) => g.status === 'Checked-out').length;

  // ---------- Check-in ----------

  const openCheckinDialog = () => {
    setCheckinForm({
      name: '',
      phone: '',
      aadhaarNo: '',
      emergencyContact: '',
      occupation: '',
      workLocation: '',
      totalMembers: '1',
      photoLink: '',
      roomId: '',
      checkInDate: toISODate(new Date()),
      openingMeterReading: '',
      ratePerUnit: '10',
    });
    fetchVacantRooms();
    setCheckinOpen(true);
  };

  const selectedRoom = vacantRooms.find((r) => r.id === checkinForm.roomId);

  const handleCheckin = async () => {
    if (!checkinForm.name.trim()) {
      toast.error('Guest name is required');
      return;
    }
    if (!checkinForm.roomId) {
      toast.error('Please select a room');
      return;
    }

    try {
      setCheckinSubmitting(true);
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: checkinForm.name.trim(),
          phone: checkinForm.phone.trim(),
          aadhaarNo: checkinForm.aadhaarNo.trim(),
          emergencyContact: checkinForm.emergencyContact.trim(),
          occupation: checkinForm.occupation.trim(),
          workLocation: checkinForm.workLocation.trim(),
          totalMembers: parseInt(checkinForm.totalMembers) || 1,
          photoLink: checkinForm.photoLink.trim(),
          roomId: checkinForm.roomId,
          checkInDate: checkinForm.checkInDate,
          openingMeterReading: parseFloat(checkinForm.openingMeterReading) || 0,
          ratePerUnit: parseFloat(checkinForm.ratePerUnit) || 10,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Check-in failed');
        return;
      }

      toast.success(`${checkinForm.name.trim()} checked in successfully!`);
      setCheckinOpen(false);
      fetchGuests();
    } catch {
      toast.error('Failed to check in guest');
    } finally {
      setCheckinSubmitting(false);
    }
  };

  // ---------- Check-out ----------

  const openCheckoutDialog = async (guest: Guest) => {
    setCheckoutGuest(guest);
    setCheckoutDate(toISODate(new Date()));
    setCurrentMeterReading('');
    const lastReading = await fetchLastReading(guest.id);
    setLastMeterReading(lastReading);
    setCheckoutOpen(true);
  };

  // Checkout preview calculations — uses shared billing-utils for +1 Day Rule
  const getCheckoutPreview = () => {
    if (!checkoutGuest) return null;

    // Use timezone-safe date calculations (UTC methods)
    const daysDiff = daysBetween(checkoutGuest.checkInDate, checkoutDate);

    // +1 Day Rule: calculateStayMonths uses UTC methods for timezone safety
    // 15/03 → 15/04 = 1 Month, 16/04 = 2 Months, 15/05 = 2 Months, 16/05 = 3 Months
    const totalMonths = calculateStayMonths(checkoutGuest.checkInDate, checkoutDate);
    const monthlyRent = checkoutGuest.room.monthlyRent;
    const totalRent = totalMonths * monthlyRent;

    const totalBilled = checkoutGuest.bills.reduce((sum, b) => sum + b.totalAmount, 0);
    const totalPaid = checkoutGuest.bills.filter((b) => b.status === 'Paid').reduce((sum, b) => sum + b.totalAmount, 0)
      + checkoutGuest.bills.filter((b) => b.status === 'Partially-Paid').reduce((sum, b) => sum + b.paidAmount, 0)
      + checkoutGuest.bills.filter((b) => b.status === 'Overdue').reduce((sum, b) => sum + (b.paidAmount || 0), 0);
    // Unpaid bills = all non-Paid bills. Remaining = totalAmount - paidAmount
    // IMPORTANT: Overdue bills can have paidAmount > 0 (when Partially-Paid bills become Overdue)
    const unpaidBills = checkoutGuest.bills.filter((b) => b.status !== 'Paid');
    const unpaidBillsTotal = unpaidBills.reduce((sum, b) => {
      return sum + (b.totalAmount - (b.paidAmount || 0));
    }, 0);
    const remainingRent = Math.max(0, totalRent - totalBilled);

    const meterReading = parseFloat(currentMeterReading) || 0;
    const unitsConsumed = Math.max(0, meterReading - lastMeterReading);
    const electricityCharge = unitsConsumed * electricityRate;

    const totalDues = unpaidBillsTotal + remainingRent + electricityCharge;
    const depositAmount = checkoutGuest.securityDeposit?.amount ?? 0;
    const depositStatus = checkoutGuest.securityDeposit?.status ?? 'None';
    const isDepositAlreadyProcessed = checkoutGuest.securityDeposit
      ? checkoutGuest.securityDeposit.status !== 'Held'
      : false;

    // Calculate deposit adjustment based on whether deposit is still Held
    let depositAdjustment = 0;
    if (!isDepositAlreadyProcessed) {
      // Deposit is still Held — it will be adjusted during checkout
      depositAdjustment = depositAmount - totalDues;
    } else {
      // Deposit was already refunded/processed — guest owes full dues
      depositAdjustment = -totalDues;
    }

    return {
      daysDiff,
      totalMonths,
      totalRent,
      totalBilled,
      totalPaid,
      remainingRent,
      unpaidBills,
      unpaidBillsTotal,
      unitsConsumed,
      electricityCharge,
      totalDues,
      depositAmount,
      depositStatus,
      isDepositAlreadyProcessed,
      depositAdjustment,
    };
  };

  const preview = getCheckoutPreview();

  const handleCheckout = async () => {
    if (!checkoutGuest) return;

    try {
      setCheckoutSubmitting(true);
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestId: checkoutGuest.id,
          checkOutDate: checkoutDate,
          currentMeterReading: parseFloat(currentMeterReading) || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Check-out failed');
        return;
      }

      toast.success(`${checkoutGuest.name} checked out successfully!`);
      setCheckoutOpen(false);
      setCheckoutResult(data.summary);
      setResultOpen(true);
      fetchGuests();
    } catch {
      toast.error('Failed to check out guest');
    } finally {
      setCheckoutSubmitting(false);
    }
  };

  // ---------- View Details ----------

  const openDetailsDialog = (guest: Guest) => {
    setDetailsGuest(guest);
    setDetailsOpen(true);
  };

  // ---------- Render ----------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-emerald-900 dark:text-emerald-100">
            Guests Management
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Manage check-in, check-out and guest records
          </p>
        </div>
        <Button
          onClick={openCheckinDialog}
          className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"
          size="lg"
        >
          <UserPlus className="mr-2 h-5 w-5" />
          Check-in New Guest
        </Button>
      </div>

      {/* Filter Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-emerald-50 dark:bg-emerald-950/40">
          <TabsTrigger
            value="all"
            className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
          >
            All ({guests.length})
          </TabsTrigger>
          <TabsTrigger
            value="live"
            className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
          >
            Live ({liveCount})
          </TabsTrigger>
          <TabsTrigger
            value="checkedout"
            className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
          >
            Checked-out ({checkedOutCount})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Guest Table */}
      <Card className="border-emerald-200 dark:border-emerald-800">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-20" />
                </div>
              ))}
            </div>
          ) : filteredGuests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Home className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-lg font-medium">No guests found</p>
              <p className="text-sm">
                {activeTab === 'all'
                  ? 'Check in a new guest to get started'
                  : `No ${activeTab === 'live' ? 'live' : 'checked-out'} guests`}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-emerald-50/60 dark:bg-emerald-950/30 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/30">
                  <TableHead className="font-semibold text-emerald-800 dark:text-emerald-200">Name</TableHead>
                  <TableHead className="font-semibold text-emerald-800 dark:text-emerald-200">Phone</TableHead>
                  <TableHead className="font-semibold text-emerald-800 dark:text-emerald-200">Room No</TableHead>
                  <TableHead className="font-semibold text-emerald-800 dark:text-emerald-200">Check-in Date</TableHead>
                  <TableHead className="font-semibold text-emerald-800 dark:text-emerald-200">Billing Cycle</TableHead>
                  <TableHead className="font-semibold text-emerald-800 dark:text-emerald-200">Status</TableHead>
                  <TableHead className="font-semibold text-emerald-800 dark:text-emerald-200 text-right">Pending</TableHead>
                  <TableHead className="font-semibold text-emerald-800 dark:text-emerald-200 text-right">Overdue</TableHead>
                  <TableHead className="font-semibold text-emerald-800 dark:text-emerald-200 text-right">Paid</TableHead>
                  <TableHead className="font-semibold text-emerald-800 dark:text-emerald-200 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGuests.map((guest) => (
                  <TableRow key={guest.id} className="group">
                    <TableCell className="font-medium">{guest.name}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5 text-sm">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                        {guest.phone || '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs border-emerald-300 dark:border-emerald-700">
                        {guest.room.roomNo}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5 text-sm">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        {formatDate(guest.checkInDate)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{guest.billingCycleDate}{getOrdinalSuffix(guest.billingCycleDate)} of month</span>
                    </TableCell>
                    <TableCell>
                      {guest.status === 'Live' ? (
                        <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100">
                          Live
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-gray-600 dark:text-gray-400">
                          Checked-out
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {(() => {
                        const pending = guest.bills.filter((b) => b.status !== 'Paid').reduce((sum, b) => {
                          if (b.status === 'Partially-Paid') return sum + (b.totalAmount - (b.paidAmount || 0));
                          return sum + b.totalAmount;
                        }, 0);
                        return pending > 0 ? (
                          <span className="font-semibold text-red-700 dark:text-red-400 text-sm">{formatCurrency(pending)}</span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400 text-sm">₹0</span>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-right">
                      {(() => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const overdue = guest.bills.filter((b) => {
                          if (b.status === 'Paid') return false;
                          const dueDate = new Date(b.dueDate);
                          return dueDate < today;
                        }).reduce((sum, b) => sum + (b.totalAmount - (b.paidAmount || 0)), 0);
                        return overdue > 0 ? (
                          <span className="font-bold text-red-700 dark:text-red-400 text-sm">{formatCurrency(overdue)}</span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400 text-sm">₹0</span>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-right">
                      {(() => {
                        const paid = guest.bills.filter((b) => b.status === 'Paid').reduce((sum, b) => sum + b.totalAmount, 0)
                          + guest.bills.filter((b) => b.status === 'Partially-Paid').reduce((sum, b) => sum + (b.paidAmount || 0), 0);
                        return (
                          <span className="text-sm text-emerald-700 dark:text-emerald-400">{formatCurrency(paid)}</span>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {guest.status === 'Live' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openCheckoutDialog(guest)}
                            className="text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-950/40"
                          >
                            <LogOut className="h-3.5 w-3.5 mr-1" />
                            Check-out
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDetailsDialog(guest)}
                          className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          Details
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ========== CHECK-IN DIALOG ========== */}
      <Dialog open={checkinOpen} onOpenChange={setCheckinOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
              <UserPlus className="h-5 w-5" />
              Check-in New Guest
            </DialogTitle>
            <DialogDescription>
              Fill in guest details and assign a room
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="guest-name">
                Full Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="guest-name"
                placeholder="Enter guest name"
                value={checkinForm.name}
                onChange={(e) => setCheckinForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>

            {/* Phone & Aadhaar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="guest-phone">Phone Number</Label>
                <Input
                  id="guest-phone"
                  placeholder="10-digit number"
                  value={checkinForm.phone}
                  onChange={(e) => setCheckinForm((p) => ({ ...p, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="guest-aadhaar">Aadhaar No</Label>
                <Input
                  id="guest-aadhaar"
                  placeholder="12-digit Aadhaar"
                  value={checkinForm.aadhaarNo}
                  onChange={(e) => setCheckinForm((p) => ({ ...p, aadhaarNo: e.target.value }))}
                />
              </div>
            </div>

            {/* Emergency Contact */}
            <div className="space-y-2">
              <Label htmlFor="guest-emergency">Emergency Contact</Label>
              <Input
                id="guest-emergency"
                placeholder="Name & phone number"
                value={checkinForm.emergencyContact}
                onChange={(e) => setCheckinForm((p) => ({ ...p, emergencyContact: e.target.value }))}
              />
            </div>

            {/* Occupation & Work Location */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="guest-occupation" className="flex items-center gap-1.5">
                  <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                  Occupation
                </Label>
                <Input
                  id="guest-occupation"
                  placeholder="Job title / Work"
                  value={checkinForm.occupation}
                  onChange={(e) => setCheckinForm((p) => ({ ...p, occupation: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="guest-work-location" className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  Work Location
                </Label>
                <Input
                  id="guest-work-location"
                  placeholder="Where they work"
                  value={checkinForm.workLocation}
                  onChange={(e) => setCheckinForm((p) => ({ ...p, workLocation: e.target.value }))}
                />
              </div>
            </div>

            {/* Total Members & Photo Link */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="guest-total-members" className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  Total Members
                </Label>
                <Input
                  id="guest-total-members"
                  type="number"
                  min="1"
                  placeholder="1"
                  value={checkinForm.totalMembers}
                  onChange={(e) => setCheckinForm((p) => ({ ...p, totalMembers: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Number of people staying in the room</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="guest-photo-link" className="flex items-center gap-1.5">
                  <Camera className="h-3.5 w-3.5 text-muted-foreground" />
                  Photo / Aadhaar Link
                </Label>
                <Input
                  id="guest-photo-link"
                  placeholder="URL to photo / Aadhaar copy"
                  value={checkinForm.photoLink}
                  onChange={(e) => setCheckinForm((p) => ({ ...p, photoLink: e.target.value }))}
                />
              </div>
            </div>

            {/* Room & Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Room <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={checkinForm.roomId}
                  onValueChange={(v) => setCheckinForm((p) => ({ ...p, roomId: v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select vacant room" />
                  </SelectTrigger>
                  <SelectContent>
                    {vacantRooms.length === 0 ? (
                      <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                        No vacant rooms available
                      </div>
                    ) : (
                      vacantRooms.map((room) => (
                        <SelectItem key={room.id} value={room.id}>
                          Room {room.roomNo} — {room.type} — {formatCurrency(room.monthlyRent)}/mo
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="checkin-date">Check-in Date</Label>
                <Input
                  id="checkin-date"
                  type="date"
                  value={checkinForm.checkInDate}
                  onChange={(e) => setCheckinForm((p) => ({ ...p, checkInDate: e.target.value }))}
                />
              </div>
            </div>

            {/* Electricity Details */}
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-3">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-800 dark:text-amber-300">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-zap"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>
                Electricity Meter Details
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="opening-reading" className="text-xs">Opening Meter Reading (Unit)</Label>
                  <Input
                    id="opening-reading"
                    type="number"
                    placeholder="e.g., 145"
                    value={checkinForm.openingMeterReading}
                    onChange={(e) => setCheckinForm((p) => ({ ...p, openingMeterReading: e.target.value }))}
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">Current meter reading at check-in</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rate-per-unit" className="text-xs">Rate per Unit (₹)</Label>
                  <Input
                    id="rate-per-unit"
                    type="number"
                    placeholder="10"
                    value={checkinForm.ratePerUnit}
                    onChange={(e) => setCheckinForm((p) => ({ ...p, ratePerUnit: e.target.value }))}
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">Electricity rate per unit in ₹</p>
                </div>
              </div>
            </div>

            {/* Payment Preview */}
            {selectedRoom && (
              <>
                <Separator />
                <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                      Payment Preview
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Monthly Rent</span>
                      <span className="font-medium">{formatCurrency(selectedRoom.monthlyRent)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Security Deposit (1 month rent)</span>
                      <span className="font-medium">{formatCurrency(selectedRoom.monthlyRent)}</span>
                    </div>
                    <Separator className="my-2" />
                    <div className="flex justify-between font-semibold text-emerald-800 dark:text-emerald-200">
                      <span>Total Initial Payment</span>
                      <span>{formatCurrency(selectedRoom.monthlyRent * 2)}</span>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckinOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCheckin}
              disabled={checkinSubmitting || !checkinForm.name.trim() || !checkinForm.roomId}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {checkinSubmitting ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Checking in...
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Check-in Guest
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== CHECK-OUT DIALOG ========== */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
              <LogOut className="h-5 w-5" />
              Check-out Guest
            </DialogTitle>
            <DialogDescription>
              Review charges and confirm check-out
            </DialogDescription>
          </DialogHeader>

          {checkoutGuest && (
            <div className="space-y-4 py-2">
              {/* Guest Info */}
              <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2 text-lg font-semibold">
                    {checkoutGuest.name}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Home className="h-3.5 w-3.5" />
                      Room {checkoutGuest.room.roomNo}
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      Checked in: {formatDate(checkoutGuest.checkInDate)}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Deposit: {formatCurrency(checkoutGuest.securityDeposit?.amount ?? 0)}</span>
                      {checkoutGuest.securityDeposit && checkoutGuest.securityDeposit.status !== 'Held' && (
                        <Badge className={`text-[10px] px-1.5 py-0 ${
                          checkoutGuest.securityDeposit.status === 'Refunded' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                          checkoutGuest.securityDeposit.status === 'Partially-Refunded' ? 'bg-teal-100 text-teal-800 border-teal-200' :
                          'bg-purple-100 text-purple-800 border-purple-200'
                        }`}>
                          {checkoutGuest.securityDeposit.status}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" />
                      {checkoutGuest.phone || '—'}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Checkout Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="checkout-date">Check-out Date</Label>
                  <Input
                    id="checkout-date"
                    type="date"
                    value={checkoutDate}
                    onChange={(e) => setCheckoutDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="meter-reading">Current Meter Reading</Label>
                  <Input
                    id="meter-reading"
                    type="number"
                    placeholder={`Last: ${lastMeterReading}`}
                    value={currentMeterReading}
                    onChange={(e) => setCurrentMeterReading(e.target.value)}
                  />
                  {lastMeterReading > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Last reading: {lastMeterReading} units
                    </p>
                  )}
                </div>
              </div>

              {/* Pending / Unpaid Bills */}
              {preview && preview.unpaidBills.length > 0 && (
                <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-red-800 dark:text-red-300">
                    <AlertTriangle className="h-4 w-4" />
                    Pending / Unpaid Bills ({preview.unpaidBills.length})
                  </div>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {preview.unpaidBills.map((bill) => (
                      <div key={bill.id} className="flex items-center justify-between text-xs bg-white dark:bg-gray-900 rounded-md px-2.5 py-1.5 border border-red-100 dark:border-red-900">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                            bill.status === 'Overdue' ? 'border-red-300 text-red-700' : 'border-amber-300 text-amber-700'
                          }`}>
                            {bill.status}
                          </Badge>
                          <span className="text-muted-foreground">
                            {MONTH_NAMES[bill.billingMonth - 1]} {bill.billingYear}
                          </span>
                        </div>
                        <span className="font-semibold text-red-700 dark:text-red-400">
                          {formatCurrency(bill.totalAmount)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-sm font-semibold text-red-800 dark:text-red-300 pt-1 border-t border-red-200 dark:border-red-800">
                    <span>Total Unpaid</span>
                    <span>{formatCurrency(preview.unpaidBillsTotal)}</span>
                  </div>
                </div>
              )}

              {/* Calculation Preview */}
              {preview && (
                <>
                  <Separator />
                  <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                        Checkout Estimate (+1 Day Rule)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Days stayed</span>
                        <span className="font-medium">{preview.daysDiff} days</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Billable months ({preview.totalMonths} × {formatCurrency(checkoutGuest.room.monthlyRent)})
                        </span>
                        <span className="font-medium">{preview.totalMonths} month{preview.totalMonths > 1 ? 's' : ''}</span>
                      </div>
                      <Separator className="my-1" />

                      <div className="flex justify-between font-semibold text-amber-900 dark:text-amber-100">
                        <span>Total Accrued Rent</span>
                        <span>{formatCurrency(preview.totalRent)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Already billed</span>
                        <span className="font-medium">{formatCurrency(preview.totalBilled)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Paid</span>
                        <span className="font-medium text-emerald-700 dark:text-emerald-400">{formatCurrency(preview.totalPaid)}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-red-700 dark:text-red-300">
                        <span>Remaining Balance</span>
                        <span>{formatCurrency(Math.max(0, preview.totalRent - preview.totalPaid))}</span>
                      </div>

                      {preview.remainingRent > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Unbilled rent (new bill needed)</span>
                          <span className="font-medium">{formatCurrency(preview.remainingRent)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Unpaid bills total</span>
                        <span className="font-medium text-red-600 dark:text-red-400">{formatCurrency(preview.unpaidBillsTotal)}</span>
                      </div>

                      {preview.unitsConsumed > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            Electricity ({preview.unitsConsumed} units × ₹{electricityRate}/unit)
                          </span>
                          <span className="font-medium">{formatCurrency(preview.electricityCharge)}</span>
                        </div>
                      )}

                      <Separator className="my-1" />
                      <div className="flex justify-between font-semibold text-amber-800 dark:text-amber-200">
                        <span>Total due (including unbilled + electricity)</span>
                        <span>{formatCurrency(preview.totalDues)}</span>
                      </div>

                      <Separator className="my-1" />
                      {preview.isDepositAlreadyProcessed ? (
                        <>
                          <div className="flex items-start gap-2 rounded-lg bg-amber-100 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 p-2.5">
                            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                            <div className="text-xs">
                              <p className="font-semibold text-amber-800 dark:text-amber-300">
                                Deposit already {preview.depositStatus === 'Refunded' ? 'refunded' : preview.depositStatus === 'Partially-Refunded' ? 'partially refunded' : 'adjusted'}
                              </p>
                              <p className="text-amber-700 dark:text-amber-400 mt-0.5">
                                Security deposit ({formatCurrency(preview.depositAmount)}) was already processed before checkout. Guest owes full dues.
                              </p>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Security deposit (Held)</span>
                            <span className="font-medium">{formatCurrency(preview.depositAmount)}</span>
                          </div>
                          <div className="flex justify-between font-semibold">
                            <span>Deposit adjustment</span>
                            <span className={preview.depositAdjustment >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                              {preview.depositAdjustment >= 0
                                ? `Refund ${formatCurrency(preview.depositAdjustment)}`
                                : `Guest owes ${formatCurrency(Math.abs(preview.depositAdjustment))}`}
                            </span>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckoutOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCheckout}
              disabled={checkoutSubmitting}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {checkoutSubmitting ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <LogOut className="mr-2 h-4 w-4" />
                  Confirm Check-out
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== CHECKOUT RESULT DIALOG ========== */}
      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-emerald-800 dark:text-emerald-300">
              Checkout Summary
            </DialogTitle>
            <DialogDescription>
              Guest has been checked out successfully
            </DialogDescription>
          </DialogHeader>

          {checkoutResult && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-muted-foreground">Guest</div>
                <div className="font-medium">{checkoutResult.guestName}</div>
                <div className="text-muted-foreground">Room</div>
                <div className="font-medium">{checkoutResult.roomNo}</div>
                <div className="text-muted-foreground">Check-in</div>
                <div className="font-medium">{formatDate(checkoutResult.checkInDate)}</div>
                <div className="text-muted-foreground">Check-out</div>
                <div className="font-medium">{formatDate(checkoutResult.checkOutDate)}</div>
              </div>

              <Separator />

              {/* Accounting Summary */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Billable months ({checkoutResult.totalMonths} × {formatCurrency(checkoutResult.monthlyRent)})</span>
                  <span className="font-medium">{checkoutResult.totalMonths} month{checkoutResult.totalMonths > 1 ? 's' : ''}</span>
                </div>
                <div className="flex justify-between font-semibold text-amber-900 dark:text-amber-100">
                  <span>Total Accrued Rent</span>
                  <span>{formatCurrency(checkoutResult.totalRent)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Already billed</span>
                  <span className="font-medium">{formatCurrency(checkoutResult.totalBilled)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Paid</span>
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">{formatCurrency(checkoutResult.totalPaid)}</span>
                </div>
                <div className="flex justify-between font-semibold text-red-700 dark:text-red-300">
                  <span>Remaining Balance</span>
                  <span>{formatCurrency(checkoutResult.totalBalance)}</span>
                </div>
                {checkoutResult.remainingRent > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Unbilled rent (checkout bill)</span>
                    <span className="font-medium">{formatCurrency(checkoutResult.remainingRent)}</span>
                  </div>
                )}
                {checkoutResult.electricityCharge !== undefined && checkoutResult.electricityCharge > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Electricity ({checkoutResult.unitsConsumed} units)
                    </span>
                    <div className="font-medium">{formatCurrency(checkoutResult.electricityCharge)}</div>
                  </div>
                )}
              </div>

              {/* Unpaid Bills in Checkout Result */}
              {checkoutResult.unpaidBills && checkoutResult.unpaidBills.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-red-700 dark:text-red-400 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Unpaid Bills ({checkoutResult.unpaidBills.length})
                    </p>
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                      {checkoutResult.unpaidBills.map((bill) => (
                        <div key={bill.id} className="flex items-center justify-between text-xs bg-red-50 dark:bg-red-950/20 rounded px-2 py-1">
                          <span className="text-muted-foreground">
                            {MONTH_NAMES[bill.billingMonth - 1]} {bill.billingYear}
                          </span>
                          <span className="font-semibold text-red-700 dark:text-red-400">
                            {formatCurrency(bill.totalAmount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <Separator />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total dues</span>
                  <span className="font-semibold">{formatCurrency(checkoutResult.totalDues)}</span>
                </div>
                {checkoutResult.depositAlreadyProcessed ? (
                  <div className="flex items-start gap-1.5 rounded bg-amber-50 dark:bg-amber-950/20 p-2 text-xs">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                    <span className="text-amber-700 dark:text-amber-400">
                      Deposit was already <strong>{checkoutResult.depositStatus}</strong> before checkout. Full dues are payable.
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Deposit deducted</span>
                      <span className="font-medium">{formatCurrency(checkoutResult.depositDeducted)}</span>
                    </div>
                    {checkoutResult.depositRefund > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Deposit refunded</span>
                        <span className="font-medium text-emerald-700 dark:text-emerald-400">
                          {formatCurrency(checkoutResult.depositRefund)}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>

              <Separator />

              <div
                className={`text-center py-3 rounded-lg font-semibold text-lg ${
                  checkoutResult.netAmount > 0
                    ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400'
                    : checkoutResult.netAmount < 0
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                      : 'bg-gray-50 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'
                }`}
              >
                {checkoutResult.netAmountLabel}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setResultOpen(false)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== VIEW DETAILS DIALOG ========== */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-emerald-800 dark:text-emerald-300">
              Guest Details
            </DialogTitle>
            <DialogDescription>
              Complete guest information & live billing status
            </DialogDescription>
          </DialogHeader>

          {detailsGuest && (() => {
            // ─── Billing calculations (only used for Live guests) ───
            const isLive = detailsGuest.status === 'Live';
            const now = new Date();
            const stayMonths = isLive ? calculateStayMonths(detailsGuest.checkInDate, now) : 0;
            const stayDays = isLive ? daysBetween(detailsGuest.checkInDate, now) : 0;
            const monthlyRent = detailsGuest.room.monthlyRent;
            const totalAccruedRent = stayMonths * monthlyRent;

            // Total paid: Paid bills (full) + partially-paid/overdue (paidAmount portion)
            const totalPaid = detailsGuest.bills.reduce((sum, b) =>
              sum + (b.status === 'Paid' ? b.totalAmount : (b.paidAmount || 0)), 0);

            // Total balance = accrued rent - what's been paid
            const totalBalance = Math.max(0, totalAccruedRent - totalPaid);

            // Current period billing
            const currentPeriod = isLive ? getCurrentBillingPeriod(detailsGuest.checkInDate, now) : null;

            // Find the bill for the current period (if it exists)
            const currentPeriodBill = currentPeriod
              ? detailsGuest.bills.find((b) => b.billingMonth === currentPeriod.month && b.billingYear === currentPeriod.year)
              : null;

            // Current month bill = what's still owed for the current period
            const currentMonthBill = currentPeriodBill
              ? Math.max(0, currentPeriodBill.totalAmount - (currentPeriodBill.paidAmount || 0))
              : (currentPeriod ? monthlyRent : 0);

            // Previous due = total outstanding minus current month's portion
            const previousDue = Math.max(0, totalBalance - currentMonthBill);

            return (
              <div className="space-y-4 py-2">
                {/* ═══════════ SECTION 1: Guest Profile Information ═══════════ */}
                <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/20">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                      <FileText className="h-4 w-4" />
                      Guest Profile Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-2 text-sm">
                    <div className="grid grid-cols-[130px_1fr] gap-y-2.5">
                      {/* Guest Name */}
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        Guest Name
                      </span>
                      <span className="font-semibold">{detailsGuest.name}</span>

                      {/* Contact */}
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5" />
                        Contact
                      </span>
                      <span className="font-medium">{detailsGuest.phone || '—'}</span>

                      {/* Identity */}
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5" />
                        Identity
                      </span>
                      <span className="font-medium">
                        <span className="font-mono">{detailsGuest.aadhaarNo || '—'}</span>
                        {detailsGuest.photoLink && (
                          <a
                            href={detailsGuest.photoLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 ml-2 text-xs text-emerald-700 dark:text-emerald-400 hover:underline"
                          >
                            <Camera className="h-3 w-3" />
                            View Photo
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                      </span>

                      {/* Job/Work */}
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Briefcase className="h-3.5 w-3.5" />
                        Job/Work
                      </span>
                      <span className="font-medium">
                        {detailsGuest.occupation || '—'}
                        {detailsGuest.workLocation && (
                          <span className="text-muted-foreground">
                            {' '}at{' '}
                            <span className="inline-flex items-center gap-0.5">
                              <MapPin className="h-3 w-3" />
                              {detailsGuest.workLocation}
                            </span>
                          </span>
                        )}
                      </span>

                      {/* Family/Members */}
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        Family/Members
                      </span>
                      <span className="font-medium">
                        {detailsGuest.totalMembers} member{detailsGuest.totalMembers !== 1 ? 's' : ''}
                      </span>

                      {/* Emergency Contact */}
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Emergency
                      </span>
                      <span className="font-medium">{detailsGuest.emergencyContact || '—'}</span>

                      {/* Room */}
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Home className="h-3.5 w-3.5" />
                        Room
                      </span>
                      <span className="font-medium">
                        {detailsGuest.room.roomNo} ({detailsGuest.room.type}) &middot; Rent: {formatCurrency(monthlyRent)}
                      </span>

                      {/* Deposit */}
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5" />
                        Deposit
                      </span>
                      <span className="font-medium">
                        {formatCurrency(detailsGuest.securityDeposit?.amount ?? 0)}
                        {detailsGuest.securityDeposit && (
                          <span className="text-xs text-muted-foreground ml-1.5">
                            ({detailsGuest.securityDeposit.status})
                          </span>
                        )}
                      </span>

                      {/* Status */}
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        Status
                      </span>
                      <span>
                        {detailsGuest.status === 'Live' ? (
                          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
                            Live
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-gray-600 dark:text-gray-400">
                            Checked-out
                          </Badge>
                        )}
                      </span>

                      {/* Check-in / Check-out */}
                      <span className="text-muted-foreground">Check-in</span>
                      <span className="font-medium">{formatDate(detailsGuest.checkInDate)}</span>
                      <span className="text-muted-foreground">Check-out</span>
                      <span className="font-medium">{formatDate(detailsGuest.checkOutDate)}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* ═══════════ SECTION 2: Live Billing Status ═══════════ */}
                {isLive && (
                  <Card className="border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-950/20">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-sm font-semibold text-red-700 dark:text-red-400 flex items-center gap-1.5">
                        <CreditCard className="h-4 w-4" />
                        Live Billing Status
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-2 text-sm">
                      <div className="grid grid-cols-[150px_1fr] gap-y-2.5">
                        {/* Check-in Date */}
                        <span className="text-muted-foreground">Check-in Date</span>
                        <span className="font-medium">{formatDate(detailsGuest.checkInDate)}</span>

                        {/* Total Stay */}
                        <span className="text-muted-foreground">Total Stay</span>
                        <span className="font-semibold text-amber-800 dark:text-amber-300">
                          {stayMonths} Month{stayMonths !== 1 ? 's' : ''} {stayDays} Day{stayDays !== 1 ? 's' : ''}
                          <span className="text-xs text-muted-foreground font-normal ml-1">(calculated live)</span>
                        </span>

                        {/* Monthly Rent */}
                        <span className="text-muted-foreground">Monthly Rent</span>
                        <span className="font-medium">{formatCurrency(monthlyRent)}</span>
                      </div>

                      <Separator className="my-2" />

                      {/* Current Month Bill */}
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Current Month Bill</span>
                        <span className="font-medium text-amber-800 dark:text-amber-300">
                          {formatCurrency(currentMonthBill)}
                        </span>
                      </div>

                      {/* Previous Due */}
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Previous Due</span>
                        <span className={`font-medium ${previousDue > 0 ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                          {formatCurrency(previousDue)}
                        </span>
                      </div>

                      <Separator className="my-1 border-dashed border-red-300 dark:border-red-700" />

                      {/* Total Outstanding */}
                      <div className="flex justify-between items-center py-1">
                        <span className="font-bold text-red-800 dark:text-red-300">Total Outstanding</span>
                        <span className="font-bold text-red-800 dark:text-red-300 text-base">
                          {formatCurrency(totalBalance)}
                        </span>
                      </div>

                      {/* Breakdown hint */}
                      {totalBalance > 0 && (
                        <div className="mt-1 flex items-start gap-1.5 text-xs text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-950/40 p-2 rounded">
                          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          <span>
                            Outstanding = Current Month ({formatCurrency(currentMonthBill)}) + Previous Due ({formatCurrency(previousDue)})
                          </span>
                        </div>
                      )}
                      {totalBalance === 0 && (
                        <div className="mt-1 flex items-start gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/40 p-2 rounded">
                          <Shield className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          <span>All dues cleared — no outstanding balance.</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            );
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Utility ----------

function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
