import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-config';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, subMonths } from 'date-fns';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    // Permission check is handled by middleware

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '1y'; // Default to 1 year for production data visibility
    const type = searchParams.get('type') || 'overview'; // overview, attendance, verification, courses

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, id: true }
    });

    if (!user) {
      console.warn(`Analytics API: User not found for ID ${session.user.id}`);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Calculate date ranges
    const now = new Date();
    let startDate: Date;
    let endDate = now;

    switch (period) {
      case '7d':
        startDate = subDays(now, 7);
        break;
      case '30d':
        startDate = subDays(now, 30);
        break;
      case '3m':
        startDate = subMonths(now, 3);
        break;
      case '6m':
        startDate = subMonths(now, 6);
        break;
      case '1y':
        startDate = subMonths(now, 12);
        break;
      case 'all':
        startDate = new Date(0); // Beginning of time
        break;
      default:
        startDate = subDays(now, 30);
    }

    // Base filters based on user role
    let attendanceFilter: any = {
      timestamp: {
        gte: startDate,
        lte: endDate
      }
    };

    let lecturerIdForFilter: string | undefined;

    if (user.role === 'LECTURER') {
      const lecturer = await prisma.lecturer.findUnique({
        where: { userId: user.id }
      });
      if (lecturer) {
        attendanceFilter.lecturerId = lecturer.id;
        lecturerIdForFilter = lecturer.id;
      } else {
        // If lecturer profile not found, they shouldn't see any records
        attendanceFilter.lecturerId = 'non-existent-id';
      }
    } else if (user.role === 'CLASS_REP') {
      // Get class rep's class group
      const classGroup = await prisma.classGroup.findFirst({
        where: { classRepId: user.id }
      });
      if (classGroup) {
        attendanceFilter.courseSchedule = {
          classGroupId: classGroup.id
        };
      }
    }

    switch (type) {
      case 'overview':
        return await getOverviewAnalytics(attendanceFilter, user.role);
      case 'attendance':
        return await getAttendanceAnalytics(attendanceFilter, startDate, endDate);
      case 'verification':
        return await getVerificationAnalytics(attendanceFilter, startDate, endDate);
      case 'courses':
        return await getCourseAnalytics(attendanceFilter, user.role, lecturerIdForFilter);
      default:
        return NextResponse.json({ error: 'Invalid analytics type' }, { status: 400 });
    }
  } catch (error) {
    console.error('Analytics API error:', error);
    // Log stack trace if available
    if (error instanceof Error) {
      console.error(error.stack);
    }
    return NextResponse.json(
      { error: 'Failed to fetch analytics data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

async function getOverviewAnalytics(filter: any, userRole: string) {
  const [totalRecords, verifiedRecords, pendingRecords, disputedRecords] = await Promise.all([
    prisma.attendanceRecord.count({ where: filter }),
    prisma.attendanceRecord.count({ 
      where: { ...filter, supervisorVerified: true } 
    }),
    prisma.attendanceRecord.count({ 
      where: { ...filter, supervisorVerified: null } 
    }),
    prisma.attendanceRecord.count({ 
      where: { ...filter, supervisorVerified: false } 
    })
  ]);

  const verificationRate = totalRecords > 0 ? (verifiedRecords / totalRecords) * 100 : 0;
  const pendingRate = totalRecords > 0 ? (pendingRecords / totalRecords) * 100 : 0;

  // Get recent activity
  const recentActivity = await prisma.attendanceRecord.findMany({
    where: filter,
    orderBy: { timestamp: 'desc' },
    take: 10,
    select: {
      id: true,
      timestamp: true,
      supervisorVerified: true,
      method: true,
      lecturer: { 
        select: { 
          user: {
            select: {
              firstName: true,
              lastName: true
            }
          }
        }
      },
      courseSchedule: { 
        select: { 
          course: { select: { title: true, courseCode: true } },
          classGroup: { select: { name: true } }
        }
      }
    }
  });

  return NextResponse.json({
    overview: {
      totalRecords,
      verifiedRecords,
      pendingRecords,
      disputedRecords,
      verificationRate: Math.round(verificationRate * 100) / 100,
      pendingRate: Math.round(pendingRate * 100) / 100
    },
    recentActivity: recentActivity.map(record => ({
      id: record.id,
      course: record.courseSchedule?.course ? `${record.courseSchedule.course.courseCode} - ${record.courseSchedule.course.title}` : 'Unknown Course',
      lecturer: record.lecturer?.user ? `${record.lecturer.user.firstName} ${record.lecturer.user.lastName}` : 'Unknown Lecturer',
      classGroup: record.courseSchedule?.classGroup?.name || 'Unknown Class Group',
      date: record.timestamp,
      status: record.supervisorVerified === null ? 'pending' : 
              record.supervisorVerified ? 'verified' : 'disputed',
      sessionType: record.method
    }))
  });
}

async function getAttendanceAnalytics(filter: any, startDate: Date, endDate: Date) {
  // Daily attendance trends
  // Note: Using Prisma's queryRaw for complex aggregation
  // Using ::date cast for PostgreSQL compatibility
  const dailyTrends = await prisma.$queryRawUnsafe(`
    SELECT 
      ar.timestamp::date as day,
      COUNT(*) as total,
      SUM(CASE WHEN ar.supervisor_verified IS TRUE THEN 1 ELSE 0 END) as verified,
      SUM(CASE WHEN ar.supervisor_verified IS FALSE THEN 1 ELSE 0 END) as disputed,
      SUM(CASE WHEN ar.supervisor_verified IS NULL THEN 1 ELSE 0 END) as pending
    FROM attendance_records ar
    ${filter.courseSchedule?.classGroupId ? 'JOIN course_schedules cs ON ar.course_schedule_id = cs.id' : ''}
    WHERE ar.timestamp >= '${startDate.toISOString()}' AND ar.timestamp <= '${endDate.toISOString()}'
    ${filter.lecturerId ? `AND ar.lecturer_id = '${filter.lecturerId}'` : ''}
    ${filter.courseSchedule?.classGroupId ? `AND cs.class_group_id = '${filter.courseSchedule.classGroupId}'` : ''}
    GROUP BY ar.timestamp::date
    ORDER BY day
  `);

  // Fix BigInt serialization for raw queries
  const serializedDailyTrends = JSON.parse(JSON.stringify(dailyTrends, (key, value) =>
      typeof value === 'bigint'
        ? Number(value)
        : value
    ));

    const sessionTypes = await prisma.attendanceRecord.groupBy({
      by: ['method'],
      where: filter,
      _count: { method: true }
    });

    // Location accuracy analysis
    const locationAccuracy = await prisma.attendanceRecord.groupBy({
      by: ['locationAccuracy'],
      where: { ...filter, locationAccuracy: { not: null } },
      _count: { locationAccuracy: true },
      _avg: { locationAccuracy: true }
    });

    return NextResponse.json({
      dailyTrends: serializedDailyTrends,
      sessionTypes: sessionTypes.map(st => ({
        type: st.method,
        count: st._count.method
      })),
      locationAccuracy: {
        distribution: locationAccuracy,
        averageAccuracy: locationAccuracy.reduce((acc, curr) => 
          acc + (curr._avg.locationAccuracy || 0), 0) / locationAccuracy.length || 0
      }
    });
  }

async function getVerificationAnalytics(filter: any, startDate: Date, endDate: Date) {
  // Verification trends over time
  const verificationTrends = await prisma.$queryRawUnsafe(`
      SELECT 
        ar.timestamp::date as day,
        COUNT(*) as total,
        SUM(CASE WHEN ar.supervisor_verified IS TRUE THEN 1 ELSE 0 END) as verified,
        SUM(CASE WHEN ar.supervisor_verified IS FALSE THEN 1 ELSE 0 END) as disputed
      FROM attendance_records ar
      ${filter.courseSchedule?.classGroupId ? 'JOIN course_schedules cs ON ar.course_schedule_id = cs.id' : ''}
      WHERE ar.timestamp >= '${startDate.toISOString()}' AND ar.timestamp <= '${endDate.toISOString()}'
      AND ar.supervisor_verified IS NOT NULL
      ${filter.lecturerId ? `AND ar.lecturer_id = '${filter.lecturerId}'` : ''}
      ${filter.courseSchedule?.classGroupId ? `AND cs.class_group_id = '${filter.courseSchedule.classGroupId}'` : ''}
      GROUP BY ar.timestamp::date
      ORDER BY day
    `);

  // Verification requests by status
  const verificationRequests = await prisma.verificationRequest.groupBy({
    by: ['status'],
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate
      }
    },
    _count: { status: true }
  });

  // Average verification time (Postgres)
  const avgVerificationTime = await prisma.$queryRaw`
    SELECT AVG(
      CASE 
        WHEN reviewed_at IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (reviewed_at - created_at)) / 60
        ELSE NULL 
      END
    ) as avgMinutes
    FROM verification_requests 
    WHERE created_at >= ${startDate} AND created_at <= ${endDate}
    AND reviewed_at IS NOT NULL
    ${filter.lecturerId ? Prisma.sql`AND lecturer_id = ${filter.lecturerId}` : Prisma.empty}
    ${filter.courseSchedule?.classGroupId ? Prisma.sql`AND course_schedule_id IN (SELECT id FROM course_schedules WHERE class_group_id = ${filter.courseSchedule.classGroupId})` : Prisma.empty}
  `;

  return NextResponse.json({
    verificationTrends,
    verificationRequests: verificationRequests.map(vr => ({
      status: vr.status,
      count: vr._count.status
    })),
    averageVerificationTime: (avgVerificationTime as any)[0]?.avgMinutes || 0
  });
}

async function getCourseAnalytics(filter: any, userRole: string, lecturerId?: string) {
  let courseFilter: any = {};
  
  if (userRole === 'LECTURER' && lecturerId) {
    courseFilter.courseSchedules = {
      some: {
        lecturerId: lecturerId
      }
    };
  } else if (filter.courseSchedule?.classGroupId) {
    courseFilter.courseSchedules = {
      some: {
        classGroupId: filter.courseSchedule.classGroupId
      }
    };
  }

  // Fetch courses with their schedules and attendance records
  const courses = await prisma.course.findMany({
    where: courseFilter,
    include: {
      courseSchedules: {
        where: userRole === 'LECTURER' && lecturerId ? { lecturerId } : 
               filter.courseSchedule?.classGroupId ? { classGroupId: filter.courseSchedule.classGroupId } : undefined,
        include: {
          attendanceRecords: {
            where: {
              timestamp: filter.timestamp
            },
            select: {
              id: true,
              supervisorVerified: true,
              method: true
            }
          }
        }
      }
    }
  });

  const courseAnalytics = courses.map(course => {
    // Flatten attendance records from all relevant schedules
    const records = course.courseSchedules.flatMap(schedule => schedule.attendanceRecords);
    
    const total = records.length;
    const verified = records.filter(r => r.supervisorVerified === true).length;
    const disputed = records.filter(r => r.supervisorVerified === false).length;
    const pending = records.filter(r => r.supervisorVerified === null).length;
    const virtualSessions = records.filter(r => r.method === 'virtual').length;
    const physicalSessions = records.filter(r => r.method === 'onsite').length;

    return {
      id: course.id,
      name: course.title,
      code: course.courseCode,
      totalRecords: total,
      verifiedRecords: verified,
      disputedRecords: disputed,
      pendingRecords: pending,
      verificationRate: total > 0 ? (verified / total) * 100 : 0,
      virtualSessions,
      physicalSessions
    };
  });

  return NextResponse.json({
    courses: courseAnalytics
  });
}