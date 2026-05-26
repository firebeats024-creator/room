import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { verifyToken } from '@/app/api/auth/login/route'

// GET: List all admins (auth required)
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    const session = verifyToken(token)
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const admins = await db.admin.findMany({
      select: { id: true, username: true, name: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({ admins })
  } catch (error) {
    console.error('List admins error:', error)
    return NextResponse.json({ error: 'Failed to list admins' }, { status: 500 })
  }
}

// POST: Create new admin (auth required)
export async function POST(request: Request) {
  try {
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
    const { username, password, name } = body

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 })
    }

    if (password.length < 4) {
      return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 })
    }

    const existing = await db.admin.findUnique({ where: { username } })
    if (existing) {
      return NextResponse.json({ error: 'Username already exists' }, { status: 409 })
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    const admin = await db.admin.create({
      data: {
        username,
        password: hashedPassword,
        name: name || 'Admin',
      },
    })

    return NextResponse.json({
      id: admin.id,
      username: admin.username,
      name: admin.name,
      message: 'New admin created successfully',
    }, { status: 201 })
  } catch (error) {
    console.error('Create admin error:', error)
    return NextResponse.json({ error: 'Failed to create admin' }, { status: 500 })
  }
}

// DELETE: Delete an admin (auth required, cannot delete self)
export async function DELETE(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    const session = verifyToken(token)
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const adminId = searchParams.get('id')

    if (!adminId) {
      return NextResponse.json({ error: 'Admin ID is required' }, { status: 400 })
    }

    if (adminId === session.adminId) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
    }

    // Check at least one admin remains
    const count = await db.admin.count()
    if (count <= 1) {
      return NextResponse.json({ error: 'Cannot delete the last admin account' }, { status: 400 })
    }

    await db.admin.delete({ where: { id: adminId } })

    return NextResponse.json({ success: true, message: 'Admin deleted successfully' })
  } catch (error) {
    console.error('Delete admin error:', error)
    return NextResponse.json({ error: 'Failed to delete admin' }, { status: 500 })
  }
}
