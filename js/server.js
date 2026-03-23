/**
 * server.js — Melify API
 * Node.js + SQLite (better-sqlite3)
 *
 * Tables:  users · tweets · likes · retweets · bookmarks · replies · translations
 *
 * Quick start:
 *   npm install
 *   node server.js
 *
 * Environment variables (optional, see .env.example):
 *   PORT                  default 3001
 *   DB_PATH               default ./melify.db
 *   JWT_SECRET            change in production
 *   JWT_EXPIRES           default 7d
 *   LIBRETRANSLATE_URL    e.g. http://localhost:5000
 */

'use strict';

require('dotenv').config();

const express  = require('express');
const Database = require('better-sqlite3');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');

// ── Config ────────────────────────────────────────────────────────────────────
const PORT          = Number(process.env.PORT)    || 3001;
const DB_PATH       = process.env.DB_PATH         || path.join(__dirname, 'melify.db');
const JWT_SECRET    = process.env.JWT_SECRET      || 'mtk-twitter-dev-secret-CHANGE-IN-PROD';
const JWT_EXPIRES   = process.env.JWT_EXPIRES     || '7d';
const TRANSLATE_URL = process.env.LIBRETRANSLATE_URL || null;
const BCRYPT_ROUNDS = 10;   // 10 = ~100ms, fast enough for dev; raise to 12 for prod

// ── Database ──────────────────────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

// ── Schema ────────────────────────────────────────────────────────────────────
db.exec(`
  -- Users
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER  PRIMARY KEY AUTOINCREMENT,
    username      TEXT     NOT NULL UNIQUE COLLATE NOCASE,
    email         TEXT     NOT NULL UNIQUE COLLATE NOCASE,
    display_name  TEXT     NOT NULL,
    password_hash TEXT     NOT NULL,
    lang          TEXT     NOT NULL DEFAULT 'en',
    bio           TEXT     NOT NULL DEFAULT '',
    avatar_url    TEXT     NOT NULL DEFAULT '',
    verified      INTEGER  NOT NULL DEFAULT 0,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  -- Tweets  (parent_id != NULL means it is a reply)
  CREATE TABLE IF NOT EXISTS tweets (
    id             INTEGER  PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER  NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    parent_id      INTEGER           REFERENCES tweets(id) ON DELETE CASCADE,
    text           TEXT     NOT NULL,
    original_lang  TEXT     NOT NULL DEFAULT 'en',
    likes_count    INTEGER  NOT NULL DEFAULT 0,
    retweets_count INTEGER  NOT NULL DEFAULT 0,
    replies_count  INTEGER  NOT NULL DEFAULT 0,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  -- Likes
  CREATE TABLE IF NOT EXISTS likes (
    user_id    INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    tweet_id   INTEGER NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, tweet_id)
  );

  -- Retweets
  CREATE TABLE IF NOT EXISTS retweets (
    user_id    INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    tweet_id   INTEGER NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, tweet_id)
  );

  -- Bookmarks
  CREATE TABLE IF NOT EXISTS bookmarks (
    user_id    INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    tweet_id   INTEGER NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, tweet_id)
  );

  -- Translation cache
  CREATE TABLE IF NOT EXISTS translations (
    tweet_id     INTEGER NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
    target_lang  TEXT    NOT NULL,
    translated   TEXT    NOT NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tweet_id, target_lang)
  );

  -- Indexes
  CREATE INDEX IF NOT EXISTS idx_tweets_user    ON tweets(user_id);
  CREATE INDEX IF NOT EXISTS idx_tweets_created ON tweets(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_tweets_parent  ON tweets(parent_id);
  CREATE INDEX IF NOT EXISTS idx_likes_tweet    ON likes(tweet_id);
  CREATE INDEX IF NOT EXISTS idx_rt_tweet       ON retweets(tweet_id);
  CREATE INDEX IF NOT EXISTS idx_bk_user        ON bookmarks(user_id);
`);

