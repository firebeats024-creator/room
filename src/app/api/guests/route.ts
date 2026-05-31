import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/guests - Get all guests with room info
export async function GET() {
  try {
    // Auto-mark overdue bills: Unpaid bills whose dueDate has passed
    const today = new Date();
    const unpaidOverdue = await db.bill.findMany({
      where: {
        status: 'Unpaid',
        dueDate: { lt: today },
      },
      select: { id: true },
    });

    for (const bill of unpaidOverdue) {
      await db.bill.update({
        where: { id: bill.id },
        data: { status: 'Overdue' },
      });
    }

    const guests = await db.guest.findMany({
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
          select: { id: true, totalAmount: true, paidAmount: true, status: true, rentAmount: true, electricityCharge: true, billingMonth: true, billingYear: true, dueDate: true },
        },
      },
    });

    // Sort guests by room number (numeric) for consistent display
    const numericRoomSort = (a: string, b: string): number => {
      const numA = parseInt(a, 10);
      const numB = parseInt(b, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    };
    guests.sort((a, b) => numericRoomSort(a.room.roomNo, b.room.roomNo));

    return NextResponse.json(guests);
  } catch (error) {
    console.error('Error fetching tenants:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tenants' },
      { status: 500 }
    );
  }
}
