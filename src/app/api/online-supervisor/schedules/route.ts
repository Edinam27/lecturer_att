import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { prisma } from '@/lib/db'
import { authOptions } from '@/lib/auth-config'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    // Allow ADMIN and ONLINE_SUPERVISOR
    if (!session?.user?.id || (session.user.role !== 'ONLINE_SUPERVISOR' && session.user.role !== 'ADMIN')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get today's day of week
    const today = new Date()
    const todayDayOfWeek = today.getDay()
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)

    // Fetch today's ONLINE/HYBRID schedules
    const schedules = await prisma.courseSchedule.findMany({
      where: {
        dayOfWeek: todayDayOfWeek,
        sessionType: {
          in: ['VIRTUAL', 'HYBRID']
        }
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
        const log = schedule.supervisorLogs[0];

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
            meetingLink: schedule.classroom?.virtualLink || 'https://zoom.us/j/example', // Fallback for demo
            verified: schedule.supervisorLogs.length > 0,
            verificationStatus: log ? log.status : 'pending',
            verificationComment: log ? log.comments : null,
            platform: log ? log.platform : null,
            connectionQuality: log ? log.connectionQuality : null
        };
    })

    return NextResponse.json(formattedSchedules)
  } catch (error) {
    console.error('Error fetching online supervisor schedules:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
