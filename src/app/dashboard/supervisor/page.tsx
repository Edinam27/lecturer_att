'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Schedule {
  id: string
  sessionDate: string
  startTime: string
  endTime: string
  sessionType: string
  course: {
    id: string
    title: string
    courseCode: string
  }
  classGroup: {
    id: string
    name: string
  }
  lecturer: {
    id: string
    name: string
    email: string
  }
  building: {
    name: string
  }
  classroom: {
    id: string
    name: string
    roomCode: string
    virtualLink: string | null
  }
  attendanceTaken: boolean
  verified: boolean
  verificationStatus: string
  verificationComment: string | null
}

export default function SupervisorDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [verifyingId, setVerifyingId] = useState<string | null>(null)
  
  // Verification form state
  const [verificationStatus, setVerificationStatus] = useState('ongoing')
  const [verificationComment, setVerificationComment] = useState('')
  const [isOnline, setIsOnline] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (status === 'loading') return
    
    if (!session) {
      router.replace('/auth/signin')
      return
    }
    
    if (session.user.role !== 'SUPERVISOR' && session.user.role !== 'ADMIN') {
      router.replace('/dashboard')
      return
    }

    fetchSchedules()
  }, [session, status, router])

  const fetchSchedules = async () => {
    try {
      setError(null)
      const response = await fetch('/api/supervisor/schedules')
      if (response.ok) {
        const data = await response.json()
        setSchedules(data)
      } else {
        console.error('Failed to fetch schedules')
        setError('Failed to fetch schedules')
      }
    } catch (error) {
      console.error('Error fetching schedules:', error)
      setError('An error occurred while fetching schedules')
    } finally {
      setLoading(false)
    }
  }

  const openVerification = (schedule: Schedule) => {
    setVerifyingId(schedule.id)
    setVerificationStatus(schedule.verificationStatus !== 'pending' ? schedule.verificationStatus : 'ongoing')
    setVerificationComment(schedule.verificationComment || '')
    setIsOnline(schedule.sessionType === 'VIRTUAL' || schedule.sessionType === 'HYBRID')
  }

  const closeVerification = () => {
    setVerifyingId(null)
    setVerificationStatus('ongoing')
    setVerificationComment('')
    setIsOnline(false)
  }

  const submitVerification = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!verifyingId) return

    setSubmitting(true)
    try {
      const response = await fetch('/api/supervisor/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          courseScheduleId: verifyingId,
          status: verificationStatus,
          comments: verificationComment,
          isOnline
        })
      })

      if (response.ok) {
        // Refresh list
        await fetchSchedules()
        closeVerification()
      } else {
        alert('Failed to submit verification')
      }
    } catch (error) {
      console.error('Error verifying:', error)
      alert('Error verifying')
    } finally {
      setSubmitting(false)
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Supervisor Dashboard</h1>
          <p className="mt-2 text-sm text-gray-600">
            Verify ongoing classes and monitor academic activities.
          </p>
        </div>

        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          {error && (
            <div className="p-4 bg-red-50 border-b border-red-200 text-red-700">
              {error}
            </div>
          )}
          <ul role="list" className="divide-y divide-gray-200">
            {schedules.length === 0 ? (
              <li className="px-4 py-8 text-center text-gray-500">
                No classes scheduled for today.
              </li>
            ) : (
              schedules.map((schedule) => (
                <li key={schedule.id}>
                  <div className="px-4 py-4 sm:px-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-indigo-600 truncate">
                          {schedule.course.courseCode}: {schedule.course.title}
                        </p>
                        <p className="mt-1 flex items-center text-sm text-gray-500">
                          <span className="truncate">{schedule.startTime} - {schedule.endTime}</span>
                          <span className="mx-2 text-gray-400">|</span>
                          <span className="truncate">{schedule.classGroup.name}</span>
                        </p>
                      </div>
                      <div className="ml-4 flex-shrink-0 flex flex-col items-end">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          schedule.verified 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {schedule.verified ? 'Verified' : 'Pending Verification'}
                        </span>
                        {schedule.verified && (
                             <span className="text-xs text-gray-500 mt-1">Status: {schedule.verificationStatus}</span>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 sm:flex sm:justify-between">
                      <div className="sm:flex">
                        <p className="flex items-center text-sm text-gray-500 mr-6">
                          <svg className="flex-shrink-0 mr-1.5 h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          {schedule.lecturer.name}
                        </p>
                        <p className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0 sm:ml-6">
                          <svg className="flex-shrink-0 mr-1.5 h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          {schedule.classroom.roomCode} ({schedule.building.name})
                        </p>
                        {schedule.classroom.virtualLink && (
                             <p className="mt-2 flex items-center text-sm text-blue-500 sm:mt-0 sm:ml-6">
                                <a href={schedule.classroom.virtualLink} target="_blank" rel="noopener noreferrer" className="flex items-center hover:underline">
                                    <svg className="flex-shrink-0 mr-1.5 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                    Join Online
                                </a>
                             </p>
                        )}
                      </div>
                      <div className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0">
                         <button
                            onClick={() => openVerification(schedule)}
                            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                         >
                            {schedule.verified ? 'Update Verification' : 'Verify Class'}
                         </button>
                      </div>
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      {/* Verification Modal */}
      {verifyingId && (
        <div className="fixed z-10 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={closeVerification}></div>

            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

            <div className="relative z-50 inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <form onSubmit={submitVerification}>
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="sm:flex sm:items-start">
                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                      <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                        Verify Class Session
                      </h3>
                      <div className="mt-4 space-y-4">
                        <div>
                          <label htmlFor="status" className="block text-sm font-medium text-gray-700">Status</label>
                          <select
                            id="status"
                            value={verificationStatus}
                            onChange={(e) => setVerificationStatus(e.target.value)}
                            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                          >
                            <option value="ongoing">Class Ongoing</option>
                            <option value="not_started">Not Started / Empty Room</option>
                            <option value="lecturer_absent">Lecturer Absent</option>
                            <option value="cancelled">Cancelled</option>
                            <option value="online">Held Online</option>
                          </select>
                        </div>

                        <div className="flex items-center">
                            <input
                                id="isOnline"
                                type="checkbox"
                                checked={isOnline}
                                onChange={(e) => setIsOnline(e.target.checked)}
                                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                            />
                            <label htmlFor="isOnline" className="ml-2 block text-sm text-gray-900">
                                This is an online session
                            </label>
                        </div>

                        <div>
                          <label htmlFor="comments" className="block text-sm font-medium text-gray-700">Comments</label>
                          <textarea
                            id="comments"
                            rows={3}
                            value={verificationComment}
                            onChange={(e) => setVerificationComment(e.target.value)}
                            className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 mt-1 block w-full sm:text-sm border border-gray-300 rounded-md"
                            placeholder="Add any observations..."
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
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                  >
                    {submitting ? 'Saving...' : 'Save Verification'}
                  </button>
                  <button
                    type="button"
                    onClick={closeVerification}
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
