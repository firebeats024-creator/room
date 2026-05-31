'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Receipt, RefreshCw, CheckCircle2, AlertCircle, Clock, Pencil, DollarSign,
  AlertTriangle, Info, Zap, Users, Calendar, ShieldCheck, TrendingDown,
  Timer, Calculator, FileDown,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  calculateStayMonths,
  getCurrentBillingPeriod,
  daysBetween,
  getDateComponents,
} from '@/lib/billing-utils';
import { useLanguage } from '@/lib/i18n';

// ---------- Types ----------

interface Bill {
  id: string;
  guestId: string;
  roomId: string;
  billingMonth: number;
  billingYear: number;
  rentAmount: number;
  maintenanceCharge: number;
  electricityCharge: number;
  previousReading: number;
  currentReading: number;
  unitsConsumed: number;
  ratePerUnit: number;
  minChargePolicy: string;
  manualAdjustment: number;
  adjustmentReason: string;
  isCustomBill: boolean;
  customTotal: number | null;
  totalAmount: number;
  paidAmount: number;
  dueDate: string;
  paidDate: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  guest: {
    id: string;
    name: string;
    nameHindi: string;
    phone: string;
    status: string;
    billingCycleDate: number;
    checkInDate: string;
    checkOutDate: string | null;
  };
  room: {
    id: string;
    roomNo: string;
    floor: number;
    type: string;
    monthlyRent: number;
    maintenanceCharge: number;
  };
}

// ---------- Helpers ----------

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const { year, month, day } = getDateComponents(dateStr);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

function formatBillPeriodWithCycleDate(month: number, year: number, cycleDate: number): string {
  const startDay = cycleDate;
  let endMonth = month + 1;
  let endYear = year;
  if (endMonth > 12) {
    endMonth = 1;
    endYear++;
  }
  return `${startDay} ${MONTH_NAMES[month - 1]} → ${startDay} ${MONTH_NAMES[endMonth - 1]} ${endYear}`;
}

function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// =====================================================================
// MASTER ACCOUNTING — DATE-TO-DATE (ANNIVERSARY) BILLING SYSTEM
// =====================================================================
// All calculation logic is in @/lib/billing-utils.ts (timezone-safe)
//
// +1 Day Rule (Anniversary Date Billing):
//   15/03 → 15/04 = 1 Month, 16/04 = 2 Months, 15/05 = 2 Months, 16/05 = 3 Months
//
// 1. MONTH COUNTING: calculateStayMonths() — uses UTC methods
// 2. RENT ALLOCATION: Total Accrued = Sum of rent from bill records + unbilled months × currentRent
// 3. CURRENT/PREVIOUS SPLIT: getCurrentBillingPeriod() — uses UTC methods
// 4. PAYMENT PRIORITY: Current Bill → Previous Due (FIFO)
// =====================================================================

interface GuestBucketInfo {
  guestId: string;
  guestName: string;
  guestNameHindi: string;
  roomNo: string;
  guestStatus: string;
  billingCycleDate: number;
  checkInDate: string;
  checkOutDate: string | null;
  monthlyRent: number;
  maintenanceCharge: number;
  totalBilled: number;
  totalPaid: number;
  totalDue: number;
  billCount: number;
  paidCount: number;
  daysStayed: number;
  stayMonths: number;
  totalAccruedRent: number;         // Sum of rent from all bills + unbilled months × current rent
  // Bill-record-based component totals:
  totalRentFromBills: number;
  totalMaintenanceFromBills: number;
  totalElectricityFromBills: number;
  totalAdjustmentsFromBills: number;
  // Dynamic accrual-based amounts (adjusted for payments):
  currentBillAmount: number;        // Current period bill remaining
  previousDue: number;              // Total Balance - Current Bill
  totalBalance: number;             // Total Accrued - Total Paid
  currentBillMonth: number;
  currentBillYear: number;
  dueBills: {
    month: number; year: number;
    amount: number; paidAmount: number;
    totalAmount: number;
    cycleDate: number;
    isCurrentBill: boolean;
  }[];
  accruedBreakdown?: {
    rent: number;
    maintenance: number;
    electricity: number;
    adjustments: number;
    unbilledRent: number;
    unbilledMaintenance: number;
    totalAccrued: number;
    totalPaid: number;
    totalDue: number;
  };
}

// ---------- Component ----------

