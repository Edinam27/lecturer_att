import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  // In production/Next.js, this should be set. 
  // If running isolated scripts without dotenv, this might fail.
  console.warn('DB_INIT: DATABASE_URL is not set in environment variables.')
}

// Extract config for Env Vars fallback if needed
if (connectionString) {
  try {
    const url = new URL(connectionString);
    process.env.PGHOST = url.hostname;
    process.env.PGUSER = url.username;
  } catch (e) {
    console.error('DB_INIT: Failed to parse DATABASE_URL for env vars', e);
  }
}

const pool = new Pool({ 
  connectionString: connectionString || undefined,
  max: 20, // Increased pool size
  connectionTimeoutMillis: 30000, // 30s timeout
  idleTimeoutMillis: 60000, // 60s idle timeout
  allowExitOnIdle: false // Keep connections alive
})

// Add error handler to prevent crashing on idle connection issues
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err)
})

const adapter = new PrismaPg(pool)

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
