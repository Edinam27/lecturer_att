import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🧹 Starting cleanup of duplicate attendance records...')

  // 1. Fetch all attendance records
  const records = await prisma.attendanceRecord.findMany({
    select: {
      id: true,
      courseScheduleId: true,
      timestamp: true,
      lecturerId: true
    },
    orderBy: { timestamp: 'desc' }
  })

  console.log(`Found ${records.length} total attendance records. Checking for duplicates...`)

  const uniqueMap = new Map<string, string>() // key -> id to keep
  const duplicates: string[] = []

  for (const record of records) {
    // Create a key based on schedule and date (ignoring time)
    const date = new Date(record.timestamp).toISOString().split('T')[0]
    const key = `${record.courseScheduleId}-${date}`
    
    if (uniqueMap.has(key)) {
      duplicates.push(record.id)
    } else {
      uniqueMap.set(key, record.id)
    }
  }

  console.log(`Found ${duplicates.length} duplicate attendance records to remove.`)

  if (duplicates.length > 0) {
    // Delete duplicates in batches
    const batchSize = 100
    for (let i = 0; i < duplicates.length; i += batchSize) {
      const batch = duplicates.slice(i, i + batchSize)
      await prisma.attendanceRecord.deleteMany({
        where: {
          id: { in: batch }
        }
      })
      console.log(`Deleted batch ${i / batchSize + 1} (${batch.length} records)`)
    }
  }

  console.log('✨ Cleanup of attendance records completed!')
}

main()
  .catch((e) => {
    console.error('❌ Error during cleanup:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
