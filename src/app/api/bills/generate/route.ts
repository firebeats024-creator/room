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
        room: {
          include: {
            rentChanges: {
              orderBy: { effectiveDate: 'asc' },
            },
          },
        },
        bills: {
          select: {
            billingMonth: true,
            billingYear: true,
            previousReading: true,
            currentReading: true,
            ratePerUnit: true,
          },
          orderBy: [{ billingYear: 'asc' }, { billingMonth: 'asc' }],
        },
      },
    });

    let billsCreated = 0;
    let overdueMarked = 0;
    let maintenanceBackfilled = 0;
    const createdBills: { guestName: string; month: number; year: number; amount: number }[] = [];

    // ─── BACKFILL: Fix existing bills where maintenanceCharge=0 but room has maintenance > 0 ───
    // This happens when room maintenance was set after bills were generated
    const allBillsWithRoom = await db.bill.findMany({
      where: { maintenanceCharge: 0 },
      include: { room: { select: { maintenanceCharge: true } } },
    });
    const billsNeedingMaintFix = allBillsWithRoom.filter(b => b.room.maintenanceCharge > 0);
    for (const bill of billsNeedingMaintFix) {
      const roomMaint = bill.room.maintenanceCharge;
      // Recalculate totalAmount: rent + maintenance + electricity + adjustments
      const newTotal = bill.rentAmount + roomMaint + bill.electricityCharge + bill.manualAdjustment;
      await db.bill.update({
        where: { id: bill.id },
        data: {
          maintenanceCharge: roomMaint,
          totalAmount: bill.isCustomBill ? bill.totalAmount : newTotal,
        },
      });
      maintenanceBackfilled++;
    }

    // ─── BACKFILL 2: Fix bills marked "Paid" but paidAmount < totalAmount ───
    const paidBillsNeedingFix = await db.bill.findMany({
      where: { status: 'Paid' },
    });
    for (const bill of paidBillsNeedingFix) {
      if (bill.paidAmount < bill.totalAmount) {
        await db.bill.update({
          where: { id: bill.id },
          data: { status: 'Partially-Paid' },
        });
      }
    }

    for (const guest of liveGuests) {
      // Timezone-safe date parsing for check-in date
      const checkInParts = getDateComponents(guest.checkInDate);
      const billingCycleDate = guest.billingCycleDate; // day of month
      const currentMonthlyRent = guest.room.monthlyRent;

      // Build rent-aware helper for this guest's room
      const rentChanges = guest.room.rentChanges || [];
      const getRentForPeriod = (month: number, year: number): number => {
        const originalRent = rentChanges.length > 0 ? rentChanges[0].oldRent : currentMonthlyRent;
        let activeRent = originalRent;
        for (const rc of rentChanges) {
          const rcParts = getDateComponents(rc.effectiveDate);
          if (rcParts.year < year || (rcParts.year === year && rcParts.month <= month)) {
            activeRent = rc.newRent;
          } else {
            break;
          }
        }
        return activeRent;
      };

      // Determine which months need bills based on +1 Day Rule
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
          const maxDayInDueMonth = new Date(dueYear, dueMonth, 0).getDate();
          const effectiveDueDay = Math.min(billingCycleDate, maxDayInDueMonth);
          const dueDate = new Date(dueYear, dueMonth - 1, effectiveDueDay);

          // ─── KEY FIX: Get previous reading from the PREVIOUS bill ───
          // The new bill's previousReading = previous bill's currentReading
          // This ensures electricity meter continuity across billing periods
          const previousBills = guest.bills.filter(
            (b) => b.billingYear < iterYear || (b.billingYear === iterYear && b.billingMonth < iterMonth)
          );
          // Also check bills we just created in this loop (they won't be in guest.bills)
          const lastPreviousBill = previousBills.length > 0
            ? previousBills[previousBills.length - 1]
            : null;

          // Use ?? instead of || to properly handle 0 as a valid reading
          const previousReading = lastPreviousBill
            ? (lastPreviousBill.currentReading ?? lastPreviousBill.previousReading ?? 0)
            : 0;

          // Also try to get from ElectricityReading table as fallback when previousReading is 0
          let openingReading = previousReading;
          if (openingReading === 0) {
            const lastElecReading = await db.electricityReading.findFirst({
              where: { guestId: guest.id },
              orderBy: { readingDate: 'desc' },
            });
            if (lastElecReading) {
              openingReading = lastElecReading.reading;
            }
          }

          // Get ratePerUnit from previous bill or default to 10
          const ratePerUnit = lastPreviousBill?.ratePerUnit ?? 10;

          // ─── RENT-AWARE: Use the correct rent for this billing period ───
          const rentForThisPeriod = getRentForPeriod(iterMonth, iterYear);
          const maintenanceChargeForPeriod = guest.room.maintenanceCharge || 0;

          // Create the missing bill
          const newBill = await db.bill.create({
            data: {
              guestId: guest.id,
              roomId: guest.roomId,
              billingMonth: iterMonth,
              billingYear: iterYear,
              rentAmount: rentForThisPeriod,
              maintenanceCharge: maintenanceChargeForPeriod,
              electricityCharge: 0,
              previousReading: openingReading,
              currentReading: openingReading, // same as previous until a new reading is taken
              unitsConsumed: 0,
              ratePerUnit,
              minChargePolicy: 'FULL_MONTH',
              manualAdjustment: 0,
              adjustmentReason: '',
              isCustomBill: false,
              totalAmount: rentForThisPeriod + maintenanceChargeForPeriod,
              dueDate,
              status: 'Unpaid',
            },
          });

          // Add to guest.bills so subsequent iterations can reference it
          guest.bills.push({
            billingMonth: iterMonth,
            billingYear: iterYear,
            previousReading: openingReading,
            currentReading: openingReading,
            ratePerUnit,
          });

          billsCreated++;
          createdBills.push({
            guestName: guest.name,
            month: iterMonth,
            year: iterYear,
            amount: rentForThisPeriod,
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
      message: `Generated ${billsCreated} new bills, marked ${overdueMarked} as overdue, backfilled maintenance on ${maintenanceBackfilled} bills`,
      billsCreated,
      overdueMarked,
      maintenanceBackfilled,
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
