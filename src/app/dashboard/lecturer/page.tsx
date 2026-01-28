'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface DashboardCard {
  title: string
  description: string
  href: string
  color: string
  icon: string
}

interface Schedule {
  id: string
  hasAttendance: boolean
  course: {
    title: string
    courseCode: string
  }
  startTime: string
  endTime: string
  classroom: {
    name: string
  }
  classGroup: {
    name: string
  }
}

interface Stats {
  mySessions: number
  attendanceRate: number
  activeCourses: number
  thisWeek: number
  totalStudents: number
}

const lecturerCards: DashboardCard[] = [
  {
    title: 'Take Attendance',
    description: 'Record attendance for your current sessions',
    href: '/dashboard/attendance/take',
    color: 'bg-green-500',
    icon: 'clipboard-check'
  },
  {
    title: 'My Schedules',
    description: 'View your teaching schedules and timetable',
    href: '/dashboard/schedules',
    color: 'bg-blue-500',
    icon: 'calendar'
  },
  {
    title: 'Attendance Records',
    description: 'View attendance records for your courses',
    href: '/dashboard/attendance',
    color: 'bg-purple-500',
    icon: 'document-text'
  },

  {
    title: 'Claim Form',
    description: 'Generate and print your claim form',
    href: '/dashboard/reports/claim-form',
    color: 'bg-indigo-500',
    icon: 'printer'
  }
]

const getIcon = (iconName: string) => {
  const icons: { [key: string]: JSX.Element } = {
    printer: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
      />
    ),
    'clipboard-check': (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
      />
    ),
    calendar: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    ),
    'document-text': (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    ),
    'book-open': (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
      />
    )
  }
  return icons[iconName] || icons['clipboard-check']
}

export default function LecturerDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'loading') return
    
    if (!session) {
      router.replace('/auth/signin')
      return
    }
    
    if (session.user.role !== 'LECTURER') {
      router.replace('/dashboard')
      return
    }

    const fetchData = async () => {
      try {
        const [schedulesRes, statsRes] = await Promise.all([
          fetch('/api/schedules/today'),
          fetch('/api/dashboard/stats')
        ])
        
        if (schedulesRes.ok) {
          const data = await schedulesRes.json()
          setSchedules(Array.isArray(data) ? data : [])
        }
        
        if (statsRes.ok) {
          const data = await statsRes.json()
          setStats(data)
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [session, status, router])

  if (status === 'loading' || (loading && session?.user.role === 'LECTURER')) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-500"></div>
      </div>
    )
  }

  if (!session || session.user.role !== 'LECTURER') {
    return null
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          Welcome, {session.user.name}
        </h1>
        <p className="mt-2 text-sm sm:text-base text-gray-600">
          Lecturer Dashboard
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        {lecturerCards.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className="block p-4 sm:p-6 bg-white rounded-lg shadow hover:shadow-md transition-shadow border border-gray-200"
          >
            <div className={`w-10 h-10 sm:w-12 sm:h-12 ${card.color} rounded-lg flex items-center justify-center mb-3 sm:mb-4`}>
              <svg
                className="w-5 h-5 sm:w-6 sm:h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {getIcon(card.icon)}
              </svg>
            </div>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">
              {card.title}
            </h3>
            <p className="text-sm sm:text-base text-gray-600">{card.description}</p>
          </Link>
        ))}
      </div>

      {/* Today's Schedule */}
      <div className="mt-8 sm:mt-12">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4 sm:mb-6">Today's Schedule</h2>
        <div className="bg-white rounded-lg shadow border border-gray-200 p-4 sm:p-6">
          {schedules.length > 0 ? (
            <div className="space-y-4">
              {schedules.map((schedule) => (
                <div key={schedule.id} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{schedule.course.title}</h3>
                    <p className="text-sm text-gray-600">{schedule.course.courseCode} - {schedule.classGroup.name}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(schedule.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - 
                      {new Date(schedule.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="flex flex-col items-end gap-1">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        {schedule.classroom?.name || 'Virtual'}
                      </span>
                      {schedule.hasAttendance && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Attendance Taken
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm sm:text-base text-gray-500 text-center py-6 sm:py-8">
              No classes scheduled for today
            </p>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="mt-8 sm:mt-12">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4 sm:mb-6">Quick Stats</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow border border-gray-200">
            <div className="text-xl sm:text-2xl font-bold text-blue-600">{stats?.thisWeek ?? '--'}</div>
            <div className="text-xs sm:text-sm text-gray-600">Sessions This Week</div>
          </div>
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow border border-gray-200">
            <div className="text-xl sm:text-2xl font-bold text-green-600">{stats?.attendanceRate ?? '--'}%</div>
            <div className="text-xs sm:text-sm text-gray-600">Attendance Rate</div>
          </div>
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow border border-gray-200">
            <div className="text-xl sm:text-2xl font-bold text-purple-600">{stats?.activeCourses ?? '--'}</div>
            <div className="text-xs sm:text-sm text-gray-600">Active Courses</div>
          </div>
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow border border-gray-200">
            <div className="text-xl sm:text-2xl font-bold text-yellow-600">{stats?.totalStudents ?? '--'}</div>
            <div className="text-xs sm:text-sm text-gray-600">Total Students</div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-8 sm:mt-12">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4 sm:mb-6">Quick Actions</h2>
        <div className="bg-white rounded-lg shadow border border-gray-200 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <Link
              href="/dashboard/attendance/take"
              className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Take Attendance Now
            </Link>
            <Link
              href="/dashboard/schedules"
              className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              View Schedule
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
