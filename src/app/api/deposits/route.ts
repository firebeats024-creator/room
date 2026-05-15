import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/deposits - Get all deposits with guest and room info
export async function GET() {
  try {
    const deposits = await db.securityDeposit.findMany({
      include: {
        guest: {
          select: {
            id: true,
            name: true,
            phone: true,
            status: true,
            room: {
              select: {
                id: true,
                roomNo: true,
                floor: true,
                type: true,
              },
            },
            bills: {
              select: {
                id: true,
                totalAmount: true,
                status: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(deposits);
  } catch (error) {
    console.error('Error fetching deposits:', error);
    return NextResponse.json(
      { error: 'Failed to fetch deposits' },
      { status: 500 }
    );
  }
}

// PUT /api/deposits - Process refund / update deposit
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { depositId, deductionAmount, notes, action } = body;

    if (!depositId) {
      return NextResponse.json(
        { error: 'Deposit ID is required' },
        { status: 400 }
      );
    }

    const deposit = await db.securityDeposit.findUnique({
      where: { id: depositId },
      include: {
        guest: {
          include: {
            bills: {
              select: { id: true, totalAmount: true, status: true },
            },
          },
        },
      },
    });

    if (!deposit) {
      return NextResponse.json(
        { error: 'Deposit not found' },
        { status: 404 }
      );
    }

    if (deposit.status !== 'Held') {
      return NextResponse.json(
        { error: 'Only held deposits can be processed' },
        { status: 400 }
      );
    }

    const amount = deposit.amount;
    let deductedAmount = 0;
    let newStatus: string = 'Held';
    let refundNotes = notes || '';

    if (action === 'full-refund') {
      // Full refund — no deduction
      deductedAmount = 0;
      newStatus = 'Refunded';
      refundNotes = refundNotes || 'Full refund processed';
    } else if (action === 'partial-refund') {
      // Partial refund — deduct specified amount
      const deduction = deductionAmount ?? 0;
      if (deduction < 0 || deduction > amount) {
        return NextResponse.json(
          { error: 'Deduction amount must be between 0 and deposit amount' },
          { status: 400 }
        );
      }
      deductedAmount = deduction;
      newStatus = deduction > 0 ? 'Partially-Refunded' : 'Refunded';
      refundNotes = refundNotes || `Partial refund: ₹${deduction} deducted`;
    } else if (action === 'adjust-against-bills') {
      // Adjust against unpaid bills
      const unpaidBills = deposit.guest.bills.filter((b) => b.status !== 'Paid');
      const totalUnpaid = unpaidBills.reduce((sum, b) => sum + b.totalAmount, 0);
      deductedAmount = Math.min(totalUnpaid, amount);
      newStatus = deductedAmount >= amount ? 'Adjusted' : 'Partially-Refunded';
      refundNotes = refundNotes || `Adjusted against ₹${totalUnpaid} unpaid bills`;

      // Mark unpaid bills as paid
      for (const bill of unpaidBills) {
        await db.bill.update({
          where: { id: bill.id },
          data: {
            status: 'Paid',
            paidDate: new Date(),
          },
        });
      }
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use: full-refund, partial-refund, or adjust-against-bills' },
        { status: 400 }
      );
    }

    const updatedDeposit = await db.securityDeposit.update({
      where: { id: depositId },
      data: {
        status: newStatus,
        deductedAmount,
        refundDate: new Date(),
        notes: refundNotes,
      },
    });

    return NextResponse.json({
      message: 'Deposit processed successfully',
      deposit: updatedDeposit,
      refundAmount: amount - deductedAmount,
    });
  } catch (error) {
    console.error('Error processing deposit:', error);
    return NextResponse.json(
      { error: 'Failed to process deposit' },
      { status: 500 }
    );
  }
}
