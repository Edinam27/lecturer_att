import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-config';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { isLocationValid } from '@/lib/geolocation';

const syncAttendanceSchema = z.object({
  sessionId: z.string(),
  attendanceRecords: z.array(z.object({
    studentId: z.string(),
    isPresent: z.boolean(),
  })),
  notes: z.string().optional(),
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }).nullable().optional(),
  timestamp: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'LECTURER') {
      return NextResponse.json({ error: 'Only lecturers can record attendance' }, { status: 403 });
    }

    const body = await request.json();
    
    // Remove extra fields that might be added by PWA service (like 'synced', 'id')
    const { id, synced, ...dataToValidate } = body;
    
    const validationResult = syncAttendanceSchema.safeParse(dataToValidate);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validationResult.error.errors },
        { status: 400 }
      );
    }

    const { sessionId, attendanceRecords, notes, location, timestamp } = validationResult.data;

    const lecturer = await prisma.lecturer.findFirst({
      where: { userId: session.user.id },
    });

    if (!lecturer) {
      return NextResponse.json({ error: 'Lecturer profile not found' }, { status: 404 });
    }

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

    // Check if attendance already exists for this session and roughly this time
    // This helps prevent duplicates if sync happens multiple times
    const recordTimestamp = new Date(timestamp);
    const existingRecord = await prisma.attendanceRecord.findFirst({
      where: {
        courseScheduleId: sessionId,
        lecturerId: lecturer.id,
        timestamp: {
          // Check within a 5 minute window of the original timestamp
          gte: new Date(recordTimestamp.getTime() - 5 * 60 * 1000),
          lte: new Date(recordTimestamp.getTime() + 5 * 60 * 1000),
        }
      }
    });

    if (existingRecord) {
      return NextResponse.json({ 
        success: true, 
        message: 'Attendance already recorded',
        recordId: existingRecord.id 
      });
    }

    let locationVerified = false;
    if (location && schedule.classroom && schedule.classroom.building) {
        const building = schedule.classroom.building;
        const isNearby = isLocationValid(
            location.latitude, 
            location.longitude, 
            building.gpsLatitude, 
            building.gpsLongitude, 
            100 // 100 meters radius
        );
        locationVerified = isNearby;
    }

    // Determine if this is a virtual session (no classroom assigned)
    // For virtual sessions, we do NOT record student attendance data
    const isVirtual = !schedule.classroom;

    const newRecord = await prisma.attendanceRecord.create({
      data: {
        lecturerId: lecturer.id,
        courseScheduleId: sessionId,
        timestamp: recordTimestamp,
        gpsLatitude: location?.latitude || null,
        gpsLongitude: location?.longitude || null,
        locationVerified: locationVerified,
        method: isVirtual ? 'virtual' : 'onsite',
        studentAttendanceData: isVirtual ? null : JSON.stringify(attendanceRecords),
        remarks: notes,
      },
    });

    return NextResponse.json({ 
        success: true, 
        message: 'Attendance synced successfully',
        recordId: newRecord.id 
    });

  } catch (error) {
    console.error('Error syncing attendance:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
