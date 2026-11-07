import { getSql } from '../lib/db.js';

async function ensureTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS health_log (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL,
      duration_minutes INTEGER NOT NULL,
      description TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
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

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT id, date, duration_minutes, description, created_at
      FROM health_log
      ORDER BY date ASC, id ASC
    `;
    return res.status(200).json(rows);
  }

  if (req.method === 'POST') {
    const { date, duration_minutes, description } = req.body || {};
    const numericDuration = Number(duration_minutes);
    const trimmedDescription = (description || '').trim();

    if (!date || !duration_minutes || Number.isNaN(numericDuration) || numericDuration <= 0 || !trimmedDescription) {
      return res.status(400).json({ error: 'date, a positive duration in minutes, and a description are required' });
    }

    const rows = await sql`
      INSERT INTO health_log (date, duration_minutes, description)
      VALUES (${date}, ${numericDuration}, ${trimmedDescription})
      RETURNING id, date, duration_minutes, description, created_at
    `;
    return res.status(201).json(rows[0]);
  }

  if (req.method === 'PUT') {
    const { id } = req.query;
    const { date, duration_minutes, description } = req.body || {};
    const numericDuration = Number(duration_minutes);
    const trimmedDescription = (description || '').trim();

    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }
    if (!date || !duration_minutes || Number.isNaN(numericDuration) || numericDuration <= 0 || !trimmedDescription) {
      return res.status(400).json({ error: 'date, a positive duration in minutes, and a description are required' });
    }

    const rows = await sql`
      UPDATE health_log
      SET date = ${date}, duration_minutes = ${numericDuration}, description = ${trimmedDescription}
      WHERE id = ${id}
      RETURNING id, date, duration_minutes, description, created_at
    `;

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }
    return res.status(200).json(rows[0]);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }
    await sql`DELETE FROM health_log WHERE id = ${id}`;
    return res.status(204).end();
  }

  res.setHeader('Allow', 'GET, POST, PUT, DELETE');
  return res.status(405).end('Method Not Allowed');
}
