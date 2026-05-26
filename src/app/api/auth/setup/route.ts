import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { username, password, name } = body

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 })
    }

    if (password.length < 4) {
      return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 })
    }

    // Check if admin already exists
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
      message: 'Admin created successfully',
    }, { status: 201 })
  } catch (error) {
    console.error('Admin setup error:', error)
    return NextResponse.json({ error: 'Failed to create admin' }, { status: 500 })
  }
}

// GET: Check if any admin exists (for first-time setup)
export async function GET() {
  try {
    const adminCount = await db.admin.count()
    return NextResponse.json({ hasAdmin: adminCount > 0, count: adminCount })
  } catch (error) {
    console.error('Admin check error:', error)
    return NextResponse.json({ error: 'Failed to check admin' }, { status: 500 })
  }
}
