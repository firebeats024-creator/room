import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import crypto from 'crypto'

const SECRET = process.env.JWT_SECRET || 'room-rent-secret-key-change-in-production'

// Create a signed token (like JWT but simpler)
function createToken(payload: { adminId: string; name: string; username: string }): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const exp = Math.floor(Date.now() / 1000) + 24 * 60 * 60 // 24 hours
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url')
  const signature = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${signature}`
}

// Verify a signed token
export function verifyToken(token: string): { adminId: string; name: string; username: string } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [header, body, signature] = parts
    const expectedSig = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url')
    if (signature !== expectedSig) return null

    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (Date.now() / 1000 > decoded.exp) return null

    return { adminId: decoded.adminId, name: decoded.name, username: decoded.username }
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { username, password } = body

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 })
    }

    const admin = await db.admin.findUnique({
      where: { username },
    })

    if (!admin) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
    }

    const isValid = await bcrypt.compare(password, admin.password)
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
    }

    // Generate stateless token (no in-memory store needed)
    const token = createToken({ adminId: admin.id, name: admin.name, username: admin.username })

    return NextResponse.json({
      success: true,
      name: admin.name,
      token,
      message: 'Login successful',
    })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
