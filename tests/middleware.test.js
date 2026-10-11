import { test } from 'node:test';
import assert from 'node:assert/strict';
import middleware from '../middleware.js';

const PASSWORD = 'testpass123';

function setPassword() {
  process.env.SITE_PASSWORD = PASSWORD;
}

async function login(password = PASSWORD) {
  const res = await middleware(
    new Request('https://example.com/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    })
  );
  return res;
}

test('fails closed with a clear error when SITE_PASSWORD is unset', async () => {
  const original = process.env.SITE_PASSWORD;
  delete process.env.SITE_PASSWORD;
  try {
    const res = await middleware(new Request('https://example.com/finances.html'));
    assert.equal(res.status, 500);
  } finally {
    if (original !== undefined) process.env.SITE_PASSWORD = original;
  }
});

test('GET /api/blog-posts is public with no cookie', async () => {
  setPassword();
  const res = await middleware(new Request('https://example.com/api/blog-posts'));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-middleware-next'), '1');
});

test('GET /api/quotes and /api/dad-jokes are public with no cookie', async () => {
  setPassword();
  for (const path of ['/api/quotes', '/api/dad-jokes']) {
    const res = await middleware(new Request(`https://example.com${path}`));
    assert.equal(res.status, 200, `${path} should be public`);
  }
});

test('GET and POST /api/comments are public with no cookie', async () => {
  setPassword();
  const getRes = await middleware(new Request('https://example.com/api/comments?post_id=1'));
  assert.equal(getRes.status, 200);

  const postRes = await middleware(
    new Request('https://example.com/api/comments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ post_id: 1, name: 'A', message: 'hi' }),
    })
  );
  assert.equal(postRes.status, 200);
});

test('POST /api/blog-posts with no cookie is rejected as a JSON 401', async () => {
  setPassword();
  const res = await middleware(
    new Request('https://example.com/api/blog-posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'x', content: 'y' }),
    })
  );
  assert.equal(res.status, 401);
  assert.match(res.headers.get('content-type') || '', /application\/json/);
  const body = await res.json();
  assert.equal(body.error, 'Unauthorized');
});

test('PUT /api/blog-posts with no cookie is rejected as a JSON 401', async () => {
  setPassword();
  const res = await middleware(
    new Request('https://example.com/api/blog-posts?id=1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'x', content: 'y' }),
    })
  );
  assert.equal(res.status, 401);
});

test('GET /api/transactions with no cookie is rejected as a JSON 401 (finances stays fully private)', async () => {
  setPassword();
  const res = await middleware(new Request('https://example.com/api/transactions'));
  assert.equal(res.status, 401);
  assert.match(res.headers.get('content-type') || '', /application\/json/);
});

test('GET /finances.html with no cookie shows the HTML login page', async () => {
  setPassword();
  const res = await middleware(new Request('https://example.com/finances.html'));
  assert.equal(res.status, 401);
  assert.match(res.headers.get('content-type') || '', /text\/html/);
  const body = await res.text();
  assert.match(body, /This site is private/);
});

test('POST /finances.html with the wrong password re-shows the login page with an error', async () => {
  setPassword();
  const res = await middleware(
    new Request('https://example.com/finances.html', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'password=wrong',
    })
  );
  assert.equal(res.status, 401);
  const body = await res.text();
  assert.match(body, /Incorrect password/);
});

test('POST /finances.html with the correct password redirects and sets the session cookie', async () => {
  setPassword();
  const res = await middleware(
    new Request('https://example.com/finances.html', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `password=${PASSWORD}`,
    })
  );
  assert.equal(res.status, 303);
  assert.match(res.headers.get('set-cookie') || '', /^site_auth=/);
});

test('POST /api/login with the wrong password returns a JSON 401 and sets no cookie', async () => {
  setPassword();
  const res = await login('wrong');
  assert.equal(res.status, 401);
  assert.equal(res.headers.get('set-cookie'), null);
});

test('POST /api/login with the correct password returns ok and sets the session cookie', async () => {
  setPassword();
  const res = await login();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.match(res.headers.get('set-cookie') || '', /^site_auth=/);
});

test('the cookie from a successful login authenticates a subsequent write', async () => {
  setPassword();
  const loginRes = await login();
  const cookie = loginRes.headers.get('set-cookie').split(';')[0];

  const res = await middleware(
    new Request('https://example.com/api/blog-posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ title: 'x', content: 'y' }),
    })
  );
  assert.equal(res.status, 200);

  const financesRes = await middleware(
    new Request('https://example.com/api/transactions', { headers: { cookie } })
  );
  assert.equal(financesRes.status, 200, 'the same cookie also authenticates finances, since there is one site password');
});

test('an authenticated cookie set for one password no longer works after the password changes', async () => {
  setPassword();
  const loginRes = await login();
  const cookie = loginRes.headers.get('set-cookie').split(';')[0];

  process.env.SITE_PASSWORD = 'a-new-password';
  const res = await middleware(new Request('https://example.com/api/transactions', { headers: { cookie } }));
  assert.equal(res.status, 401);
});
