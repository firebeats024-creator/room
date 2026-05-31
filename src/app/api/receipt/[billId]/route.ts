import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';
import { db } from '@/lib/db';
import { getDateComponents } from '@/lib/billing-utils';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const PRIMARY_COLOR = '#047857'; // emerald green

function formatCurrency(amount: number): string {
  const rounded = Math.round(amount);
  const str = rounded.toString();
  // Indian number formatting: last 3 digits, then groups of 2
  if (str.length <= 3) return `₹${str}`;
  const last3 = str.slice(-3);
  const rest = str.slice(0, -3);
  const formatted = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `₹${formatted},${last3}`;
}

function formatDate(dateInput: string | Date): string {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const day = d.getUTCDate().toString().padStart(2, '0');
  const month = MONTH_NAMES[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ billId: string }> }
) {
  const { billId } = await params;

  try {
    // Fetch bill with guest and room info
    const bill = await db.bill.findUnique({
      where: { id: billId },
      include: {
        guest: true,
        room: true,
      },
    });

    if (!bill) {
      return new Response(JSON.stringify({ error: 'Bill not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const guest = bill.guest;
    const room = bill.room;

    // Create PDF document
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const passThrough = new PassThrough();
    doc.pipe(passThrough);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const leftMargin = doc.page.margins.left;

    // ── Header Background ──
    doc.save();
    doc.rect(0, 0, doc.page.width, 100).fill(PRIMARY_COLOR);
    doc.restore();

    // ── Header Text ──
    doc
      .fillColor('#ffffff')
      .fontSize(22)
      .font('Helvetica-Bold')
      .text('PG HOSTEL MANAGER', leftMargin, 28, { align: 'center' });

    doc
      .fontSize(13)
      .font('Helvetica')
      .text('PAYMENT RECEIPT', leftMargin, 58, { align: 'center' });

    // ── Receipt Meta Info (below header) ──
    const metaY = 115;
    const receiptNo = bill.id.substring(0, 8).toUpperCase();

    doc.fillColor('#333333').fontSize(9).font('Helvetica-Bold');
    doc.text('Receipt No:', leftMargin, metaY, { continued: true });
    doc.font('Helvetica').text(` ${receiptNo}`);

    doc.font('Helvetica-Bold');
    doc.text('Date:', leftMargin + 300, metaY, { continued: true });
    doc.font('Helvetica').text(` ${formatDate(new Date())}`);

    // ── Divider ──
    let y = metaY + 20;
    doc
      .strokeColor(PRIMARY_COLOR)
      .lineWidth(1.5)
      .moveTo(leftMargin, y)
      .lineTo(leftMargin + pageWidth, y)
      .stroke();

    // ── Guest Details Section ──
    y += 15;
    doc
      .fillColor(PRIMARY_COLOR)
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('GUEST DETAILS', leftMargin, y);

    y += 20;
    const labelX = leftMargin;
    const valueX = leftMargin + 130;
    const rowHeight = 18;

    const guestDetails = [
      ['Name', guest.name],
      ['Room No', room.roomNo],
      ['Phone', guest.phone || 'N/A'],
      ['Check-in Date', formatDate(guest.checkInDate)],
    ];

    doc.fontSize(9.5);
    for (const [label, value] of guestDetails) {
      doc.fillColor('#555555').font('Helvetica-Bold').text(label + ':', labelX, y);
      doc.fillColor('#333333').font('Helvetica').text(value, valueX, y);
      y += rowHeight;
    }

    // ── Bill Period Section ──
    y += 10;
    doc
      .fillColor(PRIMARY_COLOR)
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('BILL PERIOD', leftMargin, y);

    y += 20;
    const billingMonthName = MONTH_NAMES[bill.billingMonth - 1];
    const cycleDay = guest.billingCycleDate;

    doc.fontSize(9.5).fillColor('#555555').font('Helvetica-Bold');
    doc.text('Billing Month/Year:', labelX, y);
    doc.fillColor('#333333').font('Helvetica');
    doc.text(`${billingMonthName} ${bill.billingYear}`, valueX, y);

    y += rowHeight;
    doc.fillColor('#555555').font('Helvetica-Bold');
    doc.text('Cycle Date:', labelX, y);
    doc.fillColor('#333333').font('Helvetica');
    doc.text(`${cycleDay}${getOrdinalSuffix(cycleDay)} of every month`, valueX, y);

    // ── Divider ──
    y += rowHeight + 10;
    doc
      .strokeColor(PRIMARY_COLOR)
      .lineWidth(1.5)
      .moveTo(leftMargin, y)
      .lineTo(leftMargin + pageWidth, y)
      .stroke();

    // ── Bill Breakdown Table ──
    y += 15;
    doc
      .fillColor(PRIMARY_COLOR)
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('BILL BREAKDOWN', leftMargin, y);

    y += 20;

    // Table dimensions
    const col1X = leftMargin;           // Description
    const col2X = leftMargin + 280;     // Details
    const col3X = leftMargin + 400;     // Amount (right-aligned)
    const tableWidth = pageWidth;

    // Table header
    const tableHeaderHeight = 24;
    doc.save();
    doc.rect(leftMargin, y, tableWidth, tableHeaderHeight).fill(PRIMARY_COLOR);
    doc.restore();

    doc
      .fillColor('#ffffff')
      .fontSize(9)
      .font('Helvetica-Bold');
    doc.text('Description', col1X + 8, y + 7);
    doc.text('Details', col2X, y + 7);
    doc.text('Amount', col3X, y + 7, { width: 100, align: 'right' });

    y += tableHeaderHeight;

    // Helper: draw a table row
    function drawRow(
      description: string,
      details: string,
      amount: string | null,
      options?: {
        bold?: boolean;
        bgFill?: string;
        textColor?: string;
        height?: number;
      }
    ) {
      const rowH = options?.height || 22;
      const isBold = options?.bold ?? false;
      const bg = options?.bgFill;

      if (bg) {
        doc.save();
        doc.rect(leftMargin, y, tableWidth, rowH).fill(bg);
        doc.restore();
      }

      doc
        .fillColor(options?.textColor || '#333333')
        .fontSize(9)
        .font(isBold ? 'Helvetica-Bold' : 'Helvetica');

      doc.text(description, col1X + 8, y + 6);
      doc.text(details, col2X, y + 6);

      if (amount !== null) {
        doc.text(amount, col3X, y + 6, { width: 100, align: 'right' });
      }

      // Bottom border
      doc
        .strokeColor('#e5e7eb')
        .lineWidth(0.5)
        .moveTo(leftMargin, y + rowH)
        .lineTo(leftMargin + tableWidth, y + rowH)
        .stroke();

      y += rowH;
    }

    // Rent row
    drawRow('Rent Amount', 'Monthly Rent', formatCurrency(bill.rentAmount));

    // Maintenance Charge
    if (bill.maintenanceCharge > 0) {
      drawRow('Maintenance Charge', 'Monthly Maintenance', formatCurrency(bill.maintenanceCharge));
    }

    // Electricity section
    drawRow(
      'Electricity',
      `Prev: ${bill.previousReading} | Curr: ${bill.currentReading}`,
      null,
      { bold: true }
    );
    drawRow(
      '  Units Consumed',
      `${bill.unitsConsumed} units`,
      null,
      { textColor: '#555555' }
    );
    drawRow(
      '  Rate per Unit',
      `${formatCurrency(bill.ratePerUnit).replace('₹', '₹ ')}/unit`,
      null,
      { textColor: '#555555' }
    );
    drawRow(
      '  Electricity Charge',
      '',
      formatCurrency(bill.electricityCharge)
    );

    // Manual Adjustment
    if (bill.manualAdjustment !== 0) {
      const adjLabel = bill.manualAdjustment > 0 ? 'Extra Charge' : 'Discount';
      const adjDetail = bill.adjustmentReason
        ? `${adjLabel}: ${bill.adjustmentReason}`
        : adjLabel;
      drawRow(
        'Manual Adjustment',
        adjDetail,
        formatCurrency(bill.manualAdjustment)
      );
    }

    // Separator line before totals
    y += 2;
    doc
      .strokeColor(PRIMARY_COLOR)
      .lineWidth(1)
      .moveTo(leftMargin, y)
      .lineTo(leftMargin + tableWidth, y)
      .stroke();
    y += 5;

    // Total Amount
    drawRow(
      'Total Amount',
      '',
      formatCurrency(bill.totalAmount),
      { bold: true, bgFill: '#f0fdf4', textColor: PRIMARY_COLOR }
    );

    // Paid Amount
    if (bill.paidAmount > 0) {
      drawRow(
        'Paid Amount',
        '',
        formatCurrency(bill.paidAmount),
        { bgFill: '#f0fdf4' }
      );

      // Balance / Remaining
      const balance = bill.totalAmount - bill.paidAmount;
      drawRow(
        'Balance / Remaining',
        '',
        formatCurrency(balance),
        {
          bold: true,
          bgFill: balance > 0 ? '#fef2f2' : '#f0fdf4',
          textColor: balance > 0 ? '#dc2626' : PRIMARY_COLOR,
        }
      );
    }

    // ── Payment Status ──
    y += 15;
    const statusLabel = bill.status;
    let statusColor = '#dc2626'; // red for unpaid
    if (bill.status === 'Paid') statusColor = PRIMARY_COLOR;
    else if (bill.status === 'Partially-Paid') statusColor = '#d97706'; // amber

    doc.fontSize(11).font('Helvetica-Bold').fillColor('#333333');
    doc.text('Payment Status: ', leftMargin, y, { continued: true });
    doc.fillColor(statusColor).text(statusLabel);

    // ── Due Date ──
    y += 22;
    const dueDateInfo = getDateComponents(bill.dueDate);
    const dueDateStr = formatDate(bill.dueDate);
    const isOverdue = new Date() > new Date(bill.dueDate) && bill.status !== 'Paid';

    doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333');
    doc.text('Due Date: ', leftMargin, y, { continued: true });
    doc.fillColor(isOverdue ? '#dc2626' : '#333333').font('Helvetica');
    doc.text(dueDateStr);
    if (isOverdue) {
      doc.font('Helvetica-Bold').fillColor('#dc2626').text(' (OVERDUE)');
    }

    if (bill.paidDate) {
      y += 18;
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333');
      doc.text('Paid Date: ', leftMargin, y, { continued: true });
      doc.font('Helvetica').fillColor(PRIMARY_COLOR).text(formatDate(bill.paidDate));
    }

    // ── Footer ──
    const footerY = doc.page.height - 80;
    doc
      .strokeColor('#d1d5db')
      .lineWidth(0.5)
      .moveTo(leftMargin, footerY)
      .lineTo(leftMargin + pageWidth, footerY)
      .stroke();

    doc
      .fillColor('#9ca3af')
      .fontSize(8)
      .font('Helvetica')
      .text('This is a computer-generated receipt.', leftMargin, footerY + 10, {
        align: 'center',
      });
    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .fillColor(PRIMARY_COLOR)
      .text('Room Rent', leftMargin, footerY + 24, {
        align: 'center',
      });

    // Finalize PDF
    doc.end();

    return new Response(passThrough as unknown as ReadableStream, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="receipt-${billId}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Error generating receipt PDF:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to generate receipt' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

function getOrdinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}
