import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { verifyToken } from '@/app/api/auth/login/route'

export async function POST(request: Request) {
  try {
    // Verify auth
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    const session = verifyToken(token)
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    const { currentPassword, newPassword, adminId } = body

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Current password and new password are required' }, { status: 400 })
    }

    if (newPassword.length < 4) {
      return NextResponse.json({ error: 'New password must be at least 4 characters' }, { status: 400 })
    }

    // Find the admin (either current user or specified adminId)
    const targetId = adminId || session.adminId
    const admin = await db.admin.findUnique({ where: { id: targetId } })
    if (!admin) {
      return NextResponse.json({ error: 'Admin not found' }, { status: 404 })
    }

    // If changing own password, verify current password
    if (targetId === session.adminId) {
      const isValid = await bcrypt.compare(currentPassword, admin.password)
      if (!isValid) {
        return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 })
      }
    }

    // Update password
    const hashedPassword = await bcrypt.hash(newPassword, 10)
    await db.admin.update({
      where: { id: targetId },
      data: { password: hashedPassword },
    })

    return NextResponse.json({ success: true, message: 'Password changed successfully' })
  } catch (error) {
    console.error('Change password error:', error)
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500 })
  }
}
