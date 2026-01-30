export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Import the scheduled reports background service to ensure it initializes
    await import('./lib/scheduled-reports-background')
  }
}
