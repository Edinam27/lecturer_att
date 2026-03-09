'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PlusIcon, BuildingOfficeIcon, MapPinIcon } from '@heroicons/react/24/outline'

interface Building {
  id: string
  code: string
  name: string
  description: string | null
  address: string | null
  totalFloors: number | null
  gpsLatitude: number
  gpsLongitude: number
  _count?: {
    classrooms: number
  }
}

export default function BuildingsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [buildings, setBuildings] = useState<Building[]>([])
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

    fetchBuildings()
  }, [session, status, router])

  const fetchBuildings = async () => {
    try {
      const response = await fetch('/api/buildings')
      if (response.ok) {
        const data = await response.json()
        setBuildings(data)
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to fetch buildings')
      }
    } catch (error) {
      console.error('Error fetching buildings:', error)
      setError('An error occurred while fetching buildings')
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
          <h1 className="text-2xl font-bold text-gray-900">Buildings</h1>
          <p className="mt-2 text-sm text-gray-700">
            A list of all campus buildings and their locations.
          </p>
        </div>
        {session.user.role === 'ADMIN' && (
          <div className="mt-4 sm:mt-0">
            <Link
              href="/dashboard/buildings/create"
              className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto"
            >
              <PlusIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
              Add Building
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
          {buildings.length === 0 ? (
            <li className="px-6 py-12 text-center">
              <BuildingOfficeIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No buildings</h3>
              <p className="mt-1 text-sm text-gray-500">
                Get started by creating a new building.
              </p>
              {session.user.role === 'ADMIN' && (
                <div className="mt-6">
                  <Link
                    href="/dashboard/buildings/create"
                    className="inline-flex items-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  >
                    <PlusIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
                    Add Building
                  </Link>
                </div>
              )}
            </li>
          ) : (
            buildings.map((building) => (
              <li key={building.id}>
                <div className="block hover:bg-gray-50 px-4 py-4 sm:px-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                          <BuildingOfficeIcon className="h-6 w-6 text-indigo-600" />
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="flex items-center">
                          <p className="text-sm font-medium text-indigo-600 truncate">{building.name}</p>
                          <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {building.code}
                          </span>
                        </div>
                        <div className="flex mt-1 text-sm text-gray-500 space-x-4">
                          {building.address && (
                            <div className="flex items-center">
                              <MapPinIcon className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                              <p>{building.address}</p>
                            </div>
                          )}
                          <div>
                            {building.totalFloors ? `${building.totalFloors} Floors` : 'Floors N/A'}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <div className="text-sm text-gray-500 mr-6">
                        <span className="font-medium text-gray-900">{building._count?.classrooms || 0}</span> Classrooms
                      </div>
                      {/* 
                      // Edit button could go here
                      <Link
                        href={`/dashboard/buildings/${building.id}/edit`}
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
