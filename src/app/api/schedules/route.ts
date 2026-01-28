import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { prisma } from '@/lib/db'
import { authOptions } from '@/lib/auth-config'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id || !['ADMIN', 'COORDINATOR'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

    const body = await request.json()
    console.log('[API] Creating schedule with body:', JSON.stringify(body, null, 2))

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

    // Validate required fields
    if (!courseId || !classGroupId || !lecturerId || !dayOfWeek || !startTime || !endTime || !sessionType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Explicitly cast and validate types to prevent Prisma/Driver errors
    let dayOfWeekInt: number;
    if (typeof dayOfWeek === 'string') {
      dayOfWeekInt = parseInt(dayOfWeek, 10);
    } else if (typeof dayOfWeek === 'number') {
      dayOfWeekInt = dayOfWeek;
    } else {
      console.error('[API] Invalid dayOfWeek type:', typeof dayOfWeek, dayOfWeek);
      return NextResponse.json({ error: 'Invalid dayOfWeek type' }, { status: 400 });
    }

    if (isNaN(dayOfWeekInt)) {
       console.error('[API] Invalid dayOfWeek value (NaN):', dayOfWeek);
       return NextResponse.json({ error: 'Invalid dayOfWeek value' }, { status: 400 });
    }

    const startTimeStr = String(startTime)
    const endTimeStr = String(endTime)
    const lecturerIdStr = String(lecturerId)
    const classGroupIdStr = String(classGroupId)
    const classroomIdStr = classroomId ? String(classroomId) : null

    // Authorization check for Coordinator
    if (session.user.role === 'COORDINATOR') {
      const course = await prisma.course.findUnique({
        where: { id: courseId },
        include: { programme: true }
      })
      
      if (!course || course.programme.coordinator !== session.user.id) {
        return NextResponse.json({ error: 'Forbidden - You can only create schedules for courses in your assigned programmes' }, { status: 403 })
      }
    }

    // Check for scheduling conflicts
    // Time overlap logic: (StartA <= StartB AND EndA > StartB) OR (StartA < EndB AND EndA >= EndB) OR (StartA >= StartB AND EndA <= EndB)
    const timeConflictConditions = [
      {
        AND: [
          { startTime: { lte: startTimeStr } },
          { endTime: { gt: startTimeStr } }
        ]
      },
      {
        AND: [
          { startTime: { lt: endTimeStr } },
          { endTime: { gte: endTimeStr } }
        ]
      },
      {
        AND: [
          { startTime: { gte: startTimeStr } },
          { endTime: { lte: endTimeStr } }
        ]
      }
    ]

    console.log('[API] Checking conflicts separately for day:', dayOfWeekInt);

    // 1. Check Lecturer Conflict
    const lecturerConflict = await prisma.courseSchedule.findFirst({
      where: {
        dayOfWeek: dayOfWeekInt,
        lecturerId: lecturerIdStr,
        OR: [...timeConflictConditions]
      }
    });

    if (lecturerConflict) {
       console.log('[API] Lecturer conflict found:', lecturerConflict.id);
       return NextResponse.json({ 
         error: 'Scheduling conflict: The lecturer is already booked for this time slot.' 
       }, { status: 409 });
    }

    // 2. Check Class Group Conflict
    const classGroupConflict = await prisma.courseSchedule.findFirst({
      where: {
        dayOfWeek: dayOfWeekInt,
        classGroupId: classGroupIdStr,
        OR: [...timeConflictConditions]
      }
    });

    if (classGroupConflict) {
       console.log('[API] Class Group conflict found:', classGroupConflict.id);
       return NextResponse.json({ 
         error: 'Scheduling conflict: The class group is already booked for this time slot.' 
       }, { status: 409 });
    }

    // 3. Check Classroom Conflict (if applicable)
    if (classroomIdStr) {
      const classroomConflict = await prisma.courseSchedule.findFirst({
        where: {
          dayOfWeek: dayOfWeekInt,
          classroomId: classroomIdStr,
          OR: [...timeConflictConditions]
        }
      });

      if (classroomConflict) {
         console.log('[API] Classroom conflict found:', classroomConflict.id);
         return NextResponse.json({ 
           error: 'Scheduling conflict: The classroom is already booked for this time slot.' 
         }, { status: 409 });
      }
    }

    // Create schedule
    const schedule = await prisma.courseSchedule.create({
      data: {
        courseId,
        classGroupId: classGroupIdStr,
        lecturerId: lecturerIdStr,
        classroomId: classroomIdStr,
        dayOfWeek: dayOfWeekInt,
        startTime: startTimeStr,
        endTime: endTimeStr,
        sessionType
      }
    })

    console.log('[API] Schedule created successfully:', schedule.id)
    return NextResponse.json(schedule)
  } catch (error) {
    console.error('Error creating schedule:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id || !['ADMIN', 'LECTURER', 'COORDINATOR', 'CLASS_REP'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // For lecturers, only show their own schedules
    let whereClause: any = {}
    
    if (session.user.role === 'LECTURER') {
      const lecturer = await prisma.lecturer.findUnique({
        where: { userId: session.user.id }
      })
      
      if (!lecturer) {
        return NextResponse.json({ error: 'Lecturer not found' }, { status: 404 })
      }
      
      whereClause = { lecturerId: lecturer.id }
    } else if (session.user.role === 'COORDINATOR') {
      // Find programmes where this user is coordinator
      const programmes = await prisma.programme.findMany({
        where: { coordinator: session.user.id },
        select: { id: true }
      })
      
      const programmeIds = programmes.map(p => p.id)
      
      whereClause = {
        course: {
          programmeId: { in: programmeIds }
        }
      }
    } else if (session.user.role === 'CLASS_REP') {
      // Class rep sees their class schedules
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        include: { classGroupsAsRep: true }
      })

      if (!user?.classGroupsAsRep || user.classGroupsAsRep.length === 0) {
        return NextResponse.json({ error: 'Class group not found' }, { status: 404 })
      }

      const classGroupIds = user.classGroupsAsRep.map(group => group.id)
      whereClause = {
        classGroupId: { in: classGroupIds }
      }
    }

    const schedules = await prisma.courseSchedule.findMany({
      where: whereClause,
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
      },
      orderBy: [
        { dayOfWeek: 'asc' },
        { startTime: 'asc' }
      ]
    })

    const formattedSchedules = schedules.map(schedule => ({
      id: schedule.id,
      dayOfWeek: schedule.dayOfWeek,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      sessionType: schedule.sessionType,
      venue: schedule.classroom ? `${schedule.classroom.building?.name || 'Unknown Building'} - ${schedule.classroom.name}` : 'Virtual',
      isActive: true, // Default to active, can be updated based on business logic
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
      _count: schedule._count
    }))

    return NextResponse.json(formattedSchedules)
  } catch (error) {
    console.error('Error fetching schedules:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}