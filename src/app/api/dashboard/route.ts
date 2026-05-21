import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { calculateAccruedRentWithChanges } from '@/lib/billing-utils';

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

    // Recent guests — only Live guests with billing summary
    const recentGuests = await db.guest.findMany({
      where: { status: 'Live' },
      orderBy: { checkInDate: 'desc' },
      include: {
        room: {
          select: {
            roomNo: true,
            type: true,
            baseRent: true,
            monthlyRent: true,
          },
        },
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
          },
        },
      },
    });

    // Fetch all rent changes for all rooms (to calculate accrued rent correctly)
    const allRentChanges = await db.rentChange.findMany({
      select: {
        id: true,
        roomId: true,
        oldRent: true,
        newRent: true,
        effectiveDate: true,
      },
      orderBy: { effectiveDate: 'asc' },
    });

    // Group rent changes by roomId
    const rentChangesByRoom: Record<string, typeof allRentChanges> = {};
    for (const rc of allRentChanges) {
      if (!rentChangesByRoom[rc.roomId]) rentChangesByRoom[rc.roomId] = [];
      rentChangesByRoom[rc.roomId].push(rc);
    }

    // Calculate billing summary for each guest
    const recentGuestsWithBilling = recentGuests.map(guest => {
      const unpaidBills = guest.bills.filter(b => b.status !== 'Paid');
      const totalPaid = guest.bills.reduce((sum, b) => sum + (b.paidAmount || 0), 0);
      const totalOutstanding = unpaidBills.reduce((sum, b) => sum + Math.max(0, b.totalAmount - (b.paidAmount || 0)), 0);

      // Current billing period
      const now = new Date();
      const currentDay = now.getDate();
      const billingCycleDate = guest.billingCycleDate;
      let currentMonth: number, currentYear: number;
      if (currentDay > billingCycleDate) {
        currentMonth = now.getMonth() + 1;
        currentYear = now.getFullYear();
      } else {
        currentMonth = now.getMonth();
        currentYear = now.getFullYear();
        if (currentMonth === 0) { currentMonth = 12; currentYear--; }
      }

      const currentPeriodBill = guest.bills.find(b => b.billingMonth === currentMonth && b.billingYear === currentYear);
      const monthlyRent = guest.room.monthlyRent;
      const currentMonthBill = currentPeriodBill
        ? Math.max(0, currentPeriodBill.totalAmount - (currentPeriodBill.paidAmount || 0))
        : monthlyRent;
      const previousDue = Math.max(0, totalOutstanding - currentMonthBill);

      // Calculate stay months
      const checkIn = new Date(guest.checkInDate);
      let months = (now.getFullYear() - checkIn.getFullYear()) * 12 + (now.getMonth() - checkIn.getMonth());
      if (now.getDate() < checkIn.getDate()) months--;
      if (months < 0) months = 0;

      // Calculate totalAccruedRent accounting for rent changes
      const roomRentChanges = rentChangesByRoom[guest.roomId] || [];
      const { totalAccruedRent } = calculateAccruedRentWithChanges(
        guest.checkInDate,
        monthlyRent,
        roomRentChanges.map(rc => ({
          effectiveDate: rc.effectiveDate,
          newRent: rc.newRent,
          oldRent: rc.oldRent,
        }))
      );

      return {
        id: guest.id,
        name: guest.name,
        phone: guest.phone,
        checkInDate: guest.checkInDate,
        status: guest.status,
        billingCycleDate: guest.billingCycleDate,
        room: guest.room,
        billing: {
          totalAccruedRent,
          totalPaid,
          totalOutstanding,
          currentMonthBill,
          previousDue,
          stayMonths: months,
        },
      };
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
      recentGuests: recentGuestsWithBilling,
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
