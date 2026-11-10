import { getSql } from '../lib/db.js';

const MEAL_FIELDS = ['breakfast', 'lunch', 'dinner'];

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
  await sql`ALTER TABLE health_log ADD COLUMN IF NOT EXISTS breakfast TEXT`;
  await sql`ALTER TABLE health_log ADD COLUMN IF NOT EXISTS lunch TEXT`;
  await sql`ALTER TABLE health_log ADD COLUMN IF NOT EXISTS dinner TEXT`;
  await sql`ALTER TABLE health_log ADD COLUMN IF NOT EXISTS sleep_hours INTEGER`;
  await sql`ALTER TABLE health_log ADD COLUMN IF NOT EXISTS sleep_minutes INTEGER`;
}

// Meal fields are free text, optional, capped at 100 characters.
function normalizeMeal(value, fieldName) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (trimmed.length > 100) {
    throw new Error(`${fieldName} must be 100 characters or fewer`);
  }
  return trimmed;
}

// Sleep hours/minutes are optional whole numbers within a sane clock range.
function normalizeSleepPart(value, fieldName, max) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > max) {
    throw new Error(`${fieldName} must be a whole number between 0 and ${max}`);
  }
  return n;
}

function parseOptionalFields(body) {
  const [breakfast, lunch, dinner] = MEAL_FIELDS.map((field) => normalizeMeal(body[field], field));
  const sleep_hours = normalizeSleepPart(body.sleep_hours, 'sleep hours', 23);
  const sleep_minutes = normalizeSleepPart(body.sleep_minutes, 'sleep minutes', 59);
  return { breakfast, lunch, dinner, sleep_hours, sleep_minutes };
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
      SELECT id, date, duration_minutes, description, breakfast, lunch, dinner, sleep_hours, sleep_minutes, created_at
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

    let optional;
    try {
      optional = parseOptionalFields(req.body || {});
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const rows = await sql`
      INSERT INTO health_log (date, duration_minutes, description, breakfast, lunch, dinner, sleep_hours, sleep_minutes)
      VALUES (${date}, ${numericDuration}, ${trimmedDescription}, ${optional.breakfast}, ${optional.lunch}, ${optional.dinner}, ${optional.sleep_hours}, ${optional.sleep_minutes})
      RETURNING id, date, duration_minutes, description, breakfast, lunch, dinner, sleep_hours, sleep_minutes, created_at
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

    let optional;
    try {
      optional = parseOptionalFields(req.body || {});
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const rows = await sql`
      UPDATE health_log
      SET date = ${date}, duration_minutes = ${numericDuration}, description = ${trimmedDescription},
          breakfast = ${optional.breakfast}, lunch = ${optional.lunch}, dinner = ${optional.dinner},
          sleep_hours = ${optional.sleep_hours}, sleep_minutes = ${optional.sleep_minutes}
      WHERE id = ${id}
      RETURNING id, date, duration_minutes, description, breakfast, lunch, dinner, sleep_hours, sleep_minutes, created_at
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
