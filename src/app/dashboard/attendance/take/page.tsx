'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { getUPSACoordinates, getUPSARadius, getDistance } from '@/lib/geolocation'
import { useAttendanceLocation } from '@/hooks/useAttendanceLocation'

interface Schedule {
  id: string
  sessionDate: string
  startTime: string
  endTime: string
  sessionType: string
  meetingLink?: string | null
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
  
  const { 
    location, 
    loading: locationLoading, 
    error: locationError, 
    getLocation, 
    submitAttendance,
    isOffline,
    locationDiagnostics
  } = useAttendanceLocation()

  const [distanceToCampus, setDistanceToCampus] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [attendanceMethod, setAttendanceMethod] = useState<'onsite' | 'virtual'>('onsite')
  const [virtualSessionActive, setVirtualSessionActive] = useState(false)
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null)
  const [timeRemaining, setTimeRemaining] = useState<string>('')
  const [remarks, setRemarks] = useState('')
  
  // New state for editing link
  const [isEditingLink, setIsEditingLink] = useState(false)
  const [newLink, setNewLink] = useState('')
  
  // Diagnostics state
  const [diagnosticLog, setDiagnosticLog] = useState<string>('')
  const [showDiagnostics, setShowDiagnostics] = useState(false)

  const runDiagnostics = async () => {
    setShowDiagnostics(true)
    let log = `[${new Date().toLocaleTimeString()}] Starting Diagnostics...\n`
    log += "----------------------------------------\n"
    
    // 1. Check Origin
    log += `Origin: ${window.location.origin}\n`
    log += `Protocol: ${window.location.protocol} ${window.location.protocol === 'https:' ? '✅' : '❌'}\n`
    log += `Secure Context: ${window.isSecureContext ? 'YES ✅' : 'NO ❌'}\n`
    
    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
      log += "⚠️ CRITICAL: Geolocation requires HTTPS!\n"
    }

    // 2. Browser Support
    const geoSupported = 'geolocation' in navigator
    log += `Geolocation API: ${geoSupported ? 'Available ✅' : 'Missing ❌'}\n`

    if (!geoSupported) {
      log += "❌ Browser does not support Geolocation.\n"
      setDiagnosticLog(log)
      return
    }

    // 3. Permissions API
    if (navigator.permissions && navigator.permissions.query) {
      try {
        log += "Checking Permissions API...\n"
        const result = await navigator.permissions.query({ name: 'geolocation' })
        log += `Permission State: ${result.state.toUpperCase()}\n`
        
        result.onchange = () => {
          setDiagnosticLog(prev => prev + `\n[Event] Permission changed to: ${result.state}\n`)
        }
      } catch (e: any) {
        log += `Permissions API Error: ${e.message}\n`
      }
    } else {
      log += "Permissions API: Not supported by browser (skipping check)\n"
    }

    // 4. Active Test
    log += "----------------------------------------\n"
    log += "Requesting Position (Low Accuracy)...\n"
    setDiagnosticLog(log)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        log += `SUCCESS! ✅\n`
        log += `Lat: ${pos.coords.latitude.toFixed(6)}\n`
        log += `Lng: ${pos.coords.longitude.toFixed(6)}\n`
        log += `Accuracy: ${pos.coords.accuracy} meters\n`
        setDiagnosticLog(log)
      },
      (err) => {
        log += `FAILED ❌\n`
        log += `Error Code: ${err.code}\n`
        log += `Message: ${err.message}\n`
        
        if (err.code === 1) {
          log += "\n[DIAGNOSIS] PERMISSION_DENIED\n"
          log += "1. Browser blocked site?\n"
          log += "2. OS (Windows/Mac) blocked browser?\n"
          log += "   -> Windows: Settings > Privacy > Location\n"
          log += "   -> Mac: System Settings > Privacy > Location Services\n"
        } else if (err.code === 2) {
          log += "\n[DIAGNOSIS] POSITION_UNAVAILABLE\n"
          log += "1. GPS turned off?\n"
          log += "2. No Wi-Fi/Network location available?\n"
        } else if (err.code === 3) {
          log += "\n[DIAGNOSIS] TIMEOUT\n"
          log += "Request took too long.\n"
        }
        
        setDiagnosticLog(log)
      },
      { 
        enableHighAccuracy: false, 
        timeout: 15000, 
        maximumAge: 0 
      }
    )
  }

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
      const link = selectedSchedule.meetingLink || selectedSchedule.classroom.virtualLink
      const isVirtual = link && link.trim() !== ''
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
      } else {
        console.error('Failed to fetch schedules')
        setSchedules([])
      }
    } catch (error) {
      console.error('Error fetching schedules:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleGetLocation = async () => {
    const loc = await getLocation()
    if (loc) {
      // Calculate distance to campus
      const campusCoords = getUPSACoordinates()
      const distance = getDistance(loc, campusCoords)
      setDistanceToCampus(distance)
    }
  }

  const handleUpdateLink = async () => {
    if (!selectedSchedule) return
    
    try {
      const response = await fetch(`/api/schedules/${selectedSchedule.id}/link`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: newLink })
      })
      
      if (response.ok) {
        const updatedSchedule = { ...selectedSchedule, meetingLink: newLink }
        setSelectedSchedule(updatedSchedule)
        setSchedules(schedules.map(s => s.id === updatedSchedule.id ? updatedSchedule : s))
        setIsEditingLink(false)
        alert('Meeting link updated successfully')
      } else {
        alert('Failed to update link')
      }
    } catch (error) {
      console.error('Error updating link:', error)
      alert('Error updating link')
    }
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
        const errorMessage = data.details 
          ? `${data.error}\n\nDetails:\n${data.details.join('\n')}`
          : data.error || 'Failed to start virtual session'
        alert(errorMessage)
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
      const result = await submitAttendance({
        scheduleId: selectedSchedule.id,
        method: attendanceMethod,
        remarks,
        latitude: location?.latitude,
        longitude: location?.longitude
      })

      if (result.success) {
        if (result.offline) {
          alert('Offline: Attendance saved locally. Will sync when online.')
        } else {
          alert('Attendance recorded successfully!')
        }
        router.push('/dashboard/attendance')
      } else {
        alert(result.error || 'Failed to record attendance')
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
        {isOffline && (
          <div className="mt-4 p-4 bg-yellow-50 border-l-4 border-yellow-400">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-700">
                  You are currently offline. Attendance will be saved locally and synced when you reconnect.
                </p>
              </div>
            </div>
          </div>
        )}
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
                          {(schedule.meetingLink || schedule.classroom.virtualLink) ? (
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
                    <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="text-sm font-medium text-blue-900">Meeting Link</h4>
                        <button 
                          onClick={() => {
                            setNewLink(selectedSchedule.meetingLink || selectedSchedule.classroom.virtualLink || '')
                            setIsEditingLink(!isEditingLink)
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800 underline"
                        >
                          {isEditingLink ? 'Cancel' : 'Edit'}
                        </button>
                      </div>

                      {isEditingLink ? (
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            value={newLink}
                            onChange={(e) => setNewLink(e.target.value)}
                            className="flex-1 text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 px-2 py-1"
                            placeholder="Enter meeting link"
                          />
                          <button
                            onClick={handleUpdateLink}
                            className="px-3 py-1 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        (selectedSchedule.meetingLink || selectedSchedule.classroom.virtualLink) ? (
                          <div className="flex items-center justify-between">
                            <a
                              href={selectedSchedule.meetingLink || selectedSchedule.classroom.virtualLink || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 underline text-sm break-all"
                            >
                              {selectedSchedule.meetingLink || selectedSchedule.classroom.virtualLink}
                            </a>
                            <button
                              onClick={() => navigator.clipboard.writeText((selectedSchedule.meetingLink || selectedSchedule.classroom.virtualLink)!)}
                              className="ml-2 p-1 text-blue-600 hover:text-blue-800"
                              title="Copy link"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <div className="text-sm text-gray-500 italic">No link provided. Click Edit to add one.</div>
                        )
                      )}
                    </div>

                    {/* Virtual Session Controls */}
                    {!virtualSessionActive ? (
                      <div>
                        <p className="text-sm text-gray-600 mb-4">
                          Start your virtual session to record your attendance.
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
                          onClick={handleGetLocation}
                          className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                          {locationLoading ? (
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            <svg className="-ml-1 mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          )}
                          Get Current Location
                        </button>
                        {locationError && (
                          <div className="mt-2">
                            <p className="text-sm text-red-600 font-medium">{locationError}</p>
                            
                            <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                              <h4 className="font-bold text-gray-800 mb-2 flex items-center">
                                <svg className="w-4 h-4 mr-2 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                Troubleshooting Location Issues
                              </h4>
                              
                              <div className="space-y-3 text-gray-700">
                                <div className="p-3 bg-white rounded border border-gray-200">
                                  <p className="font-semibold text-red-600 mb-1">Important for Windows Users:</p>
                                  <p className="text-xs">
                                    Even if permitted in the browser, you must enable location in 
                                    <span className="font-bold mx-1">Settings &gt; Privacy &gt; Location</span>.
                                    Make sure "Allow desktop apps to access your location" is ON.
                                  </p>
                                </div>

                                <ul className="list-disc pl-5 space-y-1 text-xs">
                                  <li>Check browser permission (lock icon 🔒 in address bar).</li>
                                  <li>Ensure you are using HTTPS (secure connection).</li>
                                  <li>If on mobile, enable GPS/Location Services.</li>
                                </ul>
                                
                                <div className="pt-2">
                                  <button 
                                    onClick={runDiagnostics}
                                    className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded font-medium text-xs border border-gray-300 flex justify-center items-center transition-colors"
                                  >
                                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                    </svg>
                                    Run Connectivity & Permission Diagnostics
                                  </button>
                                </div>

                                {showDiagnostics && (
                                  <div className="mt-3 p-2 bg-black text-green-400 font-mono text-xs rounded overflow-x-auto whitespace-pre-wrap border border-gray-700 shadow-inner max-h-60 overflow-y-auto">
                                    {diagnosticLog || "Initializing..."}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
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
                              onClick={handleGetLocation}
                              className="mt-3 inline-flex items-center px-4 py-2 border border-indigo-600 text-sm font-medium rounded-md text-indigo-700 bg-white hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                            >
                              Retry Location
                            </button>
                          </div>
                        )}

                        <div className="mt-6">
                          <label htmlFor="remarks" className="block text-sm font-medium text-gray-700">
                            Remarks (Optional)
                          </label>
                          <div className="mt-1">
                            <textarea
                              id="remarks"
                              name="remarks"
                              rows={3}
                              className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                              placeholder="Any comments about today's session..."
                              value={remarks}
                              onChange={(e) => setRemarks(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="mt-6">
                          <button
                            onClick={handleTakeAttendance}
                            disabled={submitting}
                            className="w-full inline-flex justify-center items-center px-6 py-3 border border-transparent text-base font-bold rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                          >
                            {submitting ? (
                              <>
                                <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Recording...
                              </>
                            ) : (
                              <>
                                <svg className="-ml-1 mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Confirm Attendance
                              </>
                            )}
                          </button>
                        </div>
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
