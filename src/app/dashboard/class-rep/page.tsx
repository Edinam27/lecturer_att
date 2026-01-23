'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'

interface DashboardCard {
  title: string
  description: string
  href: string
  color: string
  icon: string
}

const classRepCards: DashboardCard[] = [
  {
    title: 'Verify Lecturer Attendance',
    description: 'Verify lecturer attendance for your class',
    href: '/dashboard/verify-attendance',
    color: 'bg-red-500',
    icon: 'shield-check'
  },
  {
    title: 'Class Attendance',
    description: 'View attendance records for your class',
    href: '/dashboard/attendance',
    color: 'bg-blue-500',
    icon: 'clipboard-check'
  },
  {
    title: 'Class Schedule',
    description: 'View your class timetable and schedules',
    href: '/dashboard/schedules',
    color: 'bg-green-500',
    icon: 'calendar'
  },
  {
    title: 'Class Information',
    description: 'View your class and programme details',
    href: '/dashboard/class-info',
    color: 'bg-purple-500',
    icon: 'information-circle'
  }
]

const getIcon = (iconName: string) => {
  const icons: { [key: string]: JSX.Element } = {
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
    'information-circle': (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    ),
    'shield-check': (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    )
  }
  return icons[iconName] || icons['clipboard-check']
}

export default function ClassRepDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [stats, setStats] = useState<any>(null)
  const [recentActivity, setRecentActivity] = useState<any[]>([])
  const [upcomingSessions, setUpcomingSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'loading') return
    
    if (!session) {
      router.replace('/auth/signin')
      return
    }
    
    if (session.user.role !== 'CLASS_REP') {
      router.replace('/dashboard')
      return
    }

    const fetchData = async () => {
      try {
        const [statsRes, analyticsRes, schedulesRes] = await Promise.all([
          fetch('/api/dashboard/stats'),
          fetch('/api/analytics?type=overview'),
          fetch('/api/schedules')
        ])

        if (statsRes.ok) {
          const data = await statsRes.json()
          setStats(data)
        }
        if (analyticsRes.ok) {
          const data = await analyticsRes.json()
          setRecentActivity(data.recentActivity || [])
        }
        if (schedulesRes.ok) {
          const data = await schedulesRes.json()
          // Filter for upcoming sessions based on day of week
          // For simplicity, just showing the first few schedules
          // In a real app, we'd filter by current day/time
          setUpcomingSessions(data.slice(0, 5))
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [session, status, router])

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-500"></div>
      </div>
    )
  }

  if (!session || session.user.role !== 'CLASS_REP') {
    return null
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          Welcome, {session.user.name}
        </h1>
        <p className="mt-2 text-sm sm:text-base text-gray-600">
          Class Representative Dashboard
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {classRepCards.map((card) => (
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

      {/* Class Overview */}
      <div className="mt-8 sm:mt-12">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4 sm:mb-6">Class Overview</h2>
        <div className="bg-white rounded-lg shadow border border-gray-200 p-4 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">Class Information</h3>
              {stats?.classInfo?.map((info: any, index: number) => (
                <div key={index} className="mb-2">
                  <p className="text-sm sm:text-base text-gray-600 font-medium">{info.name}</p>
                </div>
              )) || <p className="text-sm sm:text-base text-gray-600">Loading...</p>}
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">Programme Information</h3>
              {stats?.classInfo?.map((info: any, index: number) => (
                <div key={index} className="mb-2">
                  <p className="text-sm sm:text-base text-gray-600">{info.programme}</p>
                </div>
              )) || <p className="text-sm sm:text-base text-gray-600">Loading...</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Attendance Summary */}
      <div className="mt-8 sm:mt-12">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4 sm:mb-6">Attendance Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow border border-gray-200">
            <div className="text-xl sm:text-2xl font-bold text-blue-600">{stats?.totalSessions || 0}</div>
            <div className="text-xs sm:text-sm text-gray-600">Total Sessions</div>
          </div>
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow border border-gray-200">
            <div className="text-xl sm:text-2xl font-bold text-green-600">
              {stats ? Math.round((stats.totalSessions * stats.attendanceRate) / 100) : 0}
            </div>
            <div className="text-xs sm:text-sm text-gray-600">Sessions Attended</div>
          </div>
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow border border-gray-200">
            <div className="text-xl sm:text-2xl font-bold text-yellow-600">{stats?.attendanceRate || 0}%</div>
            <div className="text-xs sm:text-sm text-gray-600">Attendance Rate</div>
          </div>
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow border border-gray-200">
            <div className="text-xl sm:text-2xl font-bold text-purple-600">{stats?.thisWeek || 0}</div>
            <div className="text-xs sm:text-sm text-gray-600">This Week</div>
          </div>
        </div>
      </div>

      {/* Recent Attendance */}
      <div className="mt-8 sm:mt-12">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4 sm:mb-6">Recent Attendance</h2>
        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
          {recentActivity.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Course</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lecturer</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {recentActivity.map((activity) => (
                    <tr key={activity.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {format(new Date(activity.date), 'MMM d, yyyy HH:mm')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{activity.course}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{activity.lecturer}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                          ${activity.status === 'verified' ? 'bg-green-100 text-green-800' : 
                            activity.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 
                            'bg-red-100 text-red-800'}`}>
                          {activity.status.charAt(0).toUpperCase() + activity.status.slice(1)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm sm:text-base text-gray-500 text-center py-6 sm:py-8">
              No recent attendance records found
            </p>
          )}
        </div>
      </div>

      {/* Upcoming Sessions */}
      <div className="mt-8 sm:mt-12">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4 sm:mb-6">Upcoming Sessions</h2>
        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
          {upcomingSessions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Course</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Venue</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lecturer</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {upcomingSessions.map((session) => (
                    <tr key={session.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {session.course.code} - {session.course.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][session.dayOfWeek]} {session.startTime}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{session.venue}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {session.lecturer.firstName} {session.lecturer.lastName}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm sm:text-base text-gray-500 text-center py-6 sm:py-8">
              No upcoming sessions found
            </p>
          )}
        </div>
      </div>
    </div>
  )
}