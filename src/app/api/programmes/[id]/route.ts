import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth-config'
import { prisma } from '@/lib/db'

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only ADMIN and COORDINATOR can view programme details
    if (session.user.role !== 'ADMIN' && session.user.role !== 'COORDINATOR') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const programme = await prisma.programme.findUnique({
      where: { id: params.id },
      include: {
        _count: {
          select: {
            courses: true,
            classGroups: true
          }
        }
      }
    })

    if (!programme) {
      return NextResponse.json({ error: 'Programme not found' }, { status: 404 })
    }

    return NextResponse.json(programme)
  } catch (error) {
    console.error('Error fetching programme:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only ADMIN and assigned COORDINATOR can update programmes
    const existingProgramme = await prisma.programme.findUnique({
      where: { id: params.id }
    })

    if (!existingProgramme) {
      return NextResponse.json({ error: 'Programme not found' }, { status: 404 })
    }

    if (session.user.role !== 'ADMIN') {
      if (session.user.role !== 'COORDINATOR' || existingProgramme.coordinator !== session.user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const body = await request.json()
    const { name, level, duration, description, coordinatorId } = body

    // Validate required fields
    if (!name || !level || !duration) {
      return NextResponse.json(
        { error: 'Name, level, and duration are required' },
        { status: 400 }
      )
    }

    // Check for duplicate programme name (excluding current programme)
    const duplicateName = await prisma.programme.findFirst({
      where: {
        name,
        id: { not: params.id }
      }
    })

    if (duplicateName) {
      return NextResponse.json(
        { error: 'Programme name already exists' },
        { status: 400 }
      )
    }

    const dataToUpdate: any = {
      name,
      level,
      durationSemesters: parseInt(duration),
      description: description || null
    }

    // Only Admin can assign/change coordinator
    if (session.user.role === 'ADMIN') {
      dataToUpdate.coordinator = coordinatorId || null
    }

    const updatedProgramme = await prisma.programme.update({
      where: { id: params.id },
      data: dataToUpdate,
      include: {
        _count: {
          select: {
            courses: true,
            classGroups: true
          }
        }
      }
    })

    return NextResponse.json(updatedProgramme)
  } catch (error) {
    console.error('Error updating programme:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only ADMIN can delete programmes
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check if programme exists
    const existingProgramme = await prisma.programme.findUnique({
      where: { id: params.id },
      include: {
        _count: {
          select: {
            courses: true,
            classGroups: true
          }
        }
      }
    })

    if (!existingProgramme) {
      return NextResponse.json({ error: 'Programme not found' }, { status: 404 })
    }

    // Check if programme has associated courses or class groups
    if (existingProgramme._count.courses > 0) {
      return NextResponse.json(
        { error: 'Cannot delete programme with associated courses' },
        { status: 400 }
      )
    }

    if (existingProgramme._count.classGroups > 0) {
      return NextResponse.json(
        { error: 'Cannot delete programme with associated class groups' },
        { status: 400 }
      )
    }

    await prisma.programme.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ message: 'Programme deleted successfully' })
  } catch (error) {
    console.error('Error deleting programme:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}