'use client'

import { useSession, signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Plus, Search, Edit2, UserX, UserCheck, Briefcase, Clock, AlertTriangle, ArrowRightLeft } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'

interface Lecturer {
  id: string
  userId: string
  user: {
    firstName: string
    lastName: string
    email: string
  }
  isActive: boolean
  lecturer: {
    employeeId: string | null
    department: string | null
    employmentType: string | null
    rank: string | null
    isAdjunct: boolean
    isOverload: boolean
    scheduleCount: number
    overloadCount: number
  }
}

export default function LecturersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [lecturers, setLecturers] = useState<Lecturer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Modal states
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [currentLecturer, setCurrentLecturer] = useState<Lecturer | null>(null)

  // Form states
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    employeeId: '',
    department: '',
    rank: '',
    isAdjunct: false,
    isOverload: false,
    isActive: true
  })
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'loading') return
    
    if (!session?.user || (session.user.role !== 'COORDINATOR' && session.user.role !== 'ADMIN')) {
      router.push('/dashboard')
      return
    }

    fetchLecturers()
  }, [session, status, router])

  const fetchLecturers = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/lecturers')
      
      if (!response.ok) {
        throw new Error('Failed to fetch lecturers')
      }
      
      const data = await response.json()
      setLecturers(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleAddLecturer = async () => {
    setFormError(null)
    try {
      const response = await fetch('/api/lecturers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to add lecturer')
      }

      setIsAddOpen(false)
      resetForm()
      fetchLecturers()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  const handleEditLecturer = async () => {
    if (!currentLecturer) return
    setFormError(null)

    try {
      const response = await fetch(`/api/lecturers/${currentLecturer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            firstName: formData.firstName,
            lastName: formData.lastName,
            employeeId: formData.employeeId,
            department: formData.department,
            rank: formData.rank,
            isAdjunct: formData.isAdjunct,
            isOverload: formData.isOverload,
            isActive: formData.isActive
        })
      })

      if (!response.ok) {
        throw new Error('Failed to update lecturer')
      }

      setIsEditOpen(false)
      setCurrentLecturer(null)
      resetForm()
      fetchLecturers()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  const handleToggleStatus = async (lecturer: Lecturer) => {
    try {
      const response = await fetch(`/api/lecturers/${lecturer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !lecturer.isActive })
      })

      if (!response.ok) throw new Error('Failed to update status')
      
      fetchLecturers()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  const handleSwitchUser = async (lecturer: Lecturer) => {
    if (!confirm(`Are you sure you want to switch to ${lecturer.user.firstName} ${lecturer.user.lastName}?`)) {
      return
    }

    try {
      console.log('Initiating user switch to:', lecturer.userId)
      const response = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: lecturer.userId })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to generate impersonation token')
      }

      const { token } = await response.json()
      console.log('Impersonation token received, signing in...')
      
      const result = await signIn('impersonation', {
        token,
        redirect: false,
        callbackUrl: '/dashboard'
      })

      if (result?.error) {
        console.error('Sign in failed:', result.error)
        throw new Error(result.error)
      }

      console.log('Switch successful, redirecting...')
      window.location.href = '/dashboard'
    } catch (err) {
      console.error('Impersonation failed:', err)
      alert('Failed to switch user. Please try again.')
    }
  }

  const openEditModal = (lecturer: Lecturer) => {
    setFormError(null)
    setCurrentLecturer(lecturer)
    setFormData({
      firstName: lecturer.user.firstName,
      lastName: lecturer.user.lastName,
      email: lecturer.user.email,
      password: '', // Password not editable here
      employeeId: lecturer.lecturer.employeeId || '',
      department: lecturer.lecturer.department || '',
      rank: lecturer.lecturer.rank || '',
      isAdjunct: lecturer.lecturer.isAdjunct,
      isOverload: lecturer.lecturer.isOverload,
      isActive: lecturer.isActive
    })
    setIsEditOpen(true)
  }

  const resetForm = () => {
    setFormError(null)
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      employeeId: '',
      department: '',
      rank: '',
      isAdjunct: false,
      isOverload: false,
      isActive: true
    })
  }

  const filteredLecturers = lecturers.filter(lecturer => 
    (lecturer.user.firstName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (lecturer.user.lastName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (lecturer.user.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (lecturer.lecturer.employeeId && lecturer.lecturer.employeeId.includes(searchQuery))
  )

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lecturers</h1>
          <p className="text-sm text-gray-500">Manage lecturers, their status, and assignments</p>
        </div>
        <Button onClick={() => { resetForm(); setIsAddOpen(true) }} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="mr-2 h-4 w-4" /> Add Lecturer
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-blue-100 text-blue-600">
              <Briefcase className="h-6 w-6" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Lecturers</p>
              <h3 className="text-2xl font-bold text-gray-900">{lecturers.length}</h3>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-green-100 text-green-600">
              <UserCheck className="h-6 w-6" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Active</p>
              <h3 className="text-2xl font-bold text-gray-900">{lecturers.filter(l => l.isActive).length}</h3>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-orange-100 text-orange-600">
              <Clock className="h-6 w-6" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Adjunct</p>
              <h3 className="text-2xl font-bold text-gray-900">{lecturers.filter(l => l.lecturer.isAdjunct).length}</h3>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="flex items-center space-x-2 bg-white p-4 rounded-lg shadow-sm border border-gray-100">
        <Search className="h-5 w-5 text-gray-400" />
        <Input 
          placeholder="Search by name, email, or ID..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="border-none focus-visible:ring-0"
        />
      </div>

      {/* Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lecturer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Info</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Workload</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredLecturers.map((lecturer) => (
                <tr key={lecturer.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                        {lecturer.user.firstName[0]}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {lecturer.user.firstName} {lecturer.user.lastName}
                        </div>
                        <div className="text-sm text-gray-500">{lecturer.user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{lecturer.lecturer.department || 'No Dept'}</div>
                    <div className="text-xs text-gray-500">{lecturer.lecturer.rank || 'No Rank'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                     <div className="flex flex-col gap-1">
                        <Badge variant={lecturer.isActive ? "default" : "destructive"} className="w-fit">
                            {lecturer.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                        {lecturer.lecturer.isAdjunct && (
                            <Badge variant="outline" className="w-fit border-orange-200 text-orange-700 bg-orange-50">
                                Adjunct
                            </Badge>
                        )}
                     </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{lecturer.lecturer.scheduleCount} Schedules</div>
                    {lecturer.lecturer.overloadCount > 0 && (
                         <div className="flex items-center text-xs text-orange-600 mt-1">
                             <AlertTriangle className="h-3 w-3 mr-1" />
                             {lecturer.lecturer.overloadCount} Overload
                         </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                        <Button variant="ghost" size="sm" onClick={() => handleSwitchUser(lecturer)} title="Switch User">
                            <ArrowRightLeft className="h-4 w-4 text-blue-600" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEditModal(lecturer)}>
                            <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className={lecturer.isActive ? "text-red-600" : "text-green-600"}
                            onClick={() => handleToggleStatus(lecturer)}
                        >
                            {lecturer.isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                        </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Lecturer Modal */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Lecturer</DialogTitle>
            <DialogDescription>
              Create a new lecturer account. They will receive an email to set their password.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {formError && (
              <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
                {formError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input id="firstName" value={formData.firstName} onChange={(e) => setFormData({...formData, firstName: e.target.value})} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input id="lastName" value={formData.lastName} onChange={(e) => setFormData({...formData, lastName: e.target.value})} />
                </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Initial Password</Label>
              <Input id="password" type="password" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="employeeId">Employee ID</Label>
                    <Input id="employeeId" value={formData.employeeId} onChange={(e) => setFormData({...formData, employeeId: e.target.value})} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="department">Department</Label>
                    <Input id="department" value={formData.department} onChange={(e) => setFormData({...formData, department: e.target.value})} />
                </div>
            </div>
             <div className="space-y-2">
                <Label htmlFor="rank">Rank</Label>
                <Input id="rank" value={formData.rank} onChange={(e) => setFormData({...formData, rank: e.target.value})} />
            </div>
            <div className="flex items-center space-x-2">
              <Switch 
                id="isAdjunct" 
                checked={formData.isAdjunct} 
                onCheckedChange={(checked) => setFormData({...formData, isAdjunct: checked})} 
              />
              <Label htmlFor="isAdjunct">Is Adjunct (Part-time)</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch 
                id="isOverload" 
                checked={formData.isOverload} 
                onCheckedChange={(checked) => setFormData({...formData, isOverload: checked})} 
              />
              <Label htmlFor="isOverload">Overload Status</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddLecturer}>Add Lecturer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Lecturer Modal */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Lecturer</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {formError && (
              <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
                {formError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="edit-firstName">First Name</Label>
                    <Input id="edit-firstName" value={formData.firstName} onChange={(e) => setFormData({...formData, firstName: e.target.value})} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="edit-lastName">Last Name</Label>
                    <Input id="edit-lastName" value={formData.lastName} onChange={(e) => setFormData({...formData, lastName: e.target.value})} />
                </div>
            </div>
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="edit-employeeId">Employee ID</Label>
                    <Input id="edit-employeeId" value={formData.employeeId} onChange={(e) => setFormData({...formData, employeeId: e.target.value})} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="edit-department">Department</Label>
                    <Input id="edit-department" value={formData.department} onChange={(e) => setFormData({...formData, department: e.target.value})} />
                </div>
            </div>
             <div className="space-y-2">
                <Label htmlFor="edit-rank">Rank</Label>
                <Input id="edit-rank" value={formData.rank} onChange={(e) => setFormData({...formData, rank: e.target.value})} />
            </div>
            <div className="flex items-center space-x-2">
                <Switch 
                  id="edit-isAdjunct" 
                  checked={formData.isAdjunct} 
                  onCheckedChange={(checked) => setFormData({...formData, isAdjunct: checked})} 
                />
                <Label htmlFor="edit-isAdjunct">Is Adjunct (Part-time)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch 
                  id="edit-isOverload" 
                  checked={formData.isOverload} 
                  onCheckedChange={(checked) => setFormData({...formData, isOverload: checked})} 
                />
                <Label htmlFor="edit-isOverload">Overload Status</Label>
              </div>
             <div className="flex items-center space-x-2">
              <Switch 
                id="edit-isActive" 
                checked={formData.isActive} 
                onCheckedChange={(checked) => setFormData({...formData, isActive: checked})} 
              />
              <Label htmlFor="edit-isActive">Account Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEditLecturer}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
