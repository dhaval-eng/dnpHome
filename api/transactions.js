import { neon } from '@neondatabase/serverless';

async function ensureTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      amount NUMERIC(10,2) NOT NULL,
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
      SELECT id, date, category, description, amount
      FROM transactions
      ORDER BY date DESC, id DESC
    `;
    return res.status(200).json(rows);
  }

  if (req.method === 'POST') {
    const { date, category, description, amount } = req.body || {};
    const numericAmount = Number(amount);

    if (!date || !category || !amount || Number.isNaN(numericAmount)) {
      return res.status(400).json({ error: 'date, category, and a numeric amount are required' });
    }

    const rows = await sql`
      INSERT INTO transactions (date, category, description, amount)
      VALUES (${date}, ${category}, ${description || null}, ${numericAmount})
      RETURNING id, date, category, description, amount
    `;
    return res.status(201).json(rows[0]);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }
    await sql`DELETE FROM transactions WHERE id = ${id}`;
    return res.status(204).end();
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).end('Method Not Allowed');
}
