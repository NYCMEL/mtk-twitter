/**
 * server.js — Melify API
 * Node.js v24+ built-in sqlite (node:sqlite) — writes directly to disk, no in-memory export needed
 * Zero native compilation, no extra npm packages for the database
 *
 * npm install  (only needs: express bcryptjs jsonwebtoken cors dotenv)
 * node server.js
 */

'use strict';

require('dotenv').config();

// node:sqlite requires --experimental-sqlite flag (Node 22+)
// If not available, we show a clear error
let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  console.error('\n  ❌  ERROR: node:sqlite not available.');
  console.error('  Run the server with:  node --experimental-sqlite server.js');
  console.error('  Or use the run script: ./run-server\n');
  process.exit(1);
}
const express   = require('express');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const cors      = require('cors');
const path      = require('path');
const fs        = require('fs');

// ── Config ────────────────────────────────────────────────────────────────────
const PORT          = Number(process.env.PORT)         || 3002;
const DB_PATH       = process.env.DB_PATH
                        ? path.resolve(process.env.DB_PATH)
                        : path.join(__dirname, 'melify.db');
const JWT_SECRET    = process.env.JWT_SECRET           || 'mtk-twitter-dev-secret-CHANGE-IN-PROD';
const JWT_EXPIRES   = process.env.JWT_EXPIRES          || '7d';
const TRANSLATE_URL = process.env.LIBRETRANSLATE_URL   || null;
const BCRYPT_ROUNDS = 10;

// ── Database — writes directly to disk on every statement ────────────────────
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA synchronous = NORMAL;');

// ── Schema ────────────────────────────────────────────────────────────────────
db.exec(`
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
`);

// Purge stale bracket-prefix translation cache
db.exec("DELETE FROM translations WHERE translated LIKE '[%'");
console.log('[DB] Ready:', DB_PATH);

// ── Seed demo data ────────────────────────────────────────────────────────────
(function seed() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) { console.log('[DB] Found', count, 'users — skipping seed'); return; }

  console.log('[DB] Seeding demo data…');
  const hash = bcrypt.hashSync('demo1234', BCRYPT_ROUNDS);
  const av   = 'https://i.pravatar.cc/80?img=';

  const insUser = db.prepare(
    'INSERT OR IGNORE INTO users (username,email,display_name,password_hash,lang,avatar_url,verified) VALUES (?,?,?,?,?,?,?)'
  );
  [
    ['priyasharma',   'priya@demo.com',   'Priya Sharma',    hash,'hi',av+'47',0],
    ['carlosmendoza', 'carlos@demo.com',  'Carlos Mendoza',  hash,'es',av+'52',1],
    ['kenjitanaka',   'kenji@demo.com',   'Kenji Tanaka',    hash,'ja',av+'56',1],
    ['omarhassan',    'omar@demo.com',    'Omar Hassan',     hash,'ar',av+'59',0],
    ['natasha_v',     'natasha@demo.com', 'Natasha Volkova', hash,'ru',av+'45',0],
  ].forEach(u => insUser.run(...u));

  const insTweet = db.prepare('INSERT INTO tweets (user_id,text,original_lang) VALUES (?,?,?)');
  [
    ['priyasharma',   'नमस्ते! आज का मौसम बहुत अच्छा है।',                    'hi'],
    ['carlosmendoza', 'La tecnología nos une a todos.',                         'es'],
    ['kenjitanaka',   'この技術は素晴らしいです！言語の壁がなくなりますね。', 'ja'],
    ['omarhassan',    'مرحبا بالجميع! نحن نبني جسور التواصل بين الشعوب.',    'ar'],
    ['natasha_v',     'Технологии меняют мир к лучшему каждый день.',          'ru'],
  ].forEach(([uname, text, lang]) => {
    const u = db.prepare('SELECT id FROM users WHERE username=?').get(uname);
    if (u) insTweet.run(u.id, text, lang);
  });

  console.log('[DB] Seeded 5 users and 5 tweets');
})();

// ── Helpers ───────────────────────────────────────────────────────────────────
function publicUser(u) {
  return {
    id:           u.id,
    username:     u.username,
    display_name: u.display_name,
    lang:         u.lang,
    bio:          u.bio || '',
    avatar_url:   u.avatar_url || ('https://i.pravatar.cc/80?u=' + u.username),
    verified:     u.verified === 1,
    created_at:   u.created_at,
  };
}

