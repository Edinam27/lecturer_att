'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface PrintableAttendanceRecord {
  id: string
  timestamp: string
  method: string
  locationVerified: boolean
  gpsLatitude?: number | null
  gpsLongitude?: number | null
  classRepVerified?: boolean | null
  classRepComment?: string | null
  course: { title: string; courseCode: string }
  classGroup: { name: string }
  building: { name: string }
  classroom: { name: string }
  lecturer: { name: string }
  studentAttendanceData?: any | null
}

export default function PrintAttendancePage() {
  const params = useParams()
  const id = params?.id as string
  const [record, setRecord] = useState<PrintableAttendanceRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchRecord = async () => {
      try {
        const res = await fetch(`/api/attendance/${id}`)
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to load attendance record')
        }
        const data = await res.json()
        setRecord(data)
      } catch (err: any) {
        setError(err.message || 'Failed to load attendance record')
      } finally {
        setLoading(false)
      }
    }

    if (id) {
      fetchRecord()
    }
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500" />
      </div>
    )
  }

  if (error || !record) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Unable to load print view</h1>
        <p className="text-gray-600">{error || 'Attendance record not found'}</p>
      </div>
    )
  }

  const dateStr = new Date(record.timestamp).toLocaleDateString()
  const timeStr = new Date(record.timestamp).toLocaleTimeString()
  const statusLabel = record.classRepVerified === true
    ? 'Verified'
    : record.classRepVerified === false
      ? 'Disputed'
      : 'Pending'

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="p-6">
      {/* Header actions (hidden on print) */}
      <div className="mb-6 print:hidden flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Printable Attendance Sheet</h1>
        <button
          onClick={handlePrint}
          className="inline-flex items-center px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
        >
          Print
        </button>
      </div>

      {/* Print content */}
      <div className="bg-white border rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <p className="text-sm text-gray-500">Course</p>
            <p className="text-lg font-semibold text-gray-900">
              {record.course.courseCode} — {record.course.title}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Class Group</p>
            <p className="text-lg font-semibold text-gray-900">{record.classGroup.name}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Lecturer</p>
            <p className="text-lg font-semibold text-gray-900">{record.lecturer.name}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Date & Time</p>
            <p className="text-lg font-semibold text-gray-900">{dateStr} — {timeStr}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Location</p>
            <p className="text-lg font-semibold text-gray-900">
              {record.building.name} — {record.classroom.name}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Method & Verification</p>
            <p className="text-lg font-semibold text-gray-900">
              {record.method?.toUpperCase()} — {statusLabel}
            </p>
          </div>
        </div>

        {/* Optional GPS info */}
        {(record.gpsLatitude && record.gpsLongitude) ? (
          <div className="mb-6">
            <p className="text-sm text-gray-500">GPS</p>
            <p className="text-gray-900">
              {record.gpsLatitude}, {record.gpsLongitude} {record.locationVerified ? '(Verified)' : ''}
            </p>
          </div>
        ) : null}

        {/* Attendance sheet table */}
        <div>
          <p className="text-sm text-gray-500 mb-2">Attendance Register</p>
          <table className="w-full border border-gray-300">
            <thead>
              <tr>
                <th className="border border-gray-300 p-2 text-left">#</th>
                <th className="border border-gray-300 p-2 text-left">Student Name</th>
                <th className="border border-gray-300 p-2 text-left">Student ID</th>
                <th className="border border-gray-300 p-2 text-left">Signature</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 30 }).map((_, idx) => (
                <tr key={idx}>
                  <td className="border border-gray-300 p-2">{idx + 1}</td>
                  <td className="border border-gray-300 p-2">&nbsp;</td>
                  <td className="border border-gray-300 p-2">&nbsp;</td>
                  <td className="border border-gray-300 p-2">&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}