import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getDateComponents } from '@/lib/billing-utils';

// GET /api/guests/[id] - Get a single guest with full details
// Also auto-generates missing bills for live guests to keep billing status accurate
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const guest = await db.guest.findUnique({
      where: { id },
      include: {
        room: {
          select: {
            id: true,
            roomNo: true,
            floor: true,
            type: true,
            baseRent: true,
            monthlyRent: true,
            status: true,
          },
        },
        securityDeposit: true,
        bills: {
          select: {
            id: true,
            totalAmount: true,
            paidAmount: true,
            status: true,
            rentAmount: true,
            electricityCharge: true,
            billingMonth: true,
            billingYear: true,
            dueDate: true,
            previousReading: true,
            currentReading: true,
            unitsConsumed: true,
            ratePerUnit: true,
            isCustomBill: true,
            customTotal: true,
            manualAdjustment: true,
            adjustmentReason: true,
          },
          orderBy: [{ billingYear: 'asc' }, { billingMonth: 'asc' }],
        },
        electricityReadings: {
          orderBy: { readingDate: 'desc' },
          take: 1,
        },
        memberHistory: {
          orderBy: { effectiveDate: 'asc' },
        },
      },
    });

    if (!guest) {
      return NextResponse.json(
        { error: 'Guest not found' },
        { status: 404 }
      );
    }

    // ─── REPAIR: Create missing ElectricityReading for guests who don't have one ───
    // This handles the case where opening reading was 0 (old bug) or the record was never created
    if (guest.electricityReadings.length === 0 && guest.bills.length > 0) {
      const firstBill = guest.bills[0];
      const openingReading = firstBill.previousReading ?? 0;
      await db.electricityReading.create({
        data: {
          guestId: guest.id,
          reading: openingReading,
          readingDate: new Date(guest.checkInDate),
        },
      });
    }

    // ─── REPAIR: Fix broken electricity reading chain across ALL bills ───
    // Walk the entire bill chain and ensure each bill's previousReading matches
    // the previous bill's currentReading. Fix any breaks found.
    if (guest.bills.length > 0) {
      // Determine the correct opening reading (from first ElectricityReading at check-in)
      const checkInReading = await db.electricityReading.findFirst({
        where: { guestId: guest.id, readingDate: { lte: new Date(guest.checkInDate) } },
        orderBy: { readingDate: 'desc' },
      });
      const correctOpening = checkInReading?.reading ?? guest.bills[0]?.previousReading ?? 0;

      let expectedPreviousReading = correctOpening;
      let chainFixed = false;

      for (const bill of guest.bills) {
        const needsFix = bill.previousReading !== expectedPreviousReading;
        let newCurrentReading = bill.currentReading;

        // If currentReading equals the OLD previousReading and no electricity
        // update was done for this period (unitsConsumed === 0), then currentReading
        // should also be fixed to the new previousReading
        if (bill.currentReading === bill.previousReading && bill.unitsConsumed === 0) {
          newCurrentReading = expectedPreviousReading;
        }

        const newUnitsConsumed = Math.max(0, newCurrentReading - expectedPreviousReading);
        const newElecCharge = newUnitsConsumed * (bill.ratePerUnit ?? 10);

        // For custom bills, don't recalculate totalAmount — keep customTotal
        let newTotalAmount: number;
        if (bill.isCustomBill && bill.customTotal !== null && bill.customTotal !== undefined) {
          newTotalAmount = bill.customTotal;
        } else {
          newTotalAmount = bill.rentAmount + newElecCharge + bill.manualAdjustment;
        }

        if (needsFix || newCurrentReading !== bill.currentReading ||
            newUnitsConsumed !== bill.unitsConsumed || newElecCharge !== bill.electricityCharge) {
          await db.bill.update({
            where: { id: bill.id },
            data: {
              previousReading: expectedPreviousReading,
              currentReading: newCurrentReading,
              unitsConsumed: newUnitsConsumed,
              electricityCharge: newElecCharge,
              totalAmount: newTotalAmount,
            },
          });
          chainFixed = true;
        }

        // Chain: next bill's previousReading = this bill's currentReading
        expectedPreviousReading = newCurrentReading;
      }

      // Re-fetch if chain was fixed
      if (chainFixed) {
        const repairedGuest = await db.guest.findUnique({
          where: { id },
          include: {
            room: {
              select: {
                id: true,
                roomNo: true,
                floor: true,
                type: true,
                baseRent: true,
                monthlyRent: true,
                status: true,
              },
            },
            securityDeposit: true,
            bills: {
              select: {
                id: true,
                totalAmount: true,
                paidAmount: true,
                status: true,
                rentAmount: true,
                electricityCharge: true,
                billingMonth: true,
                billingYear: true,
                dueDate: true,
                previousReading: true,
                currentReading: true,
                unitsConsumed: true,
                ratePerUnit: true,
                isCustomBill: true,
                customTotal: true,
                manualAdjustment: true,
                adjustmentReason: true,
              },
              orderBy: [{ billingYear: 'asc' }, { billingMonth: 'asc' }],
            },
            electricityReadings: {
              orderBy: { readingDate: 'desc' },
              take: 1,
            },
            memberHistory: {
              orderBy: { effectiveDate: 'asc' },
            },
          },
        });
        if (repairedGuest) {
          // Replace the guest data for further processing
          Object.assign(guest, repairedGuest);
        }
      }
    }

    // ─── AUTO-GENERATE MISSING BILLS for live guests ───
    if (guest.status === 'Live') {
      const todayParts = getDateComponents(new Date());
      const currentMonth = todayParts.month;
      const currentYear = todayParts.year;
      const currentDay = todayParts.day;
      const billingCycleDate = guest.billingCycleDate;
      const currentMonthlyRent = guest.room.monthlyRent;

      // Fetch rent change history for this room to determine correct rent per period
      const rentChanges = await db.rentChange.findMany({
        where: { roomId: guest.roomId },
        orderBy: { effectiveDate: 'asc' },
      });

      // Helper: get the rent that was active for a given billing month/year
      const getRentForPeriod = (month: number, year: number): number => {
        // Start with the rent before any changes (first change's oldRent, or currentRent if no changes)
        const originalRent = rentChanges.length > 0 ? rentChanges[0].oldRent : currentMonthlyRent;
        let activeRent = originalRent;
        for (const rc of rentChanges) {
          const rcParts = getDateComponents(rc.effectiveDate);
          // If the change's effective date is in or before this billing period, apply it
          if (rcParts.year < year || (rcParts.year === year && rcParts.month <= month)) {
            activeRent = rc.newRent;
          } else {
            break; // rentChanges are sorted by date ascending
          }
        }
        return activeRent;
      };

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

      const checkInParts = getDateComponents(guest.checkInDate);
      let iterMonth = checkInParts.month;
      let iterYear = checkInParts.year;
      let billsGenerated = false;

      // Build a mutable list from existing bills for previousReading lookup
      const allBills = [...guest.bills];

      while (
        iterYear < latestBillingYear ||
        (iterYear === latestBillingYear && iterMonth <= latestBillingMonth)
      ) {
        const billExists = allBills.some(
          (b) => b.billingMonth === iterMonth && b.billingYear === iterYear
        );

        if (!billExists) {
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
          const previousBills = allBills.filter(
            (b) => b.billingYear < iterYear || (b.billingYear === iterYear && b.billingMonth < iterMonth)
          );
          const lastPreviousBill = previousBills.length > 0
            ? previousBills[previousBills.length - 1]
            : null;

          // Use ?? instead of || to properly handle 0 as a valid reading
          let previousReading = lastPreviousBill
            ? (lastPreviousBill.currentReading ?? lastPreviousBill.previousReading ?? 0)
            : 0;

          // Always check ElectricityReading table as fallback when previousReading is 0
          if (previousReading === 0) {
            const lastElecReading = await db.electricityReading.findFirst({
              where: { guestId: guest.id },
              orderBy: { readingDate: 'desc' },
            });
            if (lastElecReading) {
              previousReading = lastElecReading.reading;
            }
          }

          // Get ratePerUnit from previous bill or default to 10
          const ratePerUnit = lastPreviousBill?.ratePerUnit ?? 10;

          // ─── RENT-AWARE: Use the correct rent for this billing period ───
          const rentForThisPeriod = getRentForPeriod(iterMonth, iterYear);

          const newBill = await db.bill.create({
            data: {
              guestId: guest.id,
              roomId: guest.roomId,
              billingMonth: iterMonth,
              billingYear: iterYear,
              rentAmount: rentForThisPeriod,
              electricityCharge: 0,
              previousReading,
              currentReading: previousReading, // same as previous until a new reading is taken
              unitsConsumed: 0,
              ratePerUnit,
              minChargePolicy: 'FULL_MONTH',
              manualAdjustment: 0,
              adjustmentReason: '',
              isCustomBill: false,
              totalAmount: rentForThisPeriod,
              dueDate,
              status: 'Unpaid',
            },
          });

          // Add to our tracking list so next iteration can reference it
          allBills.push({
            id: newBill.id,
            totalAmount: newBill.totalAmount,
            paidAmount: newBill.paidAmount,
            status: newBill.status,
            rentAmount: newBill.rentAmount,
            electricityCharge: newBill.electricityCharge,
            billingMonth: newBill.billingMonth,
            billingYear: newBill.billingYear,
            dueDate: newBill.dueDate.toISOString(),
            previousReading: newBill.previousReading,
            currentReading: newBill.currentReading,
            unitsConsumed: newBill.unitsConsumed,
            ratePerUnit: newBill.ratePerUnit,
            isCustomBill: newBill.isCustomBill,
            customTotal: newBill.customTotal,
            manualAdjustment: newBill.manualAdjustment,
            adjustmentReason: newBill.adjustmentReason,
          });

          billsGenerated = true;
        }

        iterMonth++;
        if (iterMonth > 12) {
          iterMonth = 1;
          iterYear++;
        }
      }

      // Mark overdue bills
      const todayForOverdue = new Date();
      const overdueBills = await db.bill.findMany({
        where: {
          guestId: guest.id,
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

      // Re-fetch guest with updated bills if any were generated or marked overdue
      if (billsGenerated || overdueBills.length > 0) {
        const updatedGuest = await db.guest.findUnique({
          where: { id },
          include: {
            room: {
              select: {
                id: true,
                roomNo: true,
                floor: true,
                type: true,
                baseRent: true,
                monthlyRent: true,
                status: true,
              },
            },
            securityDeposit: true,
            bills: {
              select: {
                id: true,
                totalAmount: true,
                paidAmount: true,
                status: true,
                rentAmount: true,
                electricityCharge: true,
                billingMonth: true,
                billingYear: true,
                dueDate: true,
                previousReading: true,
                currentReading: true,
                unitsConsumed: true,
                ratePerUnit: true,
                isCustomBill: true,
                customTotal: true,
                manualAdjustment: true,
                adjustmentReason: true,
              },
              orderBy: [{ billingYear: 'asc' }, { billingMonth: 'asc' }],
            },
            electricityReadings: {
              orderBy: { readingDate: 'desc' },
              take: 1,
            },
            memberHistory: {
              orderBy: { effectiveDate: 'asc' },
            },
          },
        });

        if (updatedGuest) {
          return NextResponse.json(updatedGuest);
        }
      }
    }

    return NextResponse.json(guest);
  } catch (error) {
    console.error('Error fetching guest:', error);
    return NextResponse.json(
      { error: 'Failed to fetch guest' },
      { status: 500 }
    );
  }
}
