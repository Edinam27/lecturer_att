import { prisma } from '@/lib/db'
import { enhancedNotificationService } from '@/lib/enhanced-notifications'

export class NotificationScheduler {
  private static instance: NotificationScheduler
  
  private constructor() {}
  
  public static getInstance(): NotificationScheduler {
    if (!NotificationScheduler.instance) {
      NotificationScheduler.instance = new NotificationScheduler()
    }
    return NotificationScheduler.instance
  }

  /**
   * Check for classes starting in 30 minutes and send notifications
   */
  public async checkUpcomingClasses(): Promise<void> {
    try {
      const now = new Date()
      // Calculate target time: 30 minutes from now
      const targetTime = new Date(now.getTime() + 30 * 60 * 1000)
      
      const currentDay = targetTime.getDay()
      const currentHour = targetTime.getHours().toString().padStart(2, '0')
      const currentMinute = targetTime.getMinutes().toString().padStart(2, '0')
      const targetTimeStr = `${currentHour}:${currentMinute}`

      console.log(`Checking for classes starting at ${targetTimeStr} on day ${currentDay}`)

      // Find classes starting exactly at this time (minute precision)
      // Note: This assumes the cron runs every minute
      const schedules = await prisma.courseSchedule.findMany({
        where: {
          dayOfWeek: currentDay,
          startTime: targetTimeStr,
          course: {
            isActive: true
          },
          classGroup: {
            isActive: true
          }
        },
        include: {
          course: true,
          classGroup: true,
          lecturer: {
            include: {
              user: true
            }
          },
          classroom: true
        }
      })

      if (schedules.length === 0) {
        return
      }

      console.log(`Found ${schedules.length} upcoming classes`)

      // Get all supervisors and admins once to avoid repeated queries
      const [supervisors, admins] = await Promise.all([
        prisma.user.findMany({
          where: {
            role: {
              in: ['SUPERVISOR', 'ONLINE_SUPERVISOR']
            },
            isActive: true
          },
          select: { id: true }
        }),
        prisma.user.findMany({
          where: {
            role: 'ADMIN',
            isActive: true
          },
          select: { id: true }
        })
      ])

      const supervisorIds = supervisors.map(s => s.id)
      const adminIds = admins.map(a => a.id)

      for (const schedule of schedules) {
        const { course, classGroup, lecturer, classroom, sessionType } = schedule
        const location = classroom ? `${classroom.name} (${classroom.roomCode})` : 'Virtual/TBD'
        
        const message = `Upcoming Class: ${course.courseCode} - ${course.title} with ${classGroup.name} starts in 30 minutes at ${location}.`
        const title = 'Upcoming Class Reminder'
        const actionUrl = `/dashboard/attendance/verify/${schedule.id}` // Assuming this is a useful link
        const metadata = {
          courseId: course.id,
          classGroupId: classGroup.id,
          scheduleId: schedule.id,
          startTime: schedule.startTime,
          location
        }

        // 1. Notify Lecturer
        if (lecturer && lecturer.user) {
          await enhancedNotificationService.sendNotification({
            userId: lecturer.user.id,
            title,
            message,
            category: 'reminder',
            priority: 'normal',
            actionUrl,
            metadata
          })
        }

        // 2. Notify Supervisors
        if (supervisorIds.length > 0) {
          await enhancedNotificationService.sendNotification({
            userId: supervisorIds,
            title,
            message,
            category: 'reminder',
            priority: 'normal',
            actionUrl,
            metadata
          })
        }

        // 3. Notify Admins
        if (adminIds.length > 0) {
          await enhancedNotificationService.sendNotification({
            userId: adminIds,
            title,
            message,
            category: 'reminder',
            priority: 'normal',
            actionUrl,
            metadata
          })
        }
      }
    } catch (error) {
      console.error('Error checking upcoming classes:', error)
    }
  }
}

export const notificationScheduler = NotificationScheduler.getInstance()
