import { neon } from '@neondatabase/serverless';

// Shared connection helper for every api/*.js route. Throws instead of
// returning a response directly, since each route's own error shape
// (res.status(500).json(...)) stays with the caller.
export function getSql() {
  if (!process.env.DNP_DATABASE_URL) {
    throw new Error('DNP_DATABASE_URL is not configured.');
  }
  return neon(process.env.DNP_DATABASE_URL);
}
