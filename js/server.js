/**
 * server.js — Melify API
 * Node.js + sql.js (pure-JavaScript SQLite — no native compilation)
 *
 * Tables:  users · tweets · likes · retweets · bookmarks · translations
 *
 * Quick start:
 *   npm install
 *   node server.js
 *
 * Environment (.env):
 *   PORT                  default 3001
 *   DB_PATH               default ./melify.db   (binary file persisted to disk)
 *   JWT_SECRET            change in production
 *   JWT_EXPIRES           default 7d
 *   LIBRETRANSLATE_URL    e.g. http://localhost:5000  (optional real translation)
 *   SAVE_INTERVAL_MS      default 5000  (how often DB is flushed to disk)
 */

'use strict';

require('dotenv').config();

const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');
const initSqlJs = require('sql.js');

// ── Config ────────────────────────────────────────────────────────────────────
const PORT           = Number(process.env.PORT)           || 3001;
const DB_PATH        = process.env.DB_PATH                || path.join(__dirname, 'melify.db');
const JWT_SECRET     = process.env.JWT_SECRET             || 'mtk-twitter-dev-secret-CHANGE-IN-PROD';
const JWT_EXPIRES    = process.env.JWT_EXPIRES            || '7d';
const TRANSLATE_URL  = process.env.LIBRETRANSLATE_URL     || null;
const BCRYPT_ROUNDS  = 10;
const SAVE_INTERVAL  = Number(process.env.SAVE_INTERVAL_MS) || 5000;

// ── sql.js thin synchronous wrapper ──────────────────────────────────────────
// sql.js is async to init, but all queries are synchronous after that.
// We expose a better-sqlite3-style API so the route code is clean.

let _sqlDb = null;      // sql.js Database instance
let _dirty = false;     // true when in-memory DB differs from disk

function dbRun(sql, params = []) {
  _sqlDb.run(sql, params);
  _dirty = true;
}

function dbGet(sql, params = []) {
  const stmt   = _sqlDb.prepare(sql);
  const result = stmt.getAsObject(params);
  stmt.free();
  // sql.js returns {} when no row found
  return Object.keys(result).length === 0 ? undefined : result;
}

