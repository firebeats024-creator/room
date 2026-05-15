import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST /api/seed - Reset all data (clean slate for real use)
export async function POST() {
  try {
    // Delete all data in correct order (respecting foreign keys)
    const billsDeleted = await db.bill.deleteMany();
    const electricityDeleted = await db.electricityReading.deleteMany();
    const depositsDeleted = await db.securityDeposit.deleteMany();
    const guestsDeleted = await db.guest.deleteMany();
    const roomsDeleted = await db.room.deleteMany();

    return NextResponse.json({
      message: 'Database reset complete — all data cleared!',
      deleted: {
        bills: billsDeleted.count,
        electricityReadings: electricityDeleted.count,
        securityDeposits: depositsDeleted.count,
        guests: guestsDeleted.count,
        rooms: roomsDeleted.count,
      },
    });
  } catch (error) {
    console.error('Error resetting database:', error);
    return NextResponse.json(
      { error: 'Failed to reset database' },
      { status: 500 }
    );
  }
}
