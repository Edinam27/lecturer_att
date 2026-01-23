'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { getUPSACoordinates, getUPSARadius, getDistance } from '@/lib/geolocation'

interface Schedule {
  id: string
  sessionDate: string
  startTime: string
  endTime: string
  sessionType: string
  course: {
    id: string
    name: string
    code: string
  }
  classGroup: {
    id: string
    name: string
  }
  building: {
    name: string
  }
  classroom: {
    name: string
    virtualLink?: string | null
  }
}

export default function TakeAttendancePage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null)
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [distanceToCampus, setDistanceToCampus] = useState<number | null>(null)
  const [locationError, setLocationError] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [attendanceMethod, setAttendanceMethod] = useState<'onsite' | 'virtual'>('onsite')
  const [virtualSessionActive, setVirtualSessionActive] = useState(false)
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null)
  const [timeRemaining, setTimeRemaining] = useState<string>('')
  const [remarks, setRemarks] = useState('')

  useEffect(() => {
    if (session?.user.role !== 'LECTURER') {
      router.push('/dashboard')
      return
    }
    fetchTodaySchedules()
  }, [session, router])

  // Update attendance method when schedule is selected
  useEffect(() => {
    if (selectedSchedule) {
      const isVirtual = selectedSchedule.classroom.virtualLink && selectedSchedule.classroom.virtualLink.trim() !== ''
      setAttendanceMethod(isVirtual ? 'virtual' : 'onsite')
    }
  }, [selectedSchedule])

  // Timer for virtual sessions
  useEffect(() => {
    if (virtualSessionActive && sessionStartTime) {
      const timer = setInterval(() => {
        const now = new Date()
        const elapsed = Math.floor((now.getTime() - sessionStartTime.getTime()) / 1000)
        const hours = Math.floor(elapsed / 3600)
        const minutes = Math.floor((elapsed % 3600) / 60)
        const seconds = elapsed % 60
        setTimeRemaining(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`)
      }, 1000)

      return () => clearInterval(timer)
    }
  }, [virtualSessionActive, sessionStartTime])

  const fetchTodaySchedules = async () => {
    try {
      const response = await fetch('/api/schedules/today')
      if (response.ok) {
        const data = await response.json()
        setSchedules(data)
      }
    } catch (error) {
      console.error('Error fetching schedules:', error)
    } finally {
      setLoading(false)
    }
  }

  const getCurrentLocation = () => {
    setLocationError('')
    
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by this browser.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userCoords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        }
        setLocation(userCoords)
        
        // Calculate distance to campus
        const campusCoords = getUPSACoordinates()
        const distance = getDistance(userCoords, campusCoords)
        setDistanceToCampus(distance)
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError('Location access denied. Please enable location services.')
            break
          case error.POSITION_UNAVAILABLE:
            setLocationError('Location information is unavailable.')
            break
          case error.TIMEOUT:
            setLocationError('Location request timed out.')
            break
          default:
            setLocationError('An unknown error occurred while retrieving location.')
            break
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    )
  }

  const handleStartVirtualSession = async () => {
    if (!selectedSchedule) return

    setSubmitting(true)

    try {
      const response = await fetch('/api/attendance/take', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          scheduleId: selectedSchedule.id,
          method: 'virtual',
          action: 'start',
          remarks
        })
      })

      const data = await response.json()

      if (response.ok) {
        setVirtualSessionActive(true)
        setSessionStartTime(new Date())
        alert('Virtual session started successfully!')
      } else {
        alert(data.error || 'Failed to start virtual session')
      }
    } catch (error) {
      console.error('Error starting virtual session:', error)
      alert('An error occurred while starting virtual session')
    } finally {
      setSubmitting(false)
    }
  }

  const handleEndVirtualSession = async () => {
    if (!selectedSchedule) return

    setSubmitting(true)

    try {
      const response = await fetch('/api/attendance/take', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          scheduleId: selectedSchedule.id,
          method: 'virtual',
          action: 'end',
          remarks
        })
      })

      const data = await response.json()

      if (response.ok) {
        setVirtualSessionActive(false)
        setSessionStartTime(null)
        alert('Virtual session ended successfully!')
        router.push('/dashboard/attendance')
      } else {
        alert(data.error || 'Failed to end virtual session')
      }
    } catch (error) {
      console.error('Error ending virtual session:', error)
      alert('An error occurred while ending virtual session')
    } finally {
      setSubmitting(false)
    }
  }

  const handleTakeAttendance = async () => {
    if (!selectedSchedule) return

    if (attendanceMethod === 'onsite' && !location) {
      alert('Please get your current location first')
      return
    }

    setSubmitting(true)

    try {
      const requestBody: any = {
        scheduleId: selectedSchedule.id,
        method: attendanceMethod,
        remarks
      }

      if (attendanceMethod === 'onsite') {
        requestBody.latitude = location!.latitude
        requestBody.longitude = location!.longitude
      }

      const response = await fetch('/api/attendance/take', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      const data = await response.json()

      if (response.ok) {
        alert('Attendance recorded successfully!')
        router.push('/dashboard/attendance')
      } else {
        alert(data.error || 'Failed to record attendance')
      }
    } catch (error) {
      console.error('Error recording attendance:', error)
      alert('An error occurred while recording attendance')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Take Attendance</h1>
        <p className="mt-2 text-gray-600">
          Record your attendance for today's sessions
        </p>
      </div>

      {schedules.length === 0 ? (
        <div className="text-center py-12">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3a2 2 0 012-2h4a2 2 0 012 2v4m-6 0h6m-6 0l-1 12a2 2 0 002 2h6a2 2 0 002-2L16 7m-6 0V3"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No sessions today</h3>
          <p className="mt-1 text-sm text-gray-500">
            You don't have any scheduled sessions for today.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Schedule Selection */}
          <div className="bg-white shadow sm:rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                Select Session
              </h3>
              <div className="space-y-3">
                {schedules.map((schedule) => (
                  <div
                    key={schedule.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      selectedSchedule?.id === schedule.id
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedSchedule(schedule)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium text-gray-900">
                          {schedule.course.code} - {schedule.course.name}
                        </h4>
                        <p className="text-sm text-gray-600">
                          {schedule.classGroup.name} • {schedule.sessionType}
                        </p>
                        <p className="text-sm text-gray-500">
                          {schedule.classroom.virtualLink ? (
                            <span className="inline-flex items-center">
                              <svg className="w-4 h-4 mr-1 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                              Virtual Classroom
                            </span>
                          ) : (
                            `${schedule.building.name} - ${schedule.classroom.name}`
                          )}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">
                          {schedule.startTime} - {schedule.endTime}
                        </p>
                        <p className="text-sm text-gray-500">
                          {new Date(schedule.sessionDate).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Attendance Verification */}
          {selectedSchedule && (
            <div className="bg-white shadow sm:rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  {attendanceMethod === 'virtual' ? 'Virtual Session Management' : 'Location Verification'}
                </h3>
                
                {attendanceMethod === 'virtual' ? (
                  <div>
                    {/* Virtual Meeting Link */}
                    {selectedSchedule.classroom.virtualLink && (
                      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <h4 className="text-sm font-medium text-blue-900 mb-2">Meeting Link</h4>
                        <div className="flex items-center justify-between">
                          <a
                            href={selectedSchedule.classroom.virtualLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 underline text-sm break-all"
                          >
                            {selectedSchedule.classroom.virtualLink}
                          </a>
                          <button
                            onClick={() => navigator.clipboard.writeText(selectedSchedule.classroom.virtualLink!)}
                            className="ml-2 p-1 text-blue-600 hover:text-blue-800"
                            title="Copy link"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Virtual Session Controls */}
                    {!virtualSessionActive ? (
                      <div>
                        <p className="text-sm text-gray-600 mb-4">
                          Start your virtual session to begin recording attendance. Students will be able to mark their attendance once the session is active.
                        </p>
                        <button
                          onClick={handleStartVirtualSession}
                          disabled={submitting}
                          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-bold rounded-md shadow-sm text-white bg-green-700 hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-600 disabled:opacity-50"
                        >
                          {submitting ? (
                            <>
                              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Starting...
                            </>
                          ) : (
                            <>
                              <svg className="-ml-1 mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h8m-9-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Start Virtual Session
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center text-green-600 mb-4">
                          <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-sm font-medium">Virtual session active</span>
                        </div>
                        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                          <p className="text-sm text-green-800">
                            Session Duration: <span className="font-mono font-medium">{timeRemaining}</span>
                          </p>
                        </div>
                        <button
                          onClick={handleEndVirtualSession}
                          disabled={submitting}
                          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-bold rounded-md shadow-sm text-white bg-red-700 hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-600 disabled:opacity-50"
                        >
                          {submitting ? (
                            <>
                              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Ending...
                            </>
                          ) : (
                            <>
                              <svg className="-ml-1 mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10h6v4H9z" />
                              </svg>
                              End Virtual Session
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Onsite Location Verification */
                  <div>
                    {!location ? (
                      <div>
                        <p className="text-sm text-gray-600 mb-4">
                          To record attendance, you must be physically present at UPSA campus. 
                          Click the button below to verify your location.
                        </p>
                        <button
                          onClick={getCurrentLocation}
                          className="w-full inline-flex justify-center items-center px-6 py-3 border border-transparent text-base font-bold rounded-md shadow-sm text-white bg-indigo-700 hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600"
                        >
                          <svg className="-ml-1 mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Get Current Location
                        </button>
                        {locationError && (
                          <p className="mt-2 text-sm text-red-600">{locationError}</p>
                        )}
                      </div>
                    ) : (
                      <div>
                        <div className={`flex items-center mb-4 ${distanceToCampus && distanceToCampus <= getUPSARadius() ? 'text-green-600' : 'text-amber-600'}`}>
                          <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {distanceToCampus && distanceToCampus <= getUPSARadius() ? (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            ) : (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            )}
                          </svg>
                          <span className="text-sm font-medium">
                            {distanceToCampus && distanceToCampus <= getUPSARadius() 
                              ? 'Location Verified (Within Campus)' 
                              : `Location Warning: ${distanceToCampus}m away (Max: ${getUPSARadius()}m)`}
                          </span>
                        </div>
                        
                        {distanceToCampus && distanceToCampus > getUPSARadius() && (
                          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
                            You appear to be outside the allowed campus radius. You may still try to record attendance, but it might be flagged or rejected depending on system settings.
                            <br />
                            <button 
                              onClick={getCurrentLocation}
                              className="mt-3 inline-flex items-center px-4 py-2 border border-indigo-600 text-sm font-medium rounded-md text-indigo-700 bg-white hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                            >
                              <svg className="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              Retry Location Check
                            </button>
                          </div>
                        )}

                        <p className="text-sm text-gray-600 mb-4">
                          Latitude: {location.latitude.toFixed(6)}, Longitude: {location.longitude.toFixed(6)}
                        </p>
                        <div className="mb-4">
                          <label htmlFor="onsite-remarks" className="block text-sm font-medium text-gray-700 mb-1">
                            Remarks (Optional)
                          </label>
                          <textarea
                            id="onsite-remarks"
                            rows={3}
                            className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                            placeholder="Enter any remarks (e.g. Room Change, Class Rep comments)..."
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                          />
                        </div>
                        <button
                          onClick={handleTakeAttendance}
                          disabled={submitting}
                          className="w-full inline-flex justify-center items-center px-6 py-4 border border-transparent text-lg font-bold rounded-lg shadow-md hover:shadow-lg transition-all text-white bg-green-700 hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {submitting ? (
                            <>
                              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Recording...
                            </>
                          ) : (
                            <>
                              <svg className="-ml-1 mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Record Attendance
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}