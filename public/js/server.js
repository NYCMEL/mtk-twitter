/**
 * server.js — Melify API
 * Node.js + sql.js  (pure-JS SQLite, zero native compilation)
 *
 * Tables: users · tweets · likes · retweets · bookmarks · translations
 *
 *  npm install
 *  node server.js
 *
 * .env (all optional):
 *   PORT=3002
 *   DB_PATH=./melify.db
 *   JWT_SECRET=change-in-production
 *   JWT_EXPIRES=7d
 *   LIBRETRANSLATE_URL=http://localhost:5000
 *   SAVE_INTERVAL_MS=5000
 */

'use strict';

require('dotenv').config();

const express    = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const cors       = require('cors');
const path       = require('path');
const fs         = require('fs');
const initSqlJs  = require('sql.js');

// ── Config ────────────────────────────────────────────────────────────────────
const PORT          = Number(process.env.PORT)              || 3002;
const DB_PATH       = process.env.DB_PATH                   || path.join(__dirname, 'melify.db');
const JWT_SECRET    = process.env.JWT_SECRET                || 'mtk-twitter-dev-secret-CHANGE-IN-PROD';
const JWT_EXPIRES   = process.env.JWT_EXPIRES               || '7d';
const TRANSLATE_URL = process.env.LIBRETRANSLATE_URL        || null;
const BCRYPT_ROUNDS = 10;
const SAVE_INTERVAL = Number(process.env.SAVE_INTERVAL_MS)  || 5000;

// ── In-memory DB handle (set during bootstrap) ────────────────────────────────
let DB = null;
let dirty = false;

// ── sql.js helper layer ───────────────────────────────────────────────────────
// sql.js uses positional ? params as an array passed to .bind() / getAsObject()
// We wrap it to match a familiar API.

function run(sql, params) {
  try {
    DB.run(sql, params || []);
    dirty = true;
  } catch (e) {
    console.error('[DB:run] Error:', e.message, '\nSQL:', sql, '\nParams:', params);
    throw e;
  }
}

function get(sql, params) {
  try {
    const stmt = DB.prepare(sql);
    if (params && params.length) stmt.bind(params);
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return row;           // null when no row found
  } catch (e) {
    console.error('[DB:get] Error:', e.message, '\nSQL:', sql, '\nParams:', params);
    throw e;
  }
}

