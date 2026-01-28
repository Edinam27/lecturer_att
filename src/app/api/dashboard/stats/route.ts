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

    const userRole = session.user.role
    const userId = session.user.id

    // Get current week date range (UTC)
    // Use simulated date for testing/demo purposes
    const now = new Date('2025-01-24T12:00:00Z')
    const day = now.getUTCDay()
    const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1) // adjust when day is sunday
    
    const startOfWeek = new Date(now)
    startOfWeek.setUTCDate(diff)
    startOfWeek.setUTCHours(0, 0, 0, 0)
    
    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6)
    endOfWeek.setUTCHours(23, 59, 59, 999)

    let stats: any = {}

    if (userRole === 'ADMIN' || userRole === 'SUPERVISOR' || userRole === 'ONLINE_SUPERVISOR') {
      // Admin and Supervisors see system-wide statistics
      const [totalSessions, totalCourses, totalUsers, weeklyAttendance] = await Promise.all([
        prisma.attendanceRecord.count(),
        prisma.course.count(),
        prisma.user.count({ where: { isActive: true } }),
        prisma.attendanceRecord.count({
          where: {
            timestamp: {
              gte: startOfWeek,
              lte: endOfWeek
            }
          }
        })
      ])

      // Calculate attendance rate (Weekly Attendance / Total Weekly Schedules)
      const totalSchedules = await prisma.courseSchedule.count()
      const attendanceRate = totalSchedules > 0 ? Math.round((weeklyAttendance / totalSchedules) * 100) : 0

      stats = {
        totalSessions,
        attendanceRate,
        activeCourses: totalCourses,
        thisWeek: weeklyAttendance,
        totalUsers
      }
    } else if (userRole === 'COORDINATOR') {
      // Coordinator sees programme-level statistics
      const [totalSessions, totalCourses, weeklyAttendance] = await Promise.all([
        prisma.attendanceRecord.count(),
        prisma.course.count(),
        prisma.attendanceRecord.count({
          where: {
            timestamp: {
              gte: startOfWeek,
              lte: endOfWeek
            }
          }
        })
      ])

      const totalSchedules = await prisma.courseSchedule.count()
      const attendanceRate = totalSchedules > 0 ? Math.round((weeklyAttendance / totalSchedules) * 100) : 0

      stats = {
        totalSessions,
        attendanceRate,
        activeCourses: totalCourses,
        thisWeek: weeklyAttendance
      }
    } else if (userRole === 'LECTURER') {
      // Lecturer sees their own statistics
      const lecturer = await prisma.lecturer.findFirst({
        where: { userId }
      })

      if (!lecturer) {
        return NextResponse.json({ error: 'Lecturer not found' }, { status: 404 })
      }

      const [mySessions, myCourses, myWeeklyAttendance] = await Promise.all([
        prisma.attendanceRecord.count({
          where: { lecturerId: lecturer.id }
        }),
        prisma.courseSchedule.count({
          where: { lecturerId: lecturer.id }
        }),
        prisma.attendanceRecord.count({
          where: {
            lecturerId: lecturer.id,
            timestamp: {
              gte: startOfWeek,
              lte: endOfWeek
            }
          }
        })
      ])

      // Calculate total students (sum of studentCount in unique class groups taught by lecturer)
      const schedules = await prisma.courseSchedule.findMany({
        where: { lecturerId: lecturer.id },
        select: { classGroupId: true },
        distinct: ['classGroupId']
      })

      const classGroupIds = schedules.map(s => s.classGroupId)
      
      const classGroups = await prisma.classGroup.findMany({
        where: { id: { in: classGroupIds } },
        select: { studentCount: true }
      })

      const totalStudents = classGroups.reduce((sum, group) => sum + (group.studentCount || 0), 0)

      const attendanceRate = myCourses > 0 ? Math.round((myWeeklyAttendance / myCourses) * 100) : 0

      stats = {
        totalSessions: mySessions,
        attendanceRate,
        activeCourses: myCourses,
        thisWeek: myWeeklyAttendance,
        totalStudents
      }
    } else if (userRole === 'CLASS_REP') {
      // Class rep sees their class statistics
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { 
          classGroupsAsRep: {
            include: {
              programme: {
                select: {
                  name: true
                }
              }
            }
          }
        }
      })

      if (!user?.classGroupsAsRep || user.classGroupsAsRep.length === 0) {
        return NextResponse.json({ error: 'Class group not found' }, { status: 404 })
      }

      const classGroupIds = user.classGroupsAsRep.map(group => group.id)

      const [classSessions, classCourses, classWeeklyAttendance] = await Promise.all([
        prisma.attendanceRecord.count({
          where: {
            courseSchedule: {
              classGroupId: { in: classGroupIds }
            }
          }
        }),
        prisma.courseSchedule.count({
          where: {
            classGroupId: { in: classGroupIds }
          }
        }),
        prisma.attendanceRecord.count({
          where: {
            courseSchedule: {
              classGroupId: { in: classGroupIds }
            },
            timestamp: {
              gte: startOfWeek,
              lte: endOfWeek
            }
          }
        })
      ])

      const classTotalSchedules = await prisma.courseSchedule.count({
        where: {
          classGroupId: { in: classGroupIds }
        }
      })
      const attendanceRate = classTotalSchedules > 0 ? Math.round((classSessions / classTotalSchedules) * 100) : 0

      stats = {
        totalSessions: classSessions,
        attendanceRate,
        activeCourses: classCourses,
        thisWeek: classWeeklyAttendance,
        classInfo: user.classGroupsAsRep.map(group => ({
          name: group.name,
          programme: group.programme.name
        }))
      }
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error('Error fetching dashboard stats:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}