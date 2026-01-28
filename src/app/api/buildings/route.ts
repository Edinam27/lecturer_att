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

    // Fetch all buildings
    const buildings = await prisma.building.findMany({
      include: {
        _count: {
          select: {
            classrooms: true
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    return NextResponse.json(buildings);
  } catch (error) {
    console.error('Error fetching buildings:', error);
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

    // Only admins can create buildings
    if (userRole !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      code,
      name,
      description,
      address,
      gpsLatitude,
      gpsLongitude,
      totalFloors
    } = body;

    // Validate required fields
    if (!code || !name || gpsLatitude === undefined || gpsLongitude === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: code, name, gpsLatitude, gpsLongitude' },
        { status: 400 }
      );
    }

    // Check if building code already exists
    const existingBuilding = await prisma.building.findUnique({
      where: { code }
    });

    if (existingBuilding) {
      return NextResponse.json(
        { error: 'Building with this code already exists' },
        { status: 409 }
      );
    }

    // Create building
    const building = await prisma.building.create({
      data: {
        code,
        name,
        description: description || null,
        address: address || null,
        gpsLatitude: parseFloat(gpsLatitude),
        gpsLongitude: parseFloat(gpsLongitude),
        totalFloors: totalFloors ? parseInt(totalFloors) : null
      }
    });

    return NextResponse.json(building, { status: 201 });
  } catch (error) {
    console.error('Error creating building:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
