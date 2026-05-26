import { NextResponse } from 'next/server'

export async function POST() {
  // With JWT stored in localStorage, we just return success
  // The client will remove the token from localStorage
  return NextResponse.json({ success: true, message: 'Logged out' })
}
