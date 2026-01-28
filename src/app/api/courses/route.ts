import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { prisma } from '@/lib/db'
import { authOptions } from '@/lib/auth-config'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id || !['ADMIN', 'COORDINATOR'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let whereClause: any = {}
    
    // Coordinators can only view courses in their programmes
    if (session.user.role === 'COORDINATOR') {
      whereClause = {
        programme: {
          coordinator: session.user.id
        }
      }
    }

    const courses = await prisma.course.findMany({
      where: whereClause,
      include: {
        programme: {
          select: {
            id: true,
            name: true,
            level: true
          }
        },
        _count: {
          select: {
            courseSchedules: true
          }
        }
      },
      orderBy: {
        courseCode: 'asc'
      }
    })

    const formattedCourses = courses.map(course => ({
      id: course.id,
      courseCode: course.courseCode,
      title: course.title,
      credits: course.creditHours,
      semester: course.semesterLevel,
      isElective: course.isElective,
      description: course.description,
      // createdAt: course.createdAt, // Removed as it might not exist in schema
      programme: course.programme,
      _count: course._count
    }))

    return NextResponse.json(formattedCourses)
  } catch (error) {
    console.error('Error fetching courses:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id || !['ADMIN', 'COORDINATOR'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { courseCode, title, credits, semester, isElective, description, programmeId } = body

    // Authorization check for Coordinator
    if (session.user.role === 'COORDINATOR') {
      const programme = await prisma.programme.findUnique({ where: { id: programmeId } })
      if (!programme || programme.coordinator !== session.user.id) {
        return NextResponse.json({ error: 'Forbidden - You can only add courses to your assigned programmes' }, { status: 403 })
      }
    }

    // Check if course already exists
    const existingCourse = await prisma.course.findUnique({
      where: {
        courseCode
      }
    })

    if (existingCourse) {
      return NextResponse.json({ error: 'Course with this code already exists' }, { status: 409 })
    }

    const course = await prisma.course.create({
      data: {
        courseCode,
        title,
        creditHours: credits,
        semesterLevel: semester,
        isElective,
        description,
        programmeId
      },
      select: {
        id: true,
        courseCode: true,
        title: true,
        creditHours: true,
        semesterLevel: true,
        isElective: true,
        description: true,
        programme: {
          select: {
            id: true,
            name: true,
            level: true
          }
        },
        _count: {
          select: {
            courseSchedules: true
          }
        }
      }
    })

    return NextResponse.json(course, { status: 201 })
  } catch (error) {
    console.error('Error creating course:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}