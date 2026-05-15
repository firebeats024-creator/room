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

    // ─── REPAIR: Fix bills with previousReading=0 that should have the opening reading ───
    // If the first bill has previousReading=0 but ElectricityReading has a non-zero reading, fix it
    const firstBill = guest.bills[0];
    if (firstBill && firstBill.previousReading === 0 && guest.electricityReadings.length > 0) {
      const lastReading = guest.electricityReadings[0]; // ordered desc
      if (lastReading.reading > 0) {
        // The first bill's previousReading should be the opening reading at check-in
        // Find the reading closest to check-in date
        const checkInReading = await db.electricityReading.findFirst({
          where: { guestId: guest.id, readingDate: { lte: new Date(guest.checkInDate) } },
          orderBy: { readingDate: 'desc' },
        });
        if (checkInReading) {
          await db.bill.update({
            where: { id: firstBill.id },
            data: { previousReading: checkInReading.reading },
          });
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
      const monthlyRent = guest.room.monthlyRent;

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

          const newBill = await db.bill.create({
            data: {
              guestId: guest.id,
              roomId: guest.roomId,
              billingMonth: iterMonth,
              billingYear: iterYear,
              rentAmount: monthlyRent,
              electricityCharge: 0,
              previousReading,
              currentReading: previousReading, // same as previous until a new reading is taken
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
