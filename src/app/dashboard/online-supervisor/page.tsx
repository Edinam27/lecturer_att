'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface OnlineSchedule {
  id: string
  startTime: string
  endTime: string
  sessionType: string
  course: {
    title: string
    courseCode: string
  }
  classGroup: {
    name: string
  }
  lecturer: {
    name: string
    email: string
  }
  meetingLink: string
  verified: boolean
  verificationStatus: string
  platform?: string
  connectionQuality?: string
}

export default function OnlineSupervisorDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [schedules, setSchedules] = useState<OnlineSchedule[]>([])
  const [loading, setLoading] = useState(true)
  
  // Monitoring State
  const [monitoringId, setMonitoringId] = useState<string | null>(null)
  const [monitorStatus, setMonitorStatus] = useState('ongoing')
  const [comments, setComments] = useState('')
  const [platform, setPlatform] = useState('')
  const [connectionQuality, setConnectionQuality] = useState('Good')
  const [studentCount, setStudentCount] = useState('')
  const [technicalIssues, setTechnicalIssues] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (status === 'authenticated') {
      if (session?.user?.role !== 'ONLINE_SUPERVISOR' && session?.user?.role !== 'ADMIN') {
        router.push('/dashboard')
      } else {
        fetchSchedules()
      }
    }
  }, [status, session, router])

  const fetchSchedules = async () => {
    try {
      const response = await fetch('/api/online-supervisor/schedules')
      if (response.ok) {
        const data = await response.json()
        setSchedules(data)
      }
    } catch (error) {
      console.error('Failed to fetch schedules', error)
    } finally {
      setLoading(false)
    }
  }

  const openMonitoring = (schedule: OnlineSchedule) => {
    setMonitoringId(schedule.id)
    setComments('')
    setMonitorStatus('ongoing')
    setConnectionQuality('Good')
    setStudentCount('')
    setTechnicalIssues('')
    
    // Auto-detect platform
    const link = schedule.meetingLink.toLowerCase()
    if (link.includes('zoom')) setPlatform('Zoom')
    else if (link.includes('meet.google')) setPlatform('Google Meet')
    else if (link.includes('teams')) setPlatform('Microsoft Teams')
    else setPlatform('Other')
  }

  const closeMonitoring = () => {
    setMonitoringId(null)
  }

  const submitMonitoring = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!monitoringId) return

    setSubmitting(true)
    try {
      const response = await fetch('/api/online-supervisor/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scheduleId: monitoringId,
          status: monitorStatus,
          comments,
          platform,
          connectionQuality,
          studentCountOnline: studentCount,
          technicalIssues
        }),
      })

      if (response.ok) {
        closeMonitoring()
        fetchSchedules()
      } else {
        alert('Failed to submit monitoring report')
      }
    } catch (error) {
      console.error('Error submitting report:', error)
      alert('An error occurred')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="p-6">Loading schedules...</div>
  }

  return (
    <div className="space-y-6">
      <div className="bg-white shadow px-4 py-5 sm:rounded-lg sm:p-6">
        <div className="md:grid md:grid-cols-3 md:gap-6">
          <div className="md:col-span-1">
            <h3 className="text-lg font-medium leading-6 text-gray-900">Online Monitoring Dashboard</h3>
            <p className="mt-1 text-sm text-gray-500">
              Monitor ongoing virtual and hybrid classes.
              Join sessions directly to verify attendance and technical quality.
            </p>
          </div>
          <div className="mt-5 md:mt-0 md:col-span-2">
            <div className="flex flex-col">
              <div className="-my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
                <div className="py-2 align-middle inline-block min-w-full sm:px-6 lg:px-8">
                  <div className="shadow overflow-hidden border-b border-gray-200 sm:rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Time
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Course / Class
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Lecturer
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th scope="col" className="relative px-6 py-3">
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {schedules.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                              No online classes scheduled for today.
                            </td>
                          </tr>
                        ) : (
                          schedules.map((schedule) => (
                            <tr key={schedule.id}>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-900">
                                  {schedule.startTime} - {schedule.endTime}
                                </div>
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                  schedule.sessionType === 'VIRTUAL' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                                }`}>
                                  {schedule.sessionType}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">{schedule.course.courseCode}</div>
                                <div className="text-sm text-gray-500">{schedule.classGroup.name}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-900">{schedule.lecturer.name}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                {schedule.verified ? (
                                  <div>
                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                      Monitored
                                    </span>
                                    {schedule.connectionQuality && (
                                        <div className="text-xs text-gray-500 mt-1">
                                            Q: {schedule.connectionQuality}
                                        </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                                    Pending
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                                <a 
                                    href={schedule.meetingLink} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="text-indigo-600 hover:text-indigo-900 border border-indigo-600 px-3 py-1 rounded hover:bg-indigo-50"
                                >
                                    Join
                                </a>
                                {!schedule.verified && (
                                  <button
                                    onClick={() => openMonitoring(schedule)}
                                    className="text-purple-600 hover:text-purple-900"
                                  >
                                    Report
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Monitoring Modal */}
      {monitoringId && (
        <div className="fixed z-50 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={closeMonitoring}></div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="relative z-50 inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <form onSubmit={submitMonitoring}>
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="sm:flex sm:items-start">
                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                      <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                        Online Class Monitor Report
                      </h3>
                      <div className="mt-4 space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Status</label>
                          <select
                            value={monitorStatus}
                            onChange={(e) => setMonitorStatus(e.target.value)}
                            className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          >
                            <option value="ongoing">Class Ongoing</option>
                            <option value="not_started">Not Started / Waiting</option>
                            <option value="lecturer_absent">Lecturer Absent</option>
                            <option value="cancelled">Cancelled</option>
                            <option value="technical_issues">Technical Issues (Class Halted)</option>
                          </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Platform</label>
                            <input
                                type="text"
                                value={platform}
                                onChange={(e) => setPlatform(e.target.value)}
                                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                placeholder="Zoom, Teams, etc."
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Connection Quality</label>
                                <select
                                    value={connectionQuality}
                                    onChange={(e) => setConnectionQuality(e.target.value)}
                                    className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                >
                                    <option value="Excellent">Excellent (HD/Clear)</option>
                                    <option value="Good">Good</option>
                                    <option value="Poor">Poor (Laggy/Choppy)</option>
                                    <option value="Unstable">Unstable (Disconnects)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Student Count</label>
                                <input
                                    type="number"
                                    value={studentCount}
                                    onChange={(e) => setStudentCount(e.target.value)}
                                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                    placeholder="approx."
                                />
                            </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700">Comments</label>
                          <textarea
                            value={comments}
                            onChange={(e) => setComments(e.target.value)}
                            rows={3}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            placeholder="General observations..."
                          />
                        </div>

                         <div>
                          <label className="block text-sm font-medium text-gray-700">Technical Issues Detail</label>
                          <textarea
                            value={technicalIssues}
                            onChange={(e) => setTechnicalIssues(e.target.value)}
                            rows={2}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            placeholder="Specific audio/video problems if any..."
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-purple-600 text-base font-medium text-white hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                  >
                    {submitting ? 'Submitting...' : 'Submit Report'}
                  </button>
                  <button
                    type="button"
                    onClick={closeMonitoring}
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
