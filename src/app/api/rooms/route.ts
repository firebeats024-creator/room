import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/rooms - Get all rooms
export async function GET() {
  try {
    const rooms = await db.room.findMany({
      orderBy: { floor: 'asc' },
      include: {
        guests: {
          where: { status: 'Live' },
          select: { id: true, name: true, checkInDate: true },
        },
        rentChanges: {
          orderBy: { effectiveDate: 'desc' },
          take: 5,
        },
      },
    });

    // Safety: For vacant rooms, ensure monthlyRent = baseRent
    // (this prevents stale rent from a previous guest showing in the UI)
    const sanitizedRooms = rooms.map((room) => {
      if (room.status === 'Vacant' && room.baseRent > 0 && room.monthlyRent !== room.baseRent) {
        // Fix the stale monthlyRent in the background (fire-and-forget)
        db.room.update({
          where: { id: room.id },
          data: { monthlyRent: room.baseRent },
        }).catch(() => {}); // Ignore errors — this is a safety measure

        return { ...room, monthlyRent: room.baseRent };
      }
      return room;
    });

    return NextResponse.json(sanitizedRooms);
  } catch (error) {
    console.error('Error fetching rooms:', error);
    return NextResponse.json(
      { error: 'Failed to fetch rooms' },
      { status: 500 }
    );
  }
}

// POST /api/rooms - Create a new room
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { roomNo, floor, type, monthlyRent, status } = body;

    // Validate required fields
    if (!roomNo) {
      return NextResponse.json(
        { error: 'Room number is required' },
        { status: 400 }
      );
    }

    // Check if room number already exists
    const existing = await db.room.findUnique({
      where: { roomNo },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Room number already exists' },
        { status: 409 }
      );
    }

    const room = await db.room.create({
      data: {
        roomNo,
        floor: floor ?? 1,
        type: type ?? 'Single',
        baseRent: monthlyRent ?? 5000,
        monthlyRent: monthlyRent ?? 5000,
        status: status ?? 'Vacant',
      },
    });

    return NextResponse.json(room, { status: 201 });
  } catch (error) {
    console.error('Error creating room:', error);
    return NextResponse.json(
      { error: 'Failed to create room' },
      { status: 500 }
    );
  }
}
