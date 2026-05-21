import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getDateComponents } from '@/lib/billing-utils';

// POST /api/rooms/[id]/update-rent — Update room rent with history tracking
// For OCCUPIED rooms: Updates monthlyRent + creates RentChange record + updates future bills
// For VACANT rooms: Updates both baseRent and monthlyRent (changes the default rent for future guests)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { newRent, effectiveDate, reason } = body;

    if (!newRent || newRent <= 0) {
      return NextResponse.json(
        { error: 'New rent must be greater than 0' },
        { status: 400 }
      );
    }

    if (!effectiveDate) {
      return NextResponse.json(
        { error: 'Effective date is required' },
        { status: 400 }
      );
    }

    // Fetch the room
    const room = await db.room.findUnique({
      where: { id },
    });

    if (!room) {
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      );
    }

    // For vacant rooms, compare against baseRent; for occupied, compare against monthlyRent
    const currentRent = room.status === 'Vacant' ? room.baseRent : room.monthlyRent;

    if (newRent === currentRent) {
      return NextResponse.json(
        { error: 'New rent is same as current rent' },
        { status: 400 }
      );
    }

    const oldRent = currentRent;

    if (room.status === 'Vacant') {
      // ─── VACANT ROOM: Update baseRent AND monthlyRent ───
      // This changes the default rent for the next guest. No RentChange record needed
      // since there's no active guest whose bills need adjusting.
      await db.room.update({
        where: { id },
        data: {
          baseRent: newRent,
          monthlyRent: newRent,
        },
      });

      return NextResponse.json({
        message: 'Default rent updated successfully',
        oldRent,
        newRent,
        effectiveDate,
        roomId: id,
        guestsAffected: 0,
        isBaseRentUpdate: true,
      });
    }

    // ─── OCCUPIED ROOM: Update monthlyRent + create RentChange + update future bills ───
    // Create rent change record and update room rent in a transaction
    const [rentChange, updatedRoom] = await db.$transaction([
      db.rentChange.create({
        data: {
          roomId: id,
          oldRent,
          newRent,
          effectiveDate: new Date(effectiveDate),
          reason: reason || '',
        },
      }),
      db.room.update({
        where: { id },
        data: { monthlyRent: newRent },
      }),
    ]);

    // Now, handle the billing implications for live guests in this room
    const liveGuests = await db.guest.findMany({
      where: {
        roomId: id,
        status: 'Live',
      },
      include: {
        bills: {
          select: { billingMonth: true, billingYear: true },
        },
      },
    });

    const effectiveParts = getDateComponents(new Date(effectiveDate));
    const effectiveMonth = effectiveParts.month;
    const effectiveYear = effectiveParts.year;

    // For each live guest, we need to ensure future bills use the new rent
    // Bills that already exist for periods BEFORE the effective date stay unchanged
    // Bills for periods ON or AFTER the effective date need to be updated if they exist
    for (const guest of liveGuests) {
      // Find bills for the effective period and after that use the old rent
      const billsToUpdate = await db.bill.findMany({
        where: {
          guestId: guest.id,
          roomId: id,
          // Bills for the effective month or later
          billingYear: { gte: effectiveYear },
          rentAmount: oldRent,
          status: { in: ['Unpaid', 'Overdue', 'Partially-Paid'] },
        },
      });

      for (const bill of billsToUpdate) {
        // Only update bills that are in the effective period or later
        if (
          bill.billingYear > effectiveYear ||
          (bill.billingYear === effectiveYear && bill.billingMonth >= effectiveMonth)
        ) {
          const rentDifference = newRent - oldRent;
          const newTotalAmount = bill.totalAmount + rentDifference;

          await db.bill.update({
            where: { id: bill.id },
            data: {
              rentAmount: newRent,
              totalAmount: newTotalAmount,
            },
          });
        }
      }
    }

    return NextResponse.json({
      message: 'Rent updated successfully',
      oldRent,
      newRent,
      effectiveDate,
      roomId: id,
      guestsAffected: liveGuests.length,
      isBaseRentUpdate: false,
    });
  } catch (error) {
    console.error('Error updating rent:', error);
    return NextResponse.json(
      { error: 'Failed to update rent' },
      { status: 500 }
    );
  }
}
