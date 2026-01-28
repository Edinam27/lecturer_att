import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-config';
import { prisma } from '@/lib/db';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
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
    if (!['ADMIN', 'LECTURER'].includes(userRole)) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const scheduleId = params.id;
    
    // For lecturers, verify they own this schedule
    if (userRole === 'LECTURER') {
      const lecturer = await prisma.lecturer.findUnique({
        where: { userId: userId }
      });

      const schedule = await prisma.courseSchedule.findUnique({
        where: { id: scheduleId },
        select: { lecturerId: true }
      });

      if (!schedule || !lecturer || schedule.lecturerId !== lecturer.id) {
        return NextResponse.json(
          { error: 'Forbidden' },
          { status: 403 }
        );
      }
    }

    // Fetch attendance records for this schedule (Sessions)
    const attendanceRecords = await prisma.attendanceRecord.findMany({
      where: {
        courseScheduleId: scheduleId
      },
      include: {
        lecturer: {
          include: {
            user: true
          }
        }
      },
      orderBy: [
        { timestamp: 'desc' }
      ]
    });

    // Format the response
    const formattedRecords = attendanceRecords.map(record => ({
      id: record.id,
      attendanceDate: record.timestamp,
      status: record.supervisorVerified === true ? 'Verified' : (record.supervisorVerified === false ? 'Disputed' : 'Pending'),
      checkInTime: record.timestamp,
      checkOutTime: record.sessionEndTime,
      location: record.method,
      remarks: record.remarks,
      lecturer: {
        id: record.lecturer.id,
        name: record.lecturer.user ? `${record.lecturer.user.firstName} ${record.lecturer.user.lastName}` : 'Unknown'
      }
    }));

    return NextResponse.json(formattedRecords);
  } catch (error) {
    console.error('Error fetching attendance records:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
    return NextResponse.json(
        { error: 'Method not implemented' },
        { status: 501 }
    );
}
