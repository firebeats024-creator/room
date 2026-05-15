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
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(guests);
  } catch (error) {
    console.error('Error fetching guests:', error);
    return NextResponse.json(
      { error: 'Failed to fetch guests' },
      { status: 500 }
    );
  }
}
