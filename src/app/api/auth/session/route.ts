import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ authenticated: false })
    }
    return NextResponse.json({
      authenticated: true,
      user: {
        name: session.user?.name,
        email: session.user?.email,
      },
    })
  } catch (error) {
    console.error('Session check error:', error)
    return NextResponse.json({ authenticated: false }, { status: 500 })
  }
}
