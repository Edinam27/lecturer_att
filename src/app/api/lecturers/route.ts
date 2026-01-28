import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-config';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    // Permission check is handled by middleware

    let whereClause: any = {
      role: 'LECTURER'
    };

    if (session?.user.role === 'COORDINATOR') {
      whereClause = {
        role: 'LECTURER',
        lecturer: {
          OR: [
            {
              courseSchedules: {
                some: {
                  course: {
                    programme: {
                      coordinator: session.user.id
                    }
                  }
                }
              }
            },
            {
              courseSchedules: {
                none: {}
              }
            }
          ]
        }
      };
    }

    // Fetch all lecturers
    const lecturers = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
        createdAt: true, // Included as it exists in User schema
        lecturer: {
          select: {
            id: true, // Include lecturer ID
            employeeId: true,
            department: true,
            employmentType: true,
            rank: true,
            isAdjunct: true,
            isOverload: true,
            courseSchedules: {
              select: {
                isOverload: true,
                id: true
              }
            }
          }
        }
      },
      orderBy: {
        firstName: 'asc'
      }
    });

    // Format the response - use lecturer.id instead of user.id for proper filtering
    const formattedLecturers = lecturers
      .filter(lecturer => lecturer.lecturer) // Only include users who have lecturer records
      .map(lecturer => {
        const scheduleCount = lecturer.lecturer!.courseSchedules.length;
        const overloadCount = lecturer.lecturer!.courseSchedules.filter(s => s.isOverload).length;
        
        return {
          id: lecturer.lecturer!.id, // Use lecturer ID, not user ID
          userId: lecturer.id,
          user: {
            firstName: lecturer.firstName,
            lastName: lecturer.lastName,
            email: lecturer.email
          },
          isActive: lecturer.isActive,
          createdAt: lecturer.createdAt,
          lecturer: {
            employeeId: lecturer.lecturer?.employeeId,
            department: lecturer.lecturer?.department,
            employmentType: lecturer.lecturer?.employmentType,
            rank: lecturer.lecturer?.rank,
            isAdjunct: lecturer.lecturer?.isAdjunct || false,
            scheduleCount: scheduleCount,
            overloadCount: overloadCount
          }
        };
      });

    return NextResponse.json(formattedLecturers);
  } catch (error) {
    console.error('Error fetching lecturers:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userRole = session.user.role;

    // Only admins and coordinators can create lecturers
    if (userRole !== 'ADMIN' && userRole !== 'COORDINATOR') {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      email,
      password,
      firstName,
      lastName,
      phoneNumber,
      dateOfBirth,
      employeeId,
      department,
      specialization,
      rank,
      isAdjunct,
      isOverload
    } = body;

    // Validate required fields
    if (!email || !password || !firstName || !lastName || !employeeId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already exists' },
        { status: 400 }
      );
    }

    // Check if employee ID already exists
    const existingLecturer = await prisma.lecturer.findUnique({
      where: { employeeId }
    });

    if (existingLecturer) {
      return NextResponse.json(
        { error: 'Employee ID already exists' },
        { status: 400 }
      );
    }

    // Hash password
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create lecturer with profile
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: hashedPassword,
        firstName,
        lastName,
        role: 'LECTURER',
        phoneNumber: phoneNumber || null,
        lecturer: {
          create: {
            employeeId,
            department: department || null,
            specialization: specialization || null,
            rank: rank || null,
            isAdjunct: Boolean(isAdjunct),
            isOverload: Boolean(isOverload)
          }
        }
      },
      include: {
        lecturer: true
      }
    });

    // Format response (exclude password hash)
    const { passwordHash: _, ...userWithoutPassword } = user;
    
    return NextResponse.json({
      message: 'Lecturer created successfully',
      lecturer: userWithoutPassword
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating lecturer:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}