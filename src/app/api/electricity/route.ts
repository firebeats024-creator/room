import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getDateComponents } from '@/lib/billing-utils';

// GET /api/electricity?guestId=xxx - Get electricity readings for a guest
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const guestId = searchParams.get('guestId');

    if (!guestId) {
      return NextResponse.json(
        { error: 'guestId query parameter is required' },
        { status: 400 }
      );
    }

    const readings = await db.electricityReading.findMany({
      where: { guestId },
      orderBy: { readingDate: 'desc' },
    });

    return NextResponse.json(readings);
  } catch (error) {
    console.error('Error fetching electricity readings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch electricity readings' },
      { status: 500 }
    );
  }
}

// POST /api/electricity - Create a new electricity reading
// Also updates the current billing period's bill with the electricity charge
// The "previous reading" for the current bill = the opening reading of the billing period
// The "current reading" = the new meter reading just entered
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { guestId, reading, readingDate } = body;

    if (!guestId || reading === undefined || reading === null) {
      return NextResponse.json(
        { error: 'guestId and reading are required' },
        { status: 400 }
      );
    }

    const parsedReading = parseFloat(reading);
    if (isNaN(parsedReading) || parsedReading < 0) {
      return NextResponse.json(
        { error: 'Reading must be a valid non-negative number' },
        { status: 400 }
      );
    }

    // Verify guest exists and get room info
    const guest = await db.guest.findUnique({
      where: { id: guestId },
      include: { room: true, bills: { orderBy: [{ billingYear: 'asc' }, { billingMonth: 'asc' }] } },
    });

    if (!guest) {
      return NextResponse.json(
        { error: 'Guest not found' },
        { status: 404 }
      );
    }

    if (guest.status === 'Checked-out') {
      return NextResponse.json(
        { error: 'Cannot add reading for checked-out guest' },
        { status: 400 }
      );
    }

    // Get the previous reading for validation (from ElectricityReading table)
    const lastReading = await db.electricityReading.findFirst({
      where: { guestId },
      orderBy: { readingDate: 'desc' },
    });

    if (lastReading && parsedReading < lastReading.reading) {
      return NextResponse.json(
        { error: `New reading (${parsedReading}) cannot be less than the last reading (${lastReading.reading})` },
        { status: 400 }
      );
    }

    // Create the reading record
    const newReading = await db.electricityReading.create({
      data: {
        guestId,
        reading: parsedReading,
        readingDate: readingDate ? new Date(readingDate) : new Date(),
      },
    });

    // ─── DETERMINE CURRENT BILLING PERIOD ───
    const todayParts = getDateComponents(new Date());
    const currentDay = todayParts.day;
    const billingCycleDate = guest.billingCycleDate;

    let currentBillingMonth: number;
    let currentBillingYear: number;

    if (currentDay > billingCycleDate) {
      currentBillingMonth = todayParts.month;
      currentBillingYear = todayParts.year;
    } else {
      currentBillingMonth = todayParts.month - 1;
      currentBillingYear = todayParts.year;
      if (currentBillingMonth === 0) {
        currentBillingMonth = 12;
        currentBillingYear--;
      }
    }

    // Find the current period's bill
    let currentBill = await db.bill.findFirst({
      where: {
        guestId,
        billingMonth: currentBillingMonth,
        billingYear: currentBillingYear,
      },
    });

    // ─── IF NO BILL EXISTS FOR CURRENT PERIOD, CREATE ONE ───
    if (!currentBill) {
      // Determine previousReading from the most recent bill's currentReading
      const sortedBills = [...guest.bills].sort((a, b) => {
        if (a.billingYear !== b.billingYear) return b.billingYear - a.billingYear;
        return b.billingMonth - a.billingMonth;
      });
      const lastBill = sortedBills[0] || null;

      // Get previousReading: use last bill's currentReading (or previousReading), then fall back to ElectricityReading
      let previousReading: number;
      if (lastBill) {
        previousReading = lastBill.currentReading ?? lastBill.previousReading ?? 0;
      } else {
        // No previous bills — use the last ElectricityReading
        previousReading = lastReading ? lastReading.reading : 0;
      }

      // If previousReading is 0 and we have an ElectricityReading, use it
      if (previousReading === 0 && lastReading) {
        previousReading = lastReading.reading;
      }

      const ratePerUnit = lastBill?.ratePerUnit ?? 10;
      const monthlyRent = guest.room.monthlyRent;

      // Calculate due date
      let dueMonth = currentBillingMonth + 1;
      let dueYear = currentBillingYear;
      if (dueMonth > 12) {
        dueMonth = 1;
        dueYear++;
      }
      const maxDayInDueMonth = new Date(dueYear, dueMonth, 0).getDate();
      const effectiveDueDay = Math.min(billingCycleDate, maxDayInDueMonth);
      const dueDate = new Date(dueYear, dueMonth - 1, effectiveDueDay);

      currentBill = await db.bill.create({
        data: {
          guestId,
          roomId: guest.roomId,
          billingMonth: currentBillingMonth,
          billingYear: currentBillingYear,
          rentAmount: monthlyRent,
          electricityCharge: 0,
          previousReading,
          currentReading: previousReading, // same as previous until reading is taken
          unitsConsumed: 0,
          ratePerUnit,
          minChargePolicy: 'FULL_MONTH',
          manualAdjustment: 0,
          adjustmentReason: '',
          isCustomBill: false,
          totalAmount: monthlyRent,
          dueDate,
          status: 'Unpaid',
        },
      });
    }

    // ─── UPDATE CURRENT BILL WITH ELECTRICITY INFO ───
    // The "previous reading" = the opening meter reading at the START of this billing period
    // It should NOT change when we update the current reading — it represents the baseline
    const previousReading = currentBill.previousReading;
    const currentReading = parsedReading;
    const unitsConsumed = Math.max(0, currentReading - previousReading);
    const ratePerUnit = currentBill.ratePerUnit ?? 10;
    const electricityCharge = unitsConsumed * ratePerUnit;
    const newTotalAmount = currentBill.rentAmount + electricityCharge + currentBill.manualAdjustment;

    await db.bill.update({
      where: { id: currentBill.id },
      data: {
        currentReading,
        unitsConsumed,
        electricityCharge,
        totalAmount: newTotalAmount,
      },
    });

    return NextResponse.json({
      ...newReading,
      _billUpdate: {
        previousReading,
        currentReading,
        unitsConsumed,
        electricityCharge,
        ratePerUnit,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating electricity reading:', error);
    return NextResponse.json(
      { error: 'Failed to create electricity reading' },
      { status: 500 }
    );
  }
}
