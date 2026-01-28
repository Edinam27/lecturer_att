import 'dotenv/config';
// Dynamic import to ensure env vars are loaded first
async function main() {
  console.log('Testing Data Fetching...');
  
  const { prisma } = await import('./src/lib/db');

  try {
    console.log('--- Courses ---');
    const courses = await prisma.course.findMany({ take: 5 });
    console.log(`Found ${courses.length} courses.`);
    if (courses.length > 0) console.log('Sample:', courses[0].title);

    console.log('\n--- Programmes ---');
    const programmes = await prisma.programme.findMany({ take: 5 });
    console.log(`Found ${programmes.length} programmes.`);
    if (programmes.length > 0) console.log('Sample:', programmes[0].name);

    console.log('\n--- Attendance Records ---');
    const attendance = await prisma.attendanceRecord.findMany({ take: 5 });
    console.log(`Found ${attendance.length} attendance records.`);
    
    console.log('\n--- Users ---');
    const users = await prisma.user.findMany({ take: 5 });
    console.log(`Found ${users.length} users.`);

  } catch (error) {
    console.error('❌ Data Fetch Failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();