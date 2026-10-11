# dnpHome

Dhaval Patel's personal site — a bio page plus a small set of side
features (a blog, quotes, dad jokes, and a private expense tracker),
deployed on Vercel.

## Pages

| Page | File | Access |
|---|---|---|
| Home / bio | `index.html` | Public |
| Blogs | `blogs.html`, `post.html`, `all-posts.html` | Public to read. Publishing and editing require the site password. Individual posts can also be marked "restricted," which gates reading that post (and its comments) behind the password too. |
| Quotes | `quotes.html` | Public to read; adding a quote requires the password. |
| Dad Jokes | `dad-jokes.html` | Public to read; adding a joke requires the password. |
| Finances | `finances.html` | Entirely behind the password — a personal expense tracker. |

There is one site password, set once as an environment variable and checked
via a shared cookie session — see **Environment variables** below.

## Tech stack

- **Plain HTML/CSS/vanilla JS** — no framework, no build step, no bundler.
  Shared chrome (`styles.css`, `nav.js`, `auth.js`) is loaded by every page;
  each page's own `<style>`/`<script>` holds content specific to it.
- **Vercel** for hosting, connected to this GitHub repo — every push to
  `main` triggers an automatic deploy.
- **Vercel Edge Middleware** (`middleware.js`) enforces the password for
  gated pages/routes, using a hashed session cookie (the real password
  never reaches the browser).
- **Vercel Serverless Functions** (`api/*.js`, Node runtime) back the
  dynamic features — blog posts, comments, quotes, dad jokes, and
  finances — each with its own Postgres table, auto-created on first use.
- **Neon Postgres**, provisioned via Vercel's Storage/Marketplace
  integration, queried through `@neondatabase/serverless`.
- **Vercel Analytics**, loaded via a plain `<script>` tag (this isn't a
  Next.js app, so the npm-package integration doesn't apply).

## Project structure

```
dnpHome/
├── index.html, blogs.html, post.html, all-posts.html,
│   quotes.html, dad-jokes.html, finances.html   # pages
├── styles.css           # shared design tokens, nav, footer, buttons
├── nav.js                # shared top-nav/side-nav, injected per page
├── auth.js                # client-side inline password-prompt helper
├── middleware.js           # Edge Middleware: the site's password gate
├── api/                     # one serverless function per feature
│   ├── blog-posts.js
│   ├── comments.js
│   ├── quotes.js
│   ├── dad-jokes.js
│   └── transactions.js
├── lib/                      # shared server-side helpers
│   ├── db.js                   # Postgres connection helper
│   └── session.js               # cookie/session check (used outside middleware)
└── img/                         # photos
```

## Environment variables

Copy `.env.example` for the list. Set real values in the Vercel dashboard
under **Project Settings → Environment Variables** — never commit them.

- `SITE_PASSWORD` — the one password that gates Finances, publishing/editing
  on Blogs/Quotes/Dad Jokes, and any post marked restricted.
- `DNP_DATABASE_URL` — the Neon Postgres connection string (provisioned via
  Vercel's Storage tab; named with a `DNP_` prefix because it was renamed
  after connecting the integration).

## Local development

This project has no build step, so most HTML/CSS/JS changes can be previewed
by opening the file directly or serving the directory with any static file
server. To exercise the password gate and the API routes locally, use the
Vercel CLI's `vercel dev` (requires `vercel login` once) — it reads
environment variables the same way production does, either via `.env.local`
or `vercel env pull`.

## Tests

```
npm install
npm test
```

Runs on Node's built-in test runner (`node --test`) — no extra test
framework dependency. Coverage so far:

- `tests/session.test.js` — the shared cookie/session check
  (`lib/session.js`) used both by middleware and by routes that need to
  know auth state outside of middleware's own routing.
- `tests/middleware.test.js` — the full password-gate matrix: which
  paths/methods are public vs. gated, the login flow (both the JSON
  `/api/login` endpoint and finances.html's HTML form), and that a session
  cookie from one login works everywhere (since there's one site password).
- `tests/blog-posts.test.js` — validation and the restricted-post logic in
  `api/blog-posts.js` (listing redaction, the 401 on reading a restricted
  post while unauthenticated, defaulting/normalizing the `restricted`
  field), using an in-memory fake `sql` client (`tests/helpers.js`) instead
  of a real database.

Every `api/*.js` handler accepts an optional third `sql` argument
(`handler(req, res, sql)`), defaulting to a real Neon connection only when
omitted — this is what lets tests inject a fake client without needing
Node's experimental module-mocking flag or a real database. The same
pattern can be extended to the remaining routes (`comments.js`,
`quotes.js`, `dad-jokes.js`, `transactions.js`) the same way.

Run the tests before pushing anything that touches `middleware.js`,
`lib/`, or `api/` — that's exactly the surface most likely to silently
break access control.

## Deployment

Push to `main` — Vercel builds and deploys automatically. No separate build
command is needed; the `api/` functions and `middleware.js` are detected
and deployed as-is.