function tweetSQL(userId) {
  const uid = Number(userId) || 0;
  return `
    SELECT t.id, t.text, t.original_lang,
           t.likes_count, t.retweets_count, t.replies_count,
           t.parent_id, t.created_at,
           u.username, u.display_name, u.avatar_url, u.verified,
           ${uid ? `(SELECT COUNT(*) FROM likes     WHERE user_id=${uid} AND tweet_id=t.id)` : '0'} AS user_liked,
           ${uid ? `(SELECT COUNT(*) FROM retweets  WHERE user_id=${uid} AND tweet_id=t.id)` : '0'} AS user_retweeted,
           ${uid ? `(SELECT COUNT(*) FROM bookmarks WHERE user_id=${uid} AND tweet_id=t.id)` : '0'} AS user_bookmarked
    FROM   tweets t JOIN users u ON u.id = t.user_id
  `;
}

function fmt(r, uid) {
  if (!r) return null;  // guard against null rows
  return {
    id:             Number(r.id),
    text:           r.text,
    original_lang:  r.original_lang,
    likes_count:    Number(r.likes_count)    || 0,
    retweets_count: Number(r.retweets_count) || 0,
    replies_count:  Number(r.replies_count)  || 0,
    parent_id:      r.parent_id ? Number(r.parent_id) : null,
    created_at:     r.created_at,
    user: {
      name:     r.display_name,
      handle:   r.username,
      avatar:   r.avatar_url || ('https://i.pravatar.cc/80?u=' + r.username),
      verified: r.verified === 1,
    },
    liked:      r.user_liked      > 0,
    retweeted:  r.user_retweeted  > 0,
    bookmarked: r.user_bookmarked > 0,
  };
}

