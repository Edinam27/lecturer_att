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

    // Also update AttendanceRecord if it exists
    try {
      const today = new Date()
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)

      const attendanceRecord = await prisma.attendanceRecord.findFirst({
        where: {
          courseScheduleId: scheduleId,
          timestamp: {
            gte: startOfDay,
            lt: endOfDay
          }
        }
      })

      if (attendanceRecord) {
        const isVerified = status === 'ongoing' || status === 'online'
        await prisma.attendanceRecord.update({
          where: { id: attendanceRecord.id },
          data: {
            supervisorVerified: isVerified,
            supervisorComment: comments
          }
        })
      }
    } catch (err) {
      console.error('Error updating attendance record from online supervisor log:', err)
    }

    return NextResponse.json({ success: true, log })
  } catch (error) {
    console.error('Error submitting online verification:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
