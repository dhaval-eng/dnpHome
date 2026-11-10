import { getSql } from '../lib/db.js';
import { isAuthed } from '../lib/session.js';

async function ensureTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS page_visits (
      id SERIAL PRIMARY KEY,
      path TEXT,
      referrer TEXT,
      ip TEXT,
      user_agent TEXT,
      country TEXT,
      city TEXT,
      authenticated BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

// Vercel sets x-forwarded-for to "client, proxy1, proxy2, ..." — the first
// entry is the visitor's own address.
function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers['x-real-ip'] || null;
}

export default async function handler(req, res, sql) {
  if (!sql) {
    try {
      sql = getSql();
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  await ensureTable(sql);

  if (req.method === 'POST') {
    const { path, referrer } = req.body || {};
    const authed = await isAuthed(req.headers.cookie);

    await sql`
      INSERT INTO page_visits (path, referrer, ip, user_agent, country, city, authenticated)
      VALUES (
        ${path || null},
        ${referrer || null},
        ${clientIp(req)},
        ${req.headers['user-agent'] || null},
        ${req.headers['x-vercel-ip-country'] || null},
        ${req.headers['x-vercel-ip-city'] ? decodeURIComponent(req.headers['x-vercel-ip-city']) : null},
        ${authed}
      )
    `;
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT id, path, referrer, ip, user_agent, country, city, authenticated, created_at
      FROM page_visits
      ORDER BY created_at DESC
      LIMIT 500
    `;
    return res.status(200).json(rows);
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).end('Method Not Allowed');
}
