import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/guests/[id] - Get a single guest with full details
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

    return NextResponse.json(guest);
  } catch (error) {
    console.error('Error fetching guest:', error);
    return NextResponse.json(
      { error: 'Failed to fetch guest' },
      { status: 500 }
    );
  }
}
