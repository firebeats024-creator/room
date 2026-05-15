import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/electricity?guestId=xxx - Get electricity readings for a guest
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const guestId = searchParams.get('guestId');

    if (!guestId) {
      return NextResponse.json(
        { error: 'guestId query parameter is required' },
        { status: 400 }
      );
    }

    const readings = await db.electricityReading.findMany({
      where: { guestId },
      orderBy: { readingDate: 'desc' },
    });

    return NextResponse.json(readings);
  } catch (error) {
    console.error('Error fetching electricity readings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch electricity readings' },
      { status: 500 }
    );
  }
}

// POST /api/electricity - Create a new electricity reading
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { guestId, reading, readingDate } = body;

    if (!guestId || reading === undefined || reading === null) {
      return NextResponse.json(
        { error: 'guestId and reading are required' },
        { status: 400 }
      );
    }

    // Verify guest exists
    const guest = await db.guest.findUnique({
      where: { id: guestId },
    });

    if (!guest) {
      return NextResponse.json(
        { error: 'Guest not found' },
        { status: 404 }
      );
    }

    if (guest.status === 'Checked-out') {
      return NextResponse.json(
        { error: 'Cannot add reading for checked-out guest' },
        { status: 400 }
      );
    }

    // Get the previous reading for validation
    const lastReading = await db.electricityReading.findFirst({
      where: { guestId },
      orderBy: { readingDate: 'desc' },
    });

    if (lastReading && reading < lastReading.reading) {
      return NextResponse.json(
        { error: 'New reading cannot be less than the previous reading' },
        { status: 400 }
      );
    }

    const newReading = await db.electricityReading.create({
      data: {
        guestId,
        reading: parseFloat(reading),
        readingDate: readingDate ? new Date(readingDate) : new Date(),
      },
    });

    return NextResponse.json(newReading, { status: 201 });
  } catch (error) {
    console.error('Error creating electricity reading:', error);
    return NextResponse.json(
      { error: 'Failed to create electricity reading' },
      { status: 500 }
    );
  }
}
