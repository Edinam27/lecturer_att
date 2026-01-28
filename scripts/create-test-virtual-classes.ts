import { PrismaClient, SessionType } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🚀 Creating Thursday virtual classes...')

  // Force Thursday (0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu)
  const dayOfWeek = 4
  console.log(`📅 Target Day: Thursday (dayOfWeek=${dayOfWeek})`)

  // 1. Find necessary data
  const lecturers = await prisma.lecturer.findMany({
    take: 4, // Need 4 lecturers for 4 classes
    include: { user: true }
  })
  
  const courses = await prisma.course.findMany({
    take: 4
  })

  const classGroups = await prisma.classGroup.findMany({
    take: 4
  })

  if (lecturers.length < 1 || courses.length < 1 || classGroups.length < 1) {
    console.error('❌ Missing seed data. Need at least 1 lecturer, course, and class group.')
    return
  }

  // 2. Find or Create a Virtual Classroom
  let virtualRoom = await prisma.classroom.findFirst({
    where: { roomType: 'Virtual' }
  })

  if (!virtualRoom) {
    const building = await prisma.building.findFirst()
    if (building) {
        virtualRoom = await prisma.classroom.create({
        data: {
            roomCode: 'VIRTUAL-001',
            name: 'Zoom Room 1',
            buildingId: building.id,
            roomType: 'Virtual',
            virtualLink: 'https://zoom.us/my/defaultroom',
            availabilityStatus: 'available'
        }
        })
        console.log('✨ Created new virtual classroom')
    } else {
        console.log('⚠️ No building found, creating schedule without classroom relation (using meetingLink only)')
    }
  }

  // 3. Define the 4 virtual sessions for Thursday
  const sessions = [
    {
      startTime: '08:00',
      endTime: '10:00',
      lecturerIdx: 0,
      courseIdx: 0,
      groupIdx: 0,
      link: 'https://zoom.us/j/THURSDAY1'
    },
    {
      startTime: '10:30',
      endTime: '12:30',
      lecturerIdx: 1 % lecturers.length,
      courseIdx: 1 % courses.length,
      groupIdx: 1 % classGroups.length,
      link: 'https://teams.microsoft.com/l/meetup-join/THURSDAY2'
    },
    {
      startTime: '13:00',
      endTime: '15:00',
      lecturerIdx: 2 % lecturers.length,
      courseIdx: 2 % courses.length,
      groupIdx: 2 % classGroups.length,
      link: 'https://meet.google.com/THURSDAY3'
    },
    {
      startTime: '15:30',
      endTime: '17:30',
      lecturerIdx: 3 % lecturers.length,
      courseIdx: 3 % courses.length,
      groupIdx: 3 % classGroups.length,
      link: 'https://zoom.us/j/THURSDAY4'
    }
  ]

  for (const session of sessions) {
    const lecturer = lecturers[session.lecturerIdx]
    const course = courses[session.courseIdx]
    const group = classGroups[session.groupIdx]

    console.log(`Processing: ${lecturer.user.firstName} ${lecturer.user.lastName} - ${course.courseCode} (${session.startTime})`)

    // Check for existing schedule to avoid unique constraint errors
    const existingSchedule = await prisma.courseSchedule.findUnique({
      where: {
        courseId_classGroupId_dayOfWeek_startTime: {
          courseId: course.id,
          classGroupId: group.id,
          dayOfWeek: dayOfWeek,
          startTime: session.startTime
        }
      }
    })

    if (existingSchedule) {
      console.log(`⚠️ Schedule already exists. Updating to VIRTUAL...`)
      await prisma.courseSchedule.update({
        where: { id: existingSchedule.id },
        data: {
          sessionType: SessionType.VIRTUAL,
          meetingLink: session.link,
          classroomId: virtualRoom?.id,
          lecturerId: lecturer.id
        }
      })
      console.log(`✅ Updated schedule ${existingSchedule.id}`)
    } else {
      try {
        const newSchedule = await prisma.courseSchedule.create({
          data: {
            courseId: course.id,
            classGroupId: group.id,
            lecturerId: lecturer.id,
            dayOfWeek: dayOfWeek,
            startTime: session.startTime,
            endTime: session.endTime,
            sessionType: SessionType.VIRTUAL,
            meetingLink: session.link,
            classroomId: virtualRoom?.id,
            isOverload: false
          }
        })
        console.log(`✅ Created new schedule ${newSchedule.id}`)
      } catch (error) {
        console.error(`❌ Failed to create schedule:`, error)
      }
    }
  }

  console.log('\n🎉 Thursday virtual classes setup complete!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
