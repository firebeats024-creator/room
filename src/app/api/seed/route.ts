import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST /api/seed - Reset all data (clean slate for real use)
export async function POST() {
  try {
    // Delete all data in correct order (respecting foreign keys)
    // 1. Bills (depends on Guest, Room)
    const billsDeleted = await db.bill.deleteMany();
    // 2. ElectricityReadings (depends on Guest)
    const electricityDeleted = await db.electricityReading.deleteMany();
    // 3. SecurityDeposits (depends on Guest)
    const depositsDeleted = await db.securityDeposit.deleteMany();
    // 4. MemberHistory (depends on Guest)
    const membersDeleted = await db.memberHistory.deleteMany();
    // 5. RentChange (depends on Room)
    const rentChangesDeleted = await db.rentChange.deleteMany();
    // 6. Guests (depends on Room)
    const guestsDeleted = await db.guest.deleteMany();
    // 7. Rooms (no dependencies left)
    const roomsDeleted = await db.room.deleteMany();

    return NextResponse.json({
      message: 'Database reset complete — all data cleared!',
      deleted: {
        bills: billsDeleted.count,
        electricityReadings: electricityDeleted.count,
        securityDeposits: depositsDeleted.count,
        memberHistory: membersDeleted.count,
        rentChanges: rentChangesDeleted.count,
        guests: guestsDeleted.count,
        rooms: roomsDeleted.count,
      },
    });
  } catch (error) {
    console.error('Error resetting database:', error);
    return NextResponse.json(
      { error: 'Failed to reset database: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
}