function dbAll(sql, params = []) {
  const stmt = _sqlDb.prepare(sql);
  const rows = [];
  stmt.bind(params);
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function dbExec(sql) {
  _sqlDb.run(sql);
  _dirty = true;
}

// Persist in-memory DB to disk
function saveToDisk() {
  if (!_dirty) return;
  const data = _sqlDb.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  _dirty = false;
}

// ── Schema ────────────────────────────────────────────────────────────────────
const SCHEMA = `
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
    created_at    TEXT     NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tweets (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL REFERENCES users(id),
    parent_id      INTEGER REFERENCES tweets(id),
    text           TEXT    NOT NULL,
    original_lang  TEXT    NOT NULL DEFAULT 'en',
    likes_count    INTEGER NOT NULL DEFAULT 0,
    retweets_count INTEGER NOT NULL DEFAULT 0,
    replies_count  INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS likes (
    user_id    INTEGER NOT NULL,
    tweet_id   INTEGER NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, tweet_id)
  );

  CREATE TABLE IF NOT EXISTS retweets (
    user_id    INTEGER NOT NULL,
    tweet_id   INTEGER NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, tweet_id)
  );

  CREATE TABLE IF NOT EXISTS bookmarks (
    user_id    INTEGER NOT NULL,
    tweet_id   INTEGER NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, tweet_id)
  );

  CREATE TABLE IF NOT EXISTS translations (
    tweet_id     INTEGER NOT NULL,
    target_lang  TEXT    NOT NULL,
    translated   TEXT    NOT NULL,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (tweet_id, target_lang)
  );

  CREATE INDEX IF NOT EXISTS idx_tweets_user    ON tweets(user_id);
  CREATE INDEX IF NOT EXISTS idx_tweets_created ON tweets(created_at);
  CREATE INDEX IF NOT EXISTS idx_tweets_parent  ON tweets(parent_id);
  CREATE INDEX IF NOT EXISTS idx_likes_tweet    ON likes(tweet_id);
  CREATE INDEX IF NOT EXISTS idx_rt_tweet       ON retweets(tweet_id);
  CREATE INDEX IF NOT EXISTS idx_bk_user        ON bookmarks(user_id);
`;

// ── Seed demo data ────────────────────────────────────────────────────────────
function seedIfEmpty() {
  const count = dbGet('SELECT COUNT(*) AS c FROM users').c;
  if (Number(count) > 0) return;

  console.log('[DB] Seeding demo data…');
  const hash = bcrypt.hashSync('demo1234', BCRYPT_ROUNDS);
  const av   = 'https://i.pravatar.cc/80?img=';

  const demoUsers = [
    { username: 'priyasharma',   email: 'priya@demo.com',   display_name: 'Priya Sharma',    lang: 'hi', avatar_url: av+'47', verified: 0 },
    { username: 'carlosmendoza', email: 'carlos@demo.com',  display_name: 'Carlos Mendoza',  lang: 'es', avatar_url: av+'52', verified: 1 },
    { username: 'kenjitanaka',   email: 'kenji@demo.com',   display_name: 'Kenji Tanaka',    lang: 'ja', avatar_url: av+'56', verified: 1 },
    { username: 'omarhassan',    email: 'omar@demo.com',    display_name: 'Omar Hassan',     lang: 'ar', avatar_url: av+'59', verified: 0 },
    { username: 'natasha_v',     email: 'natasha@demo.com', display_name: 'Natasha Volkova', lang: 'ru', avatar_url: av+'45', verified: 0 },
  ];

  const demoTweets = [
    { username: 'priyasharma',   text: 'नमस्ते! आज का मौसम बहुत अच्छा है।',                    lang: 'hi' },
    { username: 'carlosmendoza', text: 'La tecnología nos une a todos.',                         lang: 'es' },
    { username: 'kenjitanaka',   text: 'この技術は素晴らしいです！言語の壁がなくなりますね。', lang: 'ja' },
    { username: 'omarhassan',    text: 'مرحبا بالجميع! نحن نبني جسور التواصل بين الشعوب.',    lang: 'ar' },
    { username: 'natasha_v',     text: 'Технологии меняют мир к лучшему каждый день.',          lang: 'ru' },
  ];

  demoUsers.forEach(u => {
    dbRun(
      `INSERT OR IGNORE INTO users (username, email, display_name, password_hash, lang, avatar_url, verified)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [u.username, u.email, u.display_name, hash, u.lang, u.avatar_url, u.verified]
    );
  });

  demoTweets.forEach(t => {
    const user = dbGet('SELECT id FROM users WHERE username = ?', [t.username]);
    if (user) {
      dbRun(
        'INSERT INTO tweets (user_id, text, original_lang) VALUES (?, ?, ?)',
        [user.id, t.text, t.lang]
      );
    }
  });

  saveToDisk();
  console.log('[DB] Seeded', demoUsers.length, 'users and', demoTweets.length, 'tweets');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toPublicUser(u) {
  return {
    id:           Number(u.id),
    username:     u.username,
    display_name: u.display_name,
    lang:         u.lang,
    bio:          u.bio || '',
    avatar_url:   u.avatar_url || ('https://i.pravatar.cc/80?u=' + u.username),
    verified:     Number(u.verified) === 1,
    created_at:   u.created_at,
  };
}

function tweetSQL(userId) {
  const uid = Number(userId) || 0;
  return `
    SELECT
      t.id, t.text, t.original_lang,
      t.likes_count, t.retweets_count, t.replies_count,
      t.parent_id,   t.created_at,
      u.username,    u.display_name, u.avatar_url, u.verified,
      ${uid
        ? `(SELECT COUNT(*) FROM likes     WHERE user_id=${uid} AND tweet_id=t.id)`
        : '0'
      } AS user_liked,
      ${uid
        ? `(SELECT COUNT(*) FROM retweets  WHERE user_id=${uid} AND tweet_id=t.id)`
        : '0'
      } AS user_retweeted,
      ${uid
        ? `(SELECT COUNT(*) FROM bookmarks WHERE user_id=${uid} AND tweet_id=t.id)`
        : '0'
      } AS user_bookmarked
    FROM  tweets t
    JOIN  users  u ON u.id = t.user_id
  `;
}

function formatTweet(row, userId) {
  return {
    id:             Number(row.id),
    text:           row.text,
    original_lang:  row.original_lang,
    likes_count:    Number(row.likes_count),
    retweets_count: Number(row.retweets_count),
    replies_count:  Number(row.replies_count),
    parent_id:      row.parent_id ? Number(row.parent_id) : null,
    created_at:     row.created_at,
    user: {
      name:     row.display_name,
      handle:   row.username,
      avatar:   row.avatar_url || ('https://i.pravatar.cc/80?u=' + row.username),
      verified: Number(row.verified) === 1,
    },
    liked:      Number(row.user_liked)      > 0,
    retweeted:  Number(row.user_retweeted)  > 0,
    bookmarked: Number(row.user_bookmarked) > 0,
  };
}

// ── Validation ────────────────────────────────────────────────────────────────
function validateUsername(u) {
  if (!u || typeof u !== 'string')      return 'Username is required';
  if (u.length < 3 || u.length > 30)   return 'Username must be 3–30 characters';
  if (!/^[a-zA-Z0-9_]+$/.test(u))      return 'Username: letters, numbers and _ only';
  return null;
}
function validateEmail(e) {
  if (!e || typeof e !== 'string')      return 'Email is required';
  if (!/.+@.+\..+/.test(e))            return 'Enter a valid email address';
  return null;
}
function validatePassword(p) {
  if (!p || typeof p !== 'string')      return 'Password is required';
  if (p.length < 8)                     return 'Password must be at least 8 characters';
  return null;
}

// ── Auth middleware ───────────────────────────────────────────────────────────
function authRequired(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function authOptional(req, _res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  if (token) {
    try { req.user = jwt.verify(token, JWT_SECRET); } catch { /* anonymous ok */ }
  }
  next();
}

// ════════════════════════════════════════════════════════════════════════════════
// BOOTSTRAP — init sql.js, load or create DB, then start Express
// ════════════════════════════════════════════════════════════════════════════════
async function bootstrap() {
  // 1. Init sql.js (loads the WASM binary)
  const SQL = await initSqlJs();

  // 2. Load existing DB file from disk, or create fresh
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    _sqlDb = new SQL.Database(fileBuffer);
    console.log('[DB] Loaded existing database from', DB_PATH);
  } else {
    _sqlDb = new SQL.Database();
    console.log('[DB] Created new in-memory database');
  }

  // 3. Enable foreign keys + WAL equivalent pragmas
  _sqlDb.run('PRAGMA foreign_keys = ON;');
  _sqlDb.run('PRAGMA journal_mode = MEMORY;');

  // 4. Apply schema
  _sqlDb.run(SCHEMA);

  // 5. Seed if empty
  seedIfEmpty();

  // 6. Periodic save to disk
  setInterval(saveToDisk, SAVE_INTERVAL);

  // 7. Save on clean exit
  process.on('exit',    saveToDisk);
  process.on('SIGINT',  () => { saveToDisk(); process.exit(0); });
  process.on('SIGTERM', () => { saveToDisk(); process.exit(0); });

  // 8. Start Express
  startExpress();
}

// ════════════════════════════════════════════════════════════════════════════════
// EXPRESS APP
// ════════════════════════════════════════════════════════════════════════════════
function startExpress() {
  const app = express();

  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
  app.options('*', cors());

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const publicDir = path.join(__dirname, 'public');
  if (fs.existsSync(publicDir)) app.use(express.static(publicDir));

  // Request logger
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });

  // ── Health ──────────────────────────────────────────────────────────────────
  app.get('/api/health', (_req, res) => {
    const users  = Number(dbGet('SELECT COUNT(*) AS c FROM users').c);
    const tweets = Number(dbGet('SELECT COUNT(*) AS c FROM tweets').c);
    res.json({ ok: true, app: 'Melify', version: '2.0.0', users, tweets });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // AUTH
  // ════════════════════════════════════════════════════════════════════════════

  // POST /api/auth/register
  app.post('/api/auth/register', async (req, res) => {
    try {
      const body         = req.body || {};
      const display_name = (body.display_name || '').trim();
      const username     = (body.username     || '').trim();
      const email        = (body.email        || '').trim().toLowerCase();
      const password     = (body.password     || '');
      const lang         = (body.lang         || 'en').trim();
      const bio          = (body.bio          || '').trim();
      const avatar_url   = (body.avatar_url   || '').trim();

      // Validate fields
      const errs = [];
      if (!display_name || display_name.length < 2) errs.push('Display name must be at least 2 characters');
      const uErr = validateUsername(username);  if (uErr) errs.push(uErr);
      const eErr = validateEmail(email);        if (eErr) errs.push(eErr);
      const pErr = validatePassword(password);  if (pErr) errs.push(pErr);

      if (errs.length) {
        return res.status(400).json({ error: errs[0] });
      }

      // Uniqueness checks
      const existingUsername = dbGet('SELECT id FROM users WHERE username = ? COLLATE NOCASE', [username]);
      if (existingUsername) return res.status(409).json({ error: 'Username is already taken' });

      const existingEmail = dbGet('SELECT id FROM users WHERE email = ? COLLATE NOCASE', [email]);
      if (existingEmail) return res.status(409).json({ error: 'Email is already registered' });

      // Hash password
      const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      // Insert user
      dbRun(
        `INSERT INTO users (username, email, display_name, password_hash, lang, bio, avatar_url)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [username, email, display_name, password_hash, lang, bio, avatar_url]
      );

      // Retrieve the new user
      const newUser = dbGet('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [username]);
      if (!newUser) throw new Error('User created but could not be retrieved');

      const token = jwt.sign(
        { id: Number(newUser.id), username: newUser.username },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES }
      );

      saveToDisk();
      console.log(`[AUTH] ✅ Registered: @${username} (id=${newUser.id})`);
      return res.status(201).json({ token, user: toPublicUser(newUser) });

    } catch (err) {
      console.error('[AUTH] Register error:', err.message);
      if (err.message && err.message.includes('UNIQUE')) {
        return res.status(409).json({ error: 'Username or email already taken' });
      }
      return res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
  });

  // POST /api/auth/login
  app.post('/api/auth/login', async (req, res) => {
    try {
      const body       = req.body || {};
      const identifier = (body.identifier || '').trim();
      const password   = (body.password   || '');

      if (!identifier) return res.status(400).json({ error: 'Username or email is required' });
      if (!password)   return res.status(400).json({ error: 'Password is required' });

      const user = dbGet(
        'SELECT * FROM users WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE',
        [identifier, identifier]
      );

      if (!user) return res.status(401).json({ error: 'Invalid username/email or password' });

      const match = await bcrypt.compare(password, user.password_hash);
      if (!match)  return res.status(401).json({ error: 'Invalid username/email or password' });

      const token = jwt.sign(
        { id: Number(user.id), username: user.username },
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

  // ════════════════════════════════════════════════════════════════════════════
  // USERS
  // ════════════════════════════════════════════════════════════════════════════

  app.get('/api/users/me', authRequired, (req, res) => {
    const user = dbGet('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(toPublicUser(user));
  });

  app.patch('/api/users/me', authRequired, (req, res) => {
    const allowed = ['display_name', 'bio', 'avatar_url', 'lang'];
    const sets = [], vals = [];

    allowed.forEach(key => {
      if (req.body[key] !== undefined) {
        sets.push(key + ' = ?');
        vals.push(req.body[key]);
      }
    });

    if (!sets.length) return res.status(400).json({ error: 'No valid fields to update' });

    vals.push(req.user.id);
    dbRun('UPDATE users SET ' + sets.join(', ') + ' WHERE id = ?', vals);
    saveToDisk();

    const updated = dbGet('SELECT * FROM users WHERE id = ?', [req.user.id]);
    res.json(toPublicUser(updated));
  });

  app.get('/api/users/:username', (req, res) => {
    const user = dbGet('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [req.params.username]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(toPublicUser(user));
  });

  // ════════════════════════════════════════════════════════════════════════════
  // TWEETS
  // ════════════════════════════════════════════════════════════════════════════

  app.get('/api/tweets', authOptional, (req, res) => {
    const userId = req.user?.id || 0;
    const limit  = Math.min(Math.max(parseInt(req.query.limit) || 30, 1), 50);
    const since  = parseInt(req.query.since)  || 0;
    const before = parseInt(req.query.before) || 0;

    let sql  = tweetSQL(userId) + ' WHERE t.parent_id IS NULL';
    let args = [];

    if (since > 0)        { sql += ' AND t.id > ?'; args = [since]; }
    else if (before > 0)  { sql += ' AND t.id < ?'; args = [before]; }

    sql += ' ORDER BY t.created_at DESC LIMIT ?';
    args.push(limit);

    const rows = dbAll(sql, args);
    res.json(rows.map(r => formatTweet(r, userId)));
  });

  app.post('/api/tweets', authRequired, (req, res) => {
    const text = (req.body.text || '').trim();
    const lang = req.body.lang;

    if (!text)          return res.status(400).json({ error: 'Tweet text is required' });
    if (text.length > 280) return res.status(400).json({ error: 'Tweet must be 280 characters or fewer' });

    const user      = dbGet('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const tweetLang = lang || user?.lang || 'en';

    dbRun('INSERT INTO tweets (user_id, text, original_lang) VALUES (?, ?, ?)',
      [req.user.id, text, tweetLang]);

    const newTweet = dbGet(tweetSQL(req.user.id) + ' WHERE t.id = (SELECT MAX(id) FROM tweets WHERE user_id = ?)',
      [req.user.id]);

    saveToDisk();
    console.log(`[TWEET] @${req.user.username}: "${text.substring(0, 60)}"`);
    res.status(201).json(formatTweet(newTweet, req.user.id));
  });

  app.get('/api/tweets/:id', authOptional, (req, res) => {
    const userId = req.user?.id || 0;
    const tweet  = dbGet(tweetSQL(userId) + ' WHERE t.id = ?', [req.params.id]);
    if (!tweet) return res.status(404).json({ error: 'Tweet not found' });
    res.json(formatTweet(tweet, userId));
  });

  app.delete('/api/tweets/:id', authRequired, (req, res) => {
    const tweet = dbGet('SELECT * FROM tweets WHERE id = ?', [req.params.id]);
    if (!tweet)                             return res.status(404).json({ error: 'Tweet not found' });
    if (Number(tweet.user_id) !== req.user.id) return res.status(403).json({ error: 'Not your tweet' });
    dbRun('DELETE FROM tweets WHERE id = ?', [req.params.id]);
    saveToDisk();
    res.json({ ok: true });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // REPLIES
  // ════════════════════════════════════════════════════════════════════════════

  app.get('/api/tweets/:id/replies', authOptional, (req, res) => {
    const userId = req.user?.id || 0;
    const rows   = dbAll(tweetSQL(userId) + ' WHERE t.parent_id = ? ORDER BY t.created_at ASC', [req.params.id]);
    res.json(rows.map(r => formatTweet(r, userId)));
  });

  app.post('/api/tweets/:id/replies', authRequired, (req, res) => {
    const text = (req.body.text || '').trim();
    const lang = req.body.lang;

    if (!text)           return res.status(400).json({ error: 'Reply text is required' });
    if (text.length > 280) return res.status(400).json({ error: 'Reply must be 280 characters or fewer' });

    const parent = dbGet('SELECT id FROM tweets WHERE id = ?', [req.params.id]);
    if (!parent) return res.status(404).json({ error: 'Tweet not found' });

    const user      = dbGet('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const replyLang = lang || user?.lang || 'en';

    dbRun('INSERT INTO tweets (user_id, parent_id, text, original_lang) VALUES (?, ?, ?, ?)',
      [req.user.id, parent.id, text, replyLang]);
    dbRun('UPDATE tweets SET replies_count = replies_count + 1 WHERE id = ?', [parent.id]);

    const reply = dbGet(tweetSQL(req.user.id) + ' WHERE t.id = (SELECT MAX(id) FROM tweets WHERE user_id = ? AND parent_id = ?)',
      [req.user.id, parent.id]);

    saveToDisk();
    res.status(201).json(formatTweet(reply, req.user.id));
  });

  // ════════════════════════════════════════════════════════════════════════════
  // LIKES
  // ════════════════════════════════════════════════════════════════════════════

  app.post('/api/tweets/:id/like', authRequired, (req, res) => {
    const tweetId = Number(req.params.id);
    const userId  = req.user.id;
    if (!dbGet('SELECT id FROM tweets WHERE id = ?', [tweetId])) {
      return res.status(404).json({ error: 'Tweet not found' });
    }
    const already = dbGet('SELECT 1 AS x FROM likes WHERE user_id = ? AND tweet_id = ?', [userId, tweetId]);
    if (!already) {
      dbRun('INSERT OR IGNORE INTO likes (user_id, tweet_id) VALUES (?, ?)', [userId, tweetId]);
      dbRun('UPDATE tweets SET likes_count = likes_count + 1 WHERE id = ?', [tweetId]);
      saveToDisk();
    }
    const { likes_count } = dbGet('SELECT likes_count FROM tweets WHERE id = ?', [tweetId]);
    res.json({ liked: true, likes_count: Number(likes_count) });
  });

  app.delete('/api/tweets/:id/like', authRequired, (req, res) => {
    const tweetId = Number(req.params.id);
    const userId  = req.user.id;
    const already = dbGet('SELECT 1 AS x FROM likes WHERE user_id = ? AND tweet_id = ?', [userId, tweetId]);
    if (already) {
      dbRun('DELETE FROM likes WHERE user_id = ? AND tweet_id = ?', [userId, tweetId]);
      dbRun('UPDATE tweets SET likes_count = MAX(0, likes_count - 1) WHERE id = ?', [tweetId]);
      saveToDisk();
    }
    const row = dbGet('SELECT likes_count FROM tweets WHERE id = ?', [tweetId]);
    res.json({ liked: false, likes_count: row ? Number(row.likes_count) : 0 });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // RETWEETS
  // ════════════════════════════════════════════════════════════════════════════

  app.post('/api/tweets/:id/retweet', authRequired, (req, res) => {
    const tweetId = Number(req.params.id);
    const userId  = req.user.id;
    if (!dbGet('SELECT id FROM tweets WHERE id = ?', [tweetId])) {
      return res.status(404).json({ error: 'Tweet not found' });
    }
    const already = dbGet('SELECT 1 AS x FROM retweets WHERE user_id = ? AND tweet_id = ?', [userId, tweetId]);
    if (!already) {
      dbRun('INSERT OR IGNORE INTO retweets (user_id, tweet_id) VALUES (?, ?)', [userId, tweetId]);
      dbRun('UPDATE tweets SET retweets_count = retweets_count + 1 WHERE id = ?', [tweetId]);
      saveToDisk();
    }
    const { retweets_count } = dbGet('SELECT retweets_count FROM tweets WHERE id = ?', [tweetId]);
    res.json({ retweeted: true, retweets_count: Number(retweets_count) });
  });

  app.delete('/api/tweets/:id/retweet', authRequired, (req, res) => {
    const tweetId = Number(req.params.id);
    const userId  = req.user.id;
    const already = dbGet('SELECT 1 AS x FROM retweets WHERE user_id = ? AND tweet_id = ?', [userId, tweetId]);
    if (already) {
      dbRun('DELETE FROM retweets WHERE user_id = ? AND tweet_id = ?', [userId, tweetId]);
      dbRun('UPDATE tweets SET retweets_count = MAX(0, retweets_count - 1) WHERE id = ?', [tweetId]);
      saveToDisk();
    }
    const row = dbGet('SELECT retweets_count FROM tweets WHERE id = ?', [tweetId]);
    res.json({ retweeted: false, retweets_count: row ? Number(row.retweets_count) : 0 });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // BOOKMARKS
  // ════════════════════════════════════════════════════════════════════════════

  app.post('/api/tweets/:id/bookmark', authRequired, (req, res) => {
    dbRun('INSERT OR IGNORE INTO bookmarks (user_id, tweet_id) VALUES (?, ?)', [req.user.id, Number(req.params.id)]);
    saveToDisk();
    res.json({ bookmarked: true });
  });

  app.delete('/api/tweets/:id/bookmark', authRequired, (req, res) => {
    dbRun('DELETE FROM bookmarks WHERE user_id = ? AND tweet_id = ?', [req.user.id, Number(req.params.id)]);
    saveToDisk();
    res.json({ bookmarked: false });
  });

  app.get('/api/bookmarks', authRequired, (req, res) => {
    const rows = dbAll(
      tweetSQL(req.user.id) +
      ' JOIN bookmarks b ON b.tweet_id = t.id AND b.user_id = ? ORDER BY b.created_at DESC',
      [req.user.id]
    );
    res.json(rows.map(r => formatTweet(r, req.user.id)));
  });

  // ════════════════════════════════════════════════════════════════════════════
  // TRANSLATION
  // ════════════════════════════════════════════════════════════════════════════

  app.get('/api/tweets/:id/translate', authOptional, async (req, res) => {
    const targetLang = (req.query.target || 'en').toLowerCase();
    const tweet = dbGet('SELECT * FROM tweets WHERE id = ?', [req.params.id]);
    if (!tweet) return res.status(404).json({ error: 'Tweet not found' });

    if (tweet.original_lang === targetLang) {
      return res.json({ translated_text: tweet.text, source_lang: tweet.original_lang, target_lang: targetLang, cached: false });
    }

    const cached = dbGet('SELECT translated FROM translations WHERE tweet_id = ? AND target_lang = ?',
      [tweet.id, targetLang]);
    if (cached) {
      return res.json({ translated_text: cached.translated, source_lang: tweet.original_lang, target_lang: targetLang, cached: true });
    }

    let translated = null;
    if (TRANSLATE_URL) {
      try {
        const fetchFn = global.fetch || require('node-fetch');
        const resp = await fetchFn(TRANSLATE_URL + '/translate', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ q: tweet.text, source: tweet.original_lang, target: targetLang, format: 'text' }),
        });
        const data = await resp.json();
        if (data.translatedText) translated = data.translatedText;
      } catch (err) {
        console.warn('[TRANSLATE] LibreTranslate error:', err.message);
      }
    }

    if (!translated) {
      translated = '[Translated from ' + tweet.original_lang.toUpperCase() + '] ' + tweet.text;
    }

    dbRun('INSERT OR REPLACE INTO translations (tweet_id, target_lang, translated) VALUES (?, ?, ?)',
      [tweet.id, targetLang, translated]);
    saveToDisk();

    res.json({ translated_text: translated, source_lang: tweet.original_lang, target_lang: targetLang, cached: false });
  });

  // ── SPA fallback ─────────────────────────────────────────────────────────────
  app.get('/', (_req, res) => {
    const idx = path.join(__dirname, 'public', 'mtk-twitter.html');
    if (fs.existsSync(idx)) return res.sendFile(idx);
    res.json({ message: 'Melify API is running. Place compiled frontend in ./public/' });
  });

  app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

  app.use((err, _req, res, _next) => {
    console.error('[UNHANDLED]', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  app.listen(PORT, () => {
    console.log('');
    console.log('  🌍  Melify API — ready');
    console.log('  ➜   http://localhost:' + PORT + '/api/health');
    console.log('  🗄   SQLite (sql.js): ' + DB_PATH);
    console.log('  🔑  JWT expires: ' + JWT_EXPIRES);
    if (TRANSLATE_URL) {
      console.log('  🔤  LibreTranslate: ' + TRANSLATE_URL);
    } else {
      console.log('  🔤  Translation: fallback (set LIBRETRANSLATE_URL for real translation)');
    }
    console.log('');
    console.log('  Demo accounts  password: demo1234');
    console.log('  @priyasharma  @carlosmendoza  @kenjitanaka  @omarhassan  @natasha_v');
    console.log('');
  });
}

// Kick everything off
bootstrap().catch(err => {
  console.error('[FATAL] Failed to start:', err);
  process.exit(1);
});
