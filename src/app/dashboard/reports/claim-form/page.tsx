'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { format, startOfMonth, endOfMonth } from 'date-fns'

interface Lecturer {
  id: string
  user: {
    firstName: string
    lastName: string
    email: string
  }
  lecturer?: {
    isAdjunct: boolean
    overloadCount: number
  }
}

interface ClaimRecord {
  id: string
  week: string
  date: string
  startTime: string
  endTime: string
  hours: number
  status: string
}

interface CourseClaim {
  courseTitle: string
  courseCode: string
  level: string
  records: ClaimRecord[]
  totalHours: number
}

interface ClaimData {
  lecturer: {
    name: string
    department: string
    faculty: string
  }
  claims: CourseClaim[]
}

export default function ClaimFormPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [lecturers, setLecturers] = useState<Lecturer[]>([])
  const [selectedLecturer, setSelectedLecturer] = useState<string>('')
  const [startDate, setStartDate] = useState<string>(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState<string>(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [claimData, setClaimData] = useState<ClaimData | null>(null)
  const [loading, setLoading] = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)
  const logoUrl = 'https://upsa.edu.gh/wp-content/uploads/2022/07/cropped-UPSA-Logo-1.png'

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
    }
  }, [status, router])

  useEffect(() => {
    if (session?.user?.role === 'ADMIN' || session?.user?.role === 'COORDINATOR') {
      fetchLecturers()
    } else if (session?.user?.role === 'LECTURER') {
       fetchLecturerProfile()
    }
  }, [session])

  const fetchLecturers = async () => {
    try {
      const response = await fetch('/api/lecturers')
      if (response.ok) {
        const data = await response.json()
        setLecturers(data)
      }
    } catch (error) {
      console.error('Error fetching lecturers:', error)
    }
  }

  const fetchLecturerProfile = async () => {
      try {
          const response = await fetch('/api/lecturers')
          if (response.ok) {
              const data = await response.json()
              const me = data.find((l: any) => l.user.email === session?.user?.email)
              if (me) {
                  setSelectedLecturer(me.id)
              }
          }
      } catch (error) {
          console.error('Error fetching profile', error)
      }
  }

  const generateReport = async () => {
    if (!selectedLecturer || !startDate || !endDate) return

    setLoading(true)
    try {
      const data = await fetchClaimData(selectedLecturer, startDate, endDate)
      if (data) {
        setClaimData(data)
      }
    } finally {
      setLoading(false)
    }
  }

  const fetchClaimData = async (lecturerId: string, start: string, end: string): Promise<ClaimData | null> => {
    try {
      const params = new URLSearchParams({
        lecturerId: lecturerId,
        startDate: start,
        endDate: end
      })
      const response = await fetch(`/api/reports/claim-form?${params}`)
      if (response.ok) {
        return await response.json()
      } else {
        console.error(`Failed to fetch report data for lecturer ${lecturerId}`)
        return null
      }
    } catch (error) {
      console.error('Error generating report:', error)
      return null
    }
  }

  const loadLogoImage = async (): Promise<HTMLImageElement | null> => {
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'Anonymous'
        img.src = logoUrl
        img.onload = () => resolve(img)
        img.onerror = reject
      })
    } catch (error) {
      console.warn('Failed to load logo image', error)
      return null
    }
  }

  const generatePDFDoc = async (data: ClaimData, reportStartDate: string, logoImg: HTMLImageElement | null) => {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()

    data.claims.forEach((courseClaim, index) => {
      if (index > 0) {
        doc.addPage()
      }

      // Logo
      if (logoImg) {
        const imgWidth = 25
        const imgHeight = 25
        const x = (doc.internal.pageSize.width - imgWidth) / 2
        doc.addImage(logoImg, 'PNG', x, 10, imgWidth, imgHeight)
      }

      // Header
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text('UNIVERSITY OF PROFESSIONAL STUDIES ACCRA (UPSA)', 105, 40, { align: 'center' })
      doc.setFontSize(12)
      doc.text('SCHOOL OF GRADUATE STUDIES', 105, 47, { align: 'center' })
      doc.text('PART – TIME/ FULL TIME LECTURERS CLAIM FORM', 105, 54, { align: 'center' })
      doc.setLineWidth(0.5)
      doc.line(65, 55, 145, 55) // Underline for title

      // Info Section
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      
      // Lecturer & Faculty
      doc.text(data.lecturer.name.toUpperCase(), 14, 65)
      doc.text(`FACULTY: ${data.lecturer.department}`, 196, 65, { align: 'right' })
      
      // Course & Level
      doc.text(`COURSE: ${courseClaim.courseTitle}`, 14, 73)
      doc.text(courseClaim.level, 196, 73, { align: 'right' })

      // Month
      const monthYear = format(new Date(reportStartDate), 'MMMM, yyyy').toUpperCase()
      doc.text(`MONTH: ${monthYear}`, 105, 80, { align: 'center' })

      doc.setLineWidth(0.2)
      doc.line(14, 83, 196, 83) // Separator line

      // Table Data Preparation
      const tableBody = courseClaim.records.map((record, i) => [
        i + 1,
        record.week,
        record.date,
        `${record.startTime}-${record.endTime}`,
        record.hours,
        record.status
      ])

      // Add Footer Row for Total
      tableBody.push(['', '', '', 'TOTAL HOURS', courseClaim.totalHours, ''])

      // Generate Table
      autoTable(doc, {
        startY: 87,
        head: [['NO.', 'WEEK', 'DAY', 'PERIOD(TIME)', 'HOURS', 'STATUS/ REMARKS']],
        body: tableBody,
        theme: 'plain',
        styles: {
          fontSize: 9,
          cellPadding: 3,
          lineColor: [0, 0, 0],
          lineWidth: 0.1,
          font: 'helvetica'
        },
        headStyles: {
          fillColor: [240, 240, 240],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
          halign: 'center'
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 15 },
          1: { halign: 'center', cellWidth: 20 },
          2: { halign: 'center', cellWidth: 25 },
          3: { halign: 'center', cellWidth: 35 },
          4: { halign: 'center', cellWidth: 20 },
          5: { halign: 'left' }
        },
        didParseCell: function(data) {
             // Bold the Total row
             if (data.row.index === tableBody.length - 1) {
                 data.cell.styles.fontStyle = 'bold';
                 if (data.column.index === 3) {
                     data.cell.styles.halign = 'right';
                 }
             }
        }
      })

      // Signatures
      const finalY = (doc as any).lastAutoTable.finalY + 20
      
      const drawSignatureLine = (label: string, value: string | null, y: number) => {
        doc.text(label, 14, y)
        if (value) {
            doc.text(value, 80, y)
        } else {
            doc.setLineDash([1, 1], 0)
            doc.line(80, y, 196, y)
            doc.setLineDash([], 0)
        }
      }

      drawSignatureLine('Name of Receiving Officer:', 'Mr. Thomas Asante', finalY)
      drawSignatureLine('Signature of Receiving Officer:', null, finalY + 15)
      drawSignatureLine('Date Received:', format(new Date(), 'dd/MM/yyyy'), finalY + 30)
    })

    return doc
  }

  const handleDownloadPDF = async () => {
    if (!claimData) return
    const logoImg = await loadLogoImage()
    const doc = await generatePDFDoc(claimData, startDate, logoImg)
    const fileName = `claim_form_${claimData.lecturer.name.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`
    doc.save(fileName)
  }

  const handleBulkCompile = async () => {
    if (!lecturers.length || !startDate || !endDate) return
    
    setBulkLoading(true)
    try {
      const { default: JSZip } = await import('jszip')
      const { default: FileSaver } = await import('file-saver')
      const saveAs = FileSaver.saveAs || FileSaver

      // Filter lecturers: Adjunct OR Overload Status OR Overload Count > 0
      const targetLecturers = lecturers.filter(l => 
        (l.lecturer?.isAdjunct) || (l.lecturer?.isOverload) || (l.lecturer?.overloadCount && l.lecturer.overloadCount > 0)
      )

      if (targetLecturers.length === 0) {
        alert('No lecturers found with Overload or Adjunct status.')
        setBulkLoading(false)
        return
      }

      const zip = new JSZip()
      const logoImg = await loadLogoImage()
      let count = 0

      for (const lecturer of targetLecturers) {
        const data = await fetchClaimData(lecturer.id, startDate, endDate)
        if (data && data.claims.length > 0) {
          const doc = await generatePDFDoc(data, startDate, logoImg)
          const fileName = `claim_form_${data.lecturer.name.replace(/\s+/g, '_')}.pdf`
          const pdfBlob = doc.output('blob')
          zip.file(fileName, pdfBlob)
          count++
        }
      }

      if (count === 0) {
        alert('No claim forms generated (no data found for selected lecturers).')
        return
      }

      const content = await zip.generateAsync({ type: 'blob' })
      saveAs(content, `bulk_claims_${format(new Date(), 'yyyyMMdd')}.zip`)
      alert(`Successfully compiled ${count} claim forms.`)

    } catch (error) {
      console.error('Error compiling bulk claims:', error)
      alert('An error occurred while compiling claims.')
    } finally {
      setBulkLoading(false)
    }
  }

  if (status === 'loading') {
    return <div className="p-8 text-center">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      {/* Controls - Hidden when printing */}
      <div className="print:hidden max-w-5xl mx-auto bg-white p-6 rounded-lg shadow-sm mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Lecturer Claim Form Generator</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          {(session?.user?.role === 'ADMIN' || session?.user?.role === 'COORDINATOR') && (
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Lecturer</label>
              <select
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                value={selectedLecturer}
                onChange={(e) => setSelectedLecturer(e.target.value)}
              >
                <option value="">Select Lecturer</option>
                {lecturers.map((lecturer) => (
                  <option key={lecturer.id} value={lecturer.id}>
                    {lecturer.user.firstName} {lecturer.user.lastName}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              type="date"
              className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input
              type="date"
              className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div className="md:col-span-1 flex space-x-2">
            <button
              onClick={generateReport}
              disabled={loading || !selectedLecturer}
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Generating...' : 'Generate'}
            </button>
            <button
              onClick={handleDownloadPDF}
              disabled={!claimData}
              className="bg-gray-800 text-white px-4 py-2 rounded-md hover:bg-gray-900 disabled:opacity-50 flex items-center gap-2"
              title="Download PDF"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
        
        {(session?.user?.role === 'ADMIN' || session?.user?.role === 'COORDINATOR') && (
            <div className="mt-4 pt-4 border-t border-gray-200 flex justify-end">
                <button
                    onClick={handleBulkCompile}
                    disabled={bulkLoading}
                    className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                >
                    {bulkLoading ? (
                        <>
                            <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                            Compiling...
                        </>
                    ) : (
                        <>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                            </svg>
                            Compile All Overload/Adjunct Claims
                        </>
                    )}
                </button>
            </div>
        )}

        {(session?.user?.role === 'ADMIN' || session?.user?.role === 'COORDINATOR') && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Bulk Operations</h3>
            <div className="flex items-center gap-4">
              <button
                onClick={handleBulkCompile}
                disabled={bulkLoading || !startDate || !endDate}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
              >
                {bulkLoading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Compiling...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                    </svg>
                    Compile All Adjunct/Overload Claims
                  </>
                )}
              </button>
              <span className="text-xs text-gray-500">
                Generates a ZIP file containing claim forms for all Adjunct lecturers and those with Overload courses for the selected period.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Report Preview */}
      {claimData && (
        <div className="max-w-[210mm] mx-auto bg-white p-[10mm] shadow-lg mb-8">
          {claimData.claims.length > 0 ? (
            claimData.claims.map((courseClaim, index) => (
              <div key={index} className={index < claimData.claims.length - 1 ? 'mb-16 border-b-4 border-gray-100 pb-16' : ''}>
                <div className="text-center font-bold mb-6 space-y-1">
                  <div className="flex justify-center mb-4">
                    <img 
                      src={logoUrl} 
                      alt="UPSA Logo" 
                      className="h-20 w-auto object-contain"
                    />
                  </div>
                  <div className="text-xl">UNIVERSITY OF PROFESSIONAL STUDIES ACCRA (UPSA)</div>
                  <div className="text-lg">SCHOOL OF GRADUATE STUDIES</div>
                  <div className="text-lg underline decoration-1 underline-offset-4">PART – TIME/ FULL TIME LECTURERS CLAIM FORM</div>
                </div>

                <div className="flex flex-col gap-2 font-bold mb-6 uppercase">
                  <div className="flex justify-between">
                    <div>{claimData.lecturer.name}</div>
                    <div>FACULTY: {claimData.lecturer.department}</div>
                  </div>
                  <div className="flex justify-between border-t border-gray-300 pt-2 mt-2">
                    <div>COURSE: {courseClaim.courseTitle}</div>
                    <div>{courseClaim.level}</div>
                  </div>
                  <div className="text-center mt-2 border-b border-gray-300 pb-2">
                    MONTH: {format(new Date(startDate), 'MMMM, yyyy').toUpperCase()}
                  </div>
                </div>

                <table className="w-full border-collapse border border-black mb-8 text-sm">
                  <thead>
                    <tr className="bg-gray-100 print:bg-transparent">
                      <th className="border border-black p-2 w-12">NO.</th>
                      <th className="border border-black p-2 w-20">WEEK</th>
                      <th className="border border-black p-2 w-24">DAY</th>
                      <th className="border border-black p-2 w-32">PERIOD(TIME)</th>
                      <th className="border border-black p-2 w-16">HOURS</th>
                      <th className="border border-black p-2 w-24">STATUS/ REMARKS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courseClaim.records.map((record, rIndex) => (
                      <tr key={record.id} className="text-center">
                        <td className="border border-black p-2">{rIndex + 1}</td>
                        <td className="border border-black p-2">{record.week}</td>
                        <td className="border border-black p-2">{record.date}</td>
                        <td className="border border-black p-2 text-xs">{record.startTime}-{record.endTime}</td>
                        <td className="border border-black p-2">{record.hours}</td>
                        <td className="border border-black p-2">{record.status}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold">
                      <td colSpan={4} className="border border-black p-2 text-right">TOTAL HOURS</td>
                      <td className="border border-black p-2 text-center">{courseClaim.totalHours}</td>
                      <td className="border border-black p-2"></td>
                    </tr>
                  </tfoot>
                </table>

                <div className="mt-12 space-y-6 text-sm font-medium">
                  <div className="flex items-end">
                    <span className="w-48">Name of Receiving Officer:</span>
                    <div className="flex-1 border-b border-black border-dotted h-6 flex items-end px-2">Mr. Thomas Asante</div>
                  </div>
                  <div className="flex items-end">
                    <span className="w-48">Signature of Receiving Officer:</span>
                    <div className="flex-1 border-b border-black border-dotted h-6"></div>
                  </div>
                  <div className="flex items-end">
                    <span className="w-48">Date Received:</span>
                    <div className="flex-1 border-b border-black border-dotted h-6 flex items-end px-2">{format(new Date(), 'dd/MM/yyyy')}</div>
                  </div>
                </div>
              </div>
            ))
          ) : (
             <div className="text-center p-8 text-gray-500">
                No attendance records found for this period.
             </div>
          )}
        </div>
      )}
    </div>
  )
}
