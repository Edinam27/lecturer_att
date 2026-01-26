import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🧹 Starting cleanup of duplicate course schedules...')

  // 1. Fetch all schedules
  const schedules = await prisma.courseSchedule.findMany({})

  console.log(`Found ${schedules.length} total schedules. Checking for duplicates...`)

  const uniqueMap = new Map<string, string>() // key -> id to keep
  const duplicates: string[] = []

  for (const schedule of schedules) {
    const key = `${schedule.courseId}-${schedule.classGroupId}-${schedule.dayOfWeek}-${schedule.startTime}`
    
    if (uniqueMap.has(key)) {
      duplicates.push(schedule.id)
    } else {
      uniqueMap.set(key, schedule.id)
    }
  }

  console.log(`Found ${duplicates.length} duplicate schedules to remove.`)

  if (duplicates.length > 0) {
    // We need to be careful. If we delete a schedule that has attendance records, we lose data.
    // We should move attendance records to the "kept" schedule before deleting.
    
    for (const duplicateId of duplicates) {
      const schedule = schedules.find(s => s.id === duplicateId)
      if (!schedule) continue

      const key = `${schedule.courseId}-${schedule.classGroupId}-${schedule.dayOfWeek}-${schedule.startTime}`
      const keptId = uniqueMap.get(key)

      if (keptId && keptId !== duplicateId) {
        // Move attendance records
        const updateResult = await prisma.attendanceRecord.updateMany({
          where: { courseScheduleId: duplicateId },
          data: { courseScheduleId: keptId }
        })
        
        // Move supervisor logs
        await prisma.supervisorLog.updateMany({
          where: { courseScheduleId: duplicateId },
          data: { courseScheduleId: keptId }
        })
        
        // Move virtual sessions
        await prisma.virtualSession.updateMany({
            where: { courseScheduleId: duplicateId },
            data: { courseScheduleId: keptId }
        })

        // Now safe to delete
        await prisma.courseSchedule.delete({
          where: { id: duplicateId }
        })
        console.log(`Removed duplicate schedule ${duplicateId} (merged ${updateResult.count} records to ${keptId})`)
      }
    }
  }

  console.log('✨ Cleanup completed!')
}

main()
  .catch((e) => {
    console.error('❌ Error during cleanup:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
