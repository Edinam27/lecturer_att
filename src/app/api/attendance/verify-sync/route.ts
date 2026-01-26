import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-config';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const verifySyncSchema = z.object({
  attendanceRecordId: z.string(),
  verified: z.boolean(),
  comment: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || !['SUPERVISOR', 'ADMIN', 'CLASS_REP'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    
    // Remove extra fields
    const { id, synced, timestamp, ...dataToValidate } = body;
    
    const validationResult = verifySyncSchema.safeParse(dataToValidate);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validationResult.error.errors },
        { status: 400 }
      );
    }

    const { attendanceRecordId, verified, comment } = validationResult.data;

    // Get the attendance record
    const attendanceRecord = await prisma.attendanceRecord.findUnique({
      where: {
        id: attendanceRecordId
      },
      include: {
        courseSchedule: true
      }
    });

    if (!attendanceRecord) {
      return NextResponse.json({ error: 'Attendance record not found' }, { status: 404 });
    }

    // Check if Class Rep is authorized for this record
    if (session.user.role === 'CLASS_REP') {
      const classRepGroup = await prisma.classGroup.findFirst({
        where: { classRepId: session.user.id }
      });
      
      if (!classRepGroup || classRepGroup.id !== attendanceRecord.courseSchedule.classGroupId) {
        return NextResponse.json({ error: 'Unauthorized - You can only verify attendance for your own class' }, { status: 403 });
      }
    }

    // Update the attendance record with verification
    await prisma.attendanceRecord.update({
      where: { id: attendanceRecordId },
      data: {
        supervisorVerified: verified,
        supervisorComment: comment || null
      }
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'ATTENDANCE_VERIFIED_SYNC',
        targetType: 'AttendanceRecord',
        targetId: attendanceRecord.id,
        metadata: JSON.stringify({
          verified,
          comment,
          syncedAt: new Date().toISOString()
        })
      }
    });

    return NextResponse.json({ 
        success: true, 
        message: 'Verification synced successfully' 
    });

  } catch (error) {
    console.error('Error syncing verification:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
