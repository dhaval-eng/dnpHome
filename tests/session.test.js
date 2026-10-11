import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAuthed } from '../lib/session.js';

async function expectedCookieValue(password) {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

test('isAuthed returns false when SITE_PASSWORD is not configured', async () => {
  const original = process.env.SITE_PASSWORD;
  delete process.env.SITE_PASSWORD;
  try {
    assert.equal(await isAuthed('site_auth=anything'), false);
  } finally {
    if (original !== undefined) process.env.SITE_PASSWORD = original;
  }
});

test('isAuthed returns false with no cookie header', async () => {
  process.env.SITE_PASSWORD = 'testpass123';
  assert.equal(await isAuthed(undefined), false);
});

test('isAuthed returns false with an empty cookie header', async () => {
  process.env.SITE_PASSWORD = 'testpass123';
  assert.equal(await isAuthed(''), false);
});

test('isAuthed returns false with the wrong cookie value', async () => {
  process.env.SITE_PASSWORD = 'testpass123';
  assert.equal(await isAuthed('site_auth=wrong-value'), false);
});

test('isAuthed returns true with the correct cookie value', async () => {
  process.env.SITE_PASSWORD = 'testpass123';
  const hash = await expectedCookieValue('testpass123');
  assert.equal(await isAuthed(`site_auth=${hash}`), true);
});

test('isAuthed finds the cookie among other unrelated cookies', async () => {
  process.env.SITE_PASSWORD = 'testpass123';
  const hash = await expectedCookieValue('testpass123');
  assert.equal(await isAuthed(`foo=bar; site_auth=${hash}; baz=qux`), true);
});

test('isAuthed is sensitive to the configured password changing', async () => {
  process.env.SITE_PASSWORD = 'testpass123';
  const hash = await expectedCookieValue('testpass123');

  process.env.SITE_PASSWORD = 'a-different-password';
  assert.equal(await isAuthed(`site_auth=${hash}`), false);
});
