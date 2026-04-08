import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { prisma } from '@/lib/db'
import { authOptions } from '@/lib/auth-config'
import { normalizeMeetingLink, resolveMeetingLink } from '@/lib/meeting-link'

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id || session.user.role !== 'LECTURER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { link } = await request.json()
    const scheduleId = params.id

    // Verify ownership
    const schedule = await prisma.courseSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        lecturer: true,
        classroom: true
      }
    })

    if (!schedule) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
    }

    if (schedule.lecturer.userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const normalizedLink = normalizeMeetingLink(link)

    const updated = await prisma.courseSchedule.update({
      where: { id: scheduleId },
      data: { meetingLink: normalizedLink }
    })

    return NextResponse.json({
      ...updated,
      resolvedMeetingLink: resolveMeetingLink(
        updated.meetingLink,
        schedule.classroom?.virtualLink
      )
    })
  } catch (error) {
    console.error('Error updating meeting link:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
