import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { prisma } from '@/lib/db'
import { authOptions } from '@/lib/auth-config'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id || (session.user.role !== 'SUPERVISOR' && session.user.role !== 'ADMIN')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { courseScheduleId, status, comments, isOnline } = body

    if (!courseScheduleId || !status) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Check if a log already exists for today (optional, but good to prevent duplicates)
    // Use current date
    const today = new Date()
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
    
    // Create a timestamp
    const now = new Date();
    const currentCheckInTime = new Date(now);

    const existingLog = await prisma.supervisorLog.findFirst({
      where: {
        courseScheduleId,
        checkInTime: {
          gte: startOfDay,
          lt: endOfDay
        }
      }
    })

    if (existingLog) {
       // Update existing log? Or block? Let's update it.
       const updatedLog = await prisma.supervisorLog.update({
         where: { id: existingLog.id },
         data: {
           status,
           comments,
           isOnline,
           supervisorId: session.user.id,
           checkInTime: currentCheckInTime // Update time to latest check
         }
       })

       // Also update AttendanceRecord if it exists
       try {
         const attendanceRecord = await prisma.attendanceRecord.findFirst({
           where: {
             courseScheduleId,
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
         console.error('Error updating attendance record from supervisor log:', err)
       }

       return NextResponse.json(updatedLog)
    }

    const log = await prisma.supervisorLog.create({
      data: {
        supervisorId: session.user.id,
        courseScheduleId,
        status,
        comments,
        isOnline,
        checkInTime: currentCheckInTime
      }
    })

    // Also update AttendanceRecord if it exists
    try {
      const attendanceRecord = await prisma.attendanceRecord.findFirst({
        where: {
          courseScheduleId,
          timestamp: {
            gte: startOfDay,
            lt: endOfDay
          }
        }
      })

      if (attendanceRecord) {
        // If status implies presence, verify it. If absence, mark as disputed (false).
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
      console.error('Error updating attendance record from supervisor log:', err)
      // Don't fail the request if this part fails, as the log was created
    }

    return NextResponse.json(log)
  } catch (error) {
    console.error('Error verifying class:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
