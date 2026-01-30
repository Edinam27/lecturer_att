'use client'

import React from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { 
  Bell, 
  Shield, 
  Database, 
  Server, 
  Globe, 
  Lock 
} from 'lucide-react'

export default function SettingsPage() {
  const { data: session } = useSession()
  const router = useRouter()

  // Redirect if not admin
  React.useEffect(() => {
    if (session?.user && session.user.role !== 'ADMIN') {
      router.push('/dashboard')
    }
  }, [session, router])

  if (!session || session.user.role !== 'ADMIN') {
    return null
  }

  const settingsGroups = [
    {
      title: 'System Configuration',
      items: [
        {
          name: 'Notification Preferences',
          description: 'Manage global notification settings and channels',
          icon: Bell,
          href: '/dashboard/notifications/preferences'
        },
        {
          name: 'Security Settings',
          description: 'Configure password policies and session timeouts',
          icon: Shield,
          href: '#' // Placeholder
        }
      ]
    },
    {
      title: 'Data Management',
      items: [
        {
          name: 'Database Maintenance',
          description: 'View database status and perform cleanup tasks',
          icon: Database,
          href: '#' // Placeholder
        },
        {
          name: 'System Logs',
          description: 'View application and error logs',
          icon: Server,
          href: '/dashboard/audit'
        }
      ]
    }
  ]

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">System Settings</h1>
          <p className="mt-2 text-gray-600">
            Manage global application settings and configurations.
          </p>
        </div>

        <div className="space-y-6">
          {settingsGroups.map((group) => (
            <div key={group.title} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-lg font-medium text-gray-900">{group.title}</h2>
              </div>
              <div className="divide-y divide-gray-200">
                {group.items.map((item) => (
                  <button
                    key={item.name}
                    onClick={() => item.href !== '#' && router.push(item.href)}
                    className="w-full flex items-center px-6 py-4 hover:bg-gray-50 transition-colors text-left"
                    disabled={item.href === '#'}
                  >
                    <div className={`p-2 rounded-lg ${item.href === '#' ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-blue-600'}`}>
                      <item.icon className="w-6 h-6" />
                    </div>
                    <div className="ml-4 flex-1">
                      <h3 className={`text-base font-medium ${item.href === '#' ? 'text-gray-500' : 'text-gray-900'}`}>
                        {item.name}
                        {item.href === '#' && <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Coming Soon</span>}
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">{item.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
