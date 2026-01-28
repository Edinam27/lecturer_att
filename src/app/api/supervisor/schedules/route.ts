import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { prisma } from '@/lib/db'
import { authOptions } from '@/lib/auth-config'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    // Allow ADMIN and SUPERVISOR (and maybe COORDINATOR)
    if (!session?.user?.id || (session.user.role !== 'SUPERVISOR' && session.user.role !== 'ADMIN')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Use current date
    const today = new Date()
    const todayDayOfWeek = today.getUTCDay()
    
    const startOfDay = new Date(today)
    startOfDay.setUTCHours(0, 0, 0, 0)
    
    const endOfDay = new Date(today)
    endOfDay.setUTCHours(23, 59, 59, 999)

    // Fetch today's schedules
    const schedules = await prisma.courseSchedule.findMany({
      where: {
        dayOfWeek: todayDayOfWeek
      },
      include: {
        course: true,
        classGroup: true,
        lecturer: {
          include: {
            user: true
          }
        },
        classroom: {
          include: {
            building: true
          }
        },
        attendanceRecords: {
          where: {
            timestamp: {
              gte: startOfDay,
              lt: endOfDay
            }
          }
        },
        supervisorLogs: {
           where: {
            checkInTime: {
              gte: startOfDay,
              lt: endOfDay
            }
          }
        }
      },
      orderBy: {
        startTime: 'asc'
      }
    })

    const formattedSchedules = schedules.map(schedule => {
        // Determine status
        let status = 'pending';
        if (schedule.supervisorLogs.length > 0) {
            status = 'verified'; // or use the specific status from the log
        }
        
        const log = schedule.supervisorLogs[0]; // Assuming one log per session usually

        return {
            id: schedule.id,
            sessionDate: today.toISOString().split('T')[0],
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            sessionType: schedule.sessionType,
            course: {
                id: schedule.course.id,
                title: schedule.course.title,
                courseCode: schedule.course.courseCode
            },
            classGroup: {
                id: schedule.classGroup.id,
                name: schedule.classGroup.name
            },
            lecturer: {
                id: schedule.lecturer.id,
                name: `${schedule.lecturer.user.firstName} ${schedule.lecturer.user.lastName}`,
                email: schedule.lecturer.user.email
            },
            building: {
                name: schedule.classroom?.building?.name || 'N/A'
            },
            classroom: {
                id: schedule.classroom?.id,
                name: schedule.classroom?.name || 'N/A',
                roomCode: schedule.classroom?.roomCode || 'N/A',
                virtualLink: schedule.classroom?.virtualLink || null
            },
            attendanceTaken: schedule.attendanceRecords.length > 0,
            verified: schedule.supervisorLogs.length > 0,
            verificationStatus: log ? log.status : 'pending',
            verificationComment: log ? log.comments : null
        };
    })

    return NextResponse.json(formattedSchedules)
  } catch (error) {
    console.error('Error fetching supervisor schedules:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
