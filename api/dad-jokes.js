import { neon } from '@neondatabase/serverless';

async function ensureTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS dad_jokes (
      id SERIAL PRIMARY KEY,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

export default async function handler(req, res) {
  if (!process.env.DNP_DATABASE_URL) {
    return res.status(500).json({ error: 'DNP_DATABASE_URL is not configured.' });
  }

  const sql = neon(process.env.DNP_DATABASE_URL);
  await ensureTable(sql);

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT id, text, created_at
      FROM dad_jokes
      ORDER BY created_at DESC, id DESC
    `;
    return res.status(200).json(rows);
  }

  if (req.method === 'POST') {
    const { text } = req.body || {};
    const trimmedText = (text || '').trim();

    if (!trimmedText) {
      return res.status(400).json({ error: 'text is required' });
    }

    const rows = await sql`
      INSERT INTO dad_jokes (text)
      VALUES (${trimmedText})
      RETURNING id, text, created_at
    `;
    return res.status(201).json(rows[0]);
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).end('Method Not Allowed');
}
