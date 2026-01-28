
// @ts-nocheck
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- Inspecting Database ---');

  // 1. Check Users and Roles
  const users = await prisma.user.findMany({
    select: { id: true, email: true, role: true, firstName: true, lastName: true }
  });
  console.log(`\nTotal Users: ${users.length}`);
  users.forEach(u => console.log(` - ${u.email} (${u.role})`));

  // 2. Check Lecturers
  const lecturers = await prisma.lecturer.findMany({
    include: { user: { select: { email: true } } }
  });
  console.log(`\nTotal Lecturers: ${lecturers.length}`);
  lecturers.forEach(l => console.log(` - ID: ${l.id}, User: ${l.user.email}`));

  // 3. Check Attendance Records (Pending Verification)
  const pendingAttendance = await prisma.attendanceRecord.findMany({
    where: { supervisorVerified: null },
    include: {
      lecturer: { include: { user: true } },
      courseSchedule: { include: { course: true, classGroup: true } }
    }
  });
  console.log(`\nPending Verification Attendance Records: ${pendingAttendance.length}`);
  pendingAttendance.forEach(a => {
    console.log(` - ID: ${a.id}, Lecturer: ${a.lecturer.user.email}, Course: ${a.courseSchedule.course.courseCode}, Verified: ${a.supervisorVerified}`);
  });

  // 4. Check All Attendance Records
  const allAttendance = await prisma.attendanceRecord.count();
  console.log(`\nTotal Attendance Records: ${allAttendance}`);

  // 5. Check Class Groups
  const classGroups = await prisma.classGroup.findMany();
  console.log(`\nTotal Class Groups: ${classGroups.length}`);

  // 5. Check Course Schedules for Today (UTC)
  const today = new Date();
  const dayOfWeek = today.getUTCDay();
  console.log(`\nChecking Schedules for UTC Day: ${dayOfWeek} (Today is ${today.toISOString()})`);
  
  const schedulesToday = await prisma.courseSchedule.findMany({
    where: { dayOfWeek: dayOfWeek },
    include: { course: true, classGroup: true, lecturer: true }
  });
  
  console.log(`Found ${schedulesToday.length} schedules for today (UTC):`);
  schedulesToday.forEach(s => {
    console.log(` - [${s.id}] ${s.course.courseCode}: ${s.startTime}-${s.endTime} (${s.sessionType}) | Lecturer: ${s.lecturer.employeeId}`);
  });

  // 6. Check Course Schedules (All)
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
