
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { verifyVirtualClassroom } from '@/lib/virtual-verification'

// Mock dependencies
jest.mock('next-auth/next')
jest.mock('@/lib/virtual-verification')
jest.mock('@/lib/auth-config', () => ({
  authOptions: {}
}))

// Create mocks for the prisma methods we need
const findFirstLecturer = jest.fn()
const findFirstSchedule = jest.fn()
const findFirstRecord = jest.fn()
const createRecord = jest.fn()
const createAuditLog = jest.fn()

// Mock the db module
jest.mock('@/lib/db', () => ({
  prisma: {
    lecturer: {
      findFirst: (...args: any[]) => findFirstLecturer(...args),
    },
    courseSchedule: {
      findFirst: (...args: any[]) => findFirstSchedule(...args),
    },
    attendanceRecord: {
      findFirst: (...args: any[]) => findFirstRecord(...args),
      create: (...args: any[]) => createRecord(...args),
    },
    auditLog: {
      create: (...args: any[]) => createAuditLog(...args),
    },
  }
}))

// Import POST after mocking
import { POST } from '../route'

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockVerifyVirtualClassroom = verifyVirtualClassroom as jest.MockedFunction<typeof verifyVirtualClassroom>

describe('/api/attendance/take - Virtual Session', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should successfully start virtual session without recording student data', async () => {
    // Mock session
    mockGetServerSession.mockResolvedValue({
      user: {
        id: 'user-123',
        email: 'lecturer@upsa.edu.gh',
        role: 'LECTURER',
      }
    } as any)

    // Mock lecturer
    findFirstLecturer.mockResolvedValue({
      id: 'lecturer-123',
      userId: 'user-123',
    } as any)

    // Mock schedule
    findFirstSchedule.mockResolvedValue({
      id: 'schedule-123',
      lecturerId: 'lecturer-123',
      startTime: new Date(),
      endTime: new Date(),
      classroom: {
        virtualLink: 'https://meet.google.com/abc-defg-hij'
      },
      course: { title: 'Test Course' },
      classGroup: { name: 'Group A' }
    } as any)

    // Mock virtual verification
    mockVerifyVirtualClassroom.mockResolvedValue({
      verified: true,
      timeWindowVerified: true,
      meetingLinkVerified: true,
      errors: []
    })

    // Mock no existing record
    findFirstRecord.mockResolvedValue(null)

    // Mock create
    createRecord.mockResolvedValue({
      id: 'record-123',
      timestamp: new Date(),
      method: 'virtual'
    } as any)

    // Create request
    const request = new NextRequest('http://localhost:3000/api/attendance/take', {
      method: 'POST',
      body: JSON.stringify({
        scheduleId: 'schedule-123',
        method: 'virtual',
        action: 'start'
      })
    })

    // Execute
    const response = await POST(request)
    const data = await response.json()

    // Assertions
    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    
    // CRITICAL: Verify create call arguments do NOT contain student data
    expect(createRecord).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        lecturerId: 'lecturer-123',
        courseScheduleId: 'schedule-123',
        method: 'virtual',
        // Ensure these fields are NOT present or are null (depending on schema, but definitely not populated with student IDs)
        // Since we can't check for "not present" easily with objectContaining, we check the exact structure of relevant fields
        sessionDurationMet: false,
        locationVerified: false
      })
    }))

    // Verify specifically that no "students" or "studentAttendance" field is passed
    const createCallArgs = createRecord.mock.calls[0][0];
    // @ts-ignore
    expect(createCallArgs.data).not.toHaveProperty('students');
    // @ts-ignore
    expect(createCallArgs.data).not.toHaveProperty('studentAttendanceData');
  })
})
