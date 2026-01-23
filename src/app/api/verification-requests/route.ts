import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { prisma } from '@/lib/db'
import { authOptions } from '@/lib/auth-config'
import { z } from 'zod'

const createVerificationRequestSchema = z.object({
  attendanceRecordId: z.string(),
  evidenceUrls: z.array(z.string()).optional(),
  verificationNotes: z.string().optional(),
  studentAttendanceData: z.object({
    totalStudentsPresent: z.number(),
    studentsAbsent: z.array(z.string()).optional(),
    sessionQuality: z.enum(['excellent', 'good', 'fair', 'poor']),
    technicalIssues: z.array(z.string()).optional(),
    additionalNotes: z.string().optional()
  }).optional()
})

const updateVerificationRequestSchema = z.object({
  verificationRequestId: z.string(),
  status: z.enum(['approved', 'rejected', 'disputed']),
  reviewNotes: z.string().optional(),
  escalate: z.boolean().optional()
})

// POST - Create verification request
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id || session.user.role !== 'SUPERVISOR') {
      return NextResponse.json({ error: 'Unauthorized - Only supervisors can create verification requests' }, { status: 401 })
    }

    const body = await request.json()
    const { attendanceRecordId, evidenceUrls, verificationNotes, studentAttendanceData } = createVerificationRequestSchema.parse(body)

    // Get supervisor's info
    const user = await prisma.user.findUnique({
      where: { id: session.user.id }
    })
    
    // In future, we might restrict supervisors to specific departments/faculties
    // For now, any supervisor can verify any record
    
    // Get the attendance record
    const attendanceRecord = await prisma.attendanceRecord.findFirst({
      where: {
        id: attendanceRecordId
      },
      include: {
        courseSchedule: {
          include: {
            course: true,
            classGroup: true,
            lecturer: {
              include: {
                user: true
              }
            }
          }
        }
      }
    })

    if (!attendanceRecord) {
      return NextResponse.json({ error: 'Attendance record not found' }, { status: 404 })
    }

    // Check if verification request already exists
    const existingRequest = await prisma.verificationRequest.findFirst({
      where: {
        attendanceRecordId: attendanceRecordId
      }
    })

    if (existingRequest) {
      return NextResponse.json({ error: 'Verification request already exists for this attendance record' }, { status: 400 })
    }

    // Create verification request
    const verificationRequest = await prisma.verificationRequest.create({
      data: {
        attendanceRecordId,
        requesterId: session.user.id,
        status: 'pending',
        evidence: evidenceUrls ? JSON.stringify(evidenceUrls) : null,
        description: verificationNotes || 'Verification Request',
        createdAt: new Date()
      }
    })

    // Create notification for lecturer
    await prisma.notification.create({
      data: {
        userId: attendanceRecord.courseSchedule.lecturer.userId,
        type: 'verification_request',
        title: 'Attendance Verification Request',
        message: `Supervisor has submitted a verification request for your ${attendanceRecord.courseSchedule.course.title} session`,
        data: JSON.stringify({
          verificationRequestId: verificationRequest.id,
          attendanceRecordId,
          course: attendanceRecord.courseSchedule.course.title,
          classGroup: attendanceRecord.courseSchedule.classGroup.name,
          timestamp: attendanceRecord.timestamp
        }),
        channel: 'web'
      }
    })

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'VERIFICATION_REQUEST_CREATED',
        targetType: 'VerificationRequest',
        targetId: verificationRequest.id,
        metadata: JSON.stringify({
          attendanceRecordId,
          lecturerName: `${attendanceRecord.courseSchedule.lecturer.user.firstName} ${attendanceRecord.courseSchedule.lecturer.user.lastName}`,
          course: attendanceRecord.courseSchedule.course.title,
          classGroup: attendanceRecord.courseSchedule.classGroup.name,
          evidenceCount: evidenceUrls?.length || 0,
          hasStudentData: !!studentAttendanceData
        })
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Verification request created successfully',
      verificationRequest: {
        id: verificationRequest.id,
        status: verificationRequest.status,
        submittedAt: verificationRequest.createdAt
      }
    })
  } catch (error) {
    console.error('Error creating verification request:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET - Fetch verification requests
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const role = session.user.role

    let verificationRequests

    if (role === 'SUPERVISOR') {
      // Get verification requests created by this supervisor
      verificationRequests = await prisma.verificationRequest.findMany({
        where: {
          requesterId: session.user.id,
          ...(status && { status: status as any })
        },
        include: {
          attendanceRecord: {
            include: {
              courseSchedule: {
                include: {
                  course: true,
                  classGroup: true,
                  lecturer: {
                    include: {
                      user: true
                    }
                  }
                }
              }
            }
          },
          requester: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      })
    } else if (role === 'LECTURER') {
      // Get verification requests for this lecturer's attendance records
      const lecturer = await prisma.lecturer.findUnique({
        where: { userId: session.user.id }
      })

      if (!lecturer) {
        return NextResponse.json({ error: 'Lecturer profile not found' }, { status: 404 })
      }

      verificationRequests = await prisma.verificationRequest.findMany({
        where: {
          attendanceRecord: {
            lecturerId: lecturer.id
          },
          ...(status && { status: status as any })
        },
        include: {
          attendanceRecord: {
            include: {
              courseSchedule: {
                include: {
                  course: true,
                  classGroup: true
                }
              }
            }
          },
          requester: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: {
          submittedAt: 'desc'
        }
      })
    } else {
      // Admin or coordinator can see all verification requests
      verificationRequests = await prisma.verificationRequest.findMany({
        where: {
          ...(status && { status: status as any })
        },
        include: {
          attendanceRecord: {
            include: {
              courseSchedule: {
                include: {
                  course: true,
                  classGroup: true,
                  lecturer: {
                    include: {
                      user: true
                    }
                  }
                }
              }
            }
          },
          requester: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: {
          submittedAt: 'desc'
        }
      })
    }

    const formattedRequests = verificationRequests.map(request => ({
      id: request.id,
      status: request.status,
      submittedAt: request.submittedAt,
      reviewedAt: request.reviewedAt,
      escalatedAt: request.escalatedAt,
      verificationNotes: request.verificationNotes,
      reviewNotes: request.reviewNotes,
      evidenceUrls: request.evidenceUrls ? JSON.parse(request.evidenceUrls) : [],
      studentAttendanceData: request.studentAttendanceData ? JSON.parse(request.studentAttendanceData) : null,
      attendanceRecord: {
        id: request.attendanceRecord.id,
        timestamp: request.attendanceRecord.timestamp,
        method: request.attendanceRecord.method,
        locationVerified: request.attendanceRecord.locationVerified,
        course: {
          title: request.attendanceRecord.courseSchedule.course.title,
          courseCode: request.attendanceRecord.courseSchedule.course.courseCode
        },
        classGroup: {
          name: request.attendanceRecord.courseSchedule.classGroup.name
        },
        lecturer: {
          name: `${request.attendanceRecord.courseSchedule.lecturer.user.firstName} ${request.attendanceRecord.courseSchedule.lecturer.user.lastName}`,
          employeeId: request.attendanceRecord.courseSchedule.lecturer.employeeId
        }
      },
      requester: {
        name: `${request.requester.firstName} ${request.requester.lastName}`,
        email: request.requester.email
      }
    }))

    return NextResponse.json(formattedRequests)
  } catch (error) {
    console.error('Error fetching verification requests:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT - Update verification request status
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { verificationRequestId, status, reviewNotes, escalate } = updateVerificationRequestSchema.parse(body)

    // Get the verification request
    const verificationRequest = await prisma.verificationRequest.findUnique({
      where: { id: verificationRequestId },
      include: {
        attendanceRecord: {
          include: {
            courseSchedule: {
              include: {
                course: true,
                classGroup: true,
                lecturer: {
                  include: {
                    user: true
                  }
                }
              }
            }
          }
        },
        requester: true
      }
    })

    if (!verificationRequest) {
      return NextResponse.json({ error: 'Verification request not found' }, { status: 404 })
    }

    // Check authorization
    const userRole = session.user.role
    const isLecturer = userRole === 'LECTURER' && verificationRequest.attendanceRecord.courseSchedule.lecturer.userId === session.user.id
    const isRequester = verificationRequest.requesterId === session.user.id
    const isAdminOrCoordinator = ['ADMIN', 'ACADEMIC_COORDINATOR'].includes(userRole)

    if (!isLecturer && !isRequester && !isAdminOrCoordinator) {
      return NextResponse.json({ error: 'Unauthorized to update this verification request' }, { status: 403 })
    }

    // Update verification request
    const updatedRequest = await prisma.verificationRequest.update({
      where: { id: verificationRequestId },
      data: {
        status,
        reviewNotes,
        reviewedAt: new Date(),
        ...(escalate && { escalatedAt: new Date() })
      }
    })

    // If approved, update the attendance record
    if (status === 'approved' && !escalate) {
      if (verificationRequest.attendanceRecordId) {
        await prisma.attendanceRecord.update({
          where: { id: verificationRequest.attendanceRecordId },
          data: {
            supervisorVerified: true, // Auto-verify if request approved
            supervisorComment: `Verified via request: ${reviewNotes || 'Approved by lecturer'}`
          }
        })
      }
    } else if (status === 'rejected') {
      if (verificationRequest.attendanceRecordId) {
        await prisma.attendanceRecord.update({
          where: { id: verificationRequest.attendanceRecordId },
          data: {
            supervisorVerified: false,
            supervisorComment: `Rejected via request: ${reviewNotes || 'Rejected by lecturer'}`
          }
        })
      }
    }

    // Create notifications
    const notificationTargets = []
    
    if (isLecturer) {
      // Notify requester (Supervisor)
      notificationTargets.push({
        userId: verificationRequest.requesterId,
        title: `Verification Request ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        message: `Your verification request for ${verificationRequest.attendanceRecord.courseSchedule.course.title} has been ${status}`
      })
    } else if (isRequester || isAdminOrCoordinator) {
      // Notify lecturer
      notificationTargets.push({
        userId: verificationRequest.attendanceRecord.courseSchedule.lecturer.userId,
        title: `Verification Request ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        message: `Verification request for your ${verificationRequest.attendanceRecord.courseSchedule.course.title} session has been ${status}`
      })
    }

    // Create notifications
    for (const target of notificationTargets) {
      await prisma.notification.create({
        data: {
          userId: target.userId,
          type: 'verification_update',
          title: target.title,
          message: target.message,
          data: JSON.stringify({
            verificationRequestId,
            status,
            course: verificationRequest.attendanceRecord.courseSchedule.course.title,
            classGroup: verificationRequest.attendanceRecord.courseSchedule.classGroup.name
          }),
          channel: 'web'
        }
      })
    }

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'VERIFICATION_REQUEST_UPDATED',
        targetType: 'VerificationRequest',
        targetId: verificationRequestId,
        metadata: JSON.stringify({
          status,
          reviewNotes,
          escalated: !!escalate,
          reviewerRole: userRole,
          course: verificationRequest.attendanceRecord.courseSchedule.course.title,
          classGroup: verificationRequest.attendanceRecord.courseSchedule.classGroup.name
        })
      }
    })

    return NextResponse.json({
      success: true,
      message: `Verification request ${status} successfully`,
      verificationRequest: {
        id: updatedRequest.id,
        status: updatedRequest.status,
        reviewedAt: updatedRequest.reviewedAt,
        escalatedAt: updatedRequest.escalatedAt
      }
    })
  } catch (error) {
    console.error('Error updating verification request:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}