import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/bills - Get all bills with guest and room info
export async function GET() {
  try {
    // Auto-mark overdue bills: ALL Unpaid bills become Overdue (no separate "Unpaid" concept)
    // Also mark Partially-Paid bills past due date as Overdue
    const today = new Date();

    // Mark ALL Unpaid bills as Overdue (regardless of due date)
    const unpaidBills = await db.bill.findMany({
      where: {
        status: 'Unpaid',
      },
      select: { id: true },
    });

    for (const bill of unpaidBills) {
      await db.bill.update({
        where: { id: bill.id },
        data: { status: 'Overdue' },
      });
    }

    // Mark Partially-Paid bills past their due date as Overdue
    const partiallyPaidOverdue = await db.bill.findMany({
      where: {
        status: 'Partially-Paid',
        dueDate: { lt: today },
      },
      select: { id: true },
    });

    for (const bill of partiallyPaidOverdue) {
      await db.bill.update({
        where: { id: bill.id },
        data: { status: 'Overdue' },
      });
    }

    const bills = await db.bill.findMany({
      include: {
        guest: {
          select: {
            id: true,
            name: true,
            phone: true,
            status: true,
            billingCycleDate: true,
            checkInDate: true,
            checkOutDate: true,
          },
        },
        room: {
          select: {
            id: true,
            roomNo: true,
            floor: true,
            type: true,
            monthlyRent: true,
          },
        },
      },
      orderBy: [{ billingYear: 'desc' }, { billingMonth: 'desc' }],
    });

    return NextResponse.json(bills);
  } catch (error) {
    console.error('Error fetching bills:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bills' },
      { status: 500 }
    );
  }
}

