import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import * as XLSX from 'xlsx';
import { calculateStayMonths, getDateComponents } from '@/lib/billing-utils';

// GET /api/export — Generate and download Excel file with all PG data
export async function GET() {
  try {
    // ─── Fetch all data ───

    const rooms = await db.room.findMany({
      orderBy: { floor: 'asc' },
      include: {
        guests: {
          select: {
            id: true,
            name: true,
            phone: true,
            status: true,
            checkInDate: true,
            checkOutDate: true,
            totalMembers: true,
          },
        },
      },
    });

    const guests = await db.guest.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        room: { select: { roomNo: true, type: true, monthlyRent: true } },
        securityDeposit: true,
        bills: {
          orderBy: [{ billingYear: 'asc' }, { billingMonth: 'asc' }],
        },
      },
    });

    const bills = await db.bill.findMany({
      orderBy: [{ billingYear: 'desc' }, { billingMonth: 'desc' }],
      include: {
        guest: { select: { name: true, phone: true } },
        room: { select: { roomNo: true, type: true } },
      },
    });

    const deposits = await db.securityDeposit.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        guest: { select: { name: true, phone: true } },
      },
    });

    // ─── Helper ───

    const fmtDate = (d: Date | string | null): string => {
      if (!d) return '';
      const { year, month, day } = getDateComponents(String(d));
      return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
    };

    const fmtCurrency = (n: number): number => Math.round(n);

    // ─── Sheet 1: Rooms ───

    const roomsData = rooms.map((r) => {
      const activeGuest = r.guests.find((g) => g.status === 'Live');
      return {
        'Room No': r.roomNo,
        Floor: r.floor,
        Type: r.type,
        'Monthly Rent (₹)': r.monthlyRent,
        Status: r.status,
        'Occupant': activeGuest?.name || '',
        'Check-in Date': activeGuest ? fmtDate(activeGuest.checkInDate) : '',
        'Members': activeGuest?.totalMembers || '',
      };
    });

    // ─── Sheet 2: Guests ───

    const guestsData = guests.map((g) => {
      const isLive = g.status === 'Live';
      const stayMonths = isLive ? calculateStayMonths(g.checkInDate, new Date()) : 0;
      const totalPaid = g.bills.reduce(
        (sum, b) => sum + (b.status === 'Paid' ? b.totalAmount : (b.paidAmount || 0)),
        0
      );
      const totalBilled = g.bills.reduce((sum, b) => sum + b.totalAmount, 0);
      const totalBalance = Math.max(0, stayMonths * g.room.monthlyRent - totalPaid);

      return {
        'Guest Name': g.name,
        Phone: g.phone,
        'Aadhaar No': g.aadhaarNo,
        Occupation: g.occupation,
        'Work Location': g.workLocation,
        'Emergency Contact': g.emergencyContact,
        'Total Members': g.totalMembers,
        'Room No': g.room.roomNo,
        'Room Type': g.room.type,
        'Monthly Rent (₹)': g.room.monthlyRent,
        'Check-in Date': fmtDate(g.checkInDate),
        'Check-out Date': fmtDate(g.checkOutDate),
        Status: g.status === 'Live' ? 'Active' : 'Checked Out',
        'Stay Months': stayMonths,
        'Total Billed (₹)': fmtCurrency(totalBilled),
        'Total Paid (₹)': fmtCurrency(totalPaid),
        'Outstanding (₹)': fmtCurrency(totalBalance),
        'Security Deposit (₹)': g.securityDeposit?.amount || 0,
        'Deposit Status': g.securityDeposit?.status || '',
      };
    });

    // ─── Sheet 3: Bills ───

    const MONTH_NAMES = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];

    const billsData = bills.map((b) => ({
      'Guest Name': b.guest.name,
      'Phone': b.guest.phone,
      'Room No': b.room.roomNo,
      'Billing Month': `${MONTH_NAMES[b.billingMonth - 1]} ${b.billingYear}`,
      'Rent (₹)': fmtCurrency(b.rentAmount),
      'Electricity (₹)': fmtCurrency(b.electricityCharge),
      'Previous Reading': b.previousReading,
      'Current Reading': b.currentReading,
      'Units Consumed': b.unitsConsumed,
      'Rate/Unit (₹)': b.ratePerUnit,
      'Adjustment (₹)': fmtCurrency(b.manualAdjustment),
      'Adjustment Reason': b.adjustmentReason || '',
      'Total Amount (₹)': fmtCurrency(b.totalAmount),
      'Paid Amount (₹)': fmtCurrency(b.paidAmount || 0),
      'Remaining (₹)': fmtCurrency(b.totalAmount - (b.paidAmount || 0)),
      'Due Date': fmtDate(b.dueDate),
      'Paid Date': fmtDate(b.paidDate),
      'Status': b.status,
    }));

    // ─── Sheet 4: Security Deposits ───

    const depositsData = deposits.map((d) => ({
      'Guest Name': d.guest.name,
      'Phone': d.guest.phone,
      'Deposit Amount (₹)': fmtCurrency(d.amount),
      'Status': d.status,
      'Deducted (₹)': fmtCurrency(d.deductedAmount),
      'Refund Date': fmtDate(d.refundDate),
      'Notes': d.notes || '',
    }));

    // ─── Sheet 5: Summary ───

    const totalRooms = rooms.length;
    const occupiedRooms = rooms.filter((r) => r.status === 'Occupied').length;
    const vacantRooms = rooms.filter((r) => r.status === 'Vacant').length;
    const maintenanceRooms = rooms.filter((r) => r.status === 'Maintenance').length;
    const activeGuests = guests.filter((g) => g.status === 'Live').length;
    const totalRevenue = bills
      .filter((b) => b.status === 'Paid')
      .reduce((sum, b) => sum + b.totalAmount, 0);
    const overdueAmount = bills
      .filter((b) => b.status === 'Overdue' || b.status === 'Partially-Paid')
      .reduce((sum, b) => sum + (b.totalAmount - (b.paidAmount || 0)), 0);
    const totalDeposits = deposits
      .filter((d) => d.status === 'Held')
      .reduce((sum, d) => sum + d.amount, 0);

    const summaryData = [
      { 'Metric': 'Total Rooms', 'Value': totalRooms },
      { 'Metric': 'Occupied Rooms', 'Value': occupiedRooms },
      { 'Metric': 'Vacant Rooms', 'Value': vacantRooms },
      { 'Metric': 'Maintenance Rooms', 'Value': maintenanceRooms },
      { 'Metric': 'Occupancy Rate', 'Value': totalRooms > 0 ? `${Math.round((occupiedRooms / totalRooms) * 100)}%` : '0%' },
      { 'Metric': 'Active Guests', 'Value': activeGuests },
      { 'Metric': 'Total Revenue Collected (₹)', 'Value': fmtCurrency(totalRevenue) },
      { 'Metric': 'Overdue / Unpaid Amount (₹)', 'Value': fmtCurrency(overdueAmount) },
      { 'Metric': 'Security Deposits Held (₹)', 'Value': fmtCurrency(totalDeposits) },
      { 'Metric': 'Export Date', 'Value': new Date().toLocaleString('en-IN') },
    ];

    // ─── Build Workbook ───

    const wb = XLSX.utils.book_new();

    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    wsSummary['!cols'] = [{ wch: 30 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    const wsRooms = XLSX.utils.json_to_sheet(roomsData);
    wsRooms['!cols'] = [
      { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 15 },
      { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 10 },
    ];
    XLSX.utils.book_append_sheet(wb, wsRooms, 'Rooms');

    const wsGuests = XLSX.utils.json_to_sheet(guestsData);
    wsGuests['!cols'] = [
      { wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
      { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 10 },
      { wch: 10 }, { wch: 15 }, { wch: 14 }, { wch: 14 },
      { wch: 14 }, { wch: 12 }, { wch: 15 }, { wch: 15 },
      { wch: 16 }, { wch: 18 }, { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(wb, wsGuests, 'Guests');

    const wsBills = XLSX.utils.json_to_sheet(billsData);
    wsBills['!cols'] = [
      { wch: 20 }, { wch: 14 }, { wch: 10 }, { wch: 14 },
      { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
      { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 18 },
      { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 },
      { wch: 14 }, { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(wb, wsBills, 'Bills');

    const wsDeposits = XLSX.utils.json_to_sheet(depositsData);
    wsDeposits['!cols'] = [
      { wch: 20 }, { wch: 14 }, { wch: 18 }, { wch: 18 },
      { wch: 12 }, { wch: 14 }, { wch: 30 },
    ];
    XLSX.utils.book_append_sheet(wb, wsDeposits, 'Deposits');

    // ─── Generate Buffer ───

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // ─── Return as downloadable file ───

    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `PG_Hostel_Report_${dateStr}.xlsx`;

    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error exporting data:', error);
    return NextResponse.json(
      { error: 'Failed to export data' },
      { status: 500 }
    );
  }
}
