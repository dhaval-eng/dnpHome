import { neon } from '@neondatabase/serverless';

const MAX_NAME_LENGTH = 100;
const MAX_MESSAGE_LENGTH = 500;

async function ensureTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      message TEXT NOT NULL,
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
    const { post_id } = req.query;

    if (!post_id) {
      return res.status(400).json({ error: 'post_id is required' });
    }

    const rows = await sql`
      SELECT id, post_id, name, message, created_at
      FROM comments
      WHERE post_id = ${post_id}
      ORDER BY created_at ASC, id ASC
    `;
    return res.status(200).json(rows);
  }

  if (req.method === 'POST') {
    const { post_id, name, message } = req.body || {};
    const trimmedName = (name || '').trim();
    const trimmedMessage = (message || '').trim();

    if (!post_id || !trimmedName || !trimmedMessage) {
      return res.status(400).json({ error: 'post_id, name, and message are required' });
    }
    if (trimmedName.length > MAX_NAME_LENGTH) {
      return res.status(400).json({ error: `Name must be ${MAX_NAME_LENGTH} characters or fewer` });
    }
    if (trimmedMessage.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: `Comment must be ${MAX_MESSAGE_LENGTH} characters or fewer` });
    }

    const rows = await sql`
      INSERT INTO comments (post_id, name, message)
      VALUES (${post_id}, ${trimmedName}, ${trimmedMessage})
      RETURNING id, post_id, name, message, created_at
    `;
    return res.status(201).json(rows[0]);
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).end('Method Not Allowed');
}