// PUT /api/bills - Update/override a bill or mark as paid
// Accounting Logic (+1 Day Rule / Anniversary Date):
// Priority 1: Payment first deducted from Current Bill (the bill being paid)
// Priority 2: Surplus (if any) goes to Previous Due (oldest unpaid bills first — FIFO)
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const {
      billId, manualAdjustment, adjustmentReason, isCustomBill, customTotal,
      status, paymentAmount,
      previousReading, currentReading, unitsConsumed, ratePerUnit, electricityCharge,
    } = body;

    if (!billId) {
      return NextResponse.json(
        { error: 'Bill ID is required' },
        { status: 400 }
      );
    }

    // Fetch the existing bill
    const existingBill = await db.bill.findUnique({
      where: { id: billId },
    });

    if (!existingBill) {
      return NextResponse.json(
        { error: 'Bill not found' },
        { status: 404 }
      );
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    // Handle payment (mark as paid / partially paid)
    if (status !== undefined && status !== null) {
      if (status === 'Paid') {
        // Full payment - mark as Paid
        updateData.status = 'Paid';
        updateData.paidDate = new Date();
        updateData.paidAmount = existingBill.totalAmount;
      } else if (status === 'Partially-Paid' && paymentAmount !== undefined) {
        // Partial payment
        const currentPaid = existingBill.paidAmount || 0;
        const newPaidAmount = currentPaid + paymentAmount;

        if (newPaidAmount >= existingBill.totalAmount) {
          // Full amount paid now
          updateData.status = 'Paid';
          updateData.paidDate = new Date();
          updateData.paidAmount = existingBill.totalAmount;
        } else {
          // Partially paid
          updateData.status = 'Partially-Paid';
          updateData.paidAmount = newPaidAmount;
        }
      }
    }

    // Handle bill editing (manager override) — only recalculate if not just a status update
    if (status === undefined || status === null) {
      let totalAmount: number;
      const effectiveIsCustomBill = isCustomBill ?? existingBill.isCustomBill;

      // Update electricity fields if provided
      if (previousReading !== undefined && previousReading !== null) {
        updateData.previousReading = previousReading;
      }
      if (currentReading !== undefined && currentReading !== null) {
        updateData.currentReading = currentReading;
      }
      if (unitsConsumed !== undefined && unitsConsumed !== null) {
        updateData.unitsConsumed = unitsConsumed;
      }
      if (ratePerUnit !== undefined && ratePerUnit !== null) {
        updateData.ratePerUnit = ratePerUnit;
      }
      if (electricityCharge !== undefined && electricityCharge !== null) {
        updateData.electricityCharge = electricityCharge;
      }

      if (effectiveIsCustomBill && customTotal !== undefined && customTotal !== null) {
        // Manager override: use custom total
        totalAmount = customTotal;
      } else {
        // Standard calculation: rent + electricity + manual adjustment
        const effectiveElectricityCharge = electricityCharge !== undefined && electricityCharge !== null
          ? electricityCharge
          : existingBill.electricityCharge;
        const effectiveAdjustment = manualAdjustment ?? existingBill.manualAdjustment;
        totalAmount =
          existingBill.rentAmount +
          effectiveElectricityCharge +
          effectiveAdjustment;
      }

      updateData.totalAmount = totalAmount;

      if (manualAdjustment !== undefined && manualAdjustment !== null) {
        updateData.manualAdjustment = manualAdjustment;
      }
      if (adjustmentReason !== undefined && adjustmentReason !== null) {
        updateData.adjustmentReason = adjustmentReason;
      }
      if (isCustomBill !== undefined && isCustomBill !== null) {
        updateData.isCustomBill = isCustomBill;
      }
      if (customTotal !== undefined && customTotal !== null) {
        updateData.customTotal = customTotal;
      }
    }

    // Also handle edit + payment combined (when Mark Paid popup edits the bill first)
    if (status !== undefined && status !== null && (previousReading !== undefined || electricityCharge !== undefined || isCustomBill !== undefined || customTotal !== undefined || manualAdjustment !== undefined)) {
      // First recalculate the total if electricity/custom bill was changed
      const effectivePreviousReading = previousReading ?? existingBill.previousReading;
      const effectiveCurrentReading = currentReading ?? existingBill.currentReading;
      const effectiveUnitsConsumed = unitsConsumed ?? Math.max(0, effectiveCurrentReading - effectivePreviousReading);
      const effectiveRatePerUnit = ratePerUnit ?? existingBill.ratePerUnit;
      const effectiveElectricityCharge = electricityCharge ?? (effectiveUnitsConsumed * effectiveRatePerUnit);
      const effectiveIsCustomBill = isCustomBill ?? existingBill.isCustomBill;

      let newTotalAmount: number;
      if (effectiveIsCustomBill && customTotal !== undefined && customTotal !== null) {
        newTotalAmount = customTotal;
      } else {
        const effectiveAdjustment = manualAdjustment ?? existingBill.manualAdjustment;
        newTotalAmount = existingBill.rentAmount + effectiveElectricityCharge + effectiveAdjustment;
      }

      updateData.totalAmount = newTotalAmount;
      updateData.previousReading = effectivePreviousReading;
      updateData.currentReading = effectiveCurrentReading;
      updateData.unitsConsumed = effectiveUnitsConsumed;
      updateData.ratePerUnit = effectiveRatePerUnit;
      updateData.electricityCharge = effectiveElectricityCharge;

      if (isCustomBill !== undefined) updateData.isCustomBill = isCustomBill;
      if (customTotal !== undefined && customTotal !== null) updateData.customTotal = customTotal;
      if (manualAdjustment !== undefined && manualAdjustment !== null) updateData.manualAdjustment = manualAdjustment;
      if (adjustmentReason !== undefined && adjustmentReason !== null) updateData.adjustmentReason = adjustmentReason;

      // Now handle payment based on the new total
      if (status === 'Paid') {
        updateData.status = 'Paid';
        updateData.paidDate = new Date();
        updateData.paidAmount = newTotalAmount;
      } else if (status === 'Partially-Paid' && paymentAmount !== undefined) {
        const currentPaid = existingBill.paidAmount || 0;
        const newPaidAmount = currentPaid + paymentAmount;

        if (newPaidAmount >= newTotalAmount) {
          updateData.status = 'Paid';
          updateData.paidDate = new Date();
          updateData.paidAmount = newTotalAmount;
        } else {
          updateData.status = 'Partially-Paid';
          updateData.paidAmount = newPaidAmount;
        }
      }
    }

    const updatedBill = await db.bill.update({
      where: { id: billId },
      data: updateData,
    });

    // =====================================================================
    // ACCOUNTING LOGIC: Current Bill → Previous Due priority distribution
    // Priority 1: Surplus from Current Bill first goes to reduce Current Bill
    // Priority 2: Any remaining surplus goes to Previous Due (oldest bills first)
    // =====================================================================
    if (status !== undefined && status !== null && paymentAmount !== undefined) {
      const existingPaid = existingBill.paidAmount || 0;
      const effectiveTotal = (updateData.totalAmount as number) || existingBill.totalAmount;
      const currentBillRemaining = effectiveTotal - existingPaid;
      const surplusPayment = Math.max(0, paymentAmount - currentBillRemaining);

      if (surplusPayment > 0) {
        // Find other unpaid/overdue/partially-paid bills for the same guest (Previous Due)
        // These are the "Previous Due" bucket - sorted oldest first
        const otherBills = await db.bill.findMany({
          where: {
            guestId: existingBill.guestId,
            id: { not: billId },
            status: { in: ['Unpaid', 'Overdue', 'Partially-Paid'] },
          },
          orderBy: [
            { billingYear: 'asc' },  // Oldest first
            { billingMonth: 'asc' },
          ],
        });

        let remainingSurplus = surplusPayment;

        for (const otherBill of otherBills) {
          if (remainingSurplus <= 0) break;

          const otherRemaining = otherBill.totalAmount - (otherBill.paidAmount || 0);
          if (otherRemaining <= 0) continue;

          const paymentForThisBill = Math.min(remainingSurplus, otherRemaining);
          const newPaidAmount = (otherBill.paidAmount || 0) + paymentForThisBill;
          const isNowPaid = newPaidAmount >= otherBill.totalAmount;

          await db.bill.update({
            where: { id: otherBill.id },
            data: {
              paidAmount: isNowPaid ? otherBill.totalAmount : newPaidAmount,
              status: isNowPaid ? 'Paid' : 'Partially-Paid',
              paidDate: isNowPaid ? new Date() : undefined,
            },
          });

          remainingSurplus -= paymentForThisBill;
        }
      }
    }

    return NextResponse.json({
      message: 'Bill updated successfully',
      bill: updatedBill,
    });
  } catch (error) {
    console.error('Error updating bill:', error);
    return NextResponse.json(
      { error: 'Failed to update bill' },
      { status: 500 }
    );
  }
}
