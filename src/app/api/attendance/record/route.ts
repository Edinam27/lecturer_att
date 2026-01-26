import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-config';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { isLocationValid } from '@/lib/geolocation';

// Schema for validation
const recordAttendanceSchema = z.object({
  sessionId: z.string(),
  attendanceRecords: z.array(z.object({
    studentId: z.string(),
    isPresent: z.boolean(),
  })),
  notes: z.string().optional(),
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }).optional(),
  timestamp: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify lecturer role
    if (session.user.role !== 'LECTURER') {
      return NextResponse.json({ error: 'Only lecturers can record attendance' }, { status: 403 });
    }

    const body = await request.json();
    const validationResult = recordAttendanceSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validationResult.error.errors },
        { status: 400 }
      );
    }

    const { sessionId, attendanceRecords, notes, location, timestamp } = validationResult.data;

    // Get lecturer info
    const lecturer = await prisma.lecturer.findFirst({
      where: { userId: session.user.id },
    });

    if (!lecturer) {
      return NextResponse.json({ error: 'Lecturer profile not found' }, { status: 404 });
    }

    // Verify schedule exists and belongs to lecturer (or is accessible)
    const schedule = await prisma.courseSchedule.findUnique({
      where: { id: sessionId },
      include: {
        classroom: {
            include: {
                building: true
            }
        }
      }
    });

    if (!schedule) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Optional: Verify lecturer owns the schedule
    if (schedule.lecturerId !== lecturer.id) {
      // Allow if it's a valid substitute or admin override? 
      // For now, enforce ownership or return 403
      return NextResponse.json({ error: 'You are not assigned to this session' }, { status: 403 });
    }

    // Verify Location
    let locationVerified = false;
    let locationAccuracy = null;
    if (location && schedule.classroom && schedule.classroom.building) {
        const building = schedule.classroom.building;
        // Simple distance check (this logic might need to be imported from geolocation util)
        // For now, let's assume isLocationValid handles it or we do a basic check
        // Using the imported helper if available
        const isNearby = isLocationValid(
            location.latitude, 
            location.longitude, 
            building.gpsLatitude, 
            building.gpsLongitude, 
            100 // 100 meters radius
        );
        locationVerified = isNearby;
    }

    // Create Attendance Record
    const newRecord = await prisma.attendanceRecord.create({
      data: {
        lecturerId: lecturer.id,
        courseScheduleId: sessionId,
        timestamp: new Date(timestamp),
        gpsLatitude: location?.latitude || null,
        gpsLongitude: location?.longitude || null,
        locationVerified: locationVerified,
        method: 'onsite', // Assuming onsite if location is provided, or derived from logic
        studentAttendanceData: JSON.stringify(attendanceRecords),
        remarks: notes,
      },
    });

    return NextResponse.json({ 
        success: true, 
        message: 'Attendance recorded successfully',
        recordId: newRecord.id 
    });

  } catch (error) {
    console.error('Error recording attendance:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
