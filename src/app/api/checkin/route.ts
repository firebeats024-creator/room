import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getDateComponents } from '@/lib/billing-utils';

// POST /api/checkin - Check-in a guest
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, nameHindi, phone, aadhaarNo, emergencyContact, occupation, workLocation, totalMembers, photoLink, roomId, checkInDate, openingMeterReading, ratePerUnit, securityDeposit } = body;

    // Validate required fields
    if (!name || !roomId || !checkInDate) {
      return NextResponse.json(
        { error: 'Name, roomId, and checkInDate are required' },
        { status: 400 }
      );
    }

    // Check if room exists and is available
    const room = await db.room.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      );
    }

    if (room.status === 'Occupied') {
      return NextResponse.json(
        { error: 'Room is already occupied' },
        { status: 409 }
      );
    }

    // Timezone-safe date parsing (uses UTC methods)
    const checkInParts = getDateComponents(checkInDate);
    // IMPORTANT: For vacant rooms, use baseRent as the canonical rent
    // (monthlyRent should equal baseRent after checkout, but as a safety measure,
    // prefer baseRent when the room is vacant to prevent stale rent from previous guest)
    const monthlyRent = room.status === 'Vacant' && room.baseRent > 0
      ? room.baseRent
      : room.monthlyRent;
    const billingCycleDate = checkInParts.day; // day of month (UTC-safe)
    const billingMonth = checkInParts.month; // 1-12 (UTC-safe)
    const billingYear = checkInParts.year; // (UTC-safe)

    // Calculate due date: billing cycle date of next month
    let dueMonth = billingMonth + 1;
    let dueYear = billingYear;
    if (dueMonth > 12) {
      dueMonth = 1;
      dueYear++;
    }
    // Handle months where billingCycleDate doesn't exist (e.g., 31st in 30-day months)
    const maxDayInDueMonth = new Date(dueYear, dueMonth, 0).getDate();
    const effectiveDueDay = Math.min(billingCycleDate, maxDayInDueMonth);
    const dueDate = new Date(Date.UTC(dueYear, dueMonth - 1, effectiveDueDay));

    // Use a transaction to create guest, deposit, first bill, and update room
    const result = await db.$transaction(async (tx) => {
      // Create the guest
      const guest = await tx.guest.create({
        data: {
          name,
          nameHindi: nameHindi ?? '',
          phone: phone ?? '',
          aadhaarNo: aadhaarNo ?? '',
          emergencyContact: emergencyContact ?? '',
          occupation: occupation ?? '',
          workLocation: workLocation ?? '',
          totalMembers: totalMembers ?? 1,
          photoLink: photoLink ?? '',
          roomId,
          checkInDate: new Date(checkInDate),
          billingCycleDate,
          status: 'Live',
        },
      });

      // Create security deposit (customizable — defaults to 1 month rent)
      const parsedDeposit = securityDeposit !== undefined ? parseFloat(securityDeposit) : monthlyRent;
      const depositAmount = isNaN(parsedDeposit) ? monthlyRent : parsedDeposit;
      const deposit = depositAmount > 0
        ? await tx.securityDeposit.create({
            data: {
              guestId: guest.id,
              amount: depositAmount,
              status: 'Held',
              notes: depositAmount === monthlyRent
                ? 'Initial deposit - 1 month rent'
                : `Initial deposit - ${depositAmount}`,
            },
          })
        : null;

      // Create first bill with FULL_MONTH rent
      const effectiveRatePerUnit = ratePerUnit || 10;
      const effectiveOpeningReading = openingMeterReading || 0;
      const bill = await tx.bill.create({
        data: {
          guestId: guest.id,
          roomId,
          billingMonth,
          billingYear,
          rentAmount: monthlyRent,
          electricityCharge: 0,
          previousReading: effectiveOpeningReading,
          currentReading: effectiveOpeningReading,
          unitsConsumed: 0,
          ratePerUnit: effectiveRatePerUnit,
          minChargePolicy: 'FULL_MONTH',
          manualAdjustment: 0,
          adjustmentReason: '',
          isCustomBill: false,
          totalAmount: monthlyRent,
          dueDate,
          status: 'Unpaid',
        },
      });

      // Always create initial electricity reading record (even for 0 — it's a valid reading)
      await tx.electricityReading.create({
        data: {
          guestId: guest.id,
          reading: effectiveOpeningReading,
          readingDate: new Date(checkInDate),
        },
      });

      // Update room status to Occupied and ensure monthlyRent matches the rent used for billing
      // This is a safety measure: if monthlyRent was stale from a previous guest,
      // we reset it here to match the actual rent being charged to the new guest
      await tx.room.update({
        where: { id: roomId },
        data: { status: 'Occupied', monthlyRent },
      });

      return { guest, deposit, bill };
    });

    return NextResponse.json(
      {
        message: 'Guest checked in successfully',
        guest: result.guest,
        deposit: result.deposit,
        bill: result.bill,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error during check-in:', error);
    return NextResponse.json(
      { error: 'Failed to check in guest' },
      { status: 500 }
    );
  }
}
