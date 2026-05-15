import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/dashboard - Get dashboard statistics
export async function GET() {
  try {
    // Auto-mark overdue: ALL Unpaid bills → Overdue, Partially-Paid past due → Overdue
    const today = new Date();

    const unpaidBills = await db.bill.findMany({
      where: { status: 'Unpaid' },
      select: { id: true },
    });
    for (const bill of unpaidBills) {
      await db.bill.update({
        where: { id: bill.id },
        data: { status: 'Overdue' },
      });
    }

    const partiallyPaidOverdue = await db.bill.findMany({
      where: { status: 'Partially-Paid', dueDate: { lt: today } },
      select: { id: true },
    });
    for (const bill of partiallyPaidOverdue) {
      await db.bill.update({
        where: { id: bill.id },
        data: { status: 'Overdue' },
      });
    }

    // Total rooms
    const totalRooms = await db.room.count();

    // Occupied rooms
    const occupiedRooms = await db.room.count({
      where: { status: 'Occupied' },
    });

    // Vacant rooms
    const vacantRooms = await db.room.count({
      where: { status: 'Vacant' },
    });

    // Revenue = fully paid bills' total + partially paid bills' paid amount + overdue bills' paid amount
    const paidBills = await db.bill.findMany({
      where: { status: 'Paid' },
      select: { totalAmount: true },
    });
    const nonPaidBills = await db.bill.findMany({
      where: { status: { in: ['Overdue', 'Partially-Paid'] } },
      select: { paidAmount: true },
    });
    const totalRevenue = paidBills.reduce((sum, b) => sum + b.totalAmount, 0)
      + nonPaidBills.reduce((sum, b) => sum + (b.paidAmount || 0), 0);

    // Overdue/Due bills = ALL bills not fully Paid
    // overdueAmount = sum of remaining (totalAmount - paidAmount) for all non-Paid bills
    const overdueBillsData = await db.bill.findMany({
      where: { status: { in: ['Overdue', 'Partially-Paid'] } },
      select: { totalAmount: true, paidAmount: true },
    });

    const overdueBills = overdueBillsData.length;
    const overdueAmount = overdueBillsData.reduce(
      (sum, b) => sum + (b.totalAmount - (b.paidAmount || 0)),
      0
    );

    // Active deposits (status = Held)
    const activeDeposits = await db.securityDeposit.count({
      where: { status: 'Held' },
    });

    // Total deposit amount held
    const heldDeposits = await db.securityDeposit.findMany({
      where: { status: 'Held' },
      select: { amount: true },
    });
    const totalDepositAmount = heldDeposits.reduce(
      (sum, d) => sum + d.amount,
      0
    );

    // Recent guests (last 5)
    const recentGuests = await db.guest.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        room: {
          select: {
            roomNo: true,
            type: true,
            monthlyRent: true,
          },
        },
      },
    });

    // Rooms under maintenance
    const maintenanceRooms = await db.room.count({
      where: { status: 'Maintenance' },
    });

    // Active (live) guests count
    const activeGuests = await db.guest.count({
      where: { status: 'Live' },
    });

    // Monthly revenue breakdown (current year)
    const currentYear = new Date().getFullYear();
    const monthlyRevenue = await db.bill.findMany({
      where: {
        status: 'Paid',
        billingYear: currentYear,
      },
      select: {
        billingMonth: true,
        totalAmount: true,
      },
    });

    const revenueByMonth: Record<number, number> = {};
    for (const bill of monthlyRevenue) {
      revenueByMonth[bill.billingMonth] =
        (revenueByMonth[bill.billingMonth] || 0) + bill.totalAmount;
    }

    return NextResponse.json({
      totalRooms,
      occupiedRooms,
      vacantRooms,
      maintenanceRooms,
      activeGuests,
      totalRevenue,
      overdueBills,
      overdueAmount,
      activeDeposits,
      totalDepositAmount,
      recentGuests,
      revenueByMonth,
      occupancyRate: totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0,
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats' },
      { status: 500 }
    );
  }
}
