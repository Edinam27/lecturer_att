import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { prisma } from '@/lib/db'
import { authOptions } from '@/lib/auth-config'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const userRole = session.user.role
    const attendanceId = params.id

    // Fetch attendance record with relations
    const record = await prisma.attendanceRecord.findUnique({
      where: { id: attendanceId },
      include: {
        lecturer: {
          include: { user: true }
        },
        courseSchedule: {
          include: {
            course: true,
            classGroup: true,
            classroom: {
              include: { building: true }
            }
          }
        }
      }
    })

    if (!record) {
      return NextResponse.json({ error: 'Attendance record not found' }, { status: 404 })
    }

    // Authorization: lecturers can only view their own records; admins/coordinators can view all
    if (userRole === 'LECTURER') {
      const lecturer = await prisma.lecturer.findFirst({ where: { userId } })
      if (!lecturer || record.lecturerId !== lecturer.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } else if (!['ADMIN', 'COORDINATOR'].includes(userRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Format response for printable use
    const formatted = {
      id: record.id,
      timestamp: record.timestamp,
      method: record.method,
      locationVerified: record.locationVerified,
      gpsLatitude: record.gpsLatitude,
      gpsLongitude: record.gpsLongitude,
      classRepVerified: record.classRepVerified,
      classRepComment: record.classRepComment,
      course: {
        title: record.courseSchedule.course.title,
        courseCode: record.courseSchedule.course.courseCode
      },
      classGroup: {
        name: record.courseSchedule.classGroup.name
      },
      building: {
        name: record.courseSchedule.classroom?.building?.name || 'Virtual'
      },
      classroom: {
        name: record.courseSchedule.classroom?.name || 'Virtual'
      },
      lecturer: {
        name: `${record.lecturer.user.firstName} ${record.lecturer.user.lastName}`
      },
      // Optional structured student attendance data
      studentAttendanceData: (() => {
        if (!record.studentAttendanceData) return null
        try {
          return JSON.parse(record.studentAttendanceData)
        } catch {
          return null
        }
      })()
    }

    return NextResponse.json(formatted)
  } catch (error) {
    console.error('Error fetching attendance record:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}