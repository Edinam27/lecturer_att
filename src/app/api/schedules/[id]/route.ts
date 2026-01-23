import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { prisma } from '@/lib/db'
import { authOptions } from '@/lib/auth-config'

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id || !['ADMIN', 'LECTURER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

    const schedule = await prisma.courseSchedule.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        sessionType: true,
        course: {
          select: {
            id: true,
            courseCode: true,
            title: true,
            creditHours: true,
            programme: {
              select: {
                id: true,
                name: true,
                level: true,
                coordinator: true
              }
            }
          }
        },
        classGroup: {
          select: {
            id: true,
            name: true,
            admissionYear: true
          }
        },
        lecturer: {
          select: {
            id: true,
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        },
        classroom: {
          select: {
            id: true,
            name: true,
            building: {
              select: {
                name: true
              }
            }
          }
        },
        _count: {
          select: {
            attendanceRecords: true
          }
        }
      }
    })

    if (!schedule) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
    }

    // Check if lecturer can only view their own schedules
    if (session.user.role === 'LECTURER') {
      const lecturer = await prisma.lecturer.findUnique({
        where: { userId: session.user.id }
      })
      
      if (!lecturer || schedule.lecturer.id !== lecturer.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const formattedSchedule = {
      id: schedule.id,
      dayOfWeek: schedule.dayOfWeek,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      sessionType: schedule.sessionType,
      venue: schedule.classroom ? `${schedule.classroom.building?.name || 'Unknown Building'} - ${schedule.classroom.name}` : 'Virtual',
      isActive: true, // Default to active
      course: {
        id: schedule.course.id,
        code: schedule.course.courseCode,
        name: schedule.course.title,
        credits: schedule.course.creditHours,
        programme: {
          name: schedule.course.programme.name,
          level: schedule.course.programme.level
        }
      },
      classGroup: {
        id: schedule.classGroup.id,
        name: schedule.classGroup.name,
        academicYear: schedule.classGroup.admissionYear.toString()
      },
      lecturer: {
        id: schedule.lecturer.id,
        firstName: schedule.lecturer.user.firstName,
        lastName: schedule.lecturer.user.lastName,
        email: schedule.lecturer.user.email
      },
      classroom: schedule.classroom ? {
        id: schedule.classroom.id,
        name: schedule.classroom.name,
        building: {
          name: schedule.classroom.building.name
        }
      } : null,
      _count: schedule._count
    }

    return NextResponse.json(formattedSchedule)
  } catch (error) {
    console.error('Error fetching schedule:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id || !['ADMIN', 'COORDINATOR'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

    const body = await request.json()
    const {
      courseId,
      classGroupId,
      lecturerId,
      classroomId,
      dayOfWeek,
      startTime,
      endTime,
      sessionType
    } = body

    // Check if schedule exists
    const existingSchedule = await prisma.courseSchedule.findUnique({
      where: { id: params.id },
      include: {
        course: {
          include: { programme: true }
        }
      }
    })

    if (!existingSchedule) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
    }

    // Authorization check for Coordinator
    if (session.user.role === 'COORDINATOR') {
      if (existingSchedule.course.programme.coordinator !== session.user.id) {
        return NextResponse.json({ error: 'Forbidden - You can only edit schedules for courses in your assigned programmes' }, { status: 403 })
      }
      
      // Also check if the new course (if changed) belongs to an assigned programme
      if (courseId && courseId !== existingSchedule.courseId) {
        const newCourse = await prisma.course.findUnique({
          where: { id: courseId },
          include: { programme: true }
        })
        if (!newCourse || newCourse.programme.coordinator !== session.user.id) {
          return NextResponse.json({ error: 'Forbidden - You cannot assign a schedule to a course not in your assigned programmes' }, { status: 403 })
        }
      }
    }

    // Check for scheduling conflicts (excluding current schedule)
    const conflictingSchedule = await prisma.courseSchedule.findFirst({
      where: {
        id: { not: params.id },
        dayOfWeek,
        OR: [
          {
            lecturerId,
            OR: [
              {
                AND: [
                  { startTime: { lte: startTime } },
                  { endTime: { gt: startTime } }
                ]
              },
              {
                AND: [
                  { startTime: { lt: endTime } },
                  { endTime: { gte: endTime } }
                ]
              },
              {
                AND: [
                  { startTime: { gte: startTime } },
                  { endTime: { lte: endTime } }
                ]
              }
            ]
          },
          classroomId ? {
            classroomId,
            OR: [
              {
                AND: [
                  { startTime: { lte: startTime } },
                  { endTime: { gt: startTime } }
                ]
              },
              {
                AND: [
                  { startTime: { lt: endTime } },
                  { endTime: { gte: endTime } }
                ]
              },
              {
                AND: [
                  { startTime: { gte: startTime } },
                  { endTime: { lte: endTime } }
                ]
              }
            ]
          } : {}
        ]
      }
    })

    if (conflictingSchedule) {
      return NextResponse.json({ error: 'Schedule conflict detected' }, { status: 409 })
    }

    // Update the schedule
    const schedule = await prisma.courseSchedule.update({
      where: { id: params.id },
      data: {
        courseId,
        classGroupId,
        lecturerId,
        classroomId: classroomId || null,
        dayOfWeek,
        startTime,
        endTime,
        sessionType
      },
      select: {
        id: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        sessionType: true,
        course: {
          select: {
            id: true,
            courseCode: true,
            title: true,
            creditHours: true,
            programme: {
              select: {
                id: true,
                name: true,
                level: true
              }
            }
          }
        },
        classGroup: {
          select: {
            id: true,
            name: true,
            admissionYear: true
          }
        },
        lecturer: {
          select: {
            id: true,
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        },
        classroom: {
          select: {
            id: true,
            name: true,
            building: {
              select: {
                name: true
              }
            }
          }
        },
        _count: {
          select: {
            attendanceRecords: true
          }
        }
      }
    })

    const formattedSchedule = {
      id: schedule.id,
      dayOfWeek: schedule.dayOfWeek,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      sessionType: schedule.sessionType,
      venue: schedule.classroom ? `${schedule.classroom.building?.name || 'Unknown Building'} - ${schedule.classroom.name}` : 'Virtual',
      isActive: true,
      course: {
        id: schedule.course.id,
        code: schedule.course.courseCode,
        name: schedule.course.title,
        credits: schedule.course.creditHours,
        programme: {
          name: schedule.course.programme.name,
          level: schedule.course.programme.level
        }
      },
      classGroup: {
        id: schedule.classGroup.id,
        name: schedule.classGroup.name,
        academicYear: schedule.classGroup.admissionYear.toString()
      },
      lecturer: {
        id: schedule.lecturer.id,
        firstName: schedule.lecturer.user.firstName,
        lastName: schedule.lecturer.user.lastName,
        email: schedule.lecturer.user.email
      },
      classroom: schedule.classroom ? {
        id: schedule.classroom.id,
        name: schedule.classroom.name,
        building: {
          name: schedule.classroom.building.name
        }
      } : null,
      _count: schedule._count
    }

    return NextResponse.json(formattedSchedule)
  } catch (error) {
    console.error('Error updating schedule:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id || !['ADMIN', 'COORDINATOR'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

    // Check if schedule exists
    const existingSchedule = await prisma.courseSchedule.findUnique({
      where: { id: params.id },
      select: {
        course: {
          select: {
            programme: {
              select: {
                coordinator: true
              }
            }
          }
        },
        _count: {
          select: {
            attendanceRecords: true
          }
        }
      }
    })

    if (!existingSchedule) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
    }

    // Authorization check for Coordinator
    if (session.user.role === 'COORDINATOR') {
      if (existingSchedule.course.programme.coordinator !== session.user.id) {
        return NextResponse.json({ error: 'Forbidden - You can only delete schedules for courses in your assigned programmes' }, { status: 403 })
      }
    }

    // Check if schedule has attendance records
    if (existingSchedule._count.attendanceRecords > 0) {
      return NextResponse.json(
        { error: 'Cannot delete schedule with existing attendance records' },
        { status: 400 }
      )
    }

    // Delete the schedule
    await prisma.courseSchedule.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ message: 'Schedule deleted successfully' })
  } catch (error) {
    console.error('Error deleting schedule:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}