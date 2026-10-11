// Shared session check for API routes that need to know whether the caller
// is authenticated, independent of middleware's path-based routing (e.g. a
// per-row "restricted" flag that middleware can't see without a DB lookup).
// Uses only Web Crypto, so it works unchanged on both the Edge runtime
// (middleware.js) and the Node runtime (serverless functions).
const COOKIE_NAME = 'site_auth';

export async function isAuthed(cookieHeader) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return false;

  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const expected = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const match = (cookieHeader || '').match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`));
  return Boolean(match && match[1] === expected);
}