function all(sql, params) {
  try {
    const stmt = DB.prepare(sql);
    if (params && params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  } catch (e) {
    console.error('[DB:all] Error:', e.message, '\nSQL:', sql, '\nParams:', params);
    throw e;
  }
}

function saveToDisk() {
  if (!dirty || !DB) return;
  try {
    const data = DB.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
    dirty = false;
  } catch (e) {
    console.error('[DB] Save error:', e.message);
  }
}

// ── Schema ────────────────────────────────────────────────────────────────────
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    display_name  TEXT    NOT NULL,
    password_hash TEXT    NOT NULL,
    lang          TEXT    NOT NULL DEFAULT 'en',
    bio           TEXT    NOT NULL DEFAULT '',
    avatar_url    TEXT    NOT NULL DEFAULT '',
    verified      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tweets (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL,
    parent_id      INTEGER,
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
`;

// ── Seed data ─────────────────────────────────────────────────────────────────
function seedIfEmpty() {
  const row = get('SELECT COUNT(*) AS c FROM users');
  if (row && Number(row.c) > 0) {
    console.log('[DB] Found', Number(row.c), 'existing users — skipping seed');
    return;
  }

  console.log('[DB] Seeding demo data…');
  const hash = bcrypt.hashSync('demo1234', BCRYPT_ROUNDS);
  const av   = 'https://i.pravatar.cc/80?img=';

  const users = [
    ['priyasharma',   'priya@demo.com',   'Priya Sharma',    hash, 'hi', av+'47', 0],
    ['carlosmendoza', 'carlos@demo.com',  'Carlos Mendoza',  hash, 'es', av+'52', 1],
    ['kenjitanaka',   'kenji@demo.com',   'Kenji Tanaka',    hash, 'ja', av+'56', 1],
    ['omarhassan',    'omar@demo.com',    'Omar Hassan',     hash, 'ar', av+'59', 0],
    ['natasha_v',     'natasha@demo.com', 'Natasha Volkova', hash, 'ru', av+'45', 0],
  ];

  users.forEach(u => {
    run(
      'INSERT OR IGNORE INTO users (username,email,display_name,password_hash,lang,avatar_url,verified) VALUES (?,?,?,?,?,?,?)',
      u
    );
  });

  const tweets = [
    ['priyasharma',   'नमस्ते! आज का मौसम बहुत अच्छा है।',                    'hi'],
    ['carlosmendoza', 'La tecnología nos une a todos.',                         'es'],
    ['kenjitanaka',   'この技術は素晴らしいです！言語の壁がなくなりますね。', 'ja'],
    ['omarhassan',    'مرحبا بالجميع! نحن نبني جسور التواصل بين الشعوب.',    'ar'],
    ['natasha_v',     'Технологии меняют мир к лучшему каждый день.',          'ru'],
  ];

  tweets.forEach(([username, text, lang]) => {
    const u = get('SELECT id FROM users WHERE username = ?', [username]);
    if (u) run('INSERT INTO tweets (user_id,text,original_lang) VALUES (?,?,?)', [u.id, text, lang]);
  });

  saveToDisk();
  console.log('[DB] Seeded', users.length, 'users and', tweets.length, 'tweets');
}

// ── Data formatters ───────────────────────────────────────────────────────────
function publicUser(u) {
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

function tweetQuery(userId) {
  const uid = Number(userId) || 0;
  const liked      = uid ? `(SELECT COUNT(*) FROM likes     WHERE user_id=${uid} AND tweet_id=t.id)` : '0';
  const retweeted  = uid ? `(SELECT COUNT(*) FROM retweets  WHERE user_id=${uid} AND tweet_id=t.id)` : '0';
  const bookmarked = uid ? `(SELECT COUNT(*) FROM bookmarks WHERE user_id=${uid} AND tweet_id=t.id)` : '0';
  return `
    SELECT t.id, t.text, t.original_lang,
           t.likes_count, t.retweets_count, t.replies_count,
           t.parent_id, t.created_at,
           u.username, u.display_name, u.avatar_url, u.verified,
           ${liked}     AS user_liked,
           ${retweeted} AS user_retweeted,
           ${bookmarked} AS user_bookmarked
    FROM   tweets t
    JOIN   users  u ON u.id = t.user_id
  `;
}

function formatTweet(r, uid) {
  return {
    id:             Number(r.id),
    text:           r.text,
    original_lang:  r.original_lang,
    likes_count:    Number(r.likes_count),
    retweets_count: Number(r.retweets_count),
    replies_count:  Number(r.replies_count),
    parent_id:      r.parent_id ? Number(r.parent_id) : null,
    created_at:     r.created_at,
    user: {
      name:     r.display_name,
      handle:   r.username,
      avatar:   r.avatar_url || ('https://i.pravatar.cc/80?u=' + r.username),
      verified: Number(r.verified) === 1,
    },
    liked:      Number(r.user_liked)      > 0,
    retweeted:  Number(r.user_retweeted)  > 0,
    bookmarked: Number(r.user_bookmarked) > 0,
  };
}

// ── Validation ────────────────────────────────────────────────────────────────
const RE_USERNAME = /^[a-zA-Z0-9_]+$/;

function validateReg(body) {
  const errs = [];
  const name = (body.display_name || '').trim();
  const user = (body.username     || '').trim();
  const mail = (body.email        || '').trim();
  const pass = (body.password     || '');

  if (!name || name.length < 2)                           errs.push('Display name must be at least 2 characters');
  if (!user)                                              errs.push('Username is required');
  else if (user.length < 3 || user.length > 30)          errs.push('Username must be 3–30 characters');
  else if (!RE_USERNAME.test(user))                       errs.push('Username: letters, numbers and _ only');
  if (!mail || !/.+@.+\..+/.test(mail))                  errs.push('Enter a valid email address');
  if (!pass || pass.length < 8)                          errs.push('Password must be at least 8 characters');
  return errs;
}

// ── Auth helpers ──────────────────────────────────────────────────────────────
function makeToken(user) {
  return jwt.sign({ id: Number(user.id), username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function authRequired(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid or expired token' }); }
}

function authOptional(req, _res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (token) try { req.user = jwt.verify(token, JWT_SECRET); } catch { /* ok */ }
  next();
}

// ════════════════════════════════════════════════════════════════════════════════
// BOOTSTRAP
// ════════════════════════════════════════════════════════════════════════════════
async function bootstrap() {

  // 1. Load sql.js WASM
  const SQL = await initSqlJs();

  // 2. Load or create database
  //    IMPORTANT: if an old better-sqlite3 file exists it will fail to parse.
  //    We detect that and start fresh.
  let loaded = false;
  if (fs.existsSync(DB_PATH)) {
    try {
      const buf = fs.readFileSync(DB_PATH);
      DB = new SQL.Database(buf);
      // Quick smoke-test — if this throws the file is corrupt/incompatible
      DB.run('SELECT 1');
      console.log('[DB] Loaded', DB_PATH);
      loaded = true;
    } catch (e) {
      console.warn('[DB] Could not read existing DB file (may be old better-sqlite3 format). Starting fresh.');
      console.warn('[DB] Detail:', e.message);
      // Rename the broken file instead of deleting it
      const backup = DB_PATH + '.bak.' + Date.now();
      try { fs.renameSync(DB_PATH, backup); console.log('[DB] Old file backed up to', backup); } catch { /* ok */ }
      DB = new SQL.Database();
    }
  } else {
    DB = new SQL.Database();
    console.log('[DB] Created new database');
  }

  // 3. Pragmas
  DB.run('PRAGMA foreign_keys = ON;');

  // 4. Schema (idempotent CREATE IF NOT EXISTS)
  DB.run(SCHEMA);

  // 5. Purge any stale/bad translation cache entries
  //    (bracket-prefix strings written by the old fallback)
  try {
    DB.run("DELETE FROM translations WHERE translated LIKE '[%→%]%'");
    DB.run("DELETE FROM translations WHERE translated LIKE '[%->%]%'");
    dirty = true;
    console.log('[DB] Purged stale translation cache entries');
  } catch(e) { /* table may not exist yet on fresh DB */ }

  // 6. Seed
  seedIfEmpty();

  // 7. Initial save if brand new
  if (!loaded) saveToDisk();

  // 7. Periodic flush
  setInterval(saveToDisk, SAVE_INTERVAL);
  process.on('exit',    saveToDisk);
  process.on('SIGINT',  () => { saveToDisk(); process.exit(0); });
  process.on('SIGTERM', () => { saveToDisk(); process.exit(0); });

  // 8. Start server
  startExpress();
}

// ════════════════════════════════════════════════════════════════════════════════
// EXPRESS
// ════════════════════════════════════════════════════════════════════════════════
function startExpress() {
  const app = express();

  app.use(cors({ origin: '*', methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
  app.options('*', cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const publicDir = path.join(__dirname, 'public');
  if (fs.existsSync(publicDir)) app.use(express.static(publicDir));

  // Logger
  app.use((req, _res, next) => {
    process.stdout.write(`[${new Date().toISOString()}] ${req.method} ${req.path}\n`);
    next();
  });

  // ── Health ──────────────────────────────────────────────────────────────────
  app.get('/api/health', (_req, res) => {
    const u = get('SELECT COUNT(*) AS c FROM users');
    const t = get('SELECT COUNT(*) AS c FROM tweets');
    res.json({ ok: true, app: 'Melify', version: '2.0.0', users: Number(u && u.c), tweets: Number(t && t.c) });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // AUTH — REGISTER
  // ════════════════════════════════════════════════════════════════════════════
  app.post('/api/auth/register', async (req, res) => {
    try {
      const body = req.body || {};

      // Validate
      const errs = validateReg(body);
      if (errs.length) return res.status(400).json({ error: errs[0] });

      const username     = body.username.trim();
      const email        = body.email.trim().toLowerCase();
      const display_name = body.display_name.trim();
      const password     = body.password;
      const lang         = (body.lang        || 'en').trim();
      const bio          = (body.bio         || '').trim();
      const avatar_url   = (body.avatar_url  || '').trim();

      // Uniqueness
      if (get('SELECT id FROM users WHERE username = ? COLLATE NOCASE', [username])) {
        return res.status(409).json({ error: 'Username is already taken' });
      }
      if (get('SELECT id FROM users WHERE email = ? COLLATE NOCASE', [email])) {
        return res.status(409).json({ error: 'Email is already registered' });
      }

      const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      run(
        'INSERT INTO users (username,email,display_name,password_hash,lang,bio,avatar_url) VALUES (?,?,?,?,?,?,?)',
        [username, email, display_name, password_hash, lang, bio, avatar_url]
      );

      const newUser = get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [username]);
      if (!newUser) throw new Error('User row not found after insert');

      saveToDisk();

      const token = makeToken(newUser);
      console.log('[AUTH] Registered @' + username + ' id=' + newUser.id);
      return res.status(201).json({ token, user: publicUser(newUser) });

    } catch (err) {
      console.error('[AUTH] Register error:', err.message);
      if ((err.message || '').includes('UNIQUE')) {
        return res.status(409).json({ error: 'Username or email already taken' });
      }
      return res.status(500).json({ error: 'Registration failed: ' + err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // AUTH — LOGIN
  // ════════════════════════════════════════════════════════════════════════════
  app.post('/api/auth/login', async (req, res) => {
    try {
      const body       = req.body || {};
      const identifier = (body.identifier || '').trim();
      const password   = body.password || '';

      if (!identifier) return res.status(400).json({ error: 'Username or email is required' });
      if (!password)   return res.status(400).json({ error: 'Password is required' });

      // Look up by username OR email — two separate queries to avoid sql.js OR binding issues
      let user = get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [identifier]);
      if (!user) {
        user = get('SELECT * FROM users WHERE email = ? COLLATE NOCASE', [identifier]);
      }

      if (!user) {
        return res.status(401).json({ error: 'No account found with that username or email' });
      }

      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) {
        return res.status(401).json({ error: 'Incorrect password' });
      }

      const token = makeToken(user);
      console.log('[AUTH] Login @' + user.username);
      return res.json({ token, user: publicUser(user) });

    } catch (err) {
      console.error('[AUTH] Login error:', err.message);
      return res.status(500).json({ error: 'Login failed: ' + err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // USERS
  // ════════════════════════════════════════════════════════════════════════════
  app.get('/api/users/me', authRequired, (req, res) => {
    const user = get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(publicUser(user));
  });

  app.patch('/api/users/me', authRequired, (req, res) => {
    const allowed = ['display_name', 'bio', 'avatar_url', 'lang'];
    const sets = [], vals = [];
    allowed.forEach(k => { if (req.body[k] !== undefined) { sets.push(k + '=?'); vals.push(req.body[k]); } });
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
    vals.push(req.user.id);
    run('UPDATE users SET ' + sets.join(',') + ' WHERE id=?', vals);
    saveToDisk();
    const u = get('SELECT * FROM users WHERE id=?', [req.user.id]);
    res.json(publicUser(u));
  });

  app.get('/api/users/:username', (req, res) => {
    const u = get('SELECT * FROM users WHERE username=? COLLATE NOCASE', [req.params.username]);
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json(publicUser(u));
  });

  // ════════════════════════════════════════════════════════════════════════════
  // TWEETS — FEED
  // ════════════════════════════════════════════════════════════════════════════
  app.get('/api/tweets', authOptional, (req, res) => {
    const uid    = req.user?.id || 0;
    const limit  = Math.min(Math.max(parseInt(req.query.limit) || 30, 1), 50);
    const since  = parseInt(req.query.since)  || 0;
    const before = parseInt(req.query.before) || 0;

    let q    = tweetQuery(uid) + ' WHERE t.parent_id IS NULL';
    let args = [];
    if (since  > 0) { q += ' AND t.id > ?'; args.push(since);  }
    if (before > 0) { q += ' AND t.id < ?'; args.push(before); }
    q += ' ORDER BY t.created_at DESC, t.id DESC LIMIT ?';
    args.push(limit);

    const rows = all(q, args);
    res.json(rows.map(r => formatTweet(r, uid)));
  });

  // POST tweet
  app.post('/api/tweets', authRequired, (req, res) => {
    const text = (req.body.text || '').trim();
    if (!text)           return res.status(400).json({ error: 'Text is required' });
    if (text.length > 280) return res.status(400).json({ error: 'Max 280 characters' });

    const user = get('SELECT * FROM users WHERE id=?', [req.user.id]);
    const lang = req.body.lang || user?.lang || 'en';

    run('INSERT INTO tweets (user_id,text,original_lang) VALUES (?,?,?)', [req.user.id, text, lang]);

    // Get the row we just inserted
    const tweet = get(tweetQuery(req.user.id) + ' WHERE t.user_id=? ORDER BY t.id DESC LIMIT 1', [req.user.id]);
    saveToDisk();
    res.status(201).json(formatTweet(tweet, req.user.id));
  });

  // GET single tweet
  app.get('/api/tweets/:id', authOptional, (req, res) => {
    const uid = req.user?.id || 0;
    const t   = get(tweetQuery(uid) + ' WHERE t.id=?', [req.params.id]);
    if (!t) return res.status(404).json({ error: 'Tweet not found' });
    res.json(formatTweet(t, uid));
  });

  // DELETE tweet
  app.delete('/api/tweets/:id', authRequired, (req, res) => {
    const t = get('SELECT * FROM tweets WHERE id=?', [req.params.id]);
    if (!t)                              return res.status(404).json({ error: 'Tweet not found' });
    if (Number(t.user_id) !== req.user.id) return res.status(403).json({ error: 'Not your tweet' });
    run('DELETE FROM tweets WHERE id=?', [req.params.id]);
    saveToDisk();
    res.json({ ok: true });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // REPLIES
  // ════════════════════════════════════════════════════════════════════════════
  app.get('/api/tweets/:id/replies', authOptional, (req, res) => {
    const uid  = req.user?.id || 0;
    const rows = all(tweetQuery(uid) + ' WHERE t.parent_id=? ORDER BY t.created_at ASC', [req.params.id]);
    res.json(rows.map(r => formatTweet(r, uid)));
  });

  app.post('/api/tweets/:id/replies', authRequired, (req, res) => {
    const text = (req.body.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Reply text required' });

    const parent = get('SELECT id FROM tweets WHERE id=?', [req.params.id]);
    if (!parent) return res.status(404).json({ error: 'Tweet not found' });

    const user = get('SELECT * FROM users WHERE id=?', [req.user.id]);
    const lang = req.body.lang || user?.lang || 'en';

    run('INSERT INTO tweets (user_id,parent_id,text,original_lang) VALUES (?,?,?,?)',
      [req.user.id, parent.id, text, lang]);
    run('UPDATE tweets SET replies_count=replies_count+1 WHERE id=?', [parent.id]);

    const reply = get(tweetQuery(req.user.id) + ' WHERE t.user_id=? AND t.parent_id=? ORDER BY t.id DESC LIMIT 1',
      [req.user.id, parent.id]);
    saveToDisk();
    res.status(201).json(formatTweet(reply, req.user.id));
  });

  // ════════════════════════════════════════════════════════════════════════════
  // LIKES
  // ════════════════════════════════════════════════════════════════════════════
  app.post('/api/tweets/:id/like', authRequired, (req, res) => {
    const tid = Number(req.params.id), uid = req.user.id;
    if (!get('SELECT id FROM tweets WHERE id=?', [tid])) return res.status(404).json({ error: 'Not found' });
    if (!get('SELECT 1 AS x FROM likes WHERE user_id=? AND tweet_id=?', [uid, tid])) {
      run('INSERT OR IGNORE INTO likes (user_id,tweet_id) VALUES (?,?)', [uid, tid]);
      run('UPDATE tweets SET likes_count=likes_count+1 WHERE id=?', [tid]);
      saveToDisk();
    }
    const row = get('SELECT likes_count FROM tweets WHERE id=?', [tid]);
    res.json({ liked: true, likes_count: Number(row.likes_count) });
  });

  app.delete('/api/tweets/:id/like', authRequired, (req, res) => {
    const tid = Number(req.params.id), uid = req.user.id;
    if (get('SELECT 1 AS x FROM likes WHERE user_id=? AND tweet_id=?', [uid, tid])) {
      run('DELETE FROM likes WHERE user_id=? AND tweet_id=?', [uid, tid]);
      run('UPDATE tweets SET likes_count=MAX(0,likes_count-1) WHERE id=?', [tid]);
      saveToDisk();
    }
    const row = get('SELECT likes_count FROM tweets WHERE id=?', [tid]);
    res.json({ liked: false, likes_count: row ? Number(row.likes_count) : 0 });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // RETWEETS
  // ════════════════════════════════════════════════════════════════════════════
  app.post('/api/tweets/:id/retweet', authRequired, (req, res) => {
    const tid = Number(req.params.id), uid = req.user.id;
    if (!get('SELECT id FROM tweets WHERE id=?', [tid])) return res.status(404).json({ error: 'Not found' });
    if (!get('SELECT 1 AS x FROM retweets WHERE user_id=? AND tweet_id=?', [uid, tid])) {
      run('INSERT OR IGNORE INTO retweets (user_id,tweet_id) VALUES (?,?)', [uid, tid]);
      run('UPDATE tweets SET retweets_count=retweets_count+1 WHERE id=?', [tid]);
      saveToDisk();
    }
    const row = get('SELECT retweets_count FROM tweets WHERE id=?', [tid]);
    res.json({ retweeted: true, retweets_count: Number(row.retweets_count) });
  });

  app.delete('/api/tweets/:id/retweet', authRequired, (req, res) => {
    const tid = Number(req.params.id), uid = req.user.id;
    if (get('SELECT 1 AS x FROM retweets WHERE user_id=? AND tweet_id=?', [uid, tid])) {
      run('DELETE FROM retweets WHERE user_id=? AND tweet_id=?', [uid, tid]);
      run('UPDATE tweets SET retweets_count=MAX(0,retweets_count-1) WHERE id=?', [tid]);
      saveToDisk();
    }
    const row = get('SELECT retweets_count FROM tweets WHERE id=?', [tid]);
    res.json({ retweeted: false, retweets_count: row ? Number(row.retweets_count) : 0 });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // BOOKMARKS
  // ════════════════════════════════════════════════════════════════════════════
  app.post('/api/tweets/:id/bookmark', authRequired, (req, res) => {
    run('INSERT OR IGNORE INTO bookmarks (user_id,tweet_id) VALUES (?,?)', [req.user.id, Number(req.params.id)]);
    saveToDisk();
    res.json({ bookmarked: true });
  });

  app.delete('/api/tweets/:id/bookmark', authRequired, (req, res) => {
    run('DELETE FROM bookmarks WHERE user_id=? AND tweet_id=?', [req.user.id, Number(req.params.id)]);
    saveToDisk();
    res.json({ bookmarked: false });
  });

  app.get('/api/bookmarks', authRequired, (req, res) => {
    const rows = all(
      tweetQuery(req.user.id) + ' JOIN bookmarks b ON b.tweet_id=t.id AND b.user_id=? ORDER BY b.created_at DESC',
      [req.user.id]
    );
    res.json(rows.map(r => formatTweet(r, req.user.id)));
  });

  // ════════════════════════════════════════════════════════════════════════════
  // TRANSLATION
  // ════════════════════════════════════════════════════════════════════════════

  // Built-in dictionary — covers all 5 seed tweets into all supported languages
  const TRANS_DICT = {
    'नमस्ते! आज का मौसम बहुत अच्छा है।': {
      en: 'Hello! The weather is very nice today.',
      es: '¡Hola! El tiempo está muy bien hoy.',
      fr: "Bonjour! Le temps est très beau aujourd'hui.",
      de: 'Hallo! Das Wetter ist heute sehr schön.',
      zh: '你好！今天天气很好。', ar: 'مرحباً! الطقس جميل جداً اليوم.',
      pt: 'Olá! O tempo está muito bom hoje.', ja: 'こんにちは！今日の天気はとても良いです。',
      ru: 'Привет! Сегодня очень хорошая погода.', ko: '안녕하세요! 오늘 날씨가 매우 좋네요.', it: 'Ciao! Il tempo è molto bello oggi.',
    },
    'La tecnología nos une a todos.': {
      en: 'Technology unites us all.',
      hi: 'प्रौद्योगिकी हम सभी को एकजुट करती है।', fr: 'La technologie nous unit tous.',
      de: 'Technologie verbindet uns alle.', zh: '技术将我们所有人联合在一起。',
      ar: 'التكنولوجيا تجمعنا جميعاً.', pt: 'A tecnologia nos une a todos.',
      ja: 'テクノロジーは私たちみんなをつなげます。', ru: 'Технологии объединяют нас всех.',
      ko: '기술은 우리 모두를 하나로 묶어줍니다.', it: 'La tecnologia ci unisce tutti.',
    },
    'この技術は素晴らしいです！言語の壁がなくなりますね。': {
      en: 'This technology is amazing! Language barriers will disappear.',
      hi: 'यह तकनीक अद्भुत है! भाषा की बाधाएं गायब हो जाएंगी।',
      es: '¡Esta tecnología es increíble! Las barreras del idioma desaparecerán.',
      fr: 'Cette technologie est incroyable! Les barrières linguistiques vont disparaître.',
      de: 'Diese Technologie ist erstaunlich! Sprachbarrieren werden verschwinden.',
      zh: '这项技术太棒了！语言障碍将会消失。', ar: 'هذه التكنولوجيا رائعة! ستختفي الحواجز اللغوية.',
      pt: 'Esta tecnologia é incrível! As barreiras linguísticas vão desaparecer.',
      ru: 'Эта технология удивительна! Языковые барьеры исчезнут.',
      ko: '이 기술은 놀랍습니다! 언어 장벽이 사라질 것입니다.', it: 'Questa tecnologia è incredibile! Le barriere linguistiche scompariranno.',
    },
    'مرحبا بالجميع! نحن نبني جسور التواصل بين الشعوب.': {
      en: 'Hello everyone! We are building bridges of communication between peoples.',
      hi: 'सभी को नमस्ते! हम लोगों के बीच संचार के पुल बना रहे हैं।',
      es: '¡Hola a todos! Estamos construyendo puentes de comunicación entre los pueblos.',
      fr: 'Bonjour à tous! Nous construisons des ponts de communication entre les peuples.',
      de: 'Hallo alle! Wir bauen Kommunikationsbrücken zwischen den Völkern.',
      zh: '大家好！我们正在建立人民之间的沟通桥梁。',
      pt: 'Olá a todos! Estamos construindo pontes de comunicação entre os povos.',
      ja: 'みなさんこんにちは！私たちは人々の間のコミュニケーションの橋を築いています。',
      ru: 'Всем привет! Мы строим мосты общения между народами.',
      ko: '모두 안녕하세요! 우리는 사람들 사이의 소통 다리를 만들고 있습니다.',
      it: 'Ciao a tutti! Stiamo costruendo ponti di comunicazione tra i popoli.',
    },
    'Технологии меняют мир к лучшему каждый день.': {
      en: 'Technology changes the world for the better every day.',
      hi: 'प्रौद्योगिकी हर दिन दुनिया को बेहतर बना रही है।',
      es: 'La tecnología cambia el mundo para mejor cada día.',
      fr: 'La technologie change le monde pour le mieux chaque jour.',
      de: 'Technologie verändert die Welt jeden Tag zum Besseren.',
      zh: '技术每天都在让世界变得更美好。', ar: 'التكنولوجيا تغير العالم نحو الأفضل كل يوم.',
      pt: 'A tecnologia muda o mundo para melhor todos os dias.',
      ja: 'テクノロジーは毎日世界をより良い方向に変えています。',
      ko: '기술은 매일 세상을 더 좋게 변화시킵니다.', it: 'La tecnologia cambia il mondo in meglio ogni giorno.',
    },
  };

  function dictLookup(text, target) {
    const norm = s => s.trim().replace(/\s+/g, ' ');
    const n = norm(text);
    for (const k of Object.keys(TRANS_DICT)) {
      if ((k === text || norm(k) === n) && TRANS_DICT[k][target]) return TRANS_DICT[k][target];
    }
    return null;
  }

  app.get('/api/tweets/:id/translate', authOptional, async (req, res) => {
    const target = (req.query.target || 'en').toLowerCase();
    const tweet  = get('SELECT * FROM tweets WHERE id=?', [req.params.id]);
    if (!tweet) return res.status(404).json({ error: 'Tweet not found' });

    // Same language — no translation needed
    if (tweet.original_lang === target) {
      return res.json({ translated_text: tweet.text, source_lang: tweet.original_lang, target_lang: target, cached: false });
    }

    // 1. Built-in dictionary always wins (fastest, most reliable for seed tweets)
    const dictResult = dictLookup(tweet.text, target);
    if (dictResult) {
      console.log('[TRANSLATE] dict hit: tweet', tweet.id, tweet.original_lang, '->', target);
      // Update DB cache with the correct value
      run('INSERT OR REPLACE INTO translations (tweet_id,target_lang,translated) VALUES (?,?,?)', [tweet.id, target, dictResult]);
      saveToDisk();
      return res.json({ translated_text: dictResult, source_lang: tweet.original_lang, target_lang: target, cached: false });
    }

    // 2. DB cache (for user-posted tweets translated previously)
    const cached = get('SELECT translated FROM translations WHERE tweet_id=? AND target_lang=?', [tweet.id, target]);
    if (cached) {
      return res.json({ translated_text: cached.translated, source_lang: tweet.original_lang, target_lang: target, cached: true });
    }

    // 3. LibreTranslate (if configured)
    let translated = null;
    if (TRANSLATE_URL) {
      try {
        const fetchFn = global.fetch || require('node-fetch');
        const r = await fetchFn(TRANSLATE_URL + '/translate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: tweet.text, source: tweet.original_lang, target, format: 'text' }),
        });
        const d = await r.json();
        if (d.translatedText) { translated = d.translatedText; console.log('[TRANSLATE] LibreTranslate hit'); }
      } catch (e) { console.warn('[TRANSLATE]', e.message); }
    }

    // 4. Last resort — return original text unchanged
    if (!translated) {
      console.log('[TRANSLATE] no translation found for tweet', tweet.id, tweet.original_lang, '->', target);
      translated = tweet.text;
    }

    // Cache result in DB
    run('INSERT OR REPLACE INTO translations (tweet_id,target_lang,translated) VALUES (?,?,?)', [tweet.id, target, translated]);
    saveToDisk();
    res.json({ translated_text: translated, source_lang: tweet.original_lang, target_lang: target, cached: false });
  });

  // ── Fallback ──────────────────────────────────────────────────────────────
  app.get('/', (_req, res) => {
    const idx = path.join(__dirname, 'public', 'mtk-twitter.html');
    if (fs.existsSync(idx)) return res.sendFile(idx);
    res.json({ message: 'Melify API running. Deploy frontend to ./public/' });
  });

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((err, _req, res, _next) => { console.error('[ERR]', err); res.status(500).json({ error: 'Server error' }); });

  // ── Listen ────────────────────────────────────────────────────────────────
  app.listen(PORT, () => {
    console.log('\n  🌍  Melify API ready');
    console.log('  ➜   http://localhost:' + PORT + '/api/health');
    console.log('  🗄   ' + DB_PATH);
    console.log('  🔑  JWT: ' + JWT_EXPIRES);
    console.log(TRANSLATE_URL ? '  🔤  LibreTranslate: ' + TRANSLATE_URL : '  🔤  Translation: fallback mode');
    console.log('\n  Demo accounts  (password: demo1234)');
    console.log('  @priyasharma  @carlosmendoza  @kenjitanaka  @omarhassan  @natasha_v\n');
  });
}

bootstrap().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
