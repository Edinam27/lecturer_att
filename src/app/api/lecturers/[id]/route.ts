import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-config';
import { prisma } from '@/lib/db';

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    
    // Check permissions
    if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'COORDINATOR')) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const lecturerId = params.id;

    // Authorization check for Coordinator
    if (session.user.role === 'COORDINATOR') {
      const lecturerToCheck = await prisma.lecturer.findUnique({
        where: { id: lecturerId },
        include: {
          courseSchedules: {
            include: {
              course: {
                include: {
                  programme: true
                }
              }
            }
          }
        }
      })

      if (lecturerToCheck) {
        // Allow if lecturer has schedules in a programme coordinated by the user
        const hasSchedulesInCoordinatorProgramme = lecturerToCheck.courseSchedules.some(
          schedule => schedule.course.programme.coordinator === session.user.id
        )
        
        // Also allow if lecturer has NO schedules (so they can be managed/assigned)
        const hasNoSchedules = lecturerToCheck.courseSchedules.length === 0

        if (!hasSchedulesInCoordinatorProgramme && !hasNoSchedules) {
           return NextResponse.json({ error: 'Forbidden - You can only manage lecturers in your assigned programmes' }, { status: 403 })
        }
      }
    }

    const body = await request.json();
    const {
      isActive,
      isAdjunct,
      isOverload,
      firstName,
      lastName,
      department,
      rank,
      employeeId,
      specialization
    } = body;

    // Verify lecturer exists
    const lecturer = await prisma.lecturer.findUnique({
      where: { id: lecturerId },
      include: { user: true }
    });

    if (!lecturer) {
      return NextResponse.json(
        { error: 'Lecturer not found' },
        { status: 404 }
      );
    }

    // Update User and Lecturer
    // We use a transaction to ensure both are updated or neither
    const updatedLecturer = await prisma.$transaction(async (tx) => {
      // Update User fields if provided
      if (isActive !== undefined || firstName || lastName) {
        await tx.user.update({
          where: { id: lecturer.userId },
          data: {
            isActive: isActive !== undefined ? isActive : undefined,
            firstName: firstName || undefined,
            lastName: lastName || undefined,
          }
        });
      }

      // Update Lecturer fields if provided
      const lecturerUpdateData: any = {};
      // if (isAdjunct !== undefined) lecturerUpdateData.isAdjunct = isAdjunct;
      // if (isOverload !== undefined) lecturerUpdateData.isOverload = isOverload;
      if (department) lecturerUpdateData.department = department;
      if (rank) lecturerUpdateData.rank = rank;
      if (employeeId) lecturerUpdateData.employeeId = employeeId;
      if (specialization) lecturerUpdateData.specialization = specialization;

      if (Object.keys(lecturerUpdateData).length > 0) {
        return await tx.lecturer.update({
          where: { id: lecturerId },
          data: lecturerUpdateData,
          include: {
             user: true,
             courseSchedules: {
                select: { 
                    // isOverload: true 
                    id: true
                }
             }
          }
        });
      }
      
      // If no lecturer fields updated, return the existing one with includes
      return await tx.lecturer.findUnique({
          where: { id: lecturerId },
          include: {
             user: true,
             courseSchedules: {
                select: { 
                    // isOverload: true 
                    id: true
                }
             }
          }
      });
    });

    // Format response
    if (!updatedLecturer) {
        throw new Error("Failed to retrieve updated lecturer");
    }

    const scheduleCount = updatedLecturer.courseSchedules.length;
    // const overloadCount = updatedLecturer.courseSchedules.filter(s => s.isOverload).length;
    const overloadCount = 0; // Placeholder

    return NextResponse.json({
      id: updatedLecturer.id,
      userId: updatedLecturer.userId,
      user: {
        firstName: updatedLecturer.user.firstName,
        lastName: updatedLecturer.user.lastName,
        email: updatedLecturer.user.email
      },
      isActive: updatedLecturer.user.isActive,
      createdAt: updatedLecturer.user.createdAt,
      lecturer: {
        employeeId: updatedLecturer.employeeId,
        department: updatedLecturer.department,
        employmentType: updatedLecturer.employmentType,
        rank: updatedLecturer.rank,
        isAdjunct: false, // updatedLecturer.isAdjunct,
        isOverload: false, // updatedLecturer.isOverload,
        scheduleCount: scheduleCount,
        overloadCount: overloadCount
      }
    });

  } catch (error) {
    console.error('Error updating lecturer:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
