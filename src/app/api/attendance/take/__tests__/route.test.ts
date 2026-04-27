import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { verifyLocationForAttendance } from '@/lib/geolocation'

jest.mock('next-auth/next')
jest.mock('@/lib/geolocation')
jest.mock('@/lib/auth-config', () => ({
  authOptions: {}
}))
jest.mock('@/lib/virtual-verification', () => ({
  verifyVirtualClassroom: jest.fn(),
  generateDeviceFingerprint: jest.fn(() => 'device-fingerprint'),
  getClientIpAddress: jest.fn(() => '127.0.0.1')
}))

const findFirstLecturer = jest.fn()
const findFirstSchedule = jest.fn()
const findFirstRecord = jest.fn()
const createRecord = jest.fn()
const createAuditLog = jest.fn()

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
      update: jest.fn(),
    },
    auditLog: {
      create: (...args: any[]) => createAuditLog(...args),
    },
  }
}))

import { POST } from '../route'

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockVerifyLocationForAttendance = verifyLocationForAttendance as jest.MockedFunction<typeof verifyLocationForAttendance>

const onsiteRequestBody = {
  scheduleId: 'schedule-123',
  latitude: 5.6037,
  longitude: -0.187,
  method: 'onsite' as const,
  remarks: 'On campus'
}

const lecturer = {
  id: 'lecturer-123',
  userId: 'user-123',
}

const schedule = {
  id: 'schedule-123',
  lecturerId: 'lecturer-123',
  startTime: '09:00',
  endTime: '12:00',
  meetingLink: null,
  course: {
    title: 'Advanced Financial Accounting',
    name: 'Advanced Financial Accounting',
  },
  classGroup: {
    name: 'MBA-AF-2024-FT',
  },
  classroom: {
    virtualLink: null,
    building: {
      name: 'Main Academic Building',
    }
  }
}

describe('/api/attendance/take', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('records onsite attendance successfully', async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: 'user-123',
        role: 'LECTURER',
      }
    } as any)
    findFirstLecturer.mockResolvedValue(lecturer)
    findFirstSchedule.mockResolvedValue(schedule)
    findFirstRecord.mockResolvedValue(null)
    mockVerifyLocationForAttendance.mockReturnValue({
      verified: true,
      distance: 150,
      withinRadius: true
    } as any)
    createRecord.mockResolvedValue({
      id: 'attendance-123',
      timestamp: new Date('2026-04-27T09:30:00.000Z'),
      locationVerified: true,
      method: 'onsite',
    })
    createAuditLog.mockResolvedValue({ id: 'audit-123' })

    const request = new NextRequest('http://localhost:3000/api/attendance/take', {
      method: 'POST',
      body: JSON.stringify(onsiteRequestBody)
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.message).toBe('Attendance recorded successfully')
    expect(mockVerifyLocationForAttendance).toHaveBeenCalledWith({
      latitude: onsiteRequestBody.latitude,
      longitude: onsiteRequestBody.longitude
    })
    expect(createRecord).toHaveBeenCalledWith({
      data: expect.objectContaining({
        lecturerId: lecturer.id,
        courseScheduleId: onsiteRequestBody.scheduleId,
        gpsLatitude: onsiteRequestBody.latitude,
        gpsLongitude: onsiteRequestBody.longitude,
        locationVerified: true,
        method: 'onsite',
        remarks: onsiteRequestBody.remarks,
        sessionDurationMet: true,
      })
    })
    expect(createAuditLog).toHaveBeenCalled()
  })

  it('rejects onsite attendance outside the allowed location radius', async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: 'user-123',
        role: 'LECTURER',
      }
    } as any)
    findFirstLecturer.mockResolvedValue(lecturer)
    findFirstSchedule.mockResolvedValue(schedule)
    findFirstRecord.mockResolvedValue(null)
    mockVerifyLocationForAttendance.mockReturnValue({
      verified: false,
      distance: 500,
      withinRadius: false
    } as any)

    const request = new NextRequest('http://localhost:3000/api/attendance/take', {
      method: 'POST',
      body: JSON.stringify(onsiteRequestBody)
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Location verification failed: You are 500m away from campus (max allowed: 300m)')
    expect(createRecord).not.toHaveBeenCalled()
  })

  it('rejects attendance without authentication', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const request = new NextRequest('http://localhost:3000/api/attendance/take', {
      method: 'POST',
      body: JSON.stringify(onsiteRequestBody)
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
    expect(findFirstLecturer).not.toHaveBeenCalled()
    expect(createRecord).not.toHaveBeenCalled()
  })

  it('rejects invalid request payloads', async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: 'user-123',
        role: 'LECTURER',
      }
    } as any)

    const request = new NextRequest('http://localhost:3000/api/attendance/take', {
      method: 'POST',
      body: JSON.stringify({
        scheduleId: 'schedule-123',
        latitude: 'invalid',
        longitude: -0.187,
        method: 'onsite',
      })
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Invalid request data')
    expect(mockVerifyLocationForAttendance).not.toHaveBeenCalled()
    expect(createRecord).not.toHaveBeenCalled()
  })

  it('returns 404 when the lecturer profile is missing', async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: 'user-123',
        role: 'LECTURER',
      }
    } as any)
    findFirstLecturer.mockResolvedValue(null)

    const request = new NextRequest('http://localhost:3000/api/attendance/take', {
      method: 'POST',
      body: JSON.stringify(onsiteRequestBody)
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toBe('Lecturer not found')
    expect(findFirstSchedule).not.toHaveBeenCalled()
    expect(mockVerifyLocationForAttendance).not.toHaveBeenCalled()
  })

  it('returns 404 when the schedule is not assigned to the lecturer', async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: 'user-123',
        role: 'LECTURER',
      }
    } as any)
    findFirstLecturer.mockResolvedValue(lecturer)
    findFirstSchedule.mockResolvedValue(null)

    const request = new NextRequest('http://localhost:3000/api/attendance/take', {
      method: 'POST',
      body: JSON.stringify(onsiteRequestBody)
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toBe('Schedule not found or unauthorized')
    expect(mockVerifyLocationForAttendance).not.toHaveBeenCalled()
    expect(createRecord).not.toHaveBeenCalled()
  })
})
