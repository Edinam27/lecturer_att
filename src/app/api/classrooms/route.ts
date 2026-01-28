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

    // Check authorization
    if (!['ADMIN', 'COORDINATOR', 'LECTURER'].includes(userRole)) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Fetch all classrooms
    const classrooms = await prisma.classroom.findMany({
      include: {
        building: {
          select: {
            id: true,
            name: true,
            code: true,
            description: true,
            address: true,
            gpsLatitude: true,
            gpsLongitude: true
          }
        },
        _count: {
          select: {
            courseSchedules: true
          }
        }
      },
      orderBy: [
        { building: { name: 'asc' } },
        { name: 'asc' }
      ]
    });

    // Format the response
    const formattedClassrooms = classrooms.map(classroom => ({
      id: classroom.id,
      roomCode: classroom.roomCode,
      name: classroom.name,
      capacity: classroom.capacity,
      roomType: classroom.roomType,
      equipmentList: classroom.equipmentList,
      availabilityStatus: classroom.availabilityStatus,
      virtualLink: classroom.virtualLink,
      building: {
        id: classroom.building.id,
        name: classroom.building.name,
        code: classroom.building.code,
        address: classroom.building.address,
        gpsLatitude: classroom.building.gpsLatitude,
        gpsLongitude: classroom.building.gpsLongitude
      },
      scheduleCount: classroom._count.courseSchedules
    }));

    return NextResponse.json(formattedClassrooms);
  } catch (error) {
    console.error('Error fetching classrooms:', error);
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

    // Only admins can create classrooms
    if (userRole !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      roomCode,
      name,
      capacity,
      roomType,
      equipmentList,
      buildingId,
      availabilityStatus = 'available',
      virtualLink,
      gpsLatitude,
      gpsLongitude
    } = body;

    // Validate required fields
    if (!roomCode || !name || !buildingId) {
      return NextResponse.json(
        { error: 'Missing required fields: roomCode, name, buildingId' },
        { status: 400 }
      );
    }

    // Validate capacity if provided
    if (capacity && capacity <= 0) {
      return NextResponse.json(
        { error: 'Capacity must be a positive number' },
        { status: 400 }
      );
    }

    // Check if building exists
    const building = await prisma.building.findUnique({
      where: { id: buildingId }
    });

    if (!building) {
      return NextResponse.json(
        { error: 'Building not found' },
        { status: 404 }
      );
    }

    // Check if classroom roomCode already exists (globally unique)
    const existingClassroomByCode = await prisma.classroom.findUnique({
      where: { roomCode }
    });

    if (existingClassroomByCode) {
      return NextResponse.json(
        { error: 'Classroom with this room code already exists' },
        { status: 409 }
      );
    }

    // Check if classroom name already exists in the same building
    // Note: Schema doesn't enforce this, but it's good practice
    const existingClassroomByName = await prisma.classroom.findFirst({
      where: {
        name,
        buildingId
      }
    });

    if (existingClassroomByName) {
      return NextResponse.json(
        { error: 'Classroom name already exists in this building' },
        { status: 409 }
      );
    }

    // Create classroom
    const classroom = await prisma.classroom.create({
      data: {
        roomCode,
        name,
        capacity: capacity ? parseInt(capacity) : null,
        roomType: roomType || null,
        equipmentList: equipmentList || null,
        buildingId,
        availabilityStatus,
        virtualLink: virtualLink || null,
        gpsLatitude: gpsLatitude ? parseFloat(gpsLatitude) : null,
        gpsLongitude: gpsLongitude ? parseFloat(gpsLongitude) : null
      },
      include: {
        building: {
          select: {
            id: true,
            name: true,
            code: true,
            address: true,
            gpsLatitude: true,
            gpsLongitude: true
          }
        }
      }
    });

    return NextResponse.json({
      message: 'Classroom created successfully',
      classroom: {
        id: classroom.id,
        roomCode: classroom.roomCode,
        name: classroom.name,
        capacity: classroom.capacity,
        roomType: classroom.roomType,
        equipmentList: classroom.equipmentList,
        availabilityStatus: classroom.availabilityStatus,
        virtualLink: classroom.virtualLink,
        building: {
          id: classroom.building.id,
          name: classroom.building.name,
          code: classroom.building.code,
          address: classroom.building.address,
          gpsLatitude: classroom.building.gpsLatitude,
          gpsLongitude: classroom.building.gpsLongitude
        }
      }
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating classroom:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
