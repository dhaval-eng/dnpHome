import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/blog-posts.js';
import { createFakeSql, createMockRes } from './helpers.js';

// Builds a fake `sql` backed by an in-memory `rows` array, covering every
// query shape api/blog-posts.js actually issues (seen by reading the file).
function fakeSqlWithRows(rows) {
  return createFakeSql([
    { match: (t) => t.includes('CREATE TABLE'), result: [] },
    { match: (t) => t.includes('ALTER TABLE'), result: [] },
    { match: (t) => t.includes('COUNT('), result: [{ count: rows.length }] },
    {
      match: (t) => t.includes('FROM blog_posts') && t.includes('WHERE id'),
      result: (values) => rows.filter((r) => String(r.id) === String(values[0])),
    },
    {
      match: (t) => t.includes('FROM blog_posts') && t.includes('ORDER BY'),
      result: rows,
    },
    {
      match: (t) => t.includes('INSERT INTO blog_posts'),
      result: (values) => {
        const row = {
          id: 101,
          title: values[0],
          content: values[1],
          restricted: values[2],
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        };
        rows.push(row);
        return [row];
      },
    },
    {
      match: (t) => t.includes('UPDATE blog_posts'),
      result: (values) => {
        const [title, content, restricted, id] = values;
        const existing = rows.find((r) => String(r.id) === String(id));
        if (!existing) return [];
        existing.title = title;
        existing.content = content;
        existing.restricted = restricted;
        existing.updated_at = '2026-01-02T00:00:00Z';
        return [existing];
      },
    },
  ]);
}

function makeReq({ method = 'GET', query = {}, body, cookie } = {}) {
  return { method, query, body, headers: cookie ? { cookie } : {} };
}

async function cookieFor(password) {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `site_auth=${hash}`;
}

test('GET list redacts content for restricted posts when unauthenticated', async () => {
  const rows = [
    { id: 1, title: 'Public', content: 'hello world', restricted: 'N', created_at: 'a', updated_at: 'a' },
    { id: 2, title: 'Secret', content: 'top secret stuff', restricted: 'Y', created_at: 'b', updated_at: 'b' },
  ];
  const res = createMockRes();

  await handler(makeReq(), res, fakeSqlWithRows(rows));

  assert.equal(res.statusCode, 200);
  const [pub, secret] = res.body;
  assert.equal(pub.content, 'hello world');
  assert.equal(secret.content, null);
});

test('GET list does not redact content for authenticated callers', async () => {
  process.env.SITE_PASSWORD = 'testpass123';
  const rows = [{ id: 2, title: 'Secret', content: 'top secret stuff', restricted: 'Y', created_at: 'b', updated_at: 'b' }];
  const res = createMockRes();

  await handler(makeReq({ cookie: await cookieFor('testpass123') }), res, fakeSqlWithRows(rows));

  assert.equal(res.body[0].content, 'top secret stuff');
});

test('GET single returns 401 for a restricted post when unauthenticated', async () => {
  const rows = [{ id: 2, title: 'Secret', content: 'top secret stuff', restricted: 'Y', created_at: 'b', updated_at: 'b' }];
  const res = createMockRes();

  await handler(makeReq({ query: { id: '2' } }), res, fakeSqlWithRows(rows));

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.restricted, true);
});

test('GET single returns a restricted post when authenticated', async () => {
  process.env.SITE_PASSWORD = 'testpass123';
  const rows = [{ id: 2, title: 'Secret', content: 'top secret stuff', restricted: 'Y', created_at: 'b', updated_at: 'b' }];
  const res = createMockRes();

  await handler(makeReq({ query: { id: '2' }, cookie: await cookieFor('testpass123') }), res, fakeSqlWithRows(rows));

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.content, 'top secret stuff');
});

test('GET single returns a non-restricted post with no auth needed', async () => {
  const rows = [{ id: 1, title: 'Public', content: 'hello world', restricted: 'N', created_at: 'a', updated_at: 'a' }];
  const res = createMockRes();

  await handler(makeReq({ query: { id: '1' } }), res, fakeSqlWithRows(rows));

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.content, 'hello world');
});

test('GET single returns 404 for a missing post', async () => {
  const res = createMockRes();
  await handler(makeReq({ query: { id: '999' } }), res, fakeSqlWithRows([]));
  assert.equal(res.statusCode, 404);
});

test('POST requires title and content', async () => {
  const res = createMockRes();
  await handler(makeReq({ method: 'POST', body: { title: '', content: '' } }), res, fakeSqlWithRows([]));
  assert.equal(res.statusCode, 400);
});

test('POST defaults restricted to N when omitted', async () => {
  const res = createMockRes();
  await handler(makeReq({ method: 'POST', body: { title: 'T', content: 'C' } }), res, fakeSqlWithRows([]));
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.restricted, 'N');
});

test('POST honors restricted: Y', async () => {
  const res = createMockRes();
  await handler(makeReq({ method: 'POST', body: { title: 'T', content: 'C', restricted: 'Y' } }), res, fakeSqlWithRows([]));
  assert.equal(res.body.restricted, 'Y');
});

test('POST normalizes an invalid restricted value to N instead of erroring', async () => {
  const res = createMockRes();
  await handler(
    makeReq({ method: 'POST', body: { title: 'T', content: 'C', restricted: 'maybe' } }),
    res,
    fakeSqlWithRows([])
  );
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.restricted, 'N');
});

test('PUT updates an existing post, including toggling restricted', async () => {
  const rows = [{ id: 5, title: 'Old', content: 'Old content', restricted: 'N', created_at: 'a', updated_at: 'a' }];
  const res = createMockRes();

  await handler(
    makeReq({ method: 'PUT', query: { id: '5' }, body: { title: 'New', content: 'New content', restricted: 'Y' } }),
    res,
    fakeSqlWithRows(rows)
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.title, 'New');
  assert.equal(res.body.restricted, 'Y');
});

test('PUT returns 404 for a missing post', async () => {
  const res = createMockRes();
  await handler(
    makeReq({ method: 'PUT', query: { id: '999' }, body: { title: 'New', content: 'New content' } }),
    res,
    fakeSqlWithRows([])
  );
  assert.equal(res.statusCode, 404);
});

test('an unsupported method returns 405', async () => {
  const res = createMockRes();
  await handler(makeReq({ method: 'DELETE' }), res, fakeSqlWithRows([]));
  assert.equal(res.statusCode, 405);
});