function makeToken(u) {
  return jwt.sign({ id: u.id, username: u.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
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

// ── Built-in translation dictionary ──────────────────────────────────────────
const TRANS_DICT = {
  'नमस्ते! आज का मौसम बहुत अच्छा है।': {
    en:'Hello! The weather is very nice today.',
    es:'¡Hola! El tiempo está muy bien hoy.',
    fr:"Bonjour! Le temps est très beau aujourd'hui.",
    de:'Hallo! Das Wetter ist heute sehr schön.',
    zh:'你好！今天天气很好。', ar:'مرحباً! الطقس جميل جداً اليوم.',
    pt:'Olá! O tempo está muito bom hoje.', ja:'こんにちは！今日の天気はとても良いです。',
    ru:'Привет! Сегодня очень хорошая погода.', ko:'안녕하세요! 오늘 날씨가 매우 좋네요.', it:'Ciao! Il tempo è molto bello oggi.',
  },
  'La tecnología nos une a todos.': {
    en:'Technology unites us all.',
    hi:'प्रौद्योगिकी हम सभी को एकजुट करती है।', fr:'La technologie nous unit tous.',
    de:'Technologie verbindet uns alle.', zh:'技术将我们所有人联合在一起。',
    ar:'التكنولوجيا تجمعنا جميعاً.', pt:'A tecnologia nos une a todos.',
    ja:'テクノロジーは私たちみんなをつなげます。', ru:'Технологии объединяют нас всех.',
    ko:'기술은 우리 모두를 하나로 묶어줍니다.', it:'La tecnologia ci unisce tutti.',
  },
  'この技術は素晴らしいです！言語の壁がなくなりますね。': {
    en:'This technology is amazing! Language barriers will disappear.',
    hi:'यह तकनीक अद्भुत है! भाषा की बाधाएं गायब हो जाएंगी।',
    es:'¡Esta tecnología es increíble! Las barreras del idioma desaparecerán.',
    fr:'Cette technologie est incroyable! Les barrières linguistiques vont disparaître.',
    de:'Diese Technologie ist erstaunlich! Sprachbarrieren werden verschwinden.',
    zh:'这项技术太棒了！语言障碍将会消失。', ar:'هذه التكنولوجيا رائعة! ستختفي الحواجز اللغوية.',
    pt:'Esta tecnologia é incrível! As barreiras linguísticas vão desaparecer.',
    ru:'Эта технология удивительна! Языковые барьеры исчезнут.',
    ko:'이 기술은 놀랍습니다! 언어 장벽이 사라질 것입니다.', it:'Questa tecnologia è incredibile! Le barriere linguistiche scompariranno.',
  },
  'مرحبا بالجميع! نحن نبني جسور التواصل بين الشعوب.': {
    en:'Hello everyone! We are building bridges of communication between peoples.',
    hi:'सभी को नमस्ते! हम लोगों के बीच संचार के पुल बना रहे हैं।',
    es:'¡Hola a todos! Estamos construyendo puentes de comunicación entre los pueblos.',
    fr:'Bonjour à tous! Nous construisons des ponts de communication entre les peuples.',
    de:'Hallo alle! Wir bauen Kommunikationsbrücken zwischen den Völkern.',
    zh:'大家好！我们正在建立人民之间的沟通桥梁。',
    pt:'Olá a todos! Estamos construindo pontes de comunicação entre os povos.',
    ja:'みなさんこんにちは！私たちは人々の間のコミュニケーションの橋を築いています。',
    ru:'Всем привет! Мы строим мосты общения между народами.',
    ko:'모두 안녕하세요! 우리는 사람들 사이의 소통 다리를 만들고 있습니다.',
    it:'Ciao a tutti! Stiamo costruendo ponti di comunicazione tra i popoli.',
  },
  'Технологии меняют мир к лучшему каждый день.': {
    en:'Technology changes the world for the better every day.',
    hi:'प्रौद्योगिकी हर दिन दुनिया को बेहतर बना रही है।',
    es:'La tecnología cambia el mundo para mejor cada día.',
    fr:'La technologie change le monde pour le mieux chaque jour.',
    de:'Technologie verändert die Welt jeden Tag zum Besseren.',
    zh:'技术每天都在让世界变得更美好。', ar:'التكنولوجيا تغير العالم نحو الأفضل كل يوم.',
    pt:'A tecnologia muda o mundo para melhor todos os dias.',
    ja:'テクノロジーは毎日世界をより良い方向に変えています。',
    ko:'기술은 매일 세상을 더 좋게 변화시킵니다.', it:'La tecnologia cambia il mondo in meglio ogni giorno.',
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

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();

app.use(cors({ origin:'*', methods:['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders:['Content-Type','Authorization'] }));
app.options('*', cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) app.use(express.static(publicDir));

app.use((req, _res, next) => {
  process.stdout.write(`[${new Date().toISOString()}] ${req.method} ${req.path}\n`);
  next();
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  const u = db.prepare('SELECT COUNT(*) AS c FROM users').get();
  const t = db.prepare('SELECT COUNT(*) AS c FROM tweets').get();
  res.json({ ok:true, app:'Melify', version:'2.0.0', users: u.c, tweets: t.c });
});

// ════════════════════════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════════════════════════
app.post('/api/auth/register', async (req, res) => {
  try {
    const body         = req.body || {};
    const display_name = (body.display_name || '').trim();
    const username     = (body.username     || '').trim();
    const email        = (body.email        || '').trim().toLowerCase();
    const password     = body.password || '';
    const lang         = (body.lang         || 'en').trim();
    const bio          = (body.bio          || '').trim();
    const avatar_url   = (body.avatar_url   || '').trim();

    if (!display_name || display_name.length < 2) return res.status(400).json({ error: 'Display name must be at least 2 characters' });
    if (!username || username.length < 3 || username.length > 30) return res.status(400).json({ error: 'Username must be 3–30 characters' });
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: 'Username: letters, numbers and _ only' });
    if (!email || !/.+@.+\..+/.test(email)) return res.status(400).json({ error: 'Enter a valid email' });
    if (!password || password.length < 8)   return res.status(400).json({ error: 'Password must be at least 8 characters' });

    if (db.prepare('SELECT id FROM users WHERE username=? COLLATE NOCASE').get(username)) {
      return res.status(409).json({ error: 'Username is already taken' });
    }
    if (db.prepare('SELECT id FROM users WHERE email=? COLLATE NOCASE').get(email)) {
      return res.status(409).json({ error: 'Email is already registered' });
    }

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    db.prepare('INSERT INTO users (username,email,display_name,password_hash,lang,bio,avatar_url) VALUES (?,?,?,?,?,?,?)')
      .run(username, email, display_name, hash, lang, bio, avatar_url);

    const user = db.prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE').get(username);
    const token = makeToken(user);
    console.log('[AUTH] Registered @' + username);
    res.status(201).json({ token, user: publicUser(user) });

  } catch (err) {
    console.error('[AUTH] Register:', err.message);
    if ((err.message||'').includes('UNIQUE')) return res.status(409).json({ error: 'Username or email already taken' });
    res.status(500).json({ error: 'Registration failed: ' + err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const identifier = (req.body.identifier || '').trim();
    const password   = req.body.password || '';

    if (!identifier) return res.status(400).json({ error: 'Username or email is required' });
    if (!password)   return res.status(400).json({ error: 'Password is required' });

    let user = db.prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE').get(identifier);
    if (!user) user = db.prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE').get(identifier);
    if (!user) return res.status(401).json({ error: 'No account found with that username or email' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Incorrect password' });

    const token = makeToken(user);
    console.log('[AUTH] Login @' + user.username);
    res.json({ token, user: publicUser(user) });

  } catch (err) {
    console.error('[AUTH] Login:', err.message);
    res.status(500).json({ error: 'Login failed: ' + err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// USERS
// ════════════════════════════════════════════════════════════════════════════════
app.get('/api/users/me', authRequired, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  res.json(publicUser(u));
});

app.patch('/api/users/me', authRequired, (req, res) => {
  const allowed = ['display_name','bio','avatar_url','lang'];
  const sets = [], vals = [];
  allowed.forEach(k => { if (req.body[k] !== undefined) { sets.push(k+'=?'); vals.push(req.body[k]); } });
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  vals.push(req.user.id);
  db.prepare('UPDATE users SET ' + sets.join(',') + ' WHERE id=?').run(...vals);
  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id)));
});

app.get('/api/users/:username', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE').get(req.params.username);
  if (!u) return res.status(404).json({ error: 'User not found' });
  res.json(publicUser(u));
});

// ════════════════════════════════════════════════════════════════════════════════
// TWEETS
// ════════════════════════════════════════════════════════════════════════════════
app.get('/api/tweets', authOptional, (req, res) => {
  const uid    = req.user?.id || 0;
  const limit  = Math.min(Math.max(parseInt(req.query.limit)||30, 1), 50);
  const since  = parseInt(req.query.since)  || 0;
  const before = parseInt(req.query.before) || 0;

  let q = tweetSQL(uid) + ' WHERE t.parent_id IS NULL';
  const args = [];
  if (since  > 0) { q += ' AND t.id>?'; args.push(since);  }
  if (before > 0) { q += ' AND t.id<?'; args.push(before); }
  q += ' ORDER BY t.created_at DESC, t.id DESC LIMIT ?';
  args.push(limit);

  const rows = db.prepare(q).all(...args);
  res.json(rows.map(r => fmt(r, uid)).filter(Boolean));
});

app.post('/api/tweets', authRequired, (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text)           return res.status(400).json({ error: 'Text is required' });
  if (text.length>280) return res.status(400).json({ error: 'Max 280 characters' });

  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  const lang = req.body.lang || user?.lang || 'en';

  db.prepare('INSERT INTO tweets (user_id,text,original_lang) VALUES (?,?,?)').run(req.user.id, text, lang);

  // Fetch the tweet we just inserted — use MAX(id) to avoid lastInsertRowid issues
  const tweet = db.prepare(tweetSQL(req.user.id) + ' WHERE t.user_id=? ORDER BY t.id DESC LIMIT 1').get(req.user.id);
  if (!tweet) return res.status(500).json({ error: 'Tweet saved but could not be retrieved' });
  res.status(201).json(fmt(tweet, req.user.id));
});

app.get('/api/tweets/:id', authOptional, (req, res) => {
  const uid = req.user?.id || 0;
  const t   = db.prepare(tweetSQL(uid) + ' WHERE t.id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Tweet not found' });
  res.json(fmt(t, uid));
});

app.delete('/api/tweets/:id', authRequired, (req, res) => {
  const t = db.prepare('SELECT * FROM tweets WHERE id=?').get(req.params.id);
  if (!t)                       return res.status(404).json({ error: 'Tweet not found' });
  if (t.user_id !== req.user.id) return res.status(403).json({ error: 'Not your tweet' });
  db.prepare('DELETE FROM tweets WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════════════════
// REPLIES
// ════════════════════════════════════════════════════════════════════════════════
app.get('/api/tweets/:id/replies', authOptional, (req, res) => {
  const uid  = req.user?.id || 0;
  const rows = db.prepare(tweetSQL(uid) + ' WHERE t.parent_id=? ORDER BY t.created_at ASC').all(req.params.id);
  res.json(rows.map(r => fmt(r, uid)));
});

app.post('/api/tweets/:id/replies', authRequired, (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Reply text required' });

  const parent = db.prepare('SELECT id FROM tweets WHERE id=?').get(req.params.id);
  if (!parent) return res.status(404).json({ error: 'Tweet not found' });

  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  const lang = req.body.lang || user?.lang || 'en';

  db.prepare('INSERT INTO tweets (user_id,parent_id,text,original_lang) VALUES (?,?,?,?)').run(req.user.id, parent.id, text, lang);
  db.prepare('UPDATE tweets SET replies_count=replies_count+1 WHERE id=?').run(parent.id);

  const reply = db.prepare(tweetSQL(req.user.id) + ' WHERE t.user_id=? AND t.parent_id=? ORDER BY t.id DESC LIMIT 1').get(req.user.id, parent.id);
  if (!reply) return res.status(500).json({ error: 'Reply saved but could not be retrieved' });
  res.status(201).json(fmt(reply, req.user.id));
});

// ════════════════════════════════════════════════════════════════════════════════
// LIKES
// ════════════════════════════════════════════════════════════════════════════════
app.post('/api/tweets/:id/like', authRequired, (req, res) => {
  const tid = Number(req.params.id), uid = req.user.id;
  if (!db.prepare('SELECT id FROM tweets WHERE id=?').get(tid)) return res.status(404).json({ error: 'Not found' });
  if (!db.prepare('SELECT 1 FROM likes WHERE user_id=? AND tweet_id=?').get(uid, tid)) {
    db.prepare('INSERT OR IGNORE INTO likes (user_id,tweet_id) VALUES (?,?)').run(uid, tid);
    db.prepare('UPDATE tweets SET likes_count=likes_count+1 WHERE id=?').run(tid);
  }
  res.json({ liked: true, likes_count: db.prepare('SELECT likes_count FROM tweets WHERE id=?').get(tid).likes_count });
});

app.delete('/api/tweets/:id/like', authRequired, (req, res) => {
  const tid = Number(req.params.id), uid = req.user.id;
  if (db.prepare('SELECT 1 FROM likes WHERE user_id=? AND tweet_id=?').get(uid, tid)) {
    db.prepare('DELETE FROM likes WHERE user_id=? AND tweet_id=?').run(uid, tid);
    db.prepare('UPDATE tweets SET likes_count=MAX(0,likes_count-1) WHERE id=?').run(tid);
  }
  const row = db.prepare('SELECT likes_count FROM tweets WHERE id=?').get(tid);
  res.json({ liked: false, likes_count: row ? row.likes_count : 0 });
});

// ════════════════════════════════════════════════════════════════════════════════
// RETWEETS
// ════════════════════════════════════════════════════════════════════════════════
app.post('/api/tweets/:id/retweet', authRequired, (req, res) => {
  const tid = Number(req.params.id), uid = req.user.id;
  if (!db.prepare('SELECT id FROM tweets WHERE id=?').get(tid)) return res.status(404).json({ error: 'Not found' });
  if (!db.prepare('SELECT 1 FROM retweets WHERE user_id=? AND tweet_id=?').get(uid, tid)) {
    db.prepare('INSERT OR IGNORE INTO retweets (user_id,tweet_id) VALUES (?,?)').run(uid, tid);
    db.prepare('UPDATE tweets SET retweets_count=retweets_count+1 WHERE id=?').run(tid);
  }
  res.json({ retweeted: true, retweets_count: db.prepare('SELECT retweets_count FROM tweets WHERE id=?').get(tid).retweets_count });
});

app.delete('/api/tweets/:id/retweet', authRequired, (req, res) => {
  const tid = Number(req.params.id), uid = req.user.id;
  if (db.prepare('SELECT 1 FROM retweets WHERE user_id=? AND tweet_id=?').get(uid, tid)) {
    db.prepare('DELETE FROM retweets WHERE user_id=? AND tweet_id=?').run(uid, tid);
    db.prepare('UPDATE tweets SET retweets_count=MAX(0,retweets_count-1) WHERE id=?').run(tid);
  }
  const row = db.prepare('SELECT retweets_count FROM tweets WHERE id=?').get(tid);
  res.json({ retweeted: false, retweets_count: row ? row.retweets_count : 0 });
});

// ════════════════════════════════════════════════════════════════════════════════
// BOOKMARKS
// ════════════════════════════════════════════════════════════════════════════════
app.post('/api/tweets/:id/bookmark', authRequired, (req, res) => {
  db.prepare('INSERT OR IGNORE INTO bookmarks (user_id,tweet_id) VALUES (?,?)').run(req.user.id, Number(req.params.id));
  res.json({ bookmarked: true });
});

app.delete('/api/tweets/:id/bookmark', authRequired, (req, res) => {
  db.prepare('DELETE FROM bookmarks WHERE user_id=? AND tweet_id=?').run(req.user.id, Number(req.params.id));
  res.json({ bookmarked: false });
});

app.get('/api/bookmarks', authRequired, (req, res) => {
  const rows = db.prepare(tweetSQL(req.user.id) + ' JOIN bookmarks b ON b.tweet_id=t.id AND b.user_id=? ORDER BY b.created_at DESC').all(req.user.id);
  res.json(rows.map(r => fmt(r, req.user.id)));
});

// ════════════════════════════════════════════════════════════════════════════════
// TRANSLATION
// ════════════════════════════════════════════════════════════════════════════════
app.get('/api/tweets/:id/translate', authOptional, async (req, res) => {
  const target = (req.query.target || 'en').toLowerCase();
  const tweet  = db.prepare('SELECT * FROM tweets WHERE id=?').get(req.params.id);
  if (!tweet) return res.status(404).json({ error: 'Tweet not found' });

  if (tweet.original_lang === target) {
    return res.json({ translated_text: tweet.text, source_lang: tweet.original_lang, target_lang: target });
  }

  // 1. Built-in dictionary (fastest, always correct for seed tweets)
  const dictResult = dictLookup(tweet.text, target);
  if (dictResult) {
    db.prepare('INSERT OR REPLACE INTO translations (tweet_id,target_lang,translated) VALUES (?,?,?)').run(tweet.id, target, dictResult);
    return res.json({ translated_text: dictResult, source_lang: tweet.original_lang, target_lang: target });
  }

  // 2. DB cache
  const cached = db.prepare('SELECT translated FROM translations WHERE tweet_id=? AND target_lang=?').get(tweet.id, target);
  if (cached) return res.json({ translated_text: cached.translated, source_lang: tweet.original_lang, target_lang: target });

  // 3. LibreTranslate
  let translated = null;
  if (TRANSLATE_URL) {
    try {
      const r = await fetch(TRANSLATE_URL + '/translate', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ q: tweet.text, source: tweet.original_lang, target, format:'text' }),
      });
      const d = await r.json();
      if (d.translatedText) translated = d.translatedText;
    } catch (e) { console.warn('[TRANSLATE]', e.message); }
  }

  // 4. Return original if nothing found
  if (!translated) translated = tweet.text;

  db.prepare('INSERT OR REPLACE INTO translations (tweet_id,target_lang,translated) VALUES (?,?,?)').run(tweet.id, target, translated);
  res.json({ translated_text: translated, source_lang: tweet.original_lang, target_lang: target });
});

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('*', (_req, res) => {
  const idx = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(idx)) return res.sendFile(idx);
  res.json({ message: 'Melify API running. Deploy frontend to ./public/' });
});

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, _req, res, _next) => { console.error('[ERR]', err); res.status(500).json({ error: 'Server error' }); });

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n  🌍  Melify API ready');
  console.log('  ➜   http://localhost:' + PORT + '/api/health');
  console.log('  🗄   DB: ' + DB_PATH + '  (writes directly to disk)');
  console.log('  🔑  JWT: ' + JWT_EXPIRES);
  console.log(TRANSLATE_URL ? '  🔤  LibreTranslate: ' + TRANSLATE_URL : '  🔤  Translation: built-in dictionary');
  console.log('\n  Demo accounts  (password: demo1234)');
  console.log('  @priyasharma  @carlosmendoza  @kenjitanaka  @omarhassan  @natasha_v\n');
});
