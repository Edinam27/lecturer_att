import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-config';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userRole = session.user.role;
    const userId = session.user.id;

    // Check authorization
    if (!['ADMIN', 'COORDINATOR', 'LECTURER'].includes(userRole)) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Build where clause based on user role
    let whereClause: any = {};
    
    if (userRole === 'LECTURER') {
      // Lecturers can only see attendance for their own schedules
      const lecturer = await prisma.lecturer.findUnique({
        where: { userId }
      });
      
      if (!lecturer) {
        return NextResponse.json({ error: 'Lecturer not found' }, { status: 404 });
      }

      whereClause = {
        lecturerId: lecturer.id
      };
    }
    // ADMIN and COORDINATOR can see all attendance records

    // Fetch recent attendance records (last 50 records)
    const attendanceRecords = await prisma.attendanceRecord.findMany({
      where: whereClause,
      include: {
        courseSchedule: {
          select: {
            id: true,
            dayOfWeek: true,
            startTime: true,
            endTime: true,
            sessionType: true,
            course: {
              select: {
                courseCode: true,
                title: true,
                programme: {
                  select: {
                    name: true
                  }
                }
              }
            },
            classGroup: {
              select: {
                name: true,
                admissionYear: true
              }
            },
            lecturer: {
              select: {
                id: true,
                // email: true, // Lecturer model might not have email directly, it's in User
                user: {
                  select: {
                    email: true,
                    firstName: true,
                    lastName: true
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
            }
          }
        }
      },
      orderBy: {
        timestamp: 'desc'
      },
      take: 50
    });

    // Format the response
    const formattedRecords = attendanceRecords.map(record => ({
      id: record.id,
      attendanceDate: record.timestamp,
      status: record.locationVerified ? 'Present' : 'Pending', // derive status
      checkInTime: record.timestamp,
      checkOutTime: record.sessionEndTime,
      location: record.gpsLatitude ? `${record.gpsLatitude}, ${record.gpsLongitude}` : 'N/A',
      remarks: record.remarks,
      createdAt: record.timestamp, // Use timestamp as createdAt
      // Removed student field as it's not applicable
      courseSchedule: {
        id: record.courseSchedule.id,
        dayOfWeek: record.courseSchedule.dayOfWeek,
        startTime: record.courseSchedule.startTime,
        endTime: record.courseSchedule.endTime,
        sessionType: record.courseSchedule.sessionType,
        venue: record.courseSchedule.classroom 
          ? `${record.courseSchedule.classroom.building.name} - ${record.courseSchedule.classroom.name}`
          : 'Virtual',
        course: {
          code: record.courseSchedule.course.courseCode,
          name: record.courseSchedule.course.title,
          programme: {
            name: record.courseSchedule.course.programme.name
          }
        },
        classGroup: {
          name: record.courseSchedule.classGroup.name,
          academicYear: record.courseSchedule.classGroup.admissionYear.toString()
        },
        lecturer: {
          id: record.courseSchedule.lecturer.id,
          email: record.courseSchedule.lecturer.user.email,
          name: `${record.courseSchedule.lecturer.user.firstName} ${record.courseSchedule.lecturer.user.lastName}`.trim()
        }
      }
    }));

    return NextResponse.json(formattedRecords);
  } catch (error) {
    console.error('Error fetching recent attendance:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}