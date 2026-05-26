import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

export async function PUT(request: NextRequest) {
  try {
    const { username, newPassword, resetKey } = await request.json()

    if (!username || !newPassword || !resetKey) {
      return NextResponse.json(
        { error: 'Username, new password, and reset key are required' },
        { status: 400 }
      )
    }

    // Verify the reset key from environment
    const envResetKey = process.env.ADMIN_RESET_KEY
    if (!envResetKey) {
      return NextResponse.json(
        { error: 'Password reset is not configured on the server' },
        { status: 500 }
      )
    }

    if (resetKey !== envResetKey) {
      return NextResponse.json(
        { error: 'Invalid reset key. Password reset denied.' },
        { status: 403 }
      )
    }

    if (newPassword.length < 4) {
      return NextResponse.json(
        { error: 'Password must be at least 4 characters' },
        { status: 400 }
      )
    }

    // Check if admin exists
    const admin = await db.admin.findFirst({
      where: { username },
    })

    if (!admin) {
      return NextResponse.json(
        { error: 'Username not found' },
        { status: 404 }
      )
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10)

    // Update the password
    await db.admin.update({
      where: { id: admin.id },
      data: { password: hashedPassword },
    })

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully! You can now login with your new password.',
    })
  } catch (error) {
    console.error('Reset password error:', error)
    return NextResponse.json(
      { error: 'Failed to reset password' },
      { status: 500 }
    )
  }
}