// ── Seed demo data (runs only when users table is empty) ──────────────────────
(function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return;

  console.log('[DB] Seeding demo data…');

  const hash = bcrypt.hashSync('demo1234', BCRYPT_ROUNDS);
  const base = 'https://i.pravatar.cc/80?img=';

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (username, email, display_name, password_hash, lang, avatar_url, verified)
    VALUES (@username, @email, @display_name, @password_hash, @lang, @avatar_url, @verified)
  `);

  const users = [
    { username: 'priyasharma',   email: 'priya@demo.com',   display_name: 'Priya Sharma',    lang: 'hi', avatar_url: base + '47', verified: 0 },
    { username: 'carlosmendoza', email: 'carlos@demo.com',  display_name: 'Carlos Mendoza',  lang: 'es', avatar_url: base + '52', verified: 1 },
    { username: 'kenjitanaka',   email: 'kenji@demo.com',   display_name: 'Kenji Tanaka',    lang: 'ja', avatar_url: base + '56', verified: 1 },
    { username: 'omarhassan',    email: 'omar@demo.com',    display_name: 'Omar Hassan',     lang: 'ar', avatar_url: base + '59', verified: 0 },
    { username: 'natasha_v',     email: 'natasha@demo.com', display_name: 'Natasha Volkova', lang: 'ru', avatar_url: base + '45', verified: 0 },
  ].map(u => ({ ...u, password_hash: hash }));

  const seedTweets = [
    { username: 'priyasharma',   text: 'नमस्ते! आज का मौसम बहुत अच्छा है।',                    lang: 'hi' },
    { username: 'carlosmendoza', text: 'La tecnología nos une a todos.',                         lang: 'es' },
    { username: 'kenjitanaka',   text: 'この技術は素晴らしいです！言語の壁がなくなりますね。', lang: 'ja' },
    { username: 'omarhassan',    text: 'مرحبا بالجميع! نحن نبني جسور التواصل بين الشعوب.',    lang: 'ar' },
    { username: 'natasha_v',     text: 'Технологии меняют мир к лучшему каждый день.',          lang: 'ru' },
  ];

  const insertTweet = db.prepare(`
    INSERT INTO tweets (user_id, text, original_lang)
    VALUES (@user_id, @text, @original_lang)
  `);

  const seedAll = db.transaction(() => {
    users.forEach(u => insertUser.run(u));
    seedTweets.forEach(t => {
      const user = db.prepare('SELECT id FROM users WHERE username=?').get(t.username);
      if (user) insertTweet.run({ user_id: user.id, text: t.text, original_lang: t.lang });
    });
  });

  seedAll();
  console.log('[DB] Seeded', users.length, 'users and', seedTweets.length, 'tweets');
})();

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();

// Explicit CORS — allow all origins (lock down in production)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors());          // handle preflight for all routes

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve compiled frontend from ./public if it exists
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) app.use(express.static(publicDir));

// ── Request logger (dev) ──────────────────────────────────────────────────────
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Auth middleware ───────────────────────────────────────────────────────────
function authRequired(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function authOptional(req, _res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  if (token) {
    try { req.user = jwt.verify(token, JWT_SECRET); } catch { /* anonymous */ }
  }
  next();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toPublicUser(u) {
  return {
    id:           u.id,
    username:     u.username,
    display_name: u.display_name,
    lang:         u.lang,
    bio:          u.bio || '',
    avatar_url:   u.avatar_url || `https://i.pravatar.cc/80?u=${u.username}`,
    verified:     u.verified === 1,
    created_at:   u.created_at,
  };
}

function tweetSQL(userId) {
  const uid = Number(userId) || 0;
  return `
    SELECT
      t.id, t.text, t.original_lang,
      t.likes_count, t.retweets_count, t.replies_count,
      t.parent_id, t.created_at,
      u.username, u.display_name, u.avatar_url, u.verified,
      ${uid ? `(SELECT 1 FROM likes     WHERE user_id=${uid} AND tweet_id=t.id)` : '0'} AS user_liked,
      ${uid ? `(SELECT 1 FROM retweets  WHERE user_id=${uid} AND tweet_id=t.id)` : '0'} AS user_retweeted,
      ${uid ? `(SELECT 1 FROM bookmarks WHERE user_id=${uid} AND tweet_id=t.id)` : '0'} AS user_bookmarked
    FROM  tweets t
    JOIN  users  u ON u.id = t.user_id
  `;
}

function formatTweet(row, userId) {
  return {
    id:             row.id,
    text:           row.text,
    original_lang:  row.original_lang,
    likes_count:    row.likes_count,
    retweets_count: row.retweets_count,
    replies_count:  row.replies_count,
    parent_id:      row.parent_id || null,
    created_at:     row.created_at,
    user: {
      name:     row.display_name,
      handle:   row.username,
      avatar:   row.avatar_url || `https://i.pravatar.cc/80?u=${row.username}`,
      verified: row.verified === 1,
    },
    liked:      !!row.user_liked,
    retweeted:  !!row.user_retweeted,
    bookmarked: !!row.user_bookmarked,
  };
}

