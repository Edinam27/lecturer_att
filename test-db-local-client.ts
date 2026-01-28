import 'dotenv/config';
import { PrismaClient } from '@prisma/client'
import { Client, neonConfig } from '@neondatabase/serverless'
import { PrismaNeon } from '@prisma/adapter-neon'
import ws from 'ws'

neonConfig.webSocketConstructor = ws

const connectionString = 'postgresql://neondb_owner:npg_mBpKQ7uC1DWl@ep-lingering-poetry-ad2nvxar-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&connect_timeout=60'

async function main() {
  console.log('Testing LOCAL Prisma instantiation with SINGLE CLIENT...');
  
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log('✅ Client connected successfully!');
  } catch (err) {
    console.error('❌ Client connection failed:', err);
    return;
  }

  const adapter = new PrismaNeon(client);
  const prisma = new PrismaClient({ adapter });

  try {
    const userCount = await prisma.user.count();
    console.log(`✅ Prisma Connection Successful! Found ${userCount} users.`);
  } catch (error) {
    console.error('❌ Prisma Connection Failed:', error);
  } finally {
    await prisma.$disconnect();
    await client.end();
  }
}

main();