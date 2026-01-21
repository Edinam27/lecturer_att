
import { PrismaClient, SessionType } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🚀 Creating virtual classes for tonight...')

  // 1. Get today's date info
  const today = new Date()
  const dayOfWeek = today.getDay()
  console.log(`📅 Date: ${today.toISOString().split('T')[0]}, Day of Week: ${dayOfWeek}`)

  // 2. Find necessary data (Lecturers, Courses, ClassGroups)
  // We'll try to fetch a few to distribute the schedules
  const lecturers = await prisma.lecturer.findMany({
    take: 3,
    include: { user: true }
  })
  
  const courses = await prisma.course.findMany({
    take: 3
  })

  const classGroups = await prisma.classGroup.findMany({
    take: 3
  })

  if (lecturers.length === 0 || courses.length === 0 || classGroups.length === 0) {
    console.error('❌ Missing seed data (lecturers, courses, or class groups). Please run db:seed first.')
    return
  }

  // 3. Find or Create a Virtual Classroom
  let virtualRoom = await prisma.classroom.findFirst({
    where: { roomType: 'Virtual' }
  })

  if (!virtualRoom) {
    // Create one if not exists
    const building = await prisma.building.findFirst()
    if (!building) throw new Error('No building found to attach classroom to')
    
    virtualRoom = await prisma.classroom.create({
      data: {
        roomCode: 'VIRTUAL-TEST-01',
        name: 'Test Virtual Room 1',
        buildingId: building.id,
        roomType: 'Virtual',
        virtualLink: 'https://zoom.us/j/1234567890',
        availabilityStatus: 'available'
      }
    })
    console.log('✨ Created new virtual classroom')
  }

  // 4. Create Schedules
  // We will create 3 sessions for "tonight"
  const schedulesToCreate = [
    {
      time: '18:00',
      endTime: '19:30',
      type: SessionType.VIRTUAL,
      lecturerIdx: 0,
      courseIdx: 0,
      groupIdx: 0
    },
    {
      time: '19:00',
      endTime: '20:30',
      type: SessionType.HYBRID,
      lecturerIdx: 1,
      courseIdx: 1,
      groupIdx: 1
    },
    {
      time: '20:00',
      endTime: '21:30',
      type: SessionType.VIRTUAL,
      lecturerIdx: 2 % lecturers.length,
      courseIdx: 2 % courses.length,
      groupIdx: 2 % classGroups.length
    }
  ]

  for (const item of schedulesToCreate) {
    const lecturer = lecturers[item.lecturerIdx]
    const course = courses[item.courseIdx]
    const group = classGroups[item.groupIdx]

    // Check collision
    const existing = await prisma.courseSchedule.findFirst({
      where: {
        lecturerId: lecturer.id,
        dayOfWeek: dayOfWeek,
        startTime: item.time
      }
    })

    if (existing) {
      console.log(`⚠️ Schedule already exists for ${lecturer.user.firstName} at ${item.time}. Skipping.`)
      
      // Update it to be VIRTUAL/HYBRID if it's not, just in case
      if (existing.sessionType !== item.type) {
         await prisma.courseSchedule.update({
            where: { id: existing.id },
            data: { sessionType: item.type, classroomId: virtualRoom.id }
         })
         console.log(`   -> Updated existing schedule to ${item.type}`)
      }
      continue
    }

    const schedule = await prisma.courseSchedule.create({
      data: {
        courseId: course.id,
        classGroupId: group.id,
        lecturerId: lecturer.id,
        dayOfWeek: dayOfWeek,
        startTime: item.time,
        endTime: item.endTime,
        classroomId: virtualRoom.id,
        sessionType: item.type
      }
    })

    console.log(`✅ Created ${item.type} class:`)
    console.log(`   Time: ${item.time} - ${item.endTime}`)
    console.log(`   Course: ${course.courseCode}`)
    console.log(`   Lecturer: ${lecturer.user.firstName} ${lecturer.user.lastName}`)
    console.log(`   Link: ${virtualRoom.virtualLink}`)
  }

  console.log('\n🎉 Done! You can now check the Online Supervisor dashboard.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