// ── Validation helpers ────────────────────────────────────────────────────────
function validateUsername(u) {
  if (!u || typeof u !== 'string')           return 'Username is required';
  if (u.length < 3 || u.length > 30)         return 'Username must be 3–30 characters';
  if (!/^[a-zA-Z0-9_]+$/.test(u))            return 'Username may only contain letters, numbers and _';
  return null;
}

function validateEmail(e) {
  if (!e || typeof e !== 'string')            return 'Email is required';
  if (!/.+@.+\..+/.test(e))                   return 'Enter a valid email address';
  return null;
}

function validatePassword(p) {
  if (!p || typeof p !== 'string')            return 'Password is required';
  if (p.length < 8)                           return 'Password must be at least 8 characters';
  return null;
}

// ════════════════════════════════════════════════════════════════════════════════
// ROUTES
// ════════════════════════════════════════════════════════════════════════════════

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  const userCount  = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const tweetCount = db.prepare('SELECT COUNT(*) AS c FROM tweets').get().c;
  res.json({ ok: true, app: 'Melify', version: '2.0.0', users: userCount, tweets: tweetCount });
});

// ════════════════════════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════════════════════════

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  try {
    const {
      display_name = '',
      username     = '',
      email        = '',
      password     = '',
      lang         = 'en',
      bio          = '',
      avatar_url   = '',
    } = req.body || {};

    // Validate
    const errors = {};
    if (!display_name.trim() || display_name.trim().length < 2) {
      errors.display_name = 'Display name must be at least 2 characters';
    }
    const uErr = validateUsername(username.trim());
    if (uErr) errors.username = uErr;

    const eErr = validateEmail(email.trim());
    if (eErr) errors.email = eErr;

    const pErr = validatePassword(password);
    if (pErr) errors.password = pErr;

    if (Object.keys(errors).length) {
      return res.status(400).json({ error: Object.values(errors)[0], errors });
    }

    const cleanUsername = username.trim();
    const cleanEmail    = email.trim().toLowerCase();
    const cleanName     = display_name.trim();

    // Check uniqueness
    const existingUser  = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(cleanUsername);
    const existingEmail = db.prepare('SELECT id FROM users WHERE email    = ? COLLATE NOCASE').get(cleanEmail);

    if (existingUser)  return res.status(409).json({ error: 'Username is already taken' });
    if (existingEmail) return res.status(409).json({ error: 'Email is already registered' });

    // Hash & insert
    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const result = db.prepare(`
      INSERT INTO users (username, email, display_name, password_hash, lang, bio, avatar_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(cleanUsername, cleanEmail, cleanName, password_hash, lang, bio.trim(), avatar_url.trim());

    const newUser = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    if (!newUser) throw new Error('User created but could not be retrieved');

    const token = jwt.sign(
      { id: newUser.id, username: newUser.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    console.log(`[AUTH] ✅ Registered: @${cleanUsername} (id=${newUser.id})`);
    return res.status(201).json({ token, user: toPublicUser(newUser) });

  } catch (err) {
    console.error('[AUTH] Register error:', err.message, err.stack);
    // Catch SQLite UNIQUE constraint (race condition)
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Username or email already taken' });
    }
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier = '', password = '' } = req.body || {};

    if (!identifier.trim()) return res.status(400).json({ error: 'Username or email is required' });
    if (!password)          return res.status(400).json({ error: 'Password is required' });

    const user = db.prepare(`
      SELECT * FROM users WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE
    `).get(identifier.trim(), identifier.trim());

    if (!user) return res.status(401).json({ error: 'Invalid username/email or password' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid username/email or password' });

    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    console.log(`[AUTH] ✅ Login: @${user.username}`);
    return res.json({ token, user: toPublicUser(user) });

  } catch (err) {
    console.error('[AUTH] Login error:', err.message);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// USERS
// ════════════════════════════════════════════════════════════════════════════════

// GET /api/users/me
app.get('/api/users/me', authRequired, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(toPublicUser(user));
});

// PATCH /api/users/me
app.patch('/api/users/me', authRequired, (req, res) => {
  const allowed = ['display_name', 'bio', 'avatar_url', 'lang'];
  const sets = [];
  const vals = [];

  allowed.forEach(key => {
    if (req.body[key] !== undefined) {
      sets.push(`${key} = ?`);
      vals.push(req.body[key]);
    }
  });

  if (!sets.length) return res.status(400).json({ error: 'No valid fields to update' });

  vals.push(req.user.id);
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json(toPublicUser(updated));
});

// GET /api/users/:username
app.get('/api/users/:username', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(toPublicUser(user));
});

// ════════════════════════════════════════════════════════════════════════════════
// TWEETS
// ════════════════════════════════════════════════════════════════════════════════

// GET /api/tweets  — paginated feed (top-level only, newest first)
app.get('/api/tweets', authOptional, (req, res) => {
  const userId  = req.user?.id || 0;
  const limit   = Math.min(Math.max(parseInt(req.query.limit) || 30, 1), 50);
  const since   = parseInt(req.query.since) || 0;   // tweet id (exclusive lower bound for polling)
  const before  = parseInt(req.query.before) || 0;  // tweet id (exclusive upper bound for pagination)

  let sql  = tweetSQL(userId) + ' WHERE t.parent_id IS NULL';
  let args = [];

  if (since > 0) {
    sql  += ' AND t.id > ?';
    args  = [since];
  } else if (before > 0) {
    sql  += ' AND t.id < ?';
    args  = [before];
  }

  sql += ' ORDER BY t.created_at DESC LIMIT ?';
  args.push(limit);

  const rows = db.prepare(sql).all(...args);
  res.json(rows.map(r => formatTweet(r, userId)));
});

// POST /api/tweets
app.post('/api/tweets', authRequired, (req, res) => {
  const { text = '', lang } = req.body || {};

  if (!text.trim())       return res.status(400).json({ error: 'Tweet text is required' });
  if (text.length > 280)  return res.status(400).json({ error: 'Tweet must be 280 characters or fewer' });

  const user       = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const tweetLang  = lang || user?.lang || 'en';

  const result = db.prepare(`
    INSERT INTO tweets (user_id, text, original_lang) VALUES (?, ?, ?)
  `).run(req.user.id, text.trim(), tweetLang);

  const tweet = db.prepare(tweetSQL(req.user.id) + ' WHERE t.id = ?').get(result.lastInsertRowid);
  console.log(`[TWEET] @${req.user.username}: "${text.substring(0, 60)}"`);
  res.status(201).json(formatTweet(tweet, req.user.id));
});

// GET /api/tweets/:id
app.get('/api/tweets/:id', authOptional, (req, res) => {
  const userId = req.user?.id || 0;
  const tweet  = db.prepare(tweetSQL(userId) + ' WHERE t.id = ?').get(req.params.id);
  if (!tweet) return res.status(404).json({ error: 'Tweet not found' });
  res.json(formatTweet(tweet, userId));
});

// DELETE /api/tweets/:id
app.delete('/api/tweets/:id', authRequired, (req, res) => {
  const tweet = db.prepare('SELECT * FROM tweets WHERE id = ?').get(req.params.id);
  if (!tweet)                        return res.status(404).json({ error: 'Tweet not found' });
  if (tweet.user_id !== req.user.id) return res.status(403).json({ error: 'Not your tweet' });

  db.prepare('DELETE FROM tweets WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════════════════
// REPLIES
// ════════════════════════════════════════════════════════════════════════════════

// GET /api/tweets/:id/replies
app.get('/api/tweets/:id/replies', authOptional, (req, res) => {
  const userId = req.user?.id || 0;
  const rows   = db.prepare(tweetSQL(userId) + ' WHERE t.parent_id = ? ORDER BY t.created_at ASC').all(req.params.id);
  res.json(rows.map(r => formatTweet(r, userId)));
});

// POST /api/tweets/:id/replies
app.post('/api/tweets/:id/replies', authRequired, (req, res) => {
  const { text = '', lang } = req.body || {};

  if (!text.trim())      return res.status(400).json({ error: 'Reply text is required' });
  if (text.length > 280) return res.status(400).json({ error: 'Reply must be 280 characters or fewer' });

  const parent = db.prepare('SELECT * FROM tweets WHERE id = ?').get(req.params.id);
  if (!parent) return res.status(404).json({ error: 'Tweet not found' });

  const user       = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const replyLang  = lang || user?.lang || 'en';

  const result = db.prepare(`
    INSERT INTO tweets (user_id, parent_id, text, original_lang) VALUES (?, ?, ?, ?)
  `).run(req.user.id, parent.id, text.trim(), replyLang);

  db.prepare('UPDATE tweets SET replies_count = replies_count + 1 WHERE id = ?').run(parent.id);

  const reply = db.prepare(tweetSQL(req.user.id) + ' WHERE t.id = ?').get(result.lastInsertRowid);
  res.status(201).json(formatTweet(reply, req.user.id));
});

// ════════════════════════════════════════════════════════════════════════════════
// LIKES
// ════════════════════════════════════════════════════════════════════════════════

app.post('/api/tweets/:id/like', authRequired, (req, res) => {
  const tweetId = parseInt(req.params.id);
  const userId  = req.user.id;

  const tweet = db.prepare('SELECT id FROM tweets WHERE id = ?').get(tweetId);
  if (!tweet) return res.status(404).json({ error: 'Tweet not found' });

  const already = db.prepare('SELECT 1 FROM likes WHERE user_id = ? AND tweet_id = ?').get(userId, tweetId);
  if (!already) {
    db.prepare('INSERT OR IGNORE INTO likes (user_id, tweet_id) VALUES (?, ?)').run(userId, tweetId);
    db.prepare('UPDATE tweets SET likes_count = likes_count + 1 WHERE id = ?').run(tweetId);
  }

  const { likes_count } = db.prepare('SELECT likes_count FROM tweets WHERE id = ?').get(tweetId);
  res.json({ liked: true, likes_count });
});

app.delete('/api/tweets/:id/like', authRequired, (req, res) => {
  const tweetId = parseInt(req.params.id);
  const userId  = req.user.id;

  const already = db.prepare('SELECT 1 FROM likes WHERE user_id = ? AND tweet_id = ?').get(userId, tweetId);
  if (already) {
    db.prepare('DELETE FROM likes WHERE user_id = ? AND tweet_id = ?').run(userId, tweetId);
    db.prepare('UPDATE tweets SET likes_count = MAX(0, likes_count - 1) WHERE id = ?').run(tweetId);
  }

  const row = db.prepare('SELECT likes_count FROM tweets WHERE id = ?').get(tweetId);
  res.json({ liked: false, likes_count: row?.likes_count ?? 0 });
});

// ════════════════════════════════════════════════════════════════════════════════
// RETWEETS
// ════════════════════════════════════════════════════════════════════════════════

app.post('/api/tweets/:id/retweet', authRequired, (req, res) => {
  const tweetId = parseInt(req.params.id);
  const userId  = req.user.id;

  const tweet = db.prepare('SELECT id FROM tweets WHERE id = ?').get(tweetId);
  if (!tweet) return res.status(404).json({ error: 'Tweet not found' });

  const already = db.prepare('SELECT 1 FROM retweets WHERE user_id = ? AND tweet_id = ?').get(userId, tweetId);
  if (!already) {
    db.prepare('INSERT OR IGNORE INTO retweets (user_id, tweet_id) VALUES (?, ?)').run(userId, tweetId);
    db.prepare('UPDATE tweets SET retweets_count = retweets_count + 1 WHERE id = ?').run(tweetId);
  }

  const { retweets_count } = db.prepare('SELECT retweets_count FROM tweets WHERE id = ?').get(tweetId);
  res.json({ retweeted: true, retweets_count });
});

app.delete('/api/tweets/:id/retweet', authRequired, (req, res) => {
  const tweetId = parseInt(req.params.id);
  const userId  = req.user.id;

  const already = db.prepare('SELECT 1 FROM retweets WHERE user_id = ? AND tweet_id = ?').get(userId, tweetId);
  if (already) {
    db.prepare('DELETE FROM retweets WHERE user_id = ? AND tweet_id = ?').run(userId, tweetId);
    db.prepare('UPDATE tweets SET retweets_count = MAX(0, retweets_count - 1) WHERE id = ?').run(tweetId);
  }

  const row = db.prepare('SELECT retweets_count FROM tweets WHERE id = ?').get(tweetId);
  res.json({ retweeted: false, retweets_count: row?.retweets_count ?? 0 });
});

// ════════════════════════════════════════════════════════════════════════════════
// BOOKMARKS
// ════════════════════════════════════════════════════════════════════════════════

app.post('/api/tweets/:id/bookmark', authRequired, (req, res) => {
  db.prepare('INSERT OR IGNORE INTO bookmarks (user_id, tweet_id) VALUES (?, ?)').run(req.user.id, parseInt(req.params.id));
  res.json({ bookmarked: true });
});

app.delete('/api/tweets/:id/bookmark', authRequired, (req, res) => {
  db.prepare('DELETE FROM bookmarks WHERE user_id = ? AND tweet_id = ?').run(req.user.id, parseInt(req.params.id));
  res.json({ bookmarked: false });
});

// GET /api/bookmarks  — all bookmarks for current user
app.get('/api/bookmarks', authRequired, (req, res) => {
  const rows = db.prepare(`
    ${tweetSQL(req.user.id)}
    JOIN bookmarks b ON b.tweet_id = t.id AND b.user_id = ?
    ORDER BY b.created_at DESC
  `).all(req.user.id);
  res.json(rows.map(r => formatTweet(r, req.user.id)));
});

// ════════════════════════════════════════════════════════════════════════════════
// TRANSLATION
// ════════════════════════════════════════════════════════════════════════════════

// GET /api/tweets/:id/translate?target=fr
app.get('/api/tweets/:id/translate', authOptional, async (req, res) => {
  const targetLang = (req.query.target || 'en').toLowerCase();
  const tweet      = db.prepare('SELECT * FROM tweets WHERE id = ?').get(req.params.id);

  if (!tweet) return res.status(404).json({ error: 'Tweet not found' });

  // Already in target language
  if (tweet.original_lang === targetLang) {
    return res.json({
      translated_text: tweet.text,
      source_lang:     tweet.original_lang,
      target_lang:     targetLang,
      cached:          false,
    });
  }

  // Check translation cache table
  const cached = db.prepare(
    'SELECT translated FROM translations WHERE tweet_id = ? AND target_lang = ?'
  ).get(tweet.id, targetLang);

  if (cached) {
    return res.json({
      translated_text: cached.translated,
      source_lang:     tweet.original_lang,
      target_lang:     targetLang,
      cached:          true,
    });
  }

  let translated = null;

  // Try LibreTranslate if configured
  if (TRANSLATE_URL) {
    try {
      const fetchFn = global.fetch || require('node-fetch');
      const resp = await fetchFn(`${TRANSLATE_URL}/translate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          q:      tweet.text,
          source: tweet.original_lang,
          target: targetLang,
          format: 'text',
        }),
      });
      const data = await resp.json();
      if (data.translatedText) translated = data.translatedText;
    } catch (err) {
      console.warn('[TRANSLATE] LibreTranslate error:', err.message);
    }
  }

  // Fallback — bracket notation so frontend can recognise and substitute from its own dict
  if (!translated) {
    translated = `[Translated from ${tweet.original_lang.toUpperCase()}] ${tweet.text}`;
  }

  // Cache in DB
  db.prepare(
    'INSERT OR REPLACE INTO translations (tweet_id, target_lang, translated) VALUES (?, ?, ?)'
  ).run(tweet.id, targetLang, translated);

  res.json({
    translated_text: translated,
    source_lang:     tweet.original_lang,
    target_lang:     targetLang,
    cached:          false,
  });
});

// ── Serve frontend SPA fallback ───────────────────────────────────────────────
app.get('/', (_req, res) => {
  const index = path.join(publicDir, 'mtk-twitter.html');
  if (fs.existsSync(index)) return res.sendFile(index);
  res.json({ message: 'Melify API is running. Place compiled frontend in ./public/' });
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[UNHANDLED]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('  🌍  Melify API — ready');
  console.log(`  ➜   http://localhost:${PORT}/api/health`);
  console.log(`  🗄   SQLite: ${DB_PATH}`);
  console.log(`  🔑  JWT expires: ${JWT_EXPIRES}`);
  if (TRANSLATE_URL) {
    console.log(`  🔤  LibreTranslate: ${TRANSLATE_URL}`);
  } else {
    console.log('  🔤  Translation: fallback mode  (set LIBRETRANSLATE_URL for real translation)');
  }
  console.log('');
  console.log('  Demo accounts (password: demo1234)');
  console.log('  @priyasharma · @carlosmendoza · @kenjitanaka · @omarhassan · @natasha_v');
  console.log('');
});

module.exports = app;
