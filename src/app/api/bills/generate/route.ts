import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getDateComponents } from '@/lib/billing-utils';

// POST /api/bills/generate - Generate missing monthly bills for all live guests
// +1 Day Rule: Agar current date anniversary date se 1 din bhi zyada hoti hai,
//   toh turant agla Month ka bill generate hoga
// On the cycle date itself: month is COMPLETE, but next month bill NOT yet generated
// If currentDay > cycleDay: current month needs a bill (+1 Day triggered)
// If currentDay <= cycleDay: previous month is the latest billable month
export async function POST() {
  try {
    // Use timezone-safe date components (UTC methods)
    const todayParts = getDateComponents(new Date());
    const currentMonth = todayParts.month; // 1-12
    const currentYear = todayParts.year;
    const currentDay = todayParts.day;

    // Get all live guests with their bills and room info
    const liveGuests = await db.guest.findMany({
      where: { status: 'Live' },
      include: {
        room: true,
        bills: {
          select: { billingMonth: true, billingYear: true },
        },
      },
    });

    let billsCreated = 0;
    let overdueMarked = 0;
    const createdBills: { guestName: string; month: number; year: number; amount: number }[] = [];

    for (const guest of liveGuests) {
      // Timezone-safe date parsing for check-in date
      const checkInParts = getDateComponents(guest.checkInDate);
      const billingCycleDate = guest.billingCycleDate; // day of month
      const monthlyRent = guest.room.monthlyRent;

      // Determine which months need bills based on +1 Day Rule

      // +1 Day Rule: Latest billable month determination
      // On the cycle date itself: that month's period is COMPLETE, but next month's bill
      // is NOT yet generated (it generates the day AFTER the cycle date)
      // If currentDay > billingCycleDate: +1 Day triggered, current month needs a bill
      // If currentDay <= billingCycleDate: still in previous period, previous month is latest

      let latestBillingMonth: number;
      let latestBillingYear: number;

      if (currentDay > billingCycleDate) {
        // +1 Day Rule: current month's billing period has started
        latestBillingMonth = currentMonth;
        latestBillingYear = currentYear;
      } else {
        // Still in previous period (or on cycle date = previous period's last day)
        latestBillingMonth = currentMonth - 1;
        latestBillingYear = currentYear;
        if (latestBillingMonth === 0) {
          latestBillingMonth = 12;
          latestBillingYear--;
        }
      }

      // Now iterate from check-in month to latestBillingMonth
      let iterMonth = checkInParts.month;
      let iterYear = checkInParts.year;

      while (
        iterYear < latestBillingYear ||
        (iterYear === latestBillingYear && iterMonth <= latestBillingMonth)
      ) {
        // Check if a bill already exists for this month/year for this guest
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
          // Handle months where billingCycleDate doesn't exist (e.g., 31st in 30-day months)
          const maxDayInDueMonth = new Date(dueYear, dueMonth, 0).getDate();
          const effectiveDueDay = Math.min(billingCycleDate, maxDayInDueMonth);
          const dueDate = new Date(dueYear, dueMonth - 1, effectiveDueDay);

          // Create the missing bill
          const newBill = await db.bill.create({
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

          billsCreated++;
          createdBills.push({
            guestName: guest.name,
            month: iterMonth,
            year: iterYear,
            amount: monthlyRent,
          });
        }

        // Move to next month
        iterMonth++;
        if (iterMonth > 12) {
          iterMonth = 1;
          iterYear++;
        }
      }
    }

    // Also mark overdue bills: Unpaid bills whose dueDate has passed
    // Use current date for comparison (timezone-safe)
    const todayForOverdue = new Date();
    const overdueBills = await db.bill.findMany({
      where: {
        status: 'Unpaid',
        dueDate: { lt: todayForOverdue },
      },
    });

    for (const bill of overdueBills) {
      await db.bill.update({
        where: { id: bill.id },
        data: { status: 'Overdue' },
      });
      overdueMarked++;
    }

    return NextResponse.json({
      message: `Generated ${billsCreated} new bills, marked ${overdueMarked} as overdue`,
      billsCreated,
      overdueMarked,
      createdBills,
    });
  } catch (error) {
    console.error('Error generating bills:', error);
    return NextResponse.json(
      { error: 'Failed to generate bills' },
      { status: 500 }
    );
  }
}
