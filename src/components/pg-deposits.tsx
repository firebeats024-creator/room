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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  ShieldCheck, RefreshCw, ArrowRightLeft, AlertTriangle, Info,
  CheckCircle2, Clock, DollarSign, Shield, Home, Receipt,
} from 'lucide-react';
import { toast } from 'sonner';
import { getDateComponents } from '@/lib/billing-utils';

// ---------- Types ----------

interface DepositGuest {
  id: string;
  name: string;
  phone: string;
  status: string;
  room: {
    id: string;
    roomNo: string;
    floor: number;
    type: string;
  };
  bills: {
    id: string;
    totalAmount: number;
    status: string;
  }[];
}

interface Deposit {
  id: string;
  guestId: string;
  amount: number;
  status: string;
  deductedAmount: number;
  refundDate: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  guest: DepositGuest;
}

// ---------- Helpers ----------

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const { year, month, day } = getDateComponents(dateStr);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

// ---------- Component ----------

export default function PgDeposits() {
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);

  // Process refund dialog
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundDeposit, setRefundDeposit] = useState<Deposit | null>(null);
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [deductionAmount, setDeductionAmount] = useState('');
  const [refundNotes, setRefundNotes] = useState('');

  // ---------- Data fetching ----------

  const fetchDeposits = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/deposits');
      if (!res.ok) throw new Error('Failed to fetch deposits');
      const data = await res.json();
      setDeposits(data);
    } catch {
      toast.error('Failed to fetch deposits');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDeposits();
  }, [fetchDeposits]);

  // ---------- Summary calculations ----------

  const totalHeld = deposits
    .filter((d) => d.status === 'Held')
    .reduce((sum, d) => sum + d.amount, 0);
  const totalRefunded = deposits
    .filter((d) => d.status === 'Refunded' || d.status === 'Partially-Refunded')
    .reduce((sum, d) => sum + (d.amount - d.deductedAmount), 0);
  const activeDepositsCount = deposits.filter((d) => d.status === 'Held').length;

  // ---------- Refund calculations ----------

  const pendingBillsTotal = refundDeposit
    ? refundDeposit.guest.bills
        .filter((b) => b.status !== 'Paid')
        .reduce((sum, b) => sum + b.totalAmount, 0)
    : 0;

  const deduction = parseFloat(deductionAmount) || 0;
  const refundAmount = refundDeposit ? refundDeposit.amount - deduction : 0;

  // ---------- Open refund dialog ----------

  const openRefundDialog = (deposit: Deposit) => {
    setRefundDeposit(deposit);
    setDeductionAmount('');
    setRefundNotes('');
    setRefundOpen(true);
  };

  // ---------- Handle refund actions ----------

  const handleRefund = async (action: 'full-refund' | 'partial-refund' | 'adjust-against-bills') => {
    if (!refundDeposit) return;

    try {
      setRefundSubmitting(true);
      const payload: Record<string, unknown> = {
        depositId: refundDeposit.id,
        action,
        notes: refundNotes.trim(),
      };

      if (action === 'partial-refund') {
        payload.deductionAmount = parseFloat(deductionAmount) || 0;
      }

      const res = await fetch('/api/deposits', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to process refund');
        return;
      }

      toast.success(data.message || 'Deposit processed successfully');
      setRefundOpen(false);
      fetchDeposits();
    } catch {
      toast.error('Failed to process refund');
    } finally {
      setRefundSubmitting(false);
    }
  };

  // ---------- Status badge ----------

  const DepositStatusBadge = ({ status }: { status: string }) => {
    switch (status) {
      case 'Held':
        return (
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100">
            <Clock className="h-3 w-3 mr-1" />
            Held
          </Badge>
        );
      case 'Refunded':
        return (
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Refunded
          </Badge>
        );
      case 'Partially-Refunded':
        return (
          <Badge className="bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300 border-teal-200 dark:border-teal-800 hover:bg-teal-100">
            <ArrowRightLeft className="h-3 w-3 mr-1" />
            Partially Refunded
          </Badge>
        );
      case 'Adjusted':
        return (
          <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 border-purple-200 dark:border-purple-800 hover:bg-purple-100">
            <ArrowRightLeft className="h-3 w-3 mr-1" />
            Adjusted
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // ---------- Render ----------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-emerald-900 dark:text-emerald-100">
            Security Deposits
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Track and manage guest security deposits and refunds
          </p>
        </div>
        <Button
          onClick={fetchDeposits}
          variant="outline"
          size="sm"
          disabled={loading}
          className="gap-1.5"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-emerald-200 dark:border-emerald-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 p-2">
                <Shield className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Deposits Held</p>
                <p className="text-lg font-bold text-emerald-800 dark:text-emerald-200">
                  {formatCurrency(totalHeld)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-teal-200 dark:border-teal-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-teal-50 dark:bg-teal-950/40 p-2">
                <DollarSign className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Refunded</p>
                <p className="text-lg font-bold text-teal-800 dark:text-teal-200">
                  {formatCurrency(totalRefunded)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 dark:border-amber-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 p-2">
                <ShieldCheck className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Active Deposits</p>
                <p className="text-lg font-bold text-amber-800 dark:text-amber-200">
                  {activeDepositsCount} deposit{activeDepositsCount !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Deposits Table */}
      <Card className="border-emerald-200 dark:border-emerald-800">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-20" />
                </div>
              ))}
            </div>
          ) : deposits.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <ShieldCheck className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-lg font-medium">No deposits found</p>
              <p className="text-sm">Deposits will appear when guests are checked in</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-emerald-50/60 dark:bg-emerald-950/30 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/30">
                    <TableHead className="font-semibold text-emerald-800 dark:text-emerald-200">Guest Name</TableHead>
                    <TableHead className="font-semibold text-emerald-800 dark:text-emerald-200">Room No</TableHead>
                    <TableHead className="font-semibold text-emerald-800 dark:text-emerald-200 text-right">Deposit Amount</TableHead>
                    <TableHead className="font-semibold text-emerald-800 dark:text-emerald-200">Status</TableHead>
                    <TableHead className="font-semibold text-emerald-800 dark:text-emerald-200 text-right">Deducted</TableHead>
                    <TableHead className="font-semibold text-emerald-800 dark:text-emerald-200">Refund Date</TableHead>
                    <TableHead className="font-semibold text-emerald-800 dark:text-emerald-200 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deposits.map((deposit) => (
                    <TableRow key={deposit.id} className="group">
                      <TableCell className="font-medium">{deposit.guest.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs border-emerald-300 dark:border-emerald-700">
                          {deposit.guest.room?.roomNo || '—'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-sm">
                        {formatCurrency(deposit.amount)}
                      </TableCell>
                      <TableCell>
                        <DepositStatusBadge status={deposit.status} />
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {deposit.deductedAmount > 0 ? (
                          <span className="text-red-600 dark:text-red-400">
                            {formatCurrency(deposit.deductedAmount)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(deposit.refundDate)}
                      </TableCell>
                      <TableCell className="text-right">
                        {deposit.status === 'Held' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openRefundDialog(deposit)}
                            className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40 h-8 px-2"
                            title="Process Refund"
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5 mr-1" />
                            <span className="hidden sm:inline">Refund</span>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ========== PROCESS REFUND DIALOG ========== */}
      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
              <ArrowRightLeft className="h-5 w-5" />
              Process Refund
            </DialogTitle>
            <DialogDescription>
              Review deposit details and process a refund
            </DialogDescription>
          </DialogHeader>

          {refundDeposit && (
            <div className="space-y-4 py-2">
              {/* Guest & Deposit Info */}
              <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2 text-lg font-semibold">
                    {refundDeposit.guest.name}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Home className="h-3.5 w-3.5" />
                      Room {refundDeposit.guest.room?.roomNo || '—'}
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Shield className="h-3.5 w-3.5" />
                      Deposit: {formatCurrency(refundDeposit.amount)}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Pending Bills Warning */}
              {pendingBillsTotal > 0 && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                      Pending Bills: {formatCurrency(pendingBillsTotal)}
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                      This guest has unpaid bills. Consider &quot;Adjust Against Bills&quot; to settle dues from the deposit.
                    </p>
                  </div>
                </div>
              )}

              {/* Deduction Amount */}
              <div className="space-y-2">
                <Label htmlFor="deduction-amount">Deduction Amount (₹)</Label>
                <Input
                  id="deduction-amount"
                  type="number"
                  placeholder="Amount to deduct from deposit"
                  value={deductionAmount}
                  onChange={(e) => setDeductionAmount(e.target.value)}
                  min={0}
                  max={refundDeposit.amount}
                />
                <p className="text-xs text-muted-foreground">
                  Amount to deduct before refund (0 for full refund)
                </p>
              </div>

              {/* Refund Preview */}
              <Card className="border-emerald-200 dark:border-emerald-800">
                <CardContent className="p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Deposit Amount</span>
                    <span className="font-medium">{formatCurrency(refundDeposit.amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Deduction</span>
                    <span className="font-medium text-red-600 dark:text-red-400">
                      -{formatCurrency(deduction)}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-semibold text-emerald-800 dark:text-emerald-200">
                    <span>Refund Amount</span>
                    <span>{formatCurrency(Math.max(0, refundAmount))}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="refund-notes">Notes</Label>
                <Textarea
                  id="refund-notes"
                  placeholder="Reason for deduction or refund notes..."
                  value={refundNotes}
                  onChange={(e) => setRefundNotes(e.target.value)}
                  rows={2}
                />
              </div>

              <Separator />

              {/* Action Buttons */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Choose refund action:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Button
                    onClick={() => handleRefund('full-refund')}
                    disabled={refundSubmitting}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white w-full"
                  >
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />
                    Full Refund
                  </Button>
                  <Button
                    onClick={() => handleRefund('partial-refund')}
                    disabled={refundSubmitting || deduction <= 0}
                    className="bg-teal-600 hover:bg-teal-700 text-white w-full"
                  >
                    <ArrowRightLeft className="mr-1.5 h-4 w-4" />
                    Partial Refund
                  </Button>
                  <Button
                    onClick={() => handleRefund('adjust-against-bills')}
                    disabled={refundSubmitting || pendingBillsTotal <= 0}
                    className="bg-purple-600 hover:bg-purple-700 text-white w-full"
                  >
                    <Receipt className="mr-1.5 h-4 w-4" />
                    Adjust Bills
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {pendingBillsTotal > 0
                    ? `Adjust Against Bills will settle ${formatCurrency(pendingBillsTotal)} in unpaid bills from the deposit`
                    : 'No pending bills to adjust against'}
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundOpen(false)} disabled={refundSubmitting}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
