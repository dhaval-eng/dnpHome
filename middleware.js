import { next } from '@vercel/edge';

const COOKIE_NAME = 'site_auth';
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : null;
}

function setCookieHeader(expected) {
  return `${COOKIE_NAME}=${expected}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
}

function loginPage(showError) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sign in</title>
<style>
  body { font-family: -apple-system, "Segoe UI", sans-serif; background: #14171a; color: #ecebe6; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  form { background: #191d20; padding: 32px; border-radius: 8px; border: 1px solid #2a2e2c; width: 280px; }
  h1 { font-size: 18px; margin: 0 0 16px; }
  input { width: 100%; padding: 10px; margin-bottom: 12px; border-radius: 4px; border: 1px solid #2a2e2c; background: #14171a; color: #ecebe6; box-sizing: border-box; }
  button { width: 100%; padding: 10px; border-radius: 4px; border: none; background: #2f6f63; color: #fff; font-weight: 600; cursor: pointer; }
  .error { color: #e28c8c; font-size: 13px; margin: 0 0 12px; }
</style>
</head>
<body>
<form method="POST">
  <h1>This site is private</h1>
  ${showError ? '<p class="error">Incorrect password.</p>' : ''}
  <input type="password" name="password" placeholder="Password" autofocus required>
  <button type="submit">Enter</button>
</form>
</body>
</html>`;
}

export const config = {
  // blogs.html / post.html / all-posts.html are intentionally NOT listed here —
  // viewing posts is public. Only finances.html (whole page) and the write
  // methods on /api/* require the password.
  matcher: ['/finances.html', '/api/(.*)'],
};

export default async function middleware(request) {
  const password = process.env.SITE_PASSWORD;

  if (!password) {
    return new Response('Site password is not configured.', { status: 500 });
  }

  const expected = await sha256Hex(password);
  const cookie = getCookie(request, COOKIE_NAME);
  const isAuthed = cookie === expected;
  const { pathname } = new URL(request.url);

  // Dedicated JSON login endpoint for fetch-based (inline) auth prompts on
  // the public blog pages — sets the same cookie the page-level flow does.
  if (pathname === '/api/login') {
    if (request.method !== 'POST') {
      return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    }

    let submitted;
    try {
      const body = await request.json();
      submitted = body.password;
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (submitted === password) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'Set-Cookie': setCookieHeader(expected),
        },
      });
    }

    return new Response(JSON.stringify({ error: 'Incorrect password' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Reading blog posts is public — no auth required.
  if (pathname === '/api/blog-posts' && request.method === 'GET') {
    return next();
  }

  if (isAuthed) {
    return next();
  }

  const isApiPath = pathname.startsWith('/api/');

  // finances.html keeps its original whole-page login form flow.
  if (!isApiPath) {
    if (request.method === 'POST') {
      const form = await request.formData();
      const submitted = form.get('password');

      if (submitted === password) {
        return new Response(null, {
          status: 303,
          headers: {
            Location: request.url,
            'Set-Cookie': setCookieHeader(expected),
          },
        });
      }

      return new Response(loginPage(true), {
        status: 401,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }

    return new Response(loginPage(false), {
      status: 401,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  // Unauthenticated writes against protected API routes (transactions, or
  // blog-posts POST/PUT) get a clean JSON 401 for the calling JS to handle.
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });
}
