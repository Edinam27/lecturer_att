import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { prisma } from '@/lib/db'
import { authOptions } from '@/lib/auth-config'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const userId = session.user.id
    const userRole = session.user.role

    let whereClause: any = {}

    // Filter based on user role
    if (userRole === 'LECTURER') {
      // Get lecturer's attendance records
      const lecturer = await prisma.lecturer.findUnique({
        where: { userId }
      })
      
      if (!lecturer) {
        console.log(`[Attendance API] Lecturer profile not found for user ${userId}`)
        return NextResponse.json({ error: 'Lecturer not found' }, { status: 404 })
      }

      whereClause = {
        lecturerId: lecturer.id
      }
    } else if (userRole === 'CLASS_REP') {
      // Get class representative's class attendance
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { classGroupsAsRep: true }
      })
      
      if (!user?.classGroupsAsRep || user.classGroupsAsRep.length === 0) {
        return NextResponse.json({ error: 'Class group not found' }, { status: 404 })
      }

      whereClause = {
        courseSchedule: {
          classGroupId: {
            in: user.classGroupsAsRep.map(group => group.id)
          }
        }
      }
    }
    // ADMIN and COORDINATOR can see all records (no additional filter)

    const attendanceRecords = await prisma.attendanceRecord.findMany({
      where: whereClause,
      orderBy: {
        timestamp: 'desc'
      },
      select: {
        id: true,
        timestamp: true,
        locationVerified: true,
        method: true,
        supervisorVerified: true,
        supervisorComment: true,
        gpsLatitude: true,
        gpsLongitude: true,
        lecturer: {
          select: {
            user: {
              select: {
                firstName: true,
                lastName: true
              }
            }
          }
        },
        courseSchedule: {
          select: {
            sessionType: true,
            course: {
              select: {
                title: true,
                courseCode: true
              }
            },
            classGroup: {
              select: {
                name: true
              }
            },
            classroom: {
              select: {
                name: true,
                building: {
                  select: {
                    name: true
                  }
                }
              }
            }
          }
        }
      }
    })

    const formattedRecords = attendanceRecords.map(record => ({
      id: record.id,
      timestamp: record.timestamp,
      locationVerified: record.locationVerified,
      method: record.method,
      supervisorVerified: record.supervisorVerified,
      supervisorComment: record.supervisorComment,
      gpsLatitude: record.gpsLatitude,
      gpsLongitude: record.gpsLongitude,
      sessionType: record.courseSchedule?.sessionType || 'Unknown',
      course: {
        title: record.courseSchedule?.course?.title || 'Unknown',
        courseCode: record.courseSchedule?.course?.courseCode || 'Unknown'
      },
      classGroup: {
        name: record.courseSchedule?.classGroup?.name || 'Unknown'
      },
      classroom: {
        name: record.courseSchedule?.classroom?.name || 'Unknown'
      },
      building: {
        name: record.courseSchedule?.classroom?.building?.name || 'Unknown'
      },
      lecturer: record.lecturer ? {
        name: `${record.lecturer.user.firstName} ${record.lecturer.user.lastName}`
      } : undefined
    }))

    return NextResponse.json(formattedRecords)
  } catch (error) {
    console.error('Error fetching attendance records:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}