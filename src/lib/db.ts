import { PrismaClient } from '@prisma/client'
import { Pool, neonConfig } from '@neondatabase/serverless'
import { PrismaNeon } from '@prisma/adapter-neon'
import ws from 'ws'

// Configure Neon for WebSocket and HTTP Fetch support (bypasses port 5432 blocking)
neonConfig.webSocketConstructor = ws
neonConfig.poolQueryViaFetch = true

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  // In production/Next.js, this should be set. 
  // If running isolated scripts without dotenv, this might fail.
  console.warn('DB_INIT: DATABASE_URL is not set in environment variables.')
}

// Extract config for Env Vars fallback (Required for PrismaNeon to work reliably with Pool in some environments)
if (connectionString) {
  try {
    const url = new URL(connectionString);
    // Only set if not already set, or overwrite? Overwrite to ensure consistency with connectionString.
    process.env.PGHOST = url.hostname;
    process.env.PGUSER = url.username;
    process.env.PGPASSWORD = url.password;
    process.env.PGDATABASE = url.pathname.slice(1);
    process.env.PGSSLMODE = 'require';
  } catch (e) {
    console.error('DB_INIT: Failed to parse DATABASE_URL for env vars', e);
  }
}

// Use connectionString if available, otherwise Pool might fail or rely on env vars we just set
const pool = new Pool({ connectionString: connectionString || undefined })
const adapter = new PrismaNeon(pool as any)

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
