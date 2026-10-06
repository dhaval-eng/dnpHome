import { neon } from '@neondatabase/serverless';

async function ensureTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS quotes (
      id SERIAL PRIMARY KEY,
      text TEXT NOT NULL,
      author TEXT,
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
      SELECT id, text, author, created_at
      FROM quotes
      ORDER BY created_at DESC, id DESC
    `;
    return res.status(200).json(rows);
  }

  if (req.method === 'POST') {
    const { text, author } = req.body || {};
    const trimmedText = (text || '').trim();
    const trimmedAuthor = (author || '').trim();

    if (!trimmedText) {
      return res.status(400).json({ error: 'text is required' });
    }

    const rows = await sql`
      INSERT INTO quotes (text, author)
      VALUES (${trimmedText}, ${trimmedAuthor || null})
      RETURNING id, text, author, created_at
    `;
    return res.status(201).json(rows[0]);
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).end('Method Not Allowed');
}
