'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PlusIcon, BuildingOfficeIcon, UsersIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'

interface Classroom {
  id: string
  roomCode: string
  name: string
  capacity: number | null
  roomType: string | null
  equipmentList: string | null
  availabilityStatus: string
  virtualLink: string | null
  building: {
    id: string
    name: string
    code: string
  }
  scheduleCount: number
}

export default function ClassroomsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'loading') return
    
    if (!session) {
      router.push('/auth/signin')
      return
    }
    
    // Allow ADMIN, COORDINATOR, LECTURER to view
    if (!['ADMIN', 'COORDINATOR', 'LECTURER'].includes(session.user.role)) {
      router.push('/dashboard')
      return
    }

    fetchClassrooms()
  }, [session, status, router])

  const fetchClassrooms = async () => {
    try {
      const response = await fetch('/api/classrooms')
      if (response.ok) {
        const data = await response.json()
        setClassrooms(data)
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to fetch classrooms')
      }
    } catch (error) {
      console.error('Error fetching classrooms:', error)
      setError('An error occurred while fetching classrooms')
    } finally {
      setLoading(false)
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-500"></div>
      </div>
    )
  }

  if (!session || !['ADMIN', 'COORDINATOR', 'LECTURER'].includes(session.user.role)) {
    return null
  }

  return (
    <div className="p-6">
      <div className="sm:flex sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Classrooms</h1>
          <p className="mt-2 text-sm text-gray-700">
            A list of all classrooms and lecture halls across campus.
          </p>
        </div>
        {session.user.role === 'ADMIN' && (
          <div className="mt-4 sm:mt-0">
            <Link
              href="/dashboard/classrooms/create"
              className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto"
            >
              <PlusIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
              Add Classroom
            </Link>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4 mb-6">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul role="list" className="divide-y divide-gray-200">
          {classrooms.length === 0 ? (
            <li className="px-6 py-12 text-center">
              <BuildingOfficeIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No classrooms</h3>
              <p className="mt-1 text-sm text-gray-500">
                Get started by creating a new classroom.
              </p>
              {session.user.role === 'ADMIN' && (
                <div className="mt-6">
                  <Link
                    href="/dashboard/classrooms/create"
                    className="inline-flex items-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  >
                    <PlusIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
                    Add Classroom
                  </Link>
                </div>
              )}
            </li>
          ) : (
            classrooms.map((classroom) => (
              <li key={classroom.id}>
                <div className="block hover:bg-gray-50 px-4 py-4 sm:px-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                          <BuildingOfficeIcon className="h-6 w-6 text-blue-600" />
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="flex items-center">
                          <p className="text-sm font-medium text-blue-600 truncate">{classroom.name}</p>
                          <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {classroom.roomCode}
                          </span>
                          <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            classroom.availabilityStatus === 'available' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {classroom.availabilityStatus}
                          </span>
                        </div>
                        <div className="flex mt-1 text-sm text-gray-500 space-x-4">
                          <div className="flex items-center">
                            <BuildingOfficeIcon className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                            <p>{classroom.building.name} ({classroom.building.code})</p>
                          </div>
                          <div className="flex items-center">
                            <UsersIcon className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                            <p>{classroom.capacity ? `${classroom.capacity} Seats` : 'Capacity N/A'}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <div className="text-sm text-gray-500 mr-6">
                        <span className="font-medium text-gray-900">{classroom.scheduleCount}</span> Scheduled Classes
                      </div>
                      {/* 
                      // Edit button could go here
                      <Link
                        href={`/dashboard/classrooms/${classroom.id}/edit`}
                        className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
                      >
                        Edit
                      </Link> 
                      */}
                    </div>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
