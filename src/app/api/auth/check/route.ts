import { NextResponse } from 'next/server'
import { verifyToken } from '@/app/api/auth/login/route'

export async function GET(request: Request) {
  try {
    // Try Authorization header first (Bearer token)
    let token: string | null = null

    const authHeader = request.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7)
    }

    // Fallback: try cookie
    if (!token) {
      token = request.headers.get('cookie')
        ?.split(';')
        .find(c => c.trim().startsWith('admin_token='))
        ?.split('=')[1]?.trim() || null
    }

    if (!token) {
      return NextResponse.json({ authenticated: false })
    }

    const session = verifyToken(token)
    if (!session) {
      return NextResponse.json({ authenticated: false })
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        name: session.name,
        adminId: session.adminId,
        username: session.username,
      },
    })
  } catch (error) {
    console.error('Auth check error:', error)
    return NextResponse.json({ authenticated: false }, { status: 500 })
  }
}
