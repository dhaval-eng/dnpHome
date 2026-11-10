import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/health-log.js';
import { createFakeSql, createMockRes } from './helpers.js';

// Builds a fake `sql` backed by an in-memory `rows` array, covering every
// query shape api/health-log.js actually issues.
function fakeSqlWithRows(rows) {
  return createFakeSql([
    { match: (t) => t.includes('CREATE TABLE'), result: [] },
    { match: (t) => t.includes('ALTER TABLE'), result: [] },
    {
      match: (t) => t.includes('SELECT id, date, duration_minutes, description') && t.includes('ORDER BY'),
      result: rows,
    },
    {
      match: (t) => t.includes('INSERT INTO health_log'),
      result: (values) => {
        const row = {
          id: 101,
          date: values[0],
          duration_minutes: values[1],
          description: values[2],
          breakfast: values[3],
          lunch: values[4],
          dinner: values[5],
          sleep_hours: values[6],
          sleep_minutes: values[7],
          created_at: '2026-01-01T00:00:00Z',
        };
        rows.push(row);
        return [row];
      },
    },
    {
      match: (t) => t.includes('UPDATE health_log'),
      result: (values) => {
        const [date, duration_minutes, description, breakfast, lunch, dinner, sleep_hours, sleep_minutes, id] = values;
        const existing = rows.find((r) => String(r.id) === String(id));
        if (!existing) return [];
        existing.date = date;
        existing.duration_minutes = duration_minutes;
        existing.description = description;
        existing.breakfast = breakfast;
        existing.lunch = lunch;
        existing.dinner = dinner;
        existing.sleep_hours = sleep_hours;
        existing.sleep_minutes = sleep_minutes;
        return [existing];
      },
    },
    {
      match: (t) => t.includes('DELETE FROM health_log'),
      result: (values) => {
        const index = rows.findIndex((r) => String(r.id) === String(values[0]));
        if (index !== -1) rows.splice(index, 1);
        return [];
      },
    },
  ]);
}

function makeReq({ method = 'GET', query = {}, body } = {}) {
  return { method, query, body, headers: {} };
}

test('GET lists all records', async () => {
  const rows = [
    { id: 1, date: '2026-11-02', duration_minutes: 30, description: 'Run', created_at: 'a' },
    { id: 2, date: '2026-11-03', duration_minutes: 45, description: 'Lift', created_at: 'b' },
  ];
  const res = createMockRes();

  await handler(makeReq(), res, fakeSqlWithRows(rows));

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 2);
});

test('POST requires date, a positive duration, and a description', async () => {
  const res = createMockRes();
  await handler(makeReq({ method: 'POST', body: { date: '', duration_minutes: '', description: '' } }), res, fakeSqlWithRows([]));
  assert.equal(res.statusCode, 400);
});

test('POST rejects a zero or negative duration', async () => {
  const res = createMockRes();
  await handler(
    makeReq({ method: 'POST', body: { date: '2026-11-02', duration_minutes: 0, description: 'Run' } }),
    res,
    fakeSqlWithRows([])
  );
  assert.equal(res.statusCode, 400);
});

test('POST creates a record', async () => {
  const res = createMockRes();
  await handler(
    makeReq({ method: 'POST', body: { date: '2026-11-02', duration_minutes: 30, description: 'Run' } }),
    res,
    fakeSqlWithRows([])
  );
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.date, '2026-11-02');
  assert.equal(res.body.duration_minutes, 30);
  assert.equal(res.body.description, 'Run');
});

test('POST accepts the optional meal and sleep fields', async () => {
  const res = createMockRes();
  await handler(
    makeReq({
      method: 'POST',
      body: {
        date: '2026-11-02',
        duration_minutes: 30,
        description: 'Run',
        breakfast: 'Oatmeal',
        lunch: 'Salad',
        dinner: 'Pasta',
        sleep_hours: 7,
        sleep_minutes: 30,
      },
    }),
    res,
    fakeSqlWithRows([])
  );
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.breakfast, 'Oatmeal');
  assert.equal(res.body.lunch, 'Salad');
  assert.equal(res.body.dinner, 'Pasta');
  assert.equal(res.body.sleep_hours, 7);
  assert.equal(res.body.sleep_minutes, 30);
});

test('POST allows the optional meal and sleep fields to be omitted (null)', async () => {
  const res = createMockRes();
  await handler(
    makeReq({ method: 'POST', body: { date: '2026-11-02', duration_minutes: 30, description: 'Run' } }),
    res,
    fakeSqlWithRows([])
  );
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.breakfast, null);
  assert.equal(res.body.sleep_hours, null);
  assert.equal(res.body.sleep_minutes, null);
});

test('POST rejects a meal field over 100 characters', async () => {
  const res = createMockRes();
  await handler(
    makeReq({ method: 'POST', body: { date: '2026-11-02', duration_minutes: 30, description: 'Run', breakfast: 'x'.repeat(101) } }),
    res,
    fakeSqlWithRows([])
  );
  assert.equal(res.statusCode, 400);
});

test('POST rejects an out-of-range sleep value', async () => {
  const res = createMockRes();
  await handler(
    makeReq({ method: 'POST', body: { date: '2026-11-02', duration_minutes: 30, description: 'Run', sleep_minutes: 90 } }),
    res,
    fakeSqlWithRows([])
  );
  assert.equal(res.statusCode, 400);
});

test('PUT updates an existing record', async () => {
  const rows = [{ id: 5, date: '2026-11-02', duration_minutes: 30, description: 'Run', created_at: 'a' }];
  const res = createMockRes();

  await handler(
    makeReq({ method: 'PUT', query: { id: '5' }, body: { date: '2026-11-03', duration_minutes: 60, description: 'Long run' } }),
    res,
    fakeSqlWithRows(rows)
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.date, '2026-11-03');
  assert.equal(res.body.duration_minutes, 60);
  assert.equal(res.body.description, 'Long run');
});

test('PUT returns 404 for a missing record', async () => {
  const res = createMockRes();
  await handler(
    makeReq({ method: 'PUT', query: { id: '999' }, body: { date: '2026-11-03', duration_minutes: 60, description: 'Long run' } }),
    res,
    fakeSqlWithRows([])
  );
  assert.equal(res.statusCode, 404);
});

test('PUT requires id', async () => {
  const res = createMockRes();
  await handler(
    makeReq({ method: 'PUT', body: { date: '2026-11-03', duration_minutes: 60, description: 'Long run' } }),
    res,
    fakeSqlWithRows([])
  );
  assert.equal(res.statusCode, 400);
});

test('DELETE removes a record', async () => {
  const rows = [{ id: 7, date: '2026-11-02', duration_minutes: 30, description: 'Run', created_at: 'a' }];
  const res = createMockRes();

  await handler(makeReq({ method: 'DELETE', query: { id: '7' } }), res, fakeSqlWithRows(rows));

  assert.equal(res.statusCode, 204);
  assert.equal(rows.length, 0);
});

test('DELETE requires id', async () => {
  const res = createMockRes();
  await handler(makeReq({ method: 'DELETE' }), res, fakeSqlWithRows([]));
  assert.equal(res.statusCode, 400);
});

test('an unsupported method returns 405', async () => {
  const res = createMockRes();
  await handler(makeReq({ method: 'PATCH' }), res, fakeSqlWithRows([]));
  assert.equal(res.statusCode, 405);
});