export default function PgBilling() {
  const { t, getGuestName } = useLanguage();
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [receiptDownloading, setReceiptDownloading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('all');
  const [guestFilter, setGuestFilter] = useState<'all' | 'live' | 'old'>('all');
  const [liveDate] = useState(() => {
    // IMPORTANT: Use local-time date string to avoid UTC/local mismatch
    // When new Date() is passed to getDateComponents (which uses UTC methods),
    // the UTC day may differ from the local day (e.g., 12:30 AM IST = 7:00 PM UTC previous day)
    const d = new Date();
    const localStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return localStr; // Store as YYYY-MM-DD string (local time)
  }); // Live system date, set once on mount

  // Edit bill dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editBill, setEditBill] = useState<Bill | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [isCustomBill, setIsCustomBill] = useState(false);
  const [manualAdjustment, setManualAdjustment] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [customTotal, setCustomTotal] = useState('');
  const [editOpeningUnit, setEditOpeningUnit] = useState('');
  const [editEndingUnit, setEditEndingUnit] = useState('');
  const [editRatePerUnit, setEditRatePerUnit] = useState('');

  // Mark Paid confirmation dialog
  const [confirmPaidOpen, setConfirmPaidOpen] = useState(false);
  const [confirmPaidBill, setConfirmPaidBill] = useState<Bill | null>(null);
  const [confirmPaidSubmitting, setConfirmPaidSubmitting] = useState(false);
  const [payOpeningUnit, setPayOpeningUnit] = useState('');
  const [payEndingUnit, setPayEndingUnit] = useState('');
  const [payRatePerUnit, setPayRatePerUnit] = useState('');
  const [payIsCustomBill, setPayIsCustomBill] = useState(false);
  const [payCustomTotal, setPayCustomTotal] = useState('');
  const [payManualAdjustment, setPayManualAdjustment] = useState('');
  const [payAdjustmentReason, setPayAdjustmentReason] = useState('');
  const [payAmount, setPayAmount] = useState('');

  // ---------- Data fetching ----------

  const fetchBills = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/bills');
      if (!res.ok) throw new Error('Failed to fetch bills');
      const data = await res.json();
      setBills(data);
    } catch {
      toast.error('Failed to fetch bills');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  // ---------- Core Logic ----------
  const isBillDue = (bill: Bill): boolean => {
    return bill.status !== 'Paid';
  };

  // ---------- Filtered bills ----------
  const filteredBills = bills.filter((b) => {
    if (activeTab === 'overdue') return isBillDue(b);
    if (activeTab === 'paid') return b.status === 'Paid';
    return true;
  });

  const paidCount = bills.filter((b) => b.status === 'Paid').length;
  const dueCount = bills.filter((b) => isBillDue(b)).length;

  // ---------- Summary calculations ----------
  const totalBilled = bills.reduce((sum, b) => sum + b.totalAmount, 0);
  const totalPaid = bills.reduce((sum, b) => {
    if (b.status === 'Paid') return sum + b.totalAmount;
    return sum + (b.paidAmount || 0);
  }, 0);
  const totalDue = totalBilled - totalPaid;

  // ---------- Guest-wise DYNAMIC RENTAL BILLING ----------
  const guestSummary = bills.reduce((acc, bill) => {
    const key = bill.guestId;
    if (!acc[key]) {
      acc[key] = {
        guestId: bill.guestId,
        guestName: bill.guest.name,
        guestNameHindi: bill.guest.nameHindi || '',
        roomNo: bill.room.roomNo,
        guestStatus: bill.guest.status,
        billingCycleDate: bill.guest.billingCycleDate,
        checkInDate: bill.guest.checkInDate,
        checkOutDate: bill.guest.checkOutDate,
        monthlyRent: bill.room.monthlyRent || bill.rentAmount,
        maintenanceCharge: bill.room.maintenanceCharge || 0,
        totalBilled: 0,
        totalPaid: 0,
        totalDue: 0,
        billCount: 0,
        paidCount: 0,
        daysStayed: 0,
        stayMonths: 0,
        totalAccruedRent: 0,
        totalRentFromBills: 0,
        totalMaintenanceFromBills: 0,
        totalElectricityFromBills: 0,
        totalAdjustmentsFromBills: 0,
        currentBillAmount: 0,
        previousDue: 0,
        totalBalance: 0,
        currentBillMonth: 0,
        currentBillYear: 0,
        dueBills: [],
      };
    }
    acc[key].totalBilled += bill.totalAmount;
    acc[key].totalRentFromBills += bill.rentAmount;
    acc[key].totalMaintenanceFromBills += bill.maintenanceCharge || 0;
    acc[key].totalElectricityFromBills += bill.electricityCharge || 0;
    acc[key].totalAdjustmentsFromBills += bill.manualAdjustment || 0;
    acc[key].billCount++;
    if (bill.status === 'Paid') {
      acc[key].totalPaid += bill.totalAmount;
      acc[key].paidCount++;
    } else {
      acc[key].totalPaid += bill.paidAmount || 0;
      const remaining = bill.totalAmount - (bill.paidAmount || 0);
      acc[key].totalDue += remaining;
      acc[key].dueBills.push({
        month: bill.billingMonth,
        year: bill.billingYear,
        amount: remaining,
        paidAmount: bill.paidAmount || 0,
        totalAmount: bill.totalAmount,
        cycleDate: bill.guest.billingCycleDate,
        isCurrentBill: false,
      });
    }
    return acc;
  }, {} as Record<string, GuestBucketInfo>);

  // =====================================================================
  // DYNAMIC RENTAL BILLING: Bill-Records-Based Calculation
  // =====================================================================
  // Source of truth: ACTUAL bill records capture correct rent per month
  //   (rent may change over time — bills record the rent at billing time)
  // Total Accrued = (Rent from bills + Unbilled rent) + (Maint from bills + Unbilled maint)
  //                 + Electricity from bills + Adjustments from bills
  // Unbilled months = stayMonths - billCount (months without a bill yet)
  // Total Balance = Total Accrued - Total Paid
  // Current Bill = remaining on current period's bill (or monthlyRent + maint if no bill)
  // Previous Due = Total Balance - Current Bill
  // =====================================================================
  for (const key of Object.keys(guestSummary)) {
    const gs = guestSummary[key];
    // For checked-out guests, use checkOutDate; for live guests, use liveDate
    const referenceDate = gs.guestStatus === 'Checked-out' && gs.checkOutDate
      ? gs.checkOutDate // String date — parseDateSafe handles it
      : liveDate; // Already a local-time YYYY-MM-DD string
    gs.daysStayed = daysBetween(gs.checkInDate, referenceDate);
    gs.stayMonths = calculateStayMonths(gs.checkInDate, referenceDate);

    // Determine current billing period
    // For checked-out guests, use checkOutDate as reference; for live guests, use liveDate
    const periodReferenceDate = gs.guestStatus === 'Checked-out' && gs.checkOutDate
      ? gs.checkOutDate // String date
      : liveDate; // Local-time YYYY-MM-DD string
    const currentPeriod = getCurrentBillingPeriod(gs.checkInDate, periodReferenceDate);
    if (currentPeriod) {
      gs.currentBillMonth = currentPeriod.month;
      gs.currentBillYear = currentPeriod.year;
    }

    // Tag due bills as current/previous for display purposes
    for (const db of gs.dueBills) {
      db.isCurrentBill = currentPeriod
        ? db.month === currentPeriod.month && db.year === currentPeriod.year
        : false;
    }
    // If no bill matches the current period, tag the most recent due bill as current
    if (gs.dueBills.length > 0 && !gs.dueBills.some(db => db.isCurrentBill)) {
      const sortedDueBills = [...gs.dueBills].sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
      });
      const latestBill = sortedDueBills[0];
      for (const db of gs.dueBills) {
        if (db.month === latestBill.month && db.year === latestBill.year) {
          db.isCurrentBill = true;
          gs.currentBillMonth = latestBill.month;
          gs.currentBillYear = latestBill.year;
        }
      }
    }

    // =====================================================================
    // BILL-RECORDS-BASED CALCULATION (handles rent changes correctly)
    // =====================================================================
    // Each bill already has the correct rentAmount and maintenanceCharge
    // for its billing period (captured at bill creation time).
    // So summing from bill records gives the accurate total.
    // For months without a bill yet (unbilled), add current room rates.
    // =====================================================================
    const unbilledMonths = Math.max(0, gs.stayMonths - gs.billCount);
    const unbilledRent = unbilledMonths * gs.monthlyRent;
    const unbilledMaintenance = unbilledMonths * gs.maintenanceCharge;

    // Total Accrued = from bill records + unbilled months
    const totalAccruedRent = gs.totalRentFromBills + unbilledRent;
    const totalAccruedMaintenance = gs.totalMaintenanceFromBills + unbilledMaintenance;
    const totalAccruedElectricity = gs.totalElectricityFromBills;
    const totalAccruedAdjustments = gs.totalAdjustmentsFromBills;

    gs.totalAccruedRent = totalAccruedRent;

    const dynamicTotalAccrued = totalAccruedRent + totalAccruedMaintenance + totalAccruedElectricity + totalAccruedAdjustments;
    const totalPaid = gs.totalPaid; // From bill records
    const totalBalance = Math.max(0, dynamicTotalAccrued - totalPaid);

    // Store breakdown for step-by-step display
    gs.accruedBreakdown = {
      rent: totalAccruedRent,
      maintenance: totalAccruedMaintenance,
      electricity: totalAccruedElectricity,
      adjustments: totalAccruedAdjustments,
      unbilledRent,
      unbilledMaintenance,
      totalAccrued: dynamicTotalAccrued,
      totalPaid: totalPaid,
      totalDue: totalBalance,
    };

    // For Current Bill: check if the current period has a bill record
    // If yes, use the remaining amount on that specific bill
    // If no bill exists for current period, the full month's rent + maintenance is still owed
    const currentPeriodBill = gs.dueBills.find(db => db.isCurrentBill);
    if (currentPeriodBill) {
      gs.currentBillAmount = currentPeriodBill.amount; // Remaining on current bill
    } else if (gs.dueBills.length === 0) {
      // All bills are paid — check if totalPaid covers the current month too
      const currentMonthCharge = gs.monthlyRent + gs.maintenanceCharge;
      gs.currentBillAmount = Math.max(0, currentMonthCharge - Math.max(0, totalPaid - (dynamicTotalAccrued - currentMonthCharge)));
    } else {
      // No bill for current period but other due bills exist — current month is still owed
      gs.currentBillAmount = gs.monthlyRent + gs.maintenanceCharge;
    }

    // Previous Due = Total Balance - Current Bill
    gs.previousDue = Math.max(0, totalBalance - gs.currentBillAmount);
    gs.totalBalance = totalBalance;
  }

  const guestSummaryList = Object.values(guestSummary).sort((a, b) => b.totalBalance - a.totalBalance);

  // Per-guest bucket lookup (for table columns)
  const guestBucketMap: Record<string, {
    monthlyRent: number;
    maintenanceCharge: number;
    stayMonths: number;
    daysStayed: number;
    totalAccruedRent: number;
    currentBillAmount: number;
    previousDue: number;
    totalBalance: number;
    isCurrentBill: (month: number, year: number) => boolean;
    guestStatus: string;
    checkOutDate: string | null;
  }> = {};
  for (const gs of guestSummaryList) {
    guestBucketMap[gs.guestId] = {
      monthlyRent: gs.monthlyRent,
      maintenanceCharge: gs.maintenanceCharge,
      stayMonths: gs.stayMonths,
      daysStayed: gs.daysStayed,
      totalAccruedRent: gs.totalAccruedRent,
      currentBillAmount: gs.currentBillAmount,
      previousDue: gs.previousDue,
      totalBalance: gs.totalBalance,
      isCurrentBill: (month: number, year: number) => month === gs.currentBillMonth && year === gs.currentBillYear,
      guestStatus: gs.guestStatus,
      checkOutDate: gs.checkOutDate,
    };
  }

  // ---------- Download Receipt ----------

  const handleDownloadReceipt = async (billId: string) => {
    setReceiptDownloading(billId);
    try {
      const res = await fetch(`/api/receipt/${billId}`);
      if (!res.ok) throw new Error('Failed to download receipt');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${billId.substring(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Receipt downloaded!');
    } catch {
      toast.error('Failed to download receipt');
    } finally {
      setReceiptDownloading(null);
    }
  };

  // ---------- Edit bill ----------

  const openEditDialog = (bill: Bill) => {
    setEditBill(bill);
    setIsCustomBill(bill.isCustomBill);
    setManualAdjustment(bill.manualAdjustment !== 0 ? String(bill.manualAdjustment) : '');
    setAdjustmentReason(bill.adjustmentReason || '');
    setCustomTotal(bill.customTotal !== null ? String(bill.customTotal) : '');
    setEditOpeningUnit(String(bill.previousReading));
    setEditEndingUnit(String(bill.currentReading));
    setEditRatePerUnit(String(bill.ratePerUnit));
    setEditOpen(true);
  };

  const editUnitsConsumed = Math.max(0, (parseFloat(editEndingUnit) || 0) - (parseFloat(editOpeningUnit) || 0));
  const editElectricityCharge = editUnitsConsumed * (parseFloat(editRatePerUnit) || 0);

  const calculatedTotal = editBill
    ? editBill.rentAmount + (editBill.maintenanceCharge || 0) + editElectricityCharge + (parseFloat(manualAdjustment) || 0)
    : 0;

  const previewTotal = isCustomBill
    ? (parseFloat(customTotal) || 0)
    : calculatedTotal;

  const handleEditSubmit = async () => {
    if (!editBill) return;

    try {
      setEditSubmitting(true);
      const payload: Record<string, unknown> = {
        billId: editBill.id,
        isCustomBill,
        previousReading: parseFloat(editOpeningUnit) || 0,
        currentReading: parseFloat(editEndingUnit) || 0,
        unitsConsumed: editUnitsConsumed,
        ratePerUnit: parseFloat(editRatePerUnit) || 10,
        electricityCharge: editElectricityCharge,
      };

      if (isCustomBill) {
        payload.customTotal = parseFloat(customTotal) || 0;
      } else {
        payload.manualAdjustment = parseFloat(manualAdjustment) || 0;
        payload.adjustmentReason = adjustmentReason.trim();
      }

      const res = await fetch('/api/bills', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to update bill');
        return;
      }

      toast.success('Bill updated successfully');
      setEditOpen(false);
      fetchBills();
    } catch {
      toast.error('Failed to update bill');
    } finally {
      setEditSubmitting(false);
    }
  };

  // ---------- Mark paid ----------

  const openConfirmPaid = (bill: Bill) => {
    setConfirmPaidBill(bill);
    setPayOpeningUnit(String(bill.previousReading));
    setPayEndingUnit(String(bill.currentReading));
    setPayRatePerUnit(String(bill.ratePerUnit));
    setPayIsCustomBill(bill.isCustomBill);
    setPayCustomTotal(bill.customTotal !== null ? String(bill.customTotal) : '');
    setPayManualAdjustment(bill.manualAdjustment !== 0 ? String(bill.manualAdjustment) : '');
    setPayAdjustmentReason(bill.adjustmentReason || '');
    const remaining = bill.totalAmount - (bill.paidAmount || 0);
    setPayAmount(String(remaining));
    setConfirmPaidOpen(true);
  };

  const payUnitsConsumed = Math.max(0, (parseFloat(payEndingUnit) || 0) - (parseFloat(payOpeningUnit) || 0));
  const payElectricityCharge = payUnitsConsumed * (parseFloat(payRatePerUnit) || 0);

  const payCalculatedTotal = confirmPaidBill
    ? confirmPaidBill.rentAmount + (confirmPaidBill.maintenanceCharge || 0) + payElectricityCharge + (parseFloat(payManualAdjustment) || 0)
    : 0;

  const payPreviewTotal = payIsCustomBill
    ? (parseFloat(payCustomTotal) || 0)
    : payCalculatedTotal;

  const handleConfirmPaid = async () => {
    if (!confirmPaidBill) return;

    try {
      setConfirmPaidSubmitting(true);
      const pUnitsConsumed = Math.max(0, (parseFloat(payEndingUnit) || 0) - (parseFloat(payOpeningUnit) || 0));
      const pElectricityCharge = pUnitsConsumed * (parseFloat(payRatePerUnit) || 0);

      let newTotal: number;
      if (payIsCustomBill) {
        newTotal = parseFloat(payCustomTotal) || 0;
      } else {
        newTotal = confirmPaidBill.rentAmount + (confirmPaidBill.maintenanceCharge || 0) + pElectricityCharge + (parseFloat(payManualAdjustment) || 0);
      }

      const paymentAmt = parseFloat(payAmount) || 0;
      const existingPaid = confirmPaidBill.paidAmount || 0;
      const totalPaidAfter = existingPaid + paymentAmt;
      const isFullPayment = totalPaidAfter >= newTotal;

      const payload: Record<string, unknown> = {
        billId: confirmPaidBill.id,
        status: isFullPayment ? 'Paid' : 'Partially-Paid',
        paymentAmount: paymentAmt,
        previousReading: parseFloat(payOpeningUnit) || 0,
        currentReading: parseFloat(payEndingUnit) || 0,
        unitsConsumed: pUnitsConsumed,
        ratePerUnit: parseFloat(payRatePerUnit) || 10,
        electricityCharge: pElectricityCharge,
      };

      if (payIsCustomBill) {
        payload.isCustomBill = true;
        payload.customTotal = parseFloat(payCustomTotal) || 0;
      } else {
        payload.isCustomBill = false;
        payload.manualAdjustment = parseFloat(payManualAdjustment) || 0;
        payload.adjustmentReason = payAdjustmentReason.trim();
      }

      const res = await fetch('/api/bills', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed');
        return;
      }

      // Dynamic aging toast message
      const bucket = guestBucketMap[confirmPaidBill.guestId];
      const currentBillRemaining = bucket?.currentBillAmount || 0;
      const previousDueRemaining = bucket?.previousDue || 0;

      if (isFullPayment && previousDueRemaining > 0) {
        toast.success('Bill paid! Surplus applied to Previous Due.');
      } else if (isFullPayment) {
        toast.success('Current Bill marked as paid!');
      } else {
        toast.success(`Payment of ${formatCurrency(paymentAmt)} recorded! Current Bill remaining: ${formatCurrency(newTotal - totalPaidAfter)}`);
      }
      setConfirmPaidOpen(false);
      fetchBills();
    } catch {
      toast.error('Failed to process payment');
    } finally {
      setConfirmPaidSubmitting(false);
    }
  };

  // ---------- Status badge ----------

  const StatusBadge = ({ status }: { status: string }) => {
    if (status === 'Paid') {
      return (
        <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          {t('billing_paid_status')}
        </Badge>
      );
    }
    return (
      <Badge className="bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300 border-red-200 dark:border-red-800 hover:bg-red-100">
        <AlertCircle className="h-3 w-3 mr-1" />
        {status === 'Partially-Paid' ? t('billing_partial') : t('billing_overdue')}
      </Badge>
    );
  };

  // Format live date for display
  const liveDateStr = formatDate(liveDate);

  // ---------- Render ----------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-emerald-900 dark:text-emerald-100">
            {t('billing_management')}
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            {t('billing_dynamic')} &nbsp;|&nbsp; {t('billing_live')}: <span className="font-semibold text-emerald-700 dark:text-emerald-400">{liveDateStr}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={fetchBills}
            variant="outline"
            size="sm"
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {t('billing_refresh')}
          </Button>
        </div>
      </div>

      {/* Summary Bar */}
      {(() => {
        let aggregateCurrentBill = 0;
        let aggregatePreviousDue = 0;
        let aggregateAccruedRent = 0;
        let aggregateTotalAccrued = 0;
        for (const gs of guestSummaryList) {
          aggregateCurrentBill += gs.currentBillAmount;
          aggregatePreviousDue += gs.previousDue;
          aggregateAccruedRent += gs.totalAccruedRent;
          aggregateTotalAccrued += gs.accruedBreakdown?.totalAccrued || gs.totalAccruedRent;
        }
        const aggregateTotalBalance = aggregateCurrentBill + aggregatePreviousDue;

        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card className="border-emerald-200 dark:border-emerald-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 p-2">
                    <Receipt className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('billing_total_billed')}</p>
                    <p className="text-lg font-bold text-emerald-800 dark:text-emerald-200">
                      {formatCurrency(aggregateTotalAccrued)}
                    </p>
                    {aggregateTotalAccrued !== aggregateAccruedRent && (
                      <p className="text-[9px] text-emerald-600/70 dark:text-emerald-400/70 mt-0.5">
                        Rent: {formatCurrency(aggregateAccruedRent)}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-emerald-200 dark:border-emerald-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 p-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('billing_total_paid')}</p>
                    <p className="text-lg font-bold text-emerald-800 dark:text-emerald-200">
                      {formatCurrency(totalPaid)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-red-200 dark:border-red-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-red-50 dark:bg-red-950/40 p-2">
                    <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('billing_current_bill')}</p>
                    <p className="text-lg font-bold text-red-800 dark:text-red-200">
                      {formatCurrency(aggregateCurrentBill)}
                    </p>
                    <p className="text-[10px] text-red-600/70 dark:text-red-400/70 mt-0.5">
                      {t('billing_latest_cycle')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-amber-200 dark:border-amber-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 p-2">
                    <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('billing_previous_due')}</p>
                    <p className="text-lg font-bold text-amber-800 dark:text-amber-200">
                      {formatCurrency(aggregatePreviousDue)}
                    </p>
                    <p className="text-[10px] text-amber-600/70 dark:text-amber-400/70 mt-0.5">
                      {t('billing_older_cycles')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-orange-300 dark:border-orange-800 bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950/30 dark:to-red-950/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-orange-100 dark:bg-orange-950/50 p-2">
                    <DollarSign className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('billing_total_balance')}</p>
                    <p className="text-xl font-extrabold text-red-700 dark:text-red-300">
                      {formatCurrency(aggregateTotalBalance)}
                    </p>
                    <p className="text-[10px] text-orange-600/70 dark:text-orange-400/70 mt-0.5">
                      {dueCount} {t('billing_bills')}{dueCount !== 1 ? 's' : ''} {t('billing_across')} {guestSummaryList.filter(g => g.totalBalance > 0).length} {t(guestSummaryList.filter(g => g.totalBalance > 0).length !== 1 ? 'billing_guests' : 'billing_guest')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* ====== Dynamic Rent Accrual Summary ====== */}
      {(() => {
        const filteredGuests = guestSummaryList.filter((g) => {
          if (g.totalBalance <= 0 && g.totalAccruedRent <= 0) return false;
          if (guestFilter === 'live') return g.guestStatus === 'Live';
          if (guestFilter === 'old') return g.guestStatus === 'Checked-out';
          return true;
        });
        const liveCount = guestSummaryList.filter(g => g.guestStatus === 'Live' && (g.totalBalance > 0 || g.totalAccruedRent > 0)).length;
        const oldCount = guestSummaryList.filter(g => g.guestStatus === 'Checked-out' && (g.totalBalance > 0 || g.totalAccruedRent > 0)).length;
        const totalCount = liveCount + oldCount;

        return (
          <>
            {/* Guest Filter Tabs */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">{t('billing_guests_label')}:</span>
              <div className="flex items-center gap-1">
                <Button
                  variant={guestFilter === 'all' ? 'default' : 'outline'}
                  size="sm"
                  className={`h-7 text-xs px-3 ${guestFilter === 'all' ? 'bg-emerald-600 hover:bg-emerald-700' : 'border-emerald-300 text-emerald-700'}`}
                  onClick={() => setGuestFilter('all')}
                >
                  {t('billing_all')} ({totalCount})
                </Button>
                <Button
                  variant={guestFilter === 'live' ? 'default' : 'outline'}
                  size="sm"
                  className={`h-7 text-xs px-3 ${guestFilter === 'live' ? 'bg-emerald-600 hover:bg-emerald-700' : 'border-emerald-300 text-emerald-700'}`}
                  onClick={() => setGuestFilter('live')}
                >
                  <Users className="h-3 w-3 mr-1" />
                  {t('billing_guests')} ({liveCount})
                </Button>
                <Button
                  variant={guestFilter === 'old' ? 'default' : 'outline'}
                  size="sm"
                  className={`h-7 text-xs px-3 ${guestFilter === 'old' ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'border-amber-300 text-amber-700'}`}
                  onClick={() => setGuestFilter('old')}
                >
                  <Clock className="h-3 w-3 mr-1" />
                  {t('billing_old')} ({oldCount})
                </Button>
              </div>
            </div>

            {filteredGuests.length === 0 ? (
              <Card className="border-dashed border-emerald-200 bg-white/60 dark:bg-gray-900/60">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <div className="mb-3 flex size-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                    <Users className="size-7 text-emerald-400" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">{t('billing_no_guests')}</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">{t('billing_add_rooms')}</p>
                </CardContent>
              </Card>
            ) : (
        <Card className="border-red-200 dark:border-red-800">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-red-800 dark:text-red-300 flex items-center gap-1.5">
              <Calculator className="h-4 w-4" />
              {t('billing_rent_accrual')} {liveDateStr})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-red-50/60 dark:bg-red-950/30 hover:bg-red-50/60 dark:hover:bg-red-950/30">
                    <TableHead className="font-semibold text-red-800 dark:text-red-200">{t('billing_room')}</TableHead>
                    <TableHead className="font-semibold text-red-800 dark:text-red-200">{t('billing_guest_col')}</TableHead>
                    <TableHead className="font-semibold text-red-800 dark:text-red-200">{t('billing_check_in')}</TableHead>
                    <TableHead className="font-semibold text-amber-800 dark:text-amber-200">{t('billing_check_out')}</TableHead>
                    <TableHead className="font-semibold text-red-800 dark:text-red-200 text-right">{t('billing_days')}</TableHead>
                    <TableHead className="font-semibold text-red-800 dark:text-red-200 text-center">{t('billing_calculation')}</TableHead>
                    <TableHead className="font-semibold text-red-800 dark:text-red-200 text-right">{t('billing_accrued_rent')}</TableHead>
                    <TableHead className="font-semibold text-red-800 dark:text-red-200 text-right">{t('billing_paid')}</TableHead>
                    <TableHead className="font-semibold text-red-800 dark:text-red-200 text-right bg-red-50/80 dark:bg-red-950/40">{t('billing_current_bill_col')}</TableHead>
                    <TableHead className="font-semibold text-amber-800 dark:text-amber-200 text-right bg-amber-50/60 dark:bg-amber-950/30">{t('billing_previous_due_col')}</TableHead>
                    <TableHead className="font-semibold text-orange-800 dark:text-orange-200 text-right bg-orange-50/60 dark:bg-orange-950/30">{t('billing_total_balance_col')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGuests.map((gs) => (
                    <TableRow key={gs.guestId} className={gs.totalBalance > 0 ? 'bg-red-50/30 dark:bg-red-950/10' : ''}>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs border-emerald-300 dark:border-emerald-700">
                          {gs.roomNo}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium text-sm">
                        <div className="flex items-center gap-1.5">
                          {getGuestName(gs.guestName, gs.guestNameHindi)}
                          {gs.guestStatus === 'Checked-out' ? (
                            <Badge className="text-[9px] px-1 py-0 bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-800">{t('guest_checked_out').toUpperCase()}</Badge>
                          ) : (
                            <Badge className="text-[9px] px-1 py-0 bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-800">{t('billing_guests').toUpperCase()}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3 inline mr-1 text-amber-500" />
                        {formatDate(gs.checkInDate)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {gs.guestStatus === 'Checked-out' ? (
                          <span className="text-amber-700 dark:text-amber-400">
                            <Calendar className="h-3 w-3 inline mr-1" />
                            {formatDate(gs.checkOutDate)}
                          </span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400 text-[10px]">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex flex-col items-end">
                          <span className="font-semibold text-foreground">{gs.daysStayed}</span>
                          <span className="text-[9px] text-muted-foreground">{t('billing_days_label')}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="inline-flex flex-col items-center">
                          <Badge className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-800">
                            {gs.stayMonths} {t('billing_months')}{gs.stayMonths !== 1 ? 's' : ''}
                          </Badge>
                          <span className="text-[9px] text-muted-foreground mt-0.5">Rent = {formatCurrency(gs.totalAccruedRent)}</span>
                          {gs.accruedBreakdown && (gs.accruedBreakdown.maintenance > 0 || gs.accruedBreakdown.electricity > 0) && (
                            <span className="text-[9px] text-amber-700 dark:text-amber-400">
                              {gs.accruedBreakdown.maintenance > 0 && `+ Maint: ${formatCurrency(gs.accruedBreakdown.maintenance)}`}
                              {gs.accruedBreakdown.electricity > 0 && ` + Elec: ${formatCurrency(gs.accruedBreakdown.electricity)}`}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-sm">
                        <div className="inline-flex flex-col items-end">
                          <span>{formatCurrency(gs.totalAccruedRent)}</span>
                          {gs.accruedBreakdown && (gs.accruedBreakdown.maintenance > 0 || gs.accruedBreakdown.electricity > 0) && (
                            <span className="text-[9px] text-amber-600 dark:text-amber-400">
                              Total: {formatCurrency(gs.accruedBreakdown.totalAccrued)}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-sm text-emerald-700 dark:text-emerald-400">{formatCurrency(gs.totalPaid)}</TableCell>
                      <TableCell className="text-right bg-red-50/40 dark:bg-red-950/15">
                        <div className="inline-flex flex-col items-end">
                          <span className="font-bold text-red-700 dark:text-red-400">{formatCurrency(gs.currentBillAmount)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right bg-amber-50/30 dark:bg-amber-950/10">
                        <div className="inline-flex flex-col items-end">
                          <span className="font-bold text-amber-700 dark:text-amber-400">{formatCurrency(gs.previousDue)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right bg-orange-50/30 dark:bg-orange-950/10">
                        <span className="text-base font-extrabold text-orange-700 dark:text-orange-300">{formatCurrency(gs.totalBalance)}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Detailed breakdown per guest */}
            <div className="mt-4 space-y-3 max-h-72 overflow-y-auto">
              {filteredGuests.filter((g) => g.totalBalance > 0).map((gs) => (
                <div key={gs.guestId} className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{getGuestName(gs.guestName, gs.guestNameHindi)}</span>
                      <Badge variant="outline" className="font-mono text-[10px] border-emerald-300 dark:border-emerald-700">
                        {gs.roomNo}
                      </Badge>
                      {gs.guestStatus === 'Checked-out' ? (
                        <Badge className="text-[9px] px-1 py-0 bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-800">{t('guest_checked_out').toUpperCase()}</Badge>
                      ) : (
                        <Badge className="text-[9px] px-1 py-0 bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-800">{t('billing_guests').toUpperCase()}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Timer className="h-3 w-3" />
                        {gs.daysStayed} {t('billing_days_label')} ({gs.stayMonths} {t('billing_months')}{gs.stayMonths !== 1 ? 's' : ''})
                      </span>
                      <span className="text-muted-foreground">
                        {t('billing_accrued_rent')}: <span className="font-semibold text-foreground">{formatCurrency(gs.totalAccruedRent)}</span>
                      </span>
                      <span className="text-emerald-700 dark:text-emerald-400">
                        {t('billing_paid')}: <span className="font-semibold">{formatCurrency(gs.totalPaid)}</span>
                      </span>
                    </div>
                  </div>
                  {/* Step-by-step Calculation */}
                  <div className="rounded bg-white dark:bg-gray-900 border border-emerald-200 dark:border-emerald-800 px-3 py-2 mb-2 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Calculator className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="font-semibold text-emerald-800 dark:text-emerald-300">Step-by-Step Calculation</span>
                    </div>
                    {(() => {
                      const bd = gs.accruedBreakdown;
                      if (!bd) return null;
                      return (
                        <div className="space-y-0.5 font-mono text-[11px]">
                          {/* Step 1: Rent from bills */}
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground w-5">1.</span>
                            <span className="text-emerald-700 dark:text-emerald-400">Rent (bills):</span>
                            <span className="text-foreground">{gs.billCount} bills = <span className="font-semibold">{formatCurrency(gs.totalRentFromBills)}</span></span>
                          </div>
                          {/* Unbilled rent */}
                          {(bd.unbilledRent || 0) > 0 && (
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground w-5"></span>
                              <span className="text-emerald-600/70 dark:text-emerald-400/70">+ Unbilled:</span>
                              <span className="text-foreground">{Math.max(0, gs.stayMonths - gs.billCount)} months × {formatCurrency(gs.monthlyRent)} = <span className="font-semibold">{formatCurrency(bd.unbilledRent || 0)}</span></span>
                            </div>
                          )}
                          {/* Step 2: Maintenance from bills */}
                          {bd.maintenance > 0 && (
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground w-5">2.</span>
                              <span className="text-amber-700 dark:text-amber-400">Maintenance:</span>
                              <span className="text-foreground">{gs.billCount} bills = {formatCurrency(gs.totalMaintenanceFromBills)}{(bd.unbilledMaintenance || 0) > 0 ? ` + ${Math.max(0, gs.stayMonths - gs.billCount)} × ${formatCurrency(gs.maintenanceCharge)} = ` : ' = '}<span className="font-semibold">{formatCurrency(bd.maintenance)}</span></span>
                            </div>
                          )}
                          {/* Step 3: Electricity */}
                          {bd.electricity > 0 && (
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground w-5">{bd.maintenance > 0 ? '3' : '2'}.</span>
                              <span className="text-yellow-600 dark:text-yellow-400">Electricity:</span>
                              <span className="text-foreground">+ {formatCurrency(bd.electricity)}</span>
                            </div>
                          )}
                          {/* Step 4: Adjustments */}
                          {bd.adjustments !== 0 && (
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground w-5">
                                {(bd.maintenance > 0 ? 1 : 0) + (bd.electricity > 0 ? 1 : 0) + 2}.
                              </span>
                              <span className="text-purple-700 dark:text-purple-400">Adjustment:</span>
                              <span className="text-foreground">{bd.adjustments > 0 ? '+' : ''} {formatCurrency(bd.adjustments)}</span>
                            </div>
                          )}
                          {/* Total Accrued */}
                          <div className="flex items-center gap-1 pt-0.5 border-t border-dashed border-emerald-200 dark:border-emerald-800 mt-0.5">
                            <span className="text-muted-foreground w-5"></span>
                            <span className="text-emerald-800 dark:text-emerald-300 font-semibold">Total Accrued:</span>
                            <span className="text-foreground font-semibold">{formatCurrency(bd.totalAccrued)}</span>
                          </div>
                          {/* Step: Minus Paid */}
                          {bd.totalPaid > 0 && (
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground w-5"></span>
                              <span className="text-teal-700 dark:text-teal-400">Minus Paid:</span>
                              <span className="text-foreground">- {formatCurrency(bd.totalPaid)}</span>
                            </div>
                          )}
                          {/* Final Total Due */}
                          <div className="flex items-center gap-1 pt-0.5 border-t-2 border-red-300 dark:border-red-700 mt-0.5">
                            <span className="text-muted-foreground w-5"></span>
                            <span className="text-red-800 dark:text-red-300 font-bold">Total Due:</span>
                            <span className="text-red-800 dark:text-red-300 font-extrabold text-sm">{formatCurrency(bd.totalDue)}</span>
                          </div>
                        </div>
                      );
                    })()}
                    <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                      <span>{t('billing_check_in')}: <span className="font-semibold text-foreground">{formatDate(gs.checkInDate)}</span></span>
                      <span>|</span>
                      <span>{t('billing_calculation')}: <span className="font-semibold text-foreground">{gs.billingCycleDate}{getOrdinalSuffix(gs.billingCycleDate)}</span></span>
                      <span>|</span>
                      <span>{gs.guestStatus === 'Checked-out' ? (
                        <>{t('guest_checked_out')}: <span className="font-semibold text-amber-700 dark:text-amber-400">{formatDate(gs.checkOutDate)}</span></>
                      ) : (
                        <>{t('billing_live')}: <span className="font-semibold text-emerald-700 dark:text-emerald-400">{liveDateStr}</span></>
                      )}</span>
                    </div>
                  </div>
                  {/* Current Bill / Previous Due / Total Balance bucket bar */}
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <div className="rounded-md bg-red-100 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-2 py-1.5 text-center">
                      <p className="text-[10px] text-red-600 dark:text-red-400 font-medium">{t('billing_current_bill')}</p>
                      <p className="text-sm font-bold text-red-800 dark:text-red-200">{formatCurrency(gs.currentBillAmount)}</p>
                    </div>
                    <div className="rounded-md bg-amber-100 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-2 py-1.5 text-center">
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">{t('billing_previous_due')}</p>
                      <p className="text-sm font-bold text-amber-800 dark:text-amber-200">{formatCurrency(gs.previousDue)}</p>
                    </div>
                    <div className="rounded-md bg-orange-100 dark:bg-orange-950/40 border border-orange-300 dark:border-orange-800 px-2 py-1.5 text-center">
                      <p className="text-[10px] text-orange-600 dark:text-orange-400 font-medium">{t('billing_total_balance')}</p>
                      <p className="text-sm font-extrabold text-orange-800 dark:text-orange-200">{formatCurrency(gs.totalBalance)}</p>
                    </div>
                  </div>
                  {/* Due bills list */}
                  {gs.dueBills.length > 0 && (
                    <div className="space-y-1">
                      {gs.dueBills.sort((a, b) => {
                        if (a.year !== b.year) return b.year - a.year;
                        return b.month - a.month;
                      }).map((db, idx) => (
                        <div key={idx} className={`flex items-center justify-between text-xs rounded px-2 py-1 border ${
                          db.isCurrentBill
                            ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
                            : 'bg-white dark:bg-gray-900 border-red-100 dark:border-red-900'
                        }`}>
                          <div className="flex items-center gap-2">
                            <Badge className={`text-[9px] px-1 py-0 ${
                              db.isCurrentBill
                                ? 'bg-red-200 text-red-800 border-red-300'
                                : db.paidAmount > 0
                                  ? 'bg-amber-100 text-amber-700 border-amber-200'
                                  : 'bg-red-100 text-red-700 border-red-200'
                            }`}>
                              {db.isCurrentBill ? 'CURRENT' : db.paidAmount > 0 ? t('billing_partial').toUpperCase() : t('billing_overdue').toUpperCase()}
                            </Badge>
                            <span className="text-muted-foreground">
                              {formatBillPeriodWithCycleDate(db.month, db.year, db.cycleDate)}
                            </span>
                            {db.paidAmount > 0 && (
                              <span className="text-emerald-600 dark:text-emerald-400">
                                ({formatCurrency(db.paidAmount)} {t('billing_paid').toLowerCase()})
                              </span>
                            )}
                          </div>
                          <span className={`font-semibold ${db.isCurrentBill ? 'text-red-800 dark:text-red-300' : 'text-red-700 dark:text-red-400'}`}>
                            {formatCurrency(db.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
            )}
            </>
        );
      })()}

      {/* Filter Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-emerald-50 dark:bg-emerald-950/40">
          <TabsTrigger value="all" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
            {t('billing_all_bills')} ({bills.length})
          </TabsTrigger>
          <TabsTrigger value="overdue" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
            {t('billing_overdue_tab')} ({dueCount})
          </TabsTrigger>
          <TabsTrigger value="paid" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
            {t('billing_paid_tab')} ({paidCount})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Bills Table */}
      <Card className="border-emerald-200 dark:border-emerald-800">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-16" />
                </div>
              ))}
            </div>
          ) : filteredBills.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Receipt className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-lg font-medium">{t('billing_no_guests')}</p>
              <p className="text-sm">
                {activeTab === 'all' ? t('billing_add_rooms') : `${t('billing_no_guests')}`}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-emerald-50/60 dark:bg-emerald-950/30 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/30">
                    <TableHead className="font-semibold text-emerald-800 dark:text-emerald-200">{t('billing_guest_col')}</TableHead>
                    <TableHead className="font-semibold text-emerald-800 dark:text-emerald-200">{t('billing_room')}</TableHead>
                    <TableHead className="font-semibold text-emerald-800 dark:text-emerald-200">{t("billing_current_bill_col")}</TableHead>
                    <TableHead className="font-semibold text-emerald-800 dark:text-emerald-200 text-right">Rent</TableHead>
                    <TableHead className="font-semibold text-emerald-800 dark:text-emerald-200 text-right">Maint.</TableHead>
                    <TableHead className="font-semibold text-emerald-800 dark:text-emerald-200 text-center">Opening</TableHead>
                    <TableHead className="font-semibold text-emerald-800 dark:text-emerald-200 text-center">Ending</TableHead>
                    <TableHead className="font-semibold text-emerald-800 dark:text-emerald-200 text-center">Units</TableHead>
                    <TableHead className="font-semibold text-emerald-800 dark:text-emerald-200 text-center">Rate</TableHead>
                    <TableHead className="font-semibold text-emerald-800 dark:text-emerald-200 text-right">{t("guest_electricity")}</TableHead>
                    <TableHead className="font-semibold text-emerald-800 dark:text-emerald-200 text-right">Bill Total</TableHead>
                    <TableHead className="font-semibold text-emerald-800 dark:text-emerald-200 text-center">{t('billing_calculation')}</TableHead>
                    <TableHead className="font-semibold text-red-800 dark:text-red-200 text-right">{t("billing_current_bill")}</TableHead>
                    <TableHead className="font-semibold text-amber-800 dark:text-amber-200 text-right bg-amber-50/60 dark:bg-amber-950/30">{t("billing_previous_due")}</TableHead>
                    <TableHead className="font-semibold text-orange-800 dark:text-orange-200 text-right bg-orange-50/60 dark:bg-orange-950/30">{t('billing_total_balance_col')}</TableHead>
                    <TableHead className="font-semibold text-emerald-800 dark:text-emerald-200">Due Date</TableHead>
                    <TableHead className="font-semibold text-emerald-800 dark:text-emerald-200">{t("billing_overdue_tab")}</TableHead>
                    <TableHead className="font-semibold text-emerald-800 dark:text-emerald-200 text-right">{t('billing_edit_bill')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBills.map((bill) => {
                    const bucket = guestBucketMap[bill.guestId];
                    const isPaid = bill.status === 'Paid';
                    const remainingAmount = bill.totalAmount - (bill.paidAmount || 0);
                    const hasPartialPayment = (bill.paidAmount || 0) > 0 && !isPaid;
                    const isCurrentBill = bucket?.isCurrentBill(bill.billingMonth, bill.billingYear) && !isPaid;
                    const currentBillAmt = bucket?.currentBillAmount || 0;
                    const previousDueVal = bucket?.previousDue || 0;
                    const totalBalance = bucket?.totalBalance || 0;
                    const stayMonths = bucket?.stayMonths || 0;
                    const monthlyRent = bucket?.monthlyRent || 0;

                    return (
                      <TableRow key={bill.id} className={`group ${
                        !isPaid ? (isCurrentBill ? 'bg-red-50/50 dark:bg-red-950/15' : 'bg-amber-50/30 dark:bg-amber-950/10') : ''
                      }`}>
                        <TableCell className="font-medium">
                          <div>
                            {getGuestName(bill.guest.name, bill.guest.nameHindi)}
                            {bill.guest.status === 'Checked-out' && (
                              <span className="ml-1 text-[10px] text-muted-foreground">({t("guest_checked_out")})</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs border-emerald-300 dark:border-emerald-700">
                            {bill.room.roomNo}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>
                            <span className="font-medium">
                              {formatBillPeriodWithCycleDate(bill.billingMonth, bill.billingYear, bill.guest.billingCycleDate)}
                            </span>
                            <span className="text-muted-foreground text-[10px] block mt-0.5">
                              <Calendar className="h-2.5 w-2.5 inline mr-0.5" />
                              {t("billing_calculation")}: {bill.guest.billingCycleDate}{getOrdinalSuffix(bill.guest.billingCycleDate)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-sm">{formatCurrency(bill.rentAmount)}</TableCell>
                        <TableCell className="text-right text-sm">{(bill.maintenanceCharge || 0) > 0 ? formatCurrency(bill.maintenanceCharge) : '—'}</TableCell>
                        <TableCell className="text-center text-sm font-mono">
                          <span className="inline-flex items-center gap-1">
                            <Zap className="h-3 w-3 text-amber-500" />
                            {bill.previousReading}
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-sm font-mono">
                          <span className="inline-flex items-center gap-1">
                            <Zap className="h-3 w-3 text-emerald-500" />
                            {bill.currentReading}
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-sm font-mono font-semibold">
                          {bill.unitsConsumed}
                        </TableCell>
                        <TableCell className="text-center text-sm">₹{bill.ratePerUnit}</TableCell>
                        <TableCell className="text-right text-sm">{formatCurrency(bill.electricityCharge)}</TableCell>
                        <TableCell className="text-right font-semibold text-sm">
                          {isPaid ? (
                            <span className="text-emerald-700 dark:text-emerald-400">{formatCurrency(bill.totalAmount)}</span>
                          ) : (
                            <div>
                              <span className="text-foreground">{formatCurrency(bill.totalAmount)}</span>
                              {hasPartialPayment && (
                                <span className="block text-[11px] text-emerald-600 dark:text-emerald-400">
                                  {t('billing_paid')}: {formatCurrency(bill.paidAmount || 0)}
                                </span>
                              )}
                            </div>
                          )}
                        </TableCell>
                        {/* Calculation Column */}
                        <TableCell className="text-center">
                          <div className="inline-flex flex-col items-center">
                            <Badge className="text-[9px] bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-800 px-1.5">
                              {stayMonths}m
                            </Badge>
                            {!isPaid && (
                              <span className="text-[9px] text-muted-foreground mt-0.5">
                                {formatCurrency(bill.rentAmount)}
                                {(bill.maintenanceCharge || 0) > 0 && ` + ${formatCurrency(bill.maintenanceCharge)}M`}
                                {(bill.electricityCharge || 0) > 0 && ` + ${formatCurrency(bill.electricityCharge)}E`}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        {/* Adjusted Current Bill Column */}
                        <TableCell className="text-right text-sm">
                          {isPaid ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">—</span>
                          ) : isCurrentBill ? (
                            <div>
                              <span className="font-bold text-red-700 dark:text-red-400">
                                {formatCurrency(currentBillAmt)}
                              </span>
                              <Badge className="text-[8px] px-1 py-0 mt-0.5 bg-red-100 text-red-700 border-red-200 block w-fit ml-auto">
                                {t('billing_current_bill')}
                              </Badge>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        {/* Adjusted Previous Due Column */}
                        <TableCell className="text-right text-sm bg-amber-50/30 dark:bg-amber-950/10">
                          {isPaid ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">—</span>
                          ) : isCurrentBill ? (
                            previousDueVal > 0 ? (
                              <div className="inline-flex flex-col items-end">
                                <span className="font-bold text-amber-700 dark:text-amber-400">{formatCurrency(previousDueVal)}</span>
                                <span className="text-[9px] text-amber-600/70 dark:text-amber-400/70">{t('billing_older_cycles')}</span>
                              </div>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium text-xs">₹0</span>
                            )
                          ) : !isPaid ? (
                            <span className="font-semibold text-amber-700 dark:text-amber-400">{formatCurrency(remainingAmount)}</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        {/* Total Balance Column */}
                        <TableCell className="text-right text-sm bg-orange-50/40 dark:bg-orange-950/15">
                          {isPaid ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">—</span>
                          ) : isCurrentBill ? (
                            <div className="inline-flex flex-col items-end">
                              <span className="font-extrabold text-orange-700 dark:text-orange-300 text-base">
                                {formatCurrency(totalBalance)}
                              </span>
                              <span className="text-[9px] text-orange-600/70 dark:text-orange-400/70 mt-0.5">
                                {t('billing_total_balance')}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{formatDate(bill.dueDate)}</TableCell>
                        <TableCell><StatusBadge status={bill.status} /></TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button variant="ghost" size="sm" onClick={() => handleDownloadReceipt(bill.id)}
                              disabled={receiptDownloading === bill.id}
                              className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40 h-8 px-2"
                              title={t('billing_download_receipt')}>
                              <FileDown className={`h-3.5 w-3.5 ${receiptDownloading === bill.id ? 'animate-bounce' : ''}`} />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => openEditDialog(bill)}
                              className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40 h-8 px-2"
                              title={t('billing_edit_bill')}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {!isPaid && (
                              <Button variant="ghost" size="sm" onClick={() => openConfirmPaid(bill)}
                                className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40 h-8 px-2"
                                title={t('billing_mark_paid')}>
                                <DollarSign className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ========== MARK PAID DIALOG ========== */}
      <Dialog open={confirmPaidOpen} onOpenChange={setConfirmPaidOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
              <ShieldCheck className="h-5 w-5" />
              {t('billing_mark_paid')}
            </DialogTitle>
            <DialogDescription>
              {t('billing_add_rooms')}
            </DialogDescription>
          </DialogHeader>

          {confirmPaidBill && (
            <div className="space-y-4 py-2">
              {/* Bill Info Card */}
              <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30">
                <CardContent className="p-4 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">{t('billing_guest_col')}</span>
                      <p className="font-medium">{getGuestName(confirmPaidBill.guest.name, confirmPaidBill.guest.nameHindi)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t('billing_room')}</span>
                      <p className="font-medium">{confirmPaidBill.room.roomNo}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Bill Period</span>
                      <p className="font-medium">
                        {formatBillPeriodWithCycleDate(confirmPaidBill.billingMonth, confirmPaidBill.billingYear, confirmPaidBill.guest.billingCycleDate)}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t('billing_overdue_tab')}</span>
                      <p><StatusBadge status={confirmPaidBill.status} /></p>
                    </div>
                  </div>
                  <Separator />
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">{t('guest_rent')}</span>
                      <p className="font-semibold text-emerald-700 dark:text-emerald-400">{formatCurrency(confirmPaidBill.rentAmount)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Maintenance</span>
                      <p className="font-semibold text-orange-700 dark:text-orange-400">{(confirmPaidBill.maintenanceCharge || 0) > 0 ? formatCurrency(confirmPaidBill.maintenanceCharge) : '—'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t('guest_electricity')}</span>
                      <p className="font-semibold text-emerald-700 dark:text-emerald-400">{formatCurrency(confirmPaidBill.electricityCharge)}</p>
                    </div>
                    {(confirmPaidBill.paidAmount || 0) > 0 && (
                      <div>
                        <span className="text-muted-foreground">{t('billing_paid')}</span>
                        <p className="font-semibold text-teal-600 dark:text-teal-400">{formatCurrency(confirmPaidBill.paidAmount || 0)}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Electricity Details */}
              <Card className="border-amber-200 dark:border-amber-800">
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <Zap className="h-4 w-4" />
                    {t('guest_electricity')} Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">{t('guest_opening_unit')}</Label>
                      <Input type="number" value={payOpeningUnit} onChange={(e) => setPayOpeningUnit(e.target.value)} className="h-9 text-sm font-mono" placeholder="0" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">{t('guest_current_unit')}</Label>
                      <Input type="number" value={payEndingUnit} onChange={(e) => setPayEndingUnit(e.target.value)} className="h-9 text-sm font-mono" placeholder="0" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">{t('guest_rate_per_unit')}</Label>
                      <Input type="number" value={payRatePerUnit} onChange={(e) => setPayRatePerUnit(e.target.value)} className="h-9 text-sm font-mono" placeholder="10" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 border border-amber-100 dark:border-amber-900">
                    <div className="flex items-center gap-2 text-xs">
                      <Zap className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                      <span className="text-muted-foreground">{t('guest_units')}: <span className="font-semibold text-foreground">{payUnitsConsumed}</span></span>
                    </div>
                    <div className="text-xs">
                      <span className="text-muted-foreground">{t('guest_charge')}: </span>
                      <span className="font-bold text-amber-700 dark:text-amber-400">{formatCurrency(payElectricityCharge)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Custom Bill Toggle */}
              <Card className="border-emerald-200 dark:border-emerald-800">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Info className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      <Label className="text-sm font-medium">{t('billing_edit_bill')}</Label>
                    </div>
                    <Switch checked={payIsCustomBill} onCheckedChange={setPayIsCustomBill} />
                  </div>
                  {payIsCustomBill ? (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">{t('billing_total_balance_col')}</Label>
                      <Input type="number" value={payCustomTotal} onChange={(e) => setPayCustomTotal(e.target.value)} className="h-9 text-sm font-mono" placeholder="Enter custom total" />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">{t('billing_previous_due')}</Label>
                        <Input type="number" value={payManualAdjustment} onChange={(e) => setPayManualAdjustment(e.target.value)} className="h-9 text-sm font-mono" placeholder="0" />
                      </div>
                      {parseFloat(payManualAdjustment) !== 0 && (
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground">{t('billing_calculation')}</Label>
                          <Textarea value={payAdjustmentReason} onChange={(e) => setPayAdjustmentReason(e.target.value)} className="text-sm min-h-[60px]" placeholder="Reason..." />
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ========== DYNAMIC RENTAL BILLING: Current Bill → Previous Due calculation ========== */}
              {(() => {
                const bucket = guestBucketMap[confirmPaidBill.guestId];
                const monthlyRent = bucket?.monthlyRent || confirmPaidBill.rentAmount;
                const stayMonths = bucket?.stayMonths || 1;
                const daysStayed = bucket?.daysStayed || 0;
                const totalAccruedRent = bucket?.totalAccruedRent || monthlyRent;

                // Dynamic accrual-based values (from guestBucketMap)
                const currentBillNow = bucket?.currentBillAmount || 0;
                const previousDueNow = bucket?.previousDue || 0;
                const totalBalanceNow = bucket?.totalBalance || 0;
                const paymentAmt = parseFloat(payAmount) || 0;

                // FIFO Payment Allocation for preview
                // Step 1: Payment goes to Current Bill first
                const paidToCurrent = Math.min(paymentAmt, currentBillNow);
                // Step 2: Surplus goes to Previous Due
                const surplusToPrevious = Math.max(0, paymentAmt - currentBillNow);

                // After payment
                const currentBillAfter = Math.max(0, currentBillNow - paidToCurrent);
                const previousDueAfter = Math.max(0, previousDueNow - surplusToPrevious);
                const totalBalanceAfter = currentBillAfter + previousDueAfter;

                return (
                  <>
                    {/* Dynamic Rent Accrual Card */}
                    <Card className="border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-950/40">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Calculator className="h-5 w-5 text-red-600 dark:text-red-400" />
                            <span className="text-sm font-semibold text-red-800 dark:text-red-200">{t('billing_rent_accrual')}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Timer className="h-3 w-3" />
                              {daysStayed} days ({stayMonths}m)
                            </span>
                            <span className="text-muted-foreground">|</span>
                            <span className="text-muted-foreground">{bucket?.guestStatus === 'Checked-out' ? (
                              <>{t('guest_checked_out')}: <span className="font-semibold text-amber-700 dark:text-amber-400">{formatDate(bucket?.checkOutDate)}</span></>
                            ) : (
                              <>{t('billing_live')}: <span className="font-semibold text-emerald-700 dark:text-emerald-400">{liveDateStr}</span></>
                            )}</span>
                          </div>
                        </div>

                        {/* Formula display - Step by step */}
                        {(() => {
                          const guestGs = guestSummaryList.find(g => g.guestId === confirmPaidBill.guestId);
                          const bd = guestGs?.accruedBreakdown;
                          if (!bd) return (
                            <div className="rounded-md bg-white dark:bg-gray-900 border border-emerald-200 dark:border-emerald-800 p-2 text-center">
                              <span className="text-xs text-emerald-800 dark:text-emerald-300 font-medium">
                                {formatCurrency(totalAccruedRent)} {t('billing_accrued_rent').toLowerCase()}
                              </span>
                            </div>
                          );
                          return (
                            <div className="rounded-md bg-white dark:bg-gray-900 border border-emerald-200 dark:border-emerald-800 p-2 text-xs space-y-0.5 font-mono">
                              <div className="flex items-center gap-1">
                                <span className="text-emerald-700 dark:text-emerald-400">Rent:</span>
                                <span className="text-foreground">{formatCurrency(bd.rent)} (from bills)</span>
                              </div>
                              {bd.maintenance > 0 && (
                                <div className="flex items-center gap-1">
                                  <span className="text-amber-700 dark:text-amber-400">Maintenance:</span>
                                  <span className="text-foreground">+ {formatCurrency(bd.maintenance)}</span>
                                </div>
                              )}
                              {bd.electricity > 0 && (
                                <div className="flex items-center gap-1">
                                  <span className="text-yellow-600 dark:text-yellow-400">Electricity:</span>
                                  <span className="text-foreground">+ {formatCurrency(bd.electricity)}</span>
                                </div>
                              )}
                              {bd.adjustments !== 0 && (
                                <div className="flex items-center gap-1">
                                  <span className="text-purple-700 dark:text-purple-400">Adjustment:</span>
                                  <span className="text-foreground">{bd.adjustments > 0 ? '+' : ''} {formatCurrency(bd.adjustments)}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-1 pt-0.5 border-t border-dashed border-emerald-200 dark:border-emerald-800">
                                <span className="text-emerald-800 dark:text-emerald-300 font-semibold">Total Accrued:</span>
                                <span className="text-foreground font-semibold">{formatCurrency(bd.totalAccrued)}</span>
                              </div>
                              {bd.totalPaid > 0 && (
                                <div className="flex items-center gap-1">
                                  <span className="text-teal-700 dark:text-teal-400">Minus Paid:</span>
                                  <span className="text-foreground">- {formatCurrency(bd.totalPaid)}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-1 pt-0.5 border-t-2 border-red-300 dark:border-red-700">
                                <span className="text-red-800 dark:text-red-300 font-bold">Total Due:</span>
                                <span className="text-red-800 dark:text-red-300 font-extrabold">{formatCurrency(bd.totalDue)}</span>
                              </div>
                            </div>
                          );
                        })()}

                        <div className="grid grid-cols-3 gap-3">
                          <div className="rounded-md bg-white dark:bg-gray-900 border border-red-100 dark:border-red-900 p-2">
                            <p className="text-[10px] text-muted-foreground">{t('billing_current_bill')} ({t('billing_latest_cycle')})</p>
                            <p className="text-sm font-bold text-red-800 dark:text-red-200">{formatCurrency(currentBillNow)}</p>
                          </div>
                          <div className="rounded-md bg-white dark:bg-gray-900 border border-amber-100 dark:border-amber-900 p-2">
                            <p className="text-[10px] text-muted-foreground">{t('billing_previous_due')} ({t('billing_older_cycles')})</p>
                            <p className="text-sm font-bold text-amber-800 dark:text-amber-200">{formatCurrency(previousDueNow)}</p>
                          </div>
                          <div className="rounded-md bg-white dark:bg-gray-900 border border-emerald-100 dark:border-emerald-900 p-2">
                            <p className="text-[10px] text-muted-foreground">{t('billing_total_paid')}</p>
                            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(guestSummaryList.find(g => g.guestId === confirmPaidBill.guestId)?.accruedBreakdown?.totalPaid ?? (totalAccruedRent - totalBalanceNow))}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between bg-red-100 dark:bg-red-950/50 rounded-md p-2 border border-red-200 dark:border-red-800">
                          <span className="text-xs font-semibold text-red-800 dark:text-red-200">Total Due (before payment)</span>
                          <span className="text-base font-bold text-red-800 dark:text-red-200">{formatCurrency(totalBalanceNow)}</span>
                        </div>
                        {(confirmPaidBill.paidAmount || 0) > 0 && (
                          <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-red-200 dark:border-red-800 pt-2">
                            <span>{t("billing_total_billed")}: {formatCurrency(payPreviewTotal)}</span>
                            <span className="font-semibold text-emerald-700 dark:text-emerald-400">{t('billing_paid')}: {formatCurrency(confirmPaidBill.paidAmount || 0)}</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Payment Amount */}
                    <Card className="border-teal-200 dark:border-teal-800">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                          <Label className="text-sm font-semibold text-teal-800 dark:text-teal-200">{t('pay_amount')}</Label>
                        </div>
                        <div className="space-y-1.5">
                          <Input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                            className="h-10 text-lg font-bold font-mono border-teal-300 dark:border-teal-700 focus-visible:ring-teal-500" placeholder="0" />
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{t('billing_current_bill')}: {formatCurrency(currentBillNow)}</span>
                            <span className="text-muted-foreground">
                              {paymentAmt >= currentBillNow + previousDueNow ? (
                                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{t("billing_paid_status")}</span>
                              ) : paymentAmt >= currentBillNow ? (
                                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{t('billing_current_bill')} + {t('billing_previous_due')}</span>
                              ) : (
                                <span className="text-teal-600 dark:text-teal-400 font-semibold">{t('billing_partial')} {t('billing_current_bill')}</span>
                              )}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Priority-based calculation preview */}
                    {paymentAmt > 0 && (
                      <Card className={`border-2 ${
                        surplusToPrevious > 0
                          ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/30'
                          : 'border-orange-300 dark:border-orange-700 bg-orange-50/60 dark:bg-orange-950/30'
                      }`}>
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-center gap-2 mb-2">
                            {surplusToPrevious > 0 ? (
                              <TrendingDown className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <DollarSign className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                            )}
                            <span className="text-xs font-bold uppercase tracking-wide">
                              {t("billing_calculation")} (FIFO: {t('billing_current_bill')} \u2192 {t('billing_previous_due')})
                            </span>
                          </div>
                          <div className="space-y-1.5 text-xs">
                            <div className="flex justify-between bg-white dark:bg-gray-900 rounded px-2 py-1.5 border border-red-100 dark:border-red-900">
                              <span className="text-red-700 dark:text-red-300 font-medium">① {t("billing_current_bill")}</span>
                              <span className="font-bold text-red-800 dark:text-red-200">
                                {formatCurrency(currentBillNow)} − {formatCurrency(paidToCurrent)} = {formatCurrency(currentBillAfter)}
                              </span>
                            </div>
                            {surplusToPrevious > 0 && (
                              <div className="flex justify-between bg-white dark:bg-gray-900 rounded px-2 py-1.5 border border-amber-100 dark:border-amber-900">
                                <span className="text-amber-700 dark:text-amber-300 font-medium">② {t("billing_previous_due")}</span>
                                <span className="font-bold text-amber-800 dark:text-amber-200">
                                  {formatCurrency(previousDueNow)} − {formatCurrency(surplusToPrevious)} = {formatCurrency(previousDueAfter)}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between bg-orange-100 dark:bg-orange-950/40 rounded px-2 py-1.5 border border-orange-200 dark:border-orange-800 mt-1">
                              <span className="text-orange-800 dark:text-orange-200 font-bold">{t("billing_total_balance")}</span>
                              <span className="font-extrabold text-orange-800 dark:text-orange-200 text-sm">
                                {formatCurrency(currentBillAfter)} + {formatCurrency(previousDueAfter)} = {formatCurrency(totalBalanceAfter)}
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </>
                );
              })()}

              {/* Check-in date stamp */}
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
                <Calendar className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <div className="text-xs">
                  <span className="text-muted-foreground">{t("billing_check_in")}: </span>
                  <span className="font-semibold text-amber-800 dark:text-amber-300">{formatDate(confirmPaidBill.guest.checkInDate)}</span>
                  <span className="text-muted-foreground ml-2">| {t("billing_calculation")}: </span>
                  <span className="font-semibold text-amber-800 dark:text-amber-300">{confirmPaidBill.guest.billingCycleDate}{getOrdinalSuffix(confirmPaidBill.guest.billingCycleDate)}</span>
                  <span className="text-muted-foreground ml-2">| {t("billing_live")}: </span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">{liveDateStr}</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmPaidOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleConfirmPaid} disabled={confirmPaidSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {confirmPaidSubmitting ? (
                <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />{t("loading")}</>
              ) : (
                <><CheckCircle2 className="mr-2 h-4 w-4" />{t("billing_mark_paid")}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== EDIT BILL DIALOG ========== */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
              <Pencil className="h-5 w-5" />
              {t("billing_edit_bill")}
            </DialogTitle>
            <DialogDescription>Modify bill amounts, apply adjustments, or set a custom total</DialogDescription>
          </DialogHeader>

          {editBill && (
            <div className="space-y-4 py-2">
              <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30">
                <CardContent className="p-4 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-muted-foreground">Guest</span><p className="font-medium">{getGuestName(editBill.guest.name, editBill.guest.nameHindi)}</p></div>
                    <div><span className="text-muted-foreground">Room</span><p className="font-medium">{editBill.room.roomNo}</p></div>
                    <div><span className="text-muted-foreground">Period</span><p className="font-medium">{formatBillPeriodWithCycleDate(editBill.billingMonth, editBill.billingYear, editBill.guest.billingCycleDate)}</p></div>
                    <div><span className="text-muted-foreground">{t("billing_overdue_tab")}</span><p><StatusBadge status={editBill.status} /></p></div>
                  </div>
                  <Separator />
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div><span className="text-muted-foreground">Rent Amount</span><p className="font-semibold text-emerald-700 dark:text-emerald-400">{formatCurrency(editBill.rentAmount)}</p></div>
                    <div><span className="text-muted-foreground">Maintenance</span><p className="font-semibold text-orange-700 dark:text-orange-400">{(editBill.maintenanceCharge || 0) > 0 ? formatCurrency(editBill.maintenanceCharge) : '—'}</p></div>
                    <div><span className="text-muted-foreground">{t("guest_electricity")}</span><p className="font-semibold text-emerald-700 dark:text-emerald-400">{formatCurrency(editBill.electricityCharge)}</p></div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-amber-200 dark:border-amber-800">
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <Zap className="h-4 w-4" />Electricity Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Opening Unit</Label>
                      <Input type="number" value={editOpeningUnit} onChange={(e) => setEditOpeningUnit(e.target.value)} className="h-9 text-sm font-mono" placeholder="0" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">{t('guest_current_unit')}</Label>
                      <Input type="number" value={editEndingUnit} onChange={(e) => setEditEndingUnit(e.target.value)} className="h-9 text-sm font-mono" placeholder="0" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">{t('guest_rate_per_unit')}</Label>
                      <Input type="number" value={editRatePerUnit} onChange={(e) => setEditRatePerUnit(e.target.value)} className="h-9 text-sm font-mono" placeholder="10" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 border border-amber-100 dark:border-amber-900">
                    <div className="flex items-center gap-2 text-xs">
                      <Zap className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                      <span className="text-muted-foreground">{t("guest_units")}: <span className="font-semibold text-foreground">{editUnitsConsumed}</span></span>
                    </div>
                    <div className="text-xs">
                      <span className="text-muted-foreground">{t('guest_charge')}: </span>
                      <span className="font-bold text-amber-700 dark:text-amber-400">{formatCurrency(editElectricityCharge)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-emerald-200 dark:border-emerald-800">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Info className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      <Label className="text-sm font-medium">{t('billing_edit_bill')}</Label>
                    </div>
                    <Switch checked={isCustomBill} onCheckedChange={setIsCustomBill} />
                  </div>
                  {isCustomBill ? (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">{t('billing_total_balance_col')}</Label>
                      <Input type="number" value={customTotal} onChange={(e) => setCustomTotal(e.target.value)} className="h-9 text-sm font-mono" placeholder="Enter custom total" />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">{t('billing_previous_due')}</Label>
                        <Input type="number" value={manualAdjustment} onChange={(e) => setManualAdjustment(e.target.value)} className="h-9 text-sm font-mono" placeholder="0" />
                      </div>
                      {parseFloat(manualAdjustment) !== 0 && (
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground">{t('billing_calculation')}</Label>
                          <Textarea value={adjustmentReason} onChange={(e) => setAdjustmentReason(e.target.value)} className="text-sm min-h-[60px]" placeholder="Reason..." />
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-emerald-300 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/40">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Preview Total</span>
                    </div>
                    <span className="text-xl font-bold text-emerald-800 dark:text-emerald-200">{formatCurrency(previewTotal)}</span>
                  </div>
                  {!isCustomBill && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      {t("guest_rent")} {formatCurrency(editBill.rentAmount)}{(editBill.maintenanceCharge || 0) > 0 && ` + Maint ${formatCurrency(editBill.maintenanceCharge)}`} + {t("guest_electricity")} {formatCurrency(editElectricityCharge)}
                      {parseFloat(manualAdjustment) ? ` + Adj ${formatCurrency(parseFloat(manualAdjustment))}` : ''}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleEditSubmit} disabled={editSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {editSubmitting ? (
                <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />{t("saving")}</>
              ) : (
                <><CheckCircle2 className="mr-2 h-4 w-4" />Save Changes</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
