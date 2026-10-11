import { getSql } from '../lib/db.js';
import { isAuthed } from '../lib/session.js';

const SEED_POSTS = [
  {
    title: 'Educational System 1',
    content: `Items that bother me about the educational system, and what I feel could be improved.

- Tests are not graded in a timely manner
- Tests are often not returned to students in a timely manner
- Not many/any classes around "real-world" and "real-life" skills
- Kids are often learning through watching videos in school classrooms`,
    createdAt: '2026-09-17T00:00:00Z',
  },
  {
    title: 'Educational System',
    content: `Items that bother me about the educational system, and what I feel could be improved.

- Tests are not graded in a timely manner
- Tests are often not returned to students in a timely manner
- Not many/any classes around "real-world" and "real-life" skills
- Kids are often learning through watching videos in school classrooms`,
    createdAt: '2026-09-17T00:01:00Z',
  },
  {
    title: 'Job Hunting Woes',
    content: `Improvements that can be made to the hiring process.

- Job posts for jobs that are not approved to hire "now".
- Applications asking the same questions or questions that should be obvious
- No response to several jobs
- Lengthy applications
- Cover letters
- Power of networking
- Recruiters reaching out and then ghosting you
- Interview process needs to be more transparent on when decisions will be finalized`,
    createdAt: '2026-09-17T00:02:00Z',
  },
  {
    title: 'Politics',
    content: `I'm speechless.

- Where is the SEC to regulate trading by Whitehouse personnel with material information
- Iran War -- what is the end game
- What happened to releasing Epstein files?
- Why are all Republicans too afraid to standup to DJT?
- Why are all GOP members kissing up to DJT?
- Voter/election fraud in 2020?  Really?
- ICE and national guards summoned to areas they didn't belong
- DJT and family benefitting with deals worth billions
- DJT not focused on real problems`,
    createdAt: '2026-09-17T00:03:00Z',
  },
];

const VALID_RESTRICTED = ['Y', 'N'];

function normalizeRestricted(value) {
  return VALID_RESTRICTED.includes(value) ? value : 'N';
}

async function ensureTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS blog_posts (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS restricted TEXT NOT NULL DEFAULT 'N'`;

  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM blog_posts`;
  if (count === 0) {
    for (const post of SEED_POSTS) {
      await sql`
        INSERT INTO blog_posts (title, content, created_at, updated_at)
        VALUES (${post.title}, ${post.content}, ${post.createdAt}, ${post.createdAt})
      `;
    }
  }
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
    const { id } = req.query;
    const authed = await isAuthed(req.headers.cookie);

    if (id) {
      const rows = await sql`
        SELECT id, title, content, created_at, updated_at, restricted
        FROM blog_posts
        WHERE id = ${id}
      `;
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Post not found' });
      }

      const post = rows[0];
      if (post.restricted === 'Y' && !authed) {
        return res.status(401).json({ error: 'This post is restricted', restricted: true });
      }
      return res.status(200).json(post);
    }

    const rows = await sql`
      SELECT id, title, content, created_at, updated_at, restricted
      FROM blog_posts
      ORDER BY updated_at DESC, id DESC
    `;

    // Redact content for restricted posts unless the caller is authenticated,
    // so the public list can't be used to read restricted content via its summary.
    const sanitized = authed
      ? rows
      : rows.map((row) => (row.restricted === 'Y' ? { ...row, content: null } : row));

    return res.status(200).json(sanitized);
  }

  if (req.method === 'POST') {
    const { title, content, restricted } = req.body || {};

    if (!title || !content) {
      return res.status(400).json({ error: 'title and content are required' });
    }

    const rows = await sql`
      INSERT INTO blog_posts (title, content, restricted)
      VALUES (${title}, ${content}, ${normalizeRestricted(restricted)})
      RETURNING id, title, content, created_at, updated_at, restricted
    `;
    return res.status(201).json(rows[0]);
  }

  if (req.method === 'PUT') {
    const { id } = req.query;
    const { title, content, restricted } = req.body || {};

    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }
    if (!title || !content) {
      return res.status(400).json({ error: 'title and content are required' });
    }

    const rows = await sql`
      UPDATE blog_posts
      SET title = ${title}, content = ${content}, restricted = ${normalizeRestricted(restricted)}, updated_at = now()
      WHERE id = ${id}
      RETURNING id, title, content, created_at, updated_at, restricted
    `;

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    return res.status(200).json(rows[0]);
  }

  res.setHeader('Allow', 'GET, POST, PUT');
  return res.status(405).end('Method Not Allowed');
}
