import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { prisma } from '@/lib/db'
import { authOptions } from '@/lib/auth-config'
import { z } from 'zod'


const verifyAttendanceSchema = z.object({
  attendanceRecordId: z.string(),
  verified: z.boolean(),
  comment: z.string().optional()
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id || !['SUPERVISOR', 'ADMIN', 'CLASS_REP'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized - Only supervisors and class reps can verify attendance' }, { status: 401 })
    }

    const body = await request.json()
    const { attendanceRecordId, verified, comment } = verifyAttendanceSchema.parse(body)

    // Get the attendance record
    const attendanceRecord = await prisma.attendanceRecord.findUnique({
      where: {
        id: attendanceRecordId
      },
      select: {
        id: true,
        timestamp: true,
        supervisorVerified: true,
        supervisorComment: true,
        courseSchedule: {
          select: {
            classGroupId: true, // Needed for Class Rep check
            course: {
              select: {
                title: true
              }
            },
            classGroup: {
              select: {
                name: true
              }
            },
            lecturer: {
              select: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true
                  }
                }
              }
            }
          }
        }
      }
    })

    if (!attendanceRecord) {
      return NextResponse.json({ error: 'Attendance record not found' }, { status: 404 })
    }

    // Check if Class Rep is authorized for this record
    if (session.user.role === 'CLASS_REP') {
      const classRepGroup = await prisma.classGroup.findFirst({
        where: { classRepId: session.user.id }
      })
      
      if (!classRepGroup || classRepGroup.id !== attendanceRecord.courseSchedule.classGroupId) {
        return NextResponse.json({ error: 'Unauthorized - You can only verify attendance for your own class' }, { status: 403 })
      }
    }

    // Check if already verified
    if (attendanceRecord.supervisorVerified !== null) {
      return NextResponse.json({ error: 'Attendance already verified' }, { status: 400 })
    }

    // Update the attendance record with verification
    const updatedRecord = await prisma.attendanceRecord.update({
      where: { id: attendanceRecordId },
      data: {
        supervisorVerified: verified,
        supervisorComment: comment || null
      }
    })

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'ATTENDANCE_VERIFIED',
        targetType: 'AttendanceRecord',
        targetId: attendanceRecord.id,
        metadata: JSON.stringify({
          verified,
          comment,
          lecturerName: `${attendanceRecord.courseSchedule.lecturer.user.firstName} ${attendanceRecord.courseSchedule.lecturer.user.lastName}`,
          course: attendanceRecord.courseSchedule.course.title,
          classGroup: attendanceRecord.courseSchedule.classGroup.name,
          timestamp: attendanceRecord.timestamp
        })
      }
    })

    return NextResponse.json({
      success: true,
      message: `Attendance ${verified ? 'verified' : 'disputed'} successfully`,
      record: {
        id: updatedRecord.id,
        supervisorVerified: updatedRecord.supervisorVerified,
        supervisorComment: updatedRecord.supervisorComment,
        lecturer: `${attendanceRecord.courseSchedule.lecturer.user.firstName} ${attendanceRecord.courseSchedule.lecturer.user.lastName}`,
        course: attendanceRecord.courseSchedule.course.title,
        classGroup: attendanceRecord.courseSchedule.classGroup.name,
        timestamp: attendanceRecord.timestamp
      }
    })
  } catch (error) {
    console.error('Error verifying attendance:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET endpoint to fetch pending verifications for supervisor
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id || (session.user.role !== 'SUPERVISOR' && session.user.role !== 'ADMIN' && session.user.role !== 'CLASS_REP')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const whereClause: any = {
      supervisorVerified: null // Only unverified records
    }

    // Filter for Class Reps
    if (session.user.role === 'CLASS_REP') {
      const classGroups = await prisma.classGroup.findMany({
        where: { classRepId: session.user.id },
        select: { id: true }
      })
      const classGroupIds = classGroups.map(cg => cg.id)
      
      whereClause.courseSchedule = {
        classGroupId: { in: classGroupIds }
      }
    }

    // Get pending attendance records for verification
    const pendingRecords = await prisma.attendanceRecord.findMany({
      where: whereClause,
      select: {
        id: true,
        timestamp: true,
        locationVerified: true,
        method: true,
        gpsLatitude: true,
        gpsLongitude: true,
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
        },
        lecturer: {
          select: {
            employeeId: true,
            user: {
              select: {
                firstName: true,
                lastName: true
              }
            }
          }
        }
      },
      orderBy: {
        timestamp: 'desc'
      }
    })

    const formattedRecords = pendingRecords.map(record => ({
      id: record.id,
      timestamp: record.timestamp,
      sessionType: record.courseSchedule.sessionType,
      course: {
        title: record.courseSchedule.course.title,
        courseCode: record.courseSchedule.course.courseCode
      },
      classGroup: {
        name: record.courseSchedule.classGroup.name
      },
      lecturer: {
        name: `${record.lecturer.user.firstName} ${record.lecturer.user.lastName}`,
        employeeId: record.lecturer.employeeId
      },
      location: {
        building: record.courseSchedule.classroom?.building?.name || 'Virtual',
        classroom: record.courseSchedule.classroom?.name || 'Virtual'
      },
      locationVerified: record.locationVerified,
      method: record.method,
      gpsLatitude: record.gpsLatitude,
      gpsLongitude: record.gpsLongitude
    }))

    return NextResponse.json(formattedRecords)
  } catch (error) {
    console.error('Error fetching pending verifications:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}