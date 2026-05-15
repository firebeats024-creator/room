import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getDateComponents } from '@/lib/billing-utils';

// POST /api/bills/custom-payment - Distribute a custom payment across unpaid bills (FIFO)
// Oldest bills get paid first. Partial payments supported.
// Auto-generates missing bills for the guest before processing payment.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { guestId, paymentAmount } = body;

    if (!guestId) {
      return NextResponse.json(
        { error: 'Guest ID is required' },
        { status: 400 }
      );
    }

    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: 'Payment amount must be greater than 0' },
        { status: 400 }
      );
    }

    // Fetch the guest with room and existing bills
    const guest = await db.guest.findUnique({
      where: { id: guestId },
      include: {
        room: true,
        bills: {
          select: { billingMonth: true, billingYear: true },
        },
      },
    });

    if (!guest || guest.status !== 'Live') {
      return NextResponse.json(
        { error: 'Guest not found or not active' },
        { status: 404 }
      );
    }

    // ─── AUTO-GENERATE MISSING BILLS ───
    // Same logic as /api/bills/generate but for this specific guest
    const todayParts = getDateComponents(new Date());
    const currentMonth = todayParts.month;
    const currentYear = todayParts.year;
    const currentDay = todayParts.day;
    const billingCycleDate = guest.billingCycleDate;
    const monthlyRent = guest.room.monthlyRent;

    // Determine latest billable month using +1 Day Rule
    let latestBillingMonth: number;
    let latestBillingYear: number;

    if (currentDay > billingCycleDate) {
      latestBillingMonth = currentMonth;
      latestBillingYear = currentYear;
    } else {
      latestBillingMonth = currentMonth - 1;
      latestBillingYear = currentYear;
      if (latestBillingMonth === 0) {
        latestBillingMonth = 12;
        latestBillingYear--;
      }
    }

    // Generate missing bills from check-in month to latest billing month
    const checkInParts = getDateComponents(guest.checkInDate);
    let iterMonth = checkInParts.month;
    let iterYear = checkInParts.year;
    let billsGenerated = 0;

    while (
      iterYear < latestBillingYear ||
      (iterYear === latestBillingYear && iterMonth <= latestBillingMonth)
    ) {
      const billExists = guest.bills.some(
        (b) => b.billingMonth === iterMonth && b.billingYear === iterYear
      );

      if (!billExists) {
        // Calculate due date: billingCycleDate of the next month
        let dueMonth = iterMonth + 1;
        let dueYear = iterYear;
        if (dueMonth > 12) {
          dueMonth = 1;
          dueYear++;
        }
        const maxDayInDueMonth = new Date(dueYear, dueMonth, 0).getDate();
        const effectiveDueDay = Math.min(billingCycleDate, maxDayInDueMonth);
        const dueDate = new Date(dueYear, dueMonth - 1, effectiveDueDay);

        await db.bill.create({
          data: {
            guestId: guest.id,
            roomId: guest.roomId,
            billingMonth: iterMonth,
            billingYear: iterYear,
            rentAmount: monthlyRent,
            electricityCharge: 0,
            previousReading: 0,
            currentReading: 0,
            unitsConsumed: 0,
            ratePerUnit: 10,
            minChargePolicy: 'FULL_MONTH',
            manualAdjustment: 0,
            adjustmentReason: '',
            isCustomBill: false,
            totalAmount: monthlyRent,
            dueDate,
            status: 'Unpaid',
          },
        });

        billsGenerated++;
      }

      iterMonth++;
      if (iterMonth > 12) {
        iterMonth = 1;
        iterYear++;
      }
    }

    // Also mark any Unpaid bills past due date as Overdue
    const todayForOverdue = new Date();
    const overdueBills = await db.bill.findMany({
      where: {
        guestId,
        status: 'Unpaid',
        dueDate: { lt: todayForOverdue },
      },
    });
    for (const bill of overdueBills) {
      await db.bill.update({
        where: { id: bill.id },
        data: { status: 'Overdue' },
      });
    }

    // ─── FIND ALL UNPAID BILLS (FIFO ORDER) ───
    const unpaidBills = await db.bill.findMany({
      where: {
        guestId,
        status: { in: ['Unpaid', 'Overdue', 'Partially-Paid'] },
      },
      orderBy: [
        { billingYear: 'asc' },
        { billingMonth: 'asc' },
      ],
    });

    if (unpaidBills.length === 0) {
      return NextResponse.json(
        { error: 'No outstanding dues for this guest' },
        { status: 400 }
      );
    }

    // Calculate total outstanding
    const totalOutstanding = unpaidBills.reduce(
      (sum, b) => sum + (b.totalAmount - (b.paidAmount || 0)),
      0
    );

    // Cap payment at total outstanding
    const effectivePayment = Math.min(amount, totalOutstanding);
    let remaining = effectivePayment;
    const paymentBreakdown: {
      billId: string;
      billingMonth: number;
      billingYear: number;
      amountAllocated: number;
      previousRemaining: number;
      newRemaining: number;
      newStatus: string;
    }[] = [];

    // Distribute payment FIFO — oldest bills first
    for (const bill of unpaidBills) {
      if (remaining <= 0) break;

      const billRemaining = bill.totalAmount - (bill.paidAmount || 0);
      if (billRemaining <= 0) continue;

      const paymentForThisBill = Math.min(remaining, billRemaining);
      const newPaidAmount = (bill.paidAmount || 0) + paymentForThisBill;
      const isNowPaid = newPaidAmount >= bill.totalAmount;

      await db.bill.update({
        where: { id: bill.id },
        data: {
          paidAmount: isNowPaid ? bill.totalAmount : newPaidAmount,
          status: isNowPaid ? 'Paid' : 'Partially-Paid',
          paidDate: isNowPaid ? new Date() : undefined,
        },
      });

      paymentBreakdown.push({
        billId: bill.id,
        billingMonth: bill.billingMonth,
        billingYear: bill.billingYear,
        amountAllocated: paymentForThisBill,
        previousRemaining: billRemaining,
        newRemaining: billRemaining - paymentForThisBill,
        newStatus: isNowPaid ? 'Paid' : 'Partially-Paid',
      });

      remaining -= paymentForThisBill;
    }

    return NextResponse.json({
      message: 'Custom payment processed successfully',
      totalPayment: effectivePayment,
      totalOutstanding,
      remainingAfterPayment: totalOutstanding - effectivePayment,
      billsGenerated,
      paymentBreakdown,
    });
  } catch (error) {
    console.error('Error processing custom payment:', error);
    return NextResponse.json(
      { error: 'Failed to process custom payment' },
      { status: 500 }
    );
  }
}
