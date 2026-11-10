import { getSql } from '../lib/db.js';

const MEAL_FIELDS = ['breakfast', 'lunch', 'dinner'];

async function ensureTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS health_log (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL,
      duration_minutes INTEGER,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`ALTER TABLE health_log ADD COLUMN IF NOT EXISTS breakfast TEXT`;
  await sql`ALTER TABLE health_log ADD COLUMN IF NOT EXISTS lunch TEXT`;
  await sql`ALTER TABLE health_log ADD COLUMN IF NOT EXISTS dinner TEXT`;
  await sql`ALTER TABLE health_log ADD COLUMN IF NOT EXISTS sleep_hours INTEGER`;
  await sql`ALTER TABLE health_log ADD COLUMN IF NOT EXISTS sleep_minutes INTEGER`;
  // Rest days may log only meals/sleep, with no workout at all.
  await sql`ALTER TABLE health_log ALTER COLUMN duration_minutes DROP NOT NULL`;
  await sql`ALTER TABLE health_log ALTER COLUMN description DROP NOT NULL`;
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

// Duration is optional (a rest day has none), but if given must be a
// positive number of minutes.
function normalizeDuration(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (Number.isNaN(n) || n <= 0) {
    throw new Error('duration in minutes must be a positive number');
  }
  return n;
}

function normalizeDescription(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function parseFields(body) {
  const duration_minutes = normalizeDuration(body.duration_minutes);
  const description = normalizeDescription(body.description);
  const [breakfast, lunch, dinner] = MEAL_FIELDS.map((field) => normalizeMeal(body[field], field));
  const sleep_hours = normalizeSleepPart(body.sleep_hours, 'sleep hours', 23);
  const sleep_minutes = normalizeSleepPart(body.sleep_minutes, 'sleep minutes', 59);
  return { duration_minutes, description, breakfast, lunch, dinner, sleep_hours, sleep_minutes };
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
    const { date } = req.body || {};

    if (!date) {
      return res.status(400).json({ error: 'date is required' });
    }

    let fields;
    try {
      fields = parseFields(req.body || {});
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const rows = await sql`
      INSERT INTO health_log (date, duration_minutes, description, breakfast, lunch, dinner, sleep_hours, sleep_minutes)
      VALUES (${date}, ${fields.duration_minutes}, ${fields.description}, ${fields.breakfast}, ${fields.lunch}, ${fields.dinner}, ${fields.sleep_hours}, ${fields.sleep_minutes})
      RETURNING id, date, duration_minutes, description, breakfast, lunch, dinner, sleep_hours, sleep_minutes, created_at
    `;
    return res.status(201).json(rows[0]);
  }

  if (req.method === 'PUT') {
    const { id } = req.query;
    const { date } = req.body || {};

    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }
    if (!date) {
      return res.status(400).json({ error: 'date is required' });
    }

    let fields;
    try {
      fields = parseFields(req.body || {});
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const rows = await sql`
      UPDATE health_log
      SET date = ${date}, duration_minutes = ${fields.duration_minutes}, description = ${fields.description},
          breakfast = ${fields.breakfast}, lunch = ${fields.lunch}, dinner = ${fields.dinner},
          sleep_hours = ${fields.sleep_hours}, sleep_minutes = ${fields.sleep_minutes}
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
