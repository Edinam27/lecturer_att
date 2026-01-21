import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { prisma } from '@/lib/db'
import { authOptions } from '@/lib/auth-config'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id || (session.user.role !== 'ONLINE_SUPERVISOR' && session.user.role !== 'ADMIN')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { scheduleId, status, comments, platform, connectionQuality, studentCountOnline, technicalIssues } = body

    if (!scheduleId || !status) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Create supervisor log
    const log = await prisma.supervisorLog.create({
      data: {
        supervisorId: session.user.id,
        courseScheduleId: scheduleId,
        status,
        comments,
        isOnline: true,
        platform,
        connectionQuality,
        studentCountOnline: studentCountOnline ? parseInt(studentCountOnline) : null,
        technicalIssues
      }
    })

    return NextResponse.json({ success: true, log })
  } catch (error) {
    console.error('Error submitting online verification:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
