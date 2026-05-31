import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/members?guestId=xxx — Get member history for a guest
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const guestId = searchParams.get('guestId');

    if (!guestId) {
      return NextResponse.json({ error: 'guestId is required' }, { status: 400 });
    }

    const history = await db.memberHistory.findMany({
      where: { guestId },
      orderBy: { effectiveDate: 'asc' },
    });

    return NextResponse.json(history);
  } catch (error) {
    console.error('Error fetching member history:', error);
    return NextResponse.json({ error: 'Failed to fetch member history' }, { status: 500 });
  }
}

// POST /api/members — Update member count for a guest
// Rent does NOT change when member count changes — only the member count is tracked.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { guestId, newMemberCount, effectiveDate, reason } = body;

    if (!guestId || !newMemberCount || !effectiveDate) {
      return NextResponse.json(
        { error: 'guestId, newMemberCount, and effectiveDate are required' },
        { status: 400 }
      );
    }

    // Verify guest exists
    const guest = await db.guest.findUnique({
      where: { id: guestId },
      include: { room: true },
    });

    if (!guest) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    if (guest.status !== 'Live') {
      return NextResponse.json({ error: 'Cannot update members for checked-out tenant' }, { status: 400 });
    }

    const oldMemberCount = guest.totalMembers;
    const newCount = parseInt(newMemberCount);

    if (newCount === oldMemberCount) {
      return NextResponse.json({ error: 'New member count is same as current' }, { status: 400 });
    }

    if (newCount < 1) {
      return NextResponse.json({ error: 'Member count must be at least 1' }, { status: 400 });
    }

    // Create the member history entry (no rent change)
    const memberEntry = await db.memberHistory.create({
      data: {
        guestId,
        oldMemberCount,
        newMemberCount: newCount,
        effectiveDate: new Date(effectiveDate),
        reason: reason || `${Math.abs(newCount - oldMemberCount)} member${Math.abs(newCount - oldMemberCount) > 1 ? 's' : ''} ${newCount > oldMemberCount ? 'added' : 'left'}`,
      },
    });

    // Update the guest's totalMembers
    await db.guest.update({
      where: { id: guestId },
      data: { totalMembers: newCount },
    });

    // NOTE: Rent does NOT change. Room's monthlyRent stays the same.

    return NextResponse.json({
      ...memberEntry,
      message: `Members updated: ${oldMemberCount} → ${newCount}. Rent unchanged: ₹${guest.room.monthlyRent}/mo`,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating member history:', error);
    return NextResponse.json({ error: 'Failed to create member history' }, { status: 500 });
  }
}
