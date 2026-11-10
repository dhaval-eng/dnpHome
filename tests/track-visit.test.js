import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/track-visit.js';
import { createFakeSql, createMockRes } from './helpers.js';

process.env.SITE_PASSWORD = 'testpass123';

function fakeSqlWithRows(rows) {
  return createFakeSql([
    { match: (t) => t.includes('CREATE TABLE'), result: [] },
    {
      match: (t) => t.includes('INSERT INTO page_visits'),
      result: (values) => {
        rows.push({
          id: rows.length + 1,
          path: values[0],
          referrer: values[1],
          ip: values[2],
          user_agent: values[3],
          country: values[4],
          city: values[5],
          authenticated: values[6],
          created_at: '2026-01-01T00:00:00Z',
        });
        return [];
      },
    },
    {
      match: (t) => t.includes('SELECT id, path, referrer, ip, user_agent, country, city, authenticated') && t.includes('ORDER BY'),
      result: rows,
    },
  ]);
}

function makeReq({ method = 'GET', body, headers = {} } = {}) {
  return { method, body, headers };
}

test('POST logs a visit with ip, user-agent, and geo headers', async () => {
  const rows = [];
  const res = createMockRes();

  await handler(
    makeReq({
      method: 'POST',
      body: { path: '/index.html', referrer: 'https://google.com' },
      headers: {
        'x-forwarded-for': '203.0.113.5, 10.0.0.1',
        'user-agent': 'TestAgent/1.0',
        'x-vercel-ip-country': 'US',
        'x-vercel-ip-city': 'New%20York',
      },
    }),
    res,
    fakeSqlWithRows(rows)
  );

  assert.equal(res.statusCode, 204);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].path, '/index.html');
  assert.equal(rows[0].referrer, 'https://google.com');
  assert.equal(rows[0].ip, '203.0.113.5');
  assert.equal(rows[0].user_agent, 'TestAgent/1.0');
  assert.equal(rows[0].country, 'US');
  assert.equal(rows[0].city, 'New York');
  assert.equal(rows[0].authenticated, false);
});

test('POST works with a minimal body and no headers', async () => {
  const rows = [];
  const res = createMockRes();

  await handler(makeReq({ method: 'POST', body: {} }), res, fakeSqlWithRows(rows));

  assert.equal(res.statusCode, 204);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].path, null);
  assert.equal(rows[0].ip, null);
});

test('GET lists logged visits', async () => {
  const rows = [
    { id: 1, path: '/index.html', referrer: null, ip: '1.2.3.4', user_agent: 'A', country: null, city: null, authenticated: false, created_at: 'a' },
  ];
  const res = createMockRes();

  await handler(makeReq(), res, fakeSqlWithRows(rows));

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
});

test('an unsupported method returns 405', async () => {
  const res = createMockRes();
  await handler(makeReq({ method: 'DELETE' }), res, fakeSqlWithRows([]));
  assert.equal(res.statusCode, 405);
});
