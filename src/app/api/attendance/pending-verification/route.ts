import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-config';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const querySchema = z.object({
  limit: z.string().optional().transform(val => val ? parseInt(val) : 50),
  offset: z.string().optional().transform(val => val ? parseInt(val) : 0),
  status: z.enum(['PENDING', 'VERIFIED', 'DISPUTED', 'ABSENT']).optional(),
  urgent: z.string().optional().transform(val => val === 'true'),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Only class reps, admins, academic coordinators, and supervisors can access this
    if (!['CLASS_REP', 'ADMIN', 'ACADEMIC_COORDINATOR', 'SUPERVISOR'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const { limit, offset, status, urgent } = querySchema.parse(Object.fromEntries(searchParams));

    let whereClause: any = {};

    // For class reps, only show records for their class
    if (session.user.role === 'CLASS_REP') {
      // First, get the class rep's class group
      const classGroup = await prisma.classGroup.findFirst({
        where: {
          classRepId: session.user.id,
        }
      });

      if (!classGroup) {
        return NextResponse.json(
          { error: 'Class representative assignment not found' },
          { status: 404 }
        );
      }

      whereClause.courseSchedule = {
        classGroupId: classGroup.id,
      };
    }

    // Filter by status if provided
    if (status) {
      if (status === 'VERIFIED') {
        whereClause.supervisorVerified = true;
      } else if (status === 'DISPUTED') {
        whereClause.supervisorVerified = false;
      } else if (status === 'PENDING') {
        whereClause.supervisorVerified = null;
      }
    } else {
      // Default to pending if no status specified
      whereClause.supervisorVerified = null;
    }

    // Filter by urgent (deadline passed) if requested
    // Note: verificationDeadline field does not exist in schema, removing filter for now
    /*
    if (urgent) {
      whereClause.verificationDeadline = {
        lt: new Date(),
      };
    }
    */

    const attendanceRecords = await prisma.attendanceRecord.findMany({
      where: whereClause,
      select: {
        id: true,
        timestamp: true,
        supervisorVerified: true,
        supervisorComment: true,
        remarks: true,
        verificationConfidenceScore: true,
        courseSchedule: {
          select: {
            startTime: true,
            endTime: true,
            lecturer: {
              select: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            },
            course: {
              select: {
                id: true,
                title: true,
                courseCode: true,
              },
            },
            classroom: {
              select: {
                name: true,
                building: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
            classGroup: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: [
        {
          timestamp: 'desc',
        },
      ],
      take: limit,
      skip: offset,
    });

    // Format the response
    const formattedRecords = attendanceRecords.map(record => {
      const schedule = record.courseSchedule;
      
      let status = 'PENDING';
      if (record.supervisorVerified === true) status = 'VERIFIED';
      if (record.supervisorVerified === false) status = 'DISPUTED';

      // Calculate deadline (e.g. 24 hours after session)
      const deadline = new Date(record.timestamp);
      deadline.setHours(deadline.getHours() + 24);

      return {
        id: record.id,
        lecturerName: `${schedule.lecturer.user.firstName} ${schedule.lecturer.user.lastName}`,
        subject: schedule.course.title,
        subjectCode: schedule.course.courseCode,
        classGroup: schedule.classGroup.name,
        scheduledTime: schedule.startTime ? `${schedule.startTime} - ${schedule.endTime}` : record.timestamp.toISOString(), // Fallback
        actualTime: record.timestamp.toISOString(),
        status: status,
        location: schedule.classroom ? `${schedule.classroom.building.name} - ${schedule.classroom.name}` : 'Unknown Location',
        building: schedule.classroom ? schedule.classroom.building.name : '',
        classroom: schedule.classroom ? schedule.classroom.name : '',
        notes: record.remarks,
        verificationDeadline: deadline.toISOString(),
        isPresent: true, // Record exists means present
        riskScore: record.verificationConfidenceScore || 0,
        // Mock student data to satisfy frontend interface for now
        studentName: 'N/A', 
        studentEmail: 'N/A',
        createdAt: record.timestamp.toISOString(),
        updatedAt: new Date().toISOString(), // No updatedAt in schema snippet, using current or mock
        verification: record.supervisorVerified !== null ? {
          id: 'generated-id', // No separate verification record
          status: status,
          notes: record.supervisorComment,
          verifiedBy: 'Supervisor', // Generic
          verifiedByRole: 'SUPERVISOR',
          verifiedAt: new Date().toISOString(), // Unknown
        } : null,
      };
    });

    // Get total count for pagination
    const totalCount = await prisma.attendanceRecord.count({
      where: whereClause,
    });

    // Get summary statistics
    const stats = {
      total: totalCount,
      pending: await prisma.attendanceRecord.count({
        where: {
          ...whereClause,
          supervisorVerified: null,
        },
      }),
      verified: await prisma.attendanceRecord.count({
        where: {
          ...whereClause,
          supervisorVerified: true,
        },
      }),
      disputed: await prisma.attendanceRecord.count({
        where: {
          ...whereClause,
          supervisorVerified: false,
        },
      }),
      urgent: await prisma.attendanceRecord.count({
        where: {
          ...whereClause,
          supervisorVerified: null,
          timestamp: {
            lt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Older than 24 hours
          },
        },
      }),
    };

    return NextResponse.json({
      records: formattedRecords,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount,
      },
      stats,
    });

  } catch (error) {
    console.error('Error fetching pending verifications:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Get specific attendance record for verification
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { attendanceId } = z.object({
      attendanceId: z.string(),
    }).parse(body);

    const attendanceRecord = await prisma.attendanceRecord.findUnique({
      where: {
        id: attendanceId,
      },
      select: {
        id: true,
        timestamp: true,
        supervisorVerified: true,
        supervisorComment: true,
        remarks: true,
        verificationConfidenceScore: true,
        courseSchedule: {
          select: {
            startTime: true,
            endTime: true,
            lecturer: {
              select: {
                id: true,
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            },
            course: {
              select: {
                id: true,
                title: true,
                courseCode: true,
              },
            },
            classroom: {
              select: {
                name: true,
                building: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
            classGroup: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!attendanceRecord) {
      return NextResponse.json(
        { error: 'Attendance record not found' },
        { status: 404 }
      );
    }

    // Check permissions for class reps
    if (session.user.role === 'CLASS_REP') {
      const classGroup = await prisma.classGroup.findFirst({
        where: {
          classRepId: session.user.id,
          id: attendanceRecord.courseSchedule.classGroup.id,
        },
      });

      if (!classGroup) {
        return NextResponse.json(
          { error: 'Forbidden' },
          { status: 403 }
        );
      }
    }

    // Format the response
    const schedule = attendanceRecord.courseSchedule;
    const formattedRecord = {
      id: attendanceRecord.id,
      lecturerName: `${schedule.lecturer.user.firstName} ${schedule.lecturer.user.lastName}`,
      subject: schedule.course.title,
      subjectCode: schedule.course.courseCode,
      classGroup: schedule.classGroup.name,
      scheduledTime: schedule.startTime ? `${schedule.startTime} - ${schedule.endTime}` : attendanceRecord.timestamp.toISOString(),
      actualTime: attendanceRecord.timestamp.toISOString(),
      status: attendanceRecord.supervisorVerified === true ? 'VERIFIED' : attendanceRecord.supervisorVerified === false ? 'DISPUTED' : 'PENDING',
      location: schedule.classroom ? `${schedule.classroom.building.name} - ${schedule.classroom.name}` : 'Unknown',
      building: schedule.classroom ? schedule.classroom.building.name : '',
      classroom: schedule.classroom ? schedule.classroom.name : '',
      notes: attendanceRecord.remarks,
      verificationDeadline: new Date(attendanceRecord.timestamp.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      isPresent: true,
      riskScore: attendanceRecord.verificationConfidenceScore,
      student: {
        id: 'N/A',
        name: 'N/A',
        email: 'N/A',
        profileImage: null,
      },
      createdAt: attendanceRecord.timestamp.toISOString(),
      updatedAt: new Date().toISOString(),
      verifications: [],
    };

    return NextResponse.json(formattedRecord);

  } catch (error) {
    console.error('Error fetching attendance record:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}