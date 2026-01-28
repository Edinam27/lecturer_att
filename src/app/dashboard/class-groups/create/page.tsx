'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Programme {
  id: string
  name: string
  level: string
}

interface FormData {
  name: string
  programmeId: string
  admissionYear: number
  currentSemester: number
  maxStudents: number
  deliveryMode: string
}

export default function CreateClassGroupPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [programmes, setProgrammes] = useState<Programme[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [formData, setFormData] = useState<FormData>({
    name: '',
    programmeId: '',
    admissionYear: new Date().getFullYear(),
    currentSemester: 1,
    maxStudents: 50,
    deliveryMode: 'FACE_TO_FACE'
  })

  useEffect(() => {
    if (status === 'loading') return
    
    if (!session) {
      router.push('/auth/signin')
      return
    }
    
    // Only coordinators, admins, and lecturers can create class groups
    if (!['COORDINATOR', 'ADMIN', 'LECTURER'].includes(session.user.role)) {
      router.push('/dashboard')
      return
    }

    fetchProgrammes()
  }, [session, status, router])

  const fetchProgrammes = async () => {
    try {
      const response = await fetch('/api/programmes')
      if (response.ok) {
        const data = await response.json()
        setProgrammes(data)
      }
    } catch (err) {
      console.error('Failed to fetch programmes', err)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseInt(value) || 0 : value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/class-groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create class group')
      }

      router.push('/dashboard') // Redirect to dashboard since class-info is only for CLASS_REP
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-500"></div>
      </div>
    )
  }

  if (!session || !['COORDINATOR', 'ADMIN', 'LECTURER'].includes(session.user.role)) {
    return null
  }

  return (
    <div>
      <div className="mb-6 sm:mb-8">
        <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Create Class Group</h1>
            <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-600">
              Create a new class group for a programme
            </p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>

      <div className="max-w-2xl">
        <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-4 sm:p-6 space-y-4 sm:space-y-6">
          {error && (
            <div className="mb-6 p-4 border border-red-300 rounded-md bg-red-50">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Class Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              placeholder="e.g. L400 Regular"
              className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="programmeId" className="block text-sm font-medium text-gray-700 mb-1">
              Programme *
            </label>
            <select
              id="programmeId"
              name="programmeId"
              value={formData.programmeId}
              onChange={handleChange}
              required
              className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">Select a programme</option>
              {programmes.map(prog => (
                <option key={prog.id} value={prog.id}>
                  {prog.name} ({prog.level})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="sm:col-span-1">
              <label htmlFor="admissionYear" className="block text-sm font-medium text-gray-700 mb-1">
                Admission Year *
              </label>
              <input
                type="number"
                id="admissionYear"
                name="admissionYear"
                value={formData.admissionYear}
                onChange={handleChange}
                required
                min="2000"
                max="2100"
                className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="sm:col-span-1">
              <label htmlFor="currentSemester" className="block text-sm font-medium text-gray-700 mb-1">
                Current Semester
              </label>
              <select
                id="currentSemester"
                name="currentSemester"
                value={formData.currentSemester}
                onChange={handleChange}
                className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map(sem => (
                  <option key={sem} value={sem}>Semester {sem}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="sm:col-span-1">
              <label htmlFor="maxStudents" className="block text-sm font-medium text-gray-700 mb-1">
                Max Students
              </label>
              <input
                type="number"
                id="maxStudents"
                name="maxStudents"
                value={formData.maxStudents}
                onChange={handleChange}
                min="1"
                className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="sm:col-span-1">
              <label htmlFor="deliveryMode" className="block text-sm font-medium text-gray-700 mb-1">
                Delivery Mode
              </label>
              <select
                id="deliveryMode"
                name="deliveryMode"
                value={formData.deliveryMode}
                onChange={handleChange}
                className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="FACE_TO_FACE">Face to Face</option>
                <option value="ONLINE">Online</option>
                <option value="HYBRID">Hybrid</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Link
              href="/dashboard"
              className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 mr-3"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className={`inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                loading ? 'opacity-75 cursor-not-allowed' : ''
              }`}
            >
              {loading ? 'Creating...' : 'Create Class Group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
