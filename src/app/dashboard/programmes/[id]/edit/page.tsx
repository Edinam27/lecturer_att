'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, use } from 'react'
import Link from 'next/link'

interface Programme {
  id: string
  name: string
  level: string
  duration: number
  description: string | null
  coordinator: string | null
  _count: {
    courses: number
    classGroups: number
  }
}

interface FormData {
  name: string
  level: string
  duration: number
  description: string
  coordinatorId: string
}

export default function EditProgrammePage({ params }: { params: Promise<{ id: string }> }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const resolvedParams = use(params)
  const [programme, setProgramme] = useState<Programme | null>(null)
  const [coordinators, setCoordinators] = useState<{id: string, firstName: string, lastName: string}[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchLoading, setFetchLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>({
    name: '',
    level: 'BACHELOR',
    duration: 4,
    description: '',
    coordinatorId: ''
  })

  useEffect(() => {
    if (status === 'loading') return
    
    if (!session) {
      router.push('/auth/signin')
      return
    }
    
    // Allow ADMIN and COORDINATOR (validation happens in fetchProgramme)
    if (session.user.role !== 'ADMIN' && session.user.role !== 'COORDINATOR') {
      router.push('/dashboard')
      return
    }

    if (session.user.role === 'ADMIN') {
      fetchCoordinators()
    }

    fetchProgramme()
  }, [session, status, router, resolvedParams.id])

  const fetchCoordinators = async () => {
    try {
      const response = await fetch('/api/users')
      if (response.ok) {
        const users = await response.json()
        const coords = users.filter((u: any) => u.role === 'COORDINATOR')
        setCoordinators(coords)
      }
    } catch (err) {
      console.error('Failed to fetch coordinators', err)
    }
  }

  const fetchProgramme = async () => {
    try {
      setFetchLoading(true)
      const response = await fetch(`/api/programmes/${resolvedParams.id}`)

      if (response.status === 403) {
        throw new Error('Access denied. You are not authorized to edit this programme.')
      }

      if (!response.ok) {
        throw new Error('Failed to fetch programme details')
      }

      const programmeData = await response.json()
      setProgramme(programmeData)
      setFormData({
        name: programmeData.name,
        level: programmeData.level,
        duration: programmeData.duration,
        description: programmeData.description || '',
        coordinatorId: programmeData.coordinator || ''
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch programme')
    } finally {
      setFetchLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/programmes/${resolvedParams.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update programme')
      }

      router.push(`/dashboard/programmes/${resolvedParams.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: name === 'duration' ? parseInt(value) || 1 : value
    }))
  }

  const handleDelete = async () => {
    if (!programme) return
    
    if (programme._count.courses > 0 || programme._count.classGroups > 0) {
      setError('Cannot delete programme with associated courses or class groups')
      return
    }

    if (!confirm('Are you sure you want to delete this programme? This action cannot be undone.')) {
      return
    }

    try {
      setLoading(true)
      const response = await fetch(`/api/programmes/${resolvedParams.id}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete programme')
      }

      router.push('/dashboard/programmes')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  if (status === 'loading' || fetchLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-500"></div>
      </div>
    )
  }

  if (!session || session.user.role !== 'ADMIN') {
    return null
  }

  if (error && !programme) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">Error loading programme</div>
          <p className="text-gray-600 mb-4">{error}</p>
          <Link
            href="/dashboard/programmes"
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            Back to Programmes
          </Link>
        </div>
      </div>
    )
  }

  const canDelete = programme && programme._count.courses === 0 && programme._count.classGroups === 0

  return (
    <div>
      <div className="mb-8">
        <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Edit Programme</h1>
            <p className="mt-2 text-gray-600">
              Update programme information
            </p>
          </div>
          <div className="flex flex-col space-y-3 sm:flex-row sm:space-y-0 sm:space-x-3">
            <Link
              href={`/dashboard/programmes/${resolvedParams.id}`}
              className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Cancel
            </Link>
            {canDelete && (
              <button
                onClick={handleDelete}
                disabled={loading}
                className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete Programme
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-2xl">
        <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-4 sm:p-6">
          {error && (
            <div className="mb-6 p-4 border border-red-300 rounded-md bg-red-50">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          {!canDelete && programme && (
            <div className="mb-6 p-4 border border-yellow-300 rounded-md bg-yellow-50">
              <div className="text-sm text-yellow-700">
                This programme cannot be deleted because it has {programme._count.courses} associated courses and {programme._count.classGroups} class groups.
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Programme Name *
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="e.g., Computer Science"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 mt-6">
            <div className="sm:col-span-1">
              <label htmlFor="level" className="block text-sm font-medium text-gray-700 mb-1">
                Level *
              </label>
              <select
                id="level"
                name="level"
                value={formData.level}
                onChange={handleChange}
                required
                className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="CERTIFICATE">Certificate</option>
                <option value="DIPLOMA">Diploma</option>
                <option value="BACHELOR">Bachelor's Degree</option>
                <option value="MASTER">Master's Degree</option>
                <option value="PHD">PhD</option>
              </select>
            </div>

            <div className="sm:col-span-1">
              <label htmlFor="duration" className="block text-sm font-medium text-gray-700 mb-1">
                Duration (Years) *
              </label>
              <input
                type="number"
                id="duration"
                name="duration"
                value={formData.duration}
                onChange={handleChange}
                required
                min="1"
                max="8"
                className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {session?.user.role === 'ADMIN' && (
            <div className="mt-6">
              <label htmlFor="coordinatorId" className="block text-sm font-medium text-gray-700 mb-1">
                Programme Coordinator
              </label>
              <select
                id="coordinatorId"
                name="coordinatorId"
                value={formData.coordinatorId}
                onChange={handleChange}
                className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">-- Select Coordinator --</option>
                {coordinators.map(coord => (
                  <option key={coord.id} value={coord.id}>
                    {coord.firstName} {coord.lastName}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Assigning a coordinator gives them authority over lecturers, courses, and schedules for this programme.
              </p>
            </div>
          )}

          <div className="mt-6">
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={4}
              className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Programme description..."
            />
          </div>

          <div className="flex flex-col space-y-3 sm:flex-row sm:space-y-0 sm:space-x-3 sm:justify-end pt-6 mt-8 border-t border-gray-200">
            <Link
              href={`/dashboard/programmes/${resolvedParams.id}`}
              className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Updating...' : 'Update Programme'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}