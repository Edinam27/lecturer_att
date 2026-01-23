import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth-config'
import { startOfDay, endOfDay, differenceInHours, parse } from 'date-fns'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const lecturerId = searchParams.get('lecturerId')
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')

    if (!lecturerId || !startDateParam || !endDateParam) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    // Verify permission (Admin or the lecturer themselves)
    const isLecturer = session.user.role === 'LECTURER'
    if (isLecturer) {
        // Get the lecturer record for the current user
        const lecturerRecord = await prisma.lecturer.findUnique({
            where: { userId: session.user.id }
        })
        
        if (!lecturerRecord || lecturerRecord.id !== lecturerId) {
             return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }
    } else if (!['ADMIN', 'COORDINATOR'].includes(session.user.role)) {
         return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const startDate = startOfDay(new Date(startDateParam))
    const endDate = endOfDay(new Date(endDateParam))

    const lecturer = await prisma.lecturer.findUnique({
      where: { id: lecturerId },
      include: {
        user: true
      }
    })

    if (!lecturer) {
      return NextResponse.json({ error: 'Lecturer not found' }, { status: 404 })
    }

    const records = await prisma.attendanceRecord.findMany({
      where: {
        lecturerId: lecturerId,
        timestamp: {
          gte: startDate,
          lte: endDate
        },
      },
      select: {
        id: true,
        timestamp: true,
        supervisorVerified: true,
        courseScheduleId: true,
        sessionDuration: true,
        courseSchedule: {
          select: {
            startTime: true,
            endTime: true,
            course: {
              select: {
                id: true,
                title: true,
                courseCode: true,
                semesterLevel: true,
                programme: {
                  select: {
                    level: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        timestamp: 'asc'
      }
    })

    // Fetch supervisor logs to identify cancelled classes
    const cancelledLogs = await prisma.supervisorLog.findMany({
      where: {
        courseSchedule: {
            lecturerId: lecturerId
        },
        checkInTime: {
          gte: startDate,
          lte: endDate
        },
        status: 'cancelled'
      }
    })

    // Filter out records that match cancelled classes
    const validRecords = records.filter(record => {
      // If the record is explicitly verified by a supervisor, include it regardless of cancellation logs
      if (record.supervisorVerified) {
        return true
      }

      const recordTime = record.timestamp.getTime()
      
      const isCancelled = cancelledLogs.some(log => {
        const logTime = log.checkInTime.getTime()
        // Check if it's the same schedule
        if (log.courseScheduleId !== record.courseScheduleId) return false
        
        // Check if it's the same day
        const logDay = startOfDay(log.checkInTime).getTime()
        const recordDay = startOfDay(record.timestamp).getTime()
        if (logDay !== recordDay) return false

        // If it's the same day, check if the times are close (within 2 hours)
        // This allows for rescheduled classes on the same day to be included
        const timeDiff = Math.abs(recordTime - logTime)
        const twoHoursInMs = 2 * 60 * 60 * 1000
        
        return timeDiff < twoHoursInMs
      })

      return !isCancelled
    })

    // Group records by Course
    // We can key by courseCode or courseId
    const recordsByCourse: Record<string, any[]> = {}

    validRecords.forEach((record) => {
      const schedule = record.courseSchedule
      const course = schedule.course
      const courseKey = course.id
      
      if (!recordsByCourse[courseKey]) {
        recordsByCourse[courseKey] = []
      }
      recordsByCourse[courseKey].push(record)
    })

    // Process each group
    const courseClaims = Object.keys(recordsByCourse).map(courseId => {
      const courseRecords = recordsByCourse[courseId]
      const firstRecord = courseRecords[0]
      const course = firstRecord.courseSchedule.course

      const processedRecords = courseRecords.map((record, index) => {
        const schedule = record.courseSchedule
        const date = new Date(record.timestamp)
        
        // Calculate Week Number relative to start date
        const dayDiff = Math.floor((date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
        const weekNumber = Math.floor(dayDiff / 7) + 1

        // Calculate Hours
        let hours = 0
        try {
          const start = parse(schedule.startTime, 'HH:mm', new Date())
          const end = parse(schedule.endTime, 'HH:mm', new Date())
          hours = differenceInHours(end, start)
          if (hours === 0) {
              const diffMs = end.getTime() - start.getTime()
              hours = diffMs / (1000 * 60 * 60)
          }
        } catch (e) {
          console.error('Error parsing time', e)
          if (record.sessionDuration) {
              hours = record.sessionDuration / 60
          }
        }

        return {
          id: record.id,
          week: `WEEK ${weekNumber}`,
          date: date.toLocaleDateString('en-GB'),
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          hours: Number(hours.toFixed(1)),
          status: 'PRESENT'
        }
      })

      const totalHours = processedRecords.reduce((sum, r) => sum + r.hours, 0)

      return {
        courseTitle: course.title,
        courseCode: course.courseCode,
        level: course.semesterLevel ? `LEVEL ${course.semesterLevel}00` : (course.programme.level || 'N/A'),
        records: processedRecords,
        totalHours: Number(totalHours.toFixed(1))
      }
    })

    return NextResponse.json({
      lecturer: {
        name: `${lecturer.user.firstName} ${lecturer.user.lastName}`.toUpperCase(),
        department: (lecturer.department || 'N/A').toUpperCase(),
        faculty: 'FACULTY' 
      },
      claims: courseClaims
    })

  } catch (error) {
    console.error('Error generating claim form data:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
