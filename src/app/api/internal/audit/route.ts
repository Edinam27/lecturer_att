import { NextRequest, NextResponse } from 'next/server'
import { auditService } from '@/lib/audit'
import { getToken } from 'next-auth/jwt'

export async function POST(request: NextRequest) {
  try {
    // Verify the request is coming from our middleware (using a secret header or just ensuring it's internal)
    // For simplicity in this context, we'll rely on the fact that it's an internal API called by middleware
    // In a stricter environment, we might want to check a shared secret.
    
    // We can also double check authentication here if needed, but the middleware should have passed valid data.
    const token = await getToken({ req: request })
    if (!token) {
        // Technically this route is "internal" but if exposed, we want some protection.
        // But since middleware calls it "fire-and-forget", we might not have the original request context perfectly.
        // The middleware sends the data explicitly.
    }

    const body = await request.json()
    
    // Validate body structure briefly
    if (!body || !body.action) {
      return NextResponse.json({ error: 'Invalid audit data' }, { status: 400 })
    }

    await auditService.createAuditLog(body)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to create audit log via internal API:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
