import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { calculateStayMonths, getDateComponents } from '@/lib/billing-utils';

// POST /api/checkout - Check-out a guest
// Uses shared billing-utils for timezone-safe +1 Day Rule calculation
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { guestId, checkOutDate, currentMeterReading } = body;

    // Validate required fields
    if (!guestId || !checkOutDate) {
      return NextResponse.json(
        { error: 'Tenant ID and checkOutDate are required' },
        { status: 400 }
      );
    }

    // Get guest with all related data
    const guest = await db.guest.findUnique({
      where: { id: guestId },
      include: {
        room: true,
        securityDeposit: true,
        bills: true,
        electricityReadings: {
          orderBy: { readingDate: 'desc' },
          take: 1,
        },
      },
    });

    if (!guest) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }

    if (guest.status === 'Checked-out') {
      return NextResponse.json(
        { error: 'Tenant is already checked out' },
        { status: 409 }
      );
    }

    // =====================================================================
    // +1 Day Rule (Anniversary Date Billing) — timezone-safe via billing-utils
    // =====================================================================
    // 15/03 → 15/04 = 1 Month, 16/04 = 2 Months
    // 15/05 = 2 Months, 16/05 = 3 Months
    // Uses UTC methods so getDate/getMonth work correctly in any timezone
    // =====================================================================
    const totalMonths = calculateStayMonths(guest.checkInDate, checkOutDate);

    // Calculate rent for total months
    const monthlyRent = guest.room.monthlyRent;
    const maintenanceChargePerMonth = guest.room.maintenanceCharge || 0;
    const totalRent = monthlyRent * totalMonths;
    const totalMaintenance = maintenanceChargePerMonth * totalMonths;

    // Calculate total paid from all bills (sum of paidAmount across all statuses)
    // Paid bills: full totalAmount paid. Others: partial paidAmount.
    const totalPaid = guest.bills.reduce(
      (sum, b) => sum + (b.status === 'Paid' ? b.totalAmount : (b.paidAmount || 0)),
      0
    );

    // Calculate unpaid bills total (remaining = totalAmount - paidAmount)
    // IMPORTANT: Overdue bills can have paidAmount > 0 (when Partially-Paid bills become Overdue)
    // So we must always use (totalAmount - paidAmount) for remaining balance
    const unpaidBills = guest.bills.filter((b) => b.status !== 'Paid');
    const unpaidBillTotal = unpaidBills.reduce(
      (sum, b) => sum + (b.totalAmount - (b.paidAmount || 0)),
      0
    );

    // Total billed from bill records
    const totalBilled = guest.bills.reduce((sum, b) => sum + b.totalAmount, 0);
    // Also calculate how much rent and maintenance have been billed separately
    const totalRentBilled = guest.bills.reduce((sum, b) => sum + b.rentAmount, 0);
    const totalMaintenanceBilled = guest.bills.reduce((sum, b) => sum + (b.maintenanceCharge || 0), 0);
    // Remaining rent to charge (total accrued rent + maintenance minus what's already billed)
    const totalAccrued = totalRent + totalMaintenance;
    const remainingRent = Math.max(0, totalAccrued - totalBilled);
    // Split remaining into rent and maintenance components for the checkout bill
    const remainingRentPortion = Math.max(0, totalRent - totalRentBilled);
    const remainingMaintPortion = Math.max(0, totalMaintenance - totalMaintenanceBilled);
    // Total balance = Total Accrued (Rent + Maintenance) - Total Paid
    const totalBalance = Math.max(0, totalAccrued - totalPaid);

    // Calculate electricity charge from the last bill's rate
    let electricityCharge = 0;
    let unitsConsumed = 0;
    const lastReading =
      guest.electricityReadings.length > 0
        ? guest.electricityReadings[0].reading
        : 0;

    // Get rate from the latest bill
    const latestBill = guest.bills.length > 0
      ? guest.bills.reduce((a, b) => (new Date(a.createdAt) > new Date(b.createdAt) ? a : b))
      : null;
    const ratePerUnit = latestBill?.ratePerUnit ?? 10;

    if (currentMeterReading !== undefined && currentMeterReading !== null) {
      unitsConsumed = Math.max(0, currentMeterReading - lastReading);
      electricityCharge = unitsConsumed * ratePerUnit;
    }

    // Security deposit handling - CHECK IF ALREADY PROCESSED
    const deposit = guest.securityDeposit;
    const depositAmount = deposit ? deposit.amount : 0;
    const isDepositAlreadyProcessed = deposit && deposit.status !== 'Held';
    const isDepositAlreadyRefunded = deposit && (deposit.status === 'Refunded' || deposit.status === 'Partially-Refunded');

    // Total dues: unpaid bills remaining + remaining rent + electricity charge
    const totalDues = unpaidBillTotal + remainingRent + electricityCharge;

    // Calculate deposit adjustment
    let depositRefund = 0;
    let depositDeducted = 0;
    let newDepositStatus: string = deposit?.status ?? 'Held';

    if (deposit && !isDepositAlreadyProcessed) {
      // Deposit is still Held — process it during checkout
      if (totalDues <= depositAmount) {
        // All dues can be covered by deposit
        depositDeducted = totalDues;
        depositRefund = depositAmount - totalDues;
        newDepositStatus =
          depositRefund > 0 ? 'Partially-Refunded' : 'Adjusted';
      } else {
        // Dues exceed deposit, deduct entire deposit
        depositDeducted = depositAmount;
        depositRefund = 0;
        newDepositStatus = 'Adjusted';
      }
    } else if (isDepositAlreadyRefunded) {
      // Deposit was already refunded before checkout — guest owes full dues
      depositDeducted = 0;
      depositRefund = 0;
      // Don't change the deposit status
      newDepositStatus = deposit.status;
    } else if (deposit && deposit.status === 'Adjusted') {
      // Deposit was already adjusted against bills — guest owes full dues
      depositDeducted = deposit.deductedAmount;
      depositRefund = 0;
      newDepositStatus = deposit.status;
    }

    // Net amount guest owes or receives
    const netAmount = totalDues - depositDeducted;
    // Positive = guest owes money, Negative = guest receives refund

    // Build list of unpaid bills for the response
    const unpaidBillsList = unpaidBills.map((b) => ({
      id: b.id,
      billingMonth: b.billingMonth,
      billingYear: b.billingYear,
      totalAmount: b.totalAmount,
      rentAmount: b.rentAmount,
      electricityCharge: b.electricityCharge,
      status: b.status,
    }));

    // Get checkout date components for bill creation (timezone-safe)
    const checkOutDateParts = getDateComponents(checkOutDate);

    const result = await db.$transaction(async (tx) => {
      // Update guest status
      const updatedGuest = await tx.guest.update({
        where: { id: guestId },
        data: {
          checkOutDate: new Date(checkOutDate),
          status: 'Checked-out',
        },
      });

      // Create a final bill if there's remaining rent or electricity charge
      if (remainingRent > 0 || electricityCharge > 0) {
        await tx.bill.create({
          data: {
            guestId,
            roomId: guest.roomId,
            billingMonth: checkOutDateParts.month,
            billingYear: checkOutDateParts.year,
            rentAmount: remainingRentPortion,
            maintenanceCharge: remainingMaintPortion,
            electricityCharge,
            previousReading: lastReading,
            currentReading: currentMeterReading ?? lastReading,
            unitsConsumed,
            ratePerUnit,
            minChargePolicy: 'FULL_MONTH',
            manualAdjustment: 0,
            adjustmentReason: 'Checkout bill',
            isCustomBill: false,
            totalAmount: remainingRentPortion + remainingMaintPortion + electricityCharge,
            dueDate: new Date(checkOutDate),
            status: 'Unpaid',
          },
        });
      } else if (electricityCharge > 0) {
        // Update the latest unpaid bill with electricity charge
        if (unpaidBills.length > 0) {
          const latestUnpaid = unpaidBills[unpaidBills.length - 1];
          await tx.bill.update({
            where: { id: latestUnpaid.id },
            data: {
              electricityCharge,
              currentReading: currentMeterReading ?? lastReading,
              unitsConsumed,
              totalAmount:
                latestUnpaid.rentAmount +
                (latestUnpaid.maintenanceCharge || 0) +
                electricityCharge +
                latestUnpaid.manualAdjustment,
            },
          });
        }
      }

      // Update security deposit ONLY if it's still Held
      if (deposit && deposit.status === 'Held') {
        await tx.securityDeposit.update({
          where: { id: deposit.id },
          data: {
            status: newDepositStatus,
            deductedAmount: depositDeducted,
            refundDate: new Date(checkOutDate),
            notes: `Checkout: Deducted ₹${depositDeducted}, Refunded ₹${depositRefund}`,
          },
        });
      }

      // Update room status to Vacant and reset rent to baseRent
      // Delete all RentChange records for this room (they belonged to the old guest's tenure)
      // IMPORTANT: monthlyRent MUST reset to baseRent so the next guest gets the default rent
      const resetRent = guest.room.baseRent > 0 ? guest.room.baseRent : guest.room.monthlyRent;
      await tx.room.update({
        where: { id: guest.roomId },
        data: { 
          status: 'Vacant',
          monthlyRent: resetRent, // Reset to base/default rent for next guest
        },
      });

      // Delete all rent change records for this room — they belonged to the outgoing guest
      await tx.rentChange.deleteMany({
        where: { roomId: guest.roomId },
      });

      return updatedGuest;
    });

    // Build checkout summary with full accounting data
    const summary = {
      guestName: guest.name,
      roomNo: guest.room.roomNo,
      checkInDate: guest.checkInDate,
      checkOutDate,
      totalMonths,
      monthlyRent,
      totalRent,
      totalBilled,
      totalPaid,
      totalBalance,
      remainingRent,
      electricityCharge: electricityCharge > 0 ? electricityCharge : undefined,
      unitsConsumed: unitsConsumed > 0 ? unitsConsumed : undefined,
      depositAmount,
      depositStatus: deposit?.status ?? 'None',
      depositAlreadyProcessed: isDepositAlreadyProcessed,
      depositDeducted,
      depositRefund,
      totalDues,
      netAmount,
      netAmountLabel:
        netAmount > 0
          ? `Tenant owes ₹${netAmount}`
          : netAmount < 0
            ? `Refund ₹${Math.abs(netAmount)} to tenant`
            : 'Settled - no dues',
      unpaidBills: unpaidBillsList,
    };

    return NextResponse.json({
      message: 'Tenant checked out successfully',
      summary,
    });
  } catch (error) {
    console.error('Error during checkout:', error);
    return NextResponse.json(
      { error: 'Failed to check out tenant' },
      { status: 500 }
    );
  }
}
