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
const BCRYPT_ROUNDS = 10;

// ── Database — writes directly to disk on every statement ────────────────────
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = DELETE;');  // simpler than WAL — writes directly, no -wal/-shm files
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA synchronous = FULL;');    // guarantee every write is flushed to disk

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
  console.log('[DB] Checking seed users…');
  const hash = bcrypt.hashSync('demo1234', BCRYPT_ROUNDS);
  const av   = 'https://i.pravatar.cc/80?img=';

  const insUser = db.prepare(
    'INSERT OR IGNORE INTO users (username,email,display_name,password_hash,lang,avatar_url,verified) VALUES (?,?,?,?,?,?,?)'
  );
  const seedUsers = [
    ['priyasharma',   'priya@demo.com',   'Priya Sharma',    hash,'hi',av+'47',0],
    ['carlosmendoza', 'carlos@demo.com',  'Carlos Mendoza',  hash,'es',av+'52',1],
    ['kenjitanaka',   'kenji@demo.com',   'Kenji Tanaka',    hash,'ja',av+'56',1],
    ['omarhassan',    'omar@demo.com',    'Omar Hassan',     hash,'ar',av+'59',0],
    ['natasha_v',     'natasha@demo.com', 'Natasha Volkova', hash,'ru',av+'45',0],
    ['mel',           'mel@melify.com',   'Mel',             hash,'en',av+'11',1],
    ['josh',          'josh@melify.com',  'Josh',            hash,'he',av+'33',0],
    ['farid',         'farid@demo.com',   'Farid',           hash,'fa',av+'68',0],
    ['sophie_m',      'sophie@demo.com',  'Sophie Martin',   hash,'fr',av+'25',0],
    ['klausberg',     'Klaus@demo.com',   'Klaus Berg',      hash,'de',av+'12',0],
    ['wei_zhang',     'wei@demo.com',     'Wei Zhang',       hash,'zh',av+'35',1],
    ['ana_silva',     'ana@demo.com',     'Ana Silva',       hash,'pt',av+'48',0],
    ['jiwon_k',       'jiwon@demo.com',   'Jiwon Kim',       hash,'ko',av+'62',0],
    ['giulia_r',      'giulia@demo.com',  'Giulia Russo',    hash,'it',av+'15',0],
    ['moshebanai',    'moshe@demo.com',   'Moshe Banai',     hash,'he',av+'57',1],
  ];
  seedUsers.forEach(u => insUser.run(...u));

  // Only seed tweets if DB is fresh
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const tweetCount = db.prepare('SELECT COUNT(*) AS c FROM tweets').get().c;
  if (tweetCount > 0) { console.log('[DB] Found', count, 'users,', tweetCount, 'tweets — skipping tweet seed'); return; }

  console.log('[DB] Seeding demo tweets…');

  // Each user has a pool of tweets — 2 to pool-size are randomly seeded
  const userTweets = {
    mel:           { lang:'en', tweets:[
      'Welcome to Mwitter — where the world speaks as one! 🌍',
      'Just posted in English, but everyone can read it in their language. Magic!',
      'Language barriers are so last century.',
      'Shoutout to everyone posting from around the globe today!',
      'The future of communication is multilingual. 🚀',
      'Good morning world! What language are you thinking in today?',
      'Just had a conversation with someone in Tokyo, Paris, and Cairo — all at once!',
      'The more languages you understand, the bigger your world gets.',
      'Translation is not just words, it is culture and connection.',
      'Mwitter is proof that technology can bring us all together. 💙',
    ]},
    moshebanai:    { lang:'he', tweets:[
      'שלום לכולם! שמח להיות חלק מהפלטפורמה הגלובלית הזאת.',
      'טכנולוגיה שמחברת עמים — זה בדיוק מה שצריך היום.',
      'הכרתי היום אנשים מ-5 מדינות שונות. מדהים! 🌍',
      'עברית היא שפה עשירה ויפה. שמח לשתף אותה עם העולם.',
      'Mwitter שינה את הדרך שבה אני מתקשר עם העולם.',
      'בוקר טוב! יום חדש, שיחות חדשות, עולם אחד. ☀️',
    ]},
    josh:          { lang:'he', tweets:[
      'שלום לכולם! הטכנולוגיה מחברת בין עמים.',
      'כיף לדבר עם אנשים מכל העולם בשפה שלי.',
      'היום למדתי מילים חדשות בשלוש שפות שונות!',
      'הטכנולוגיה הזאת פשוט מדהימה. תודה למלִיפַי!',
      'אני מאמין שהשפה לא צריכה להיות מכשול.',
      'שיחה עם אנשים מיפן, ספרד וברזיל — כולם מבינים אותי!',
      'העולם נהיה קטן יותר בזכות טכנולוגיה כזאת.',
      'בוקר טוב לכולם! ☀️ מה שלומכם היום?',
      'גאה להיות חלק מקהילה גלובלית כל כך.',
      'שפה היא הנשמה של תרבות.',
    ]},
    priyasharma:   { lang:'hi', tweets:[
      'नमस्ते! आज का मौसम बहुत अच्छा है।',
      'तकनीक ने हमारी दुनिया को बदल दिया है।',
      'आज मैंने एक नई भाषा सीखने की कोशिश की!',
      'भाषा कोई बाधा नहीं है जब दिल मिलते हैं।',
      'मेलिफाई पर सभी का स्वागत है। 🌍',
      'आज जापान, फ्रांस और मैक्सिको के लोगों से बात की!',
      'हिंदी में लिखो, दुनिया अपनी भाषा में पढ़े — कमाल है!',
      'तकनीक और भाषा मिलकर दुनिया बदल रहे हैं।',
      'हर भाषा में एक अलग दुनिया छुपी है।',
      'आज का दिन बहुत अच्छा है! सबको शुभकामनाएं 🌸',
    ]},
    carlosmendoza: { lang:'es', tweets:[
      'La tecnología nos une a todos.',
      '¡Buenos días! Hoy es un gran día para aprender algo nuevo.',
      'Me encanta poder hablar con personas de todo el mundo.',
      'La diversidad lingüística es una riqueza enorme.',
      '¡Saludos desde España! ¿Cómo están todos?',
      'Hoy hablé con alguien en árabe, japonés y ruso. ¡Todo en español!',
      'Las barreras del idioma ya son historia gracias a Mwitter.',
      'El idioma es el alma de una cultura. Nunca lo olvidemos.',
      '¡Qué maravilla poder conectar con el mundo entero!',
      'Buenos días a todos desde el otro lado del Atlántico. 🌊',
    ]},
    kenjitanaka:   { lang:'ja', tweets:[
      'この技術は素晴らしいです！言語の壁がなくなりますね。',
      'おはようございます！今日もいい日にしましょう。',
      '世界中の人々とつながれるのは本当に素晴らしい。',
      '日本語で話しても、みんなに伝わるのが嬉しいです。',
      '言語は文化の鏡だと思います。',
      '今日はスペイン語でメッセージを送ってみました！',
      'テクノロジーのおかげで世界が近くなりました。',
      'みなさん、今日もよろしくお願いします！🌸',
      '翻訳があれば、もう言葉は壁じゃない。',
      '異文化交流って本当に楽しいですね。',
    ]},
    omarhassan:    { lang:'ar', tweets:[
      'مرحبا بالجميع! نحن نبني جسور التواصل بين الشعوب.',
      'التكنولوجيا تجعل العالم قرية صغيرة.',
      'يسعدني التواصل مع أشخاص من مختلف أنحاء العالم.',
      'اللغة هي جسر التواصل بين الثقافات.',
      'صباح الخير يا عالم! 🌅',
      'اليوم تحدثت مع أشخاص من اليابان والبرازيل وفرنسا.',
      'التنوع اللغوي هو ثروة إنسانية حقيقية.',
      'أحب أن أتعلم كلمات جديدة من كل لغة.',
      'مويتر يجعل العالم أكثر تواصلاً وتفاهماً.',
      'لا حدود للتواصل الإنساني مع هذه التكنولوجيا.',
    ]},
    natasha_v:     { lang:'ru', tweets:[
      'Технологии меняют мир к лучшему каждый день.',
      'Привет всем! Рада общаться с людьми со всего мира.',
      'Язык — это не барьер, это возможность учиться.',
      'Сегодня прекрасный день для новых знакомств!',
      'Мовиттер — это будущее общения без границ.',
      'Сегодня поговорила с людьми из 7 стран. Невероятно!',
      'Русский язык — богатый и красивый. Горжусь им.',
      'Технологии сближают людей лучше, чем что-либо другое.',
      'Доброе утро, мир! Что нового сегодня? ☀️',
      'Каждый язык — это окно в другую культуру.',
    ]},
    farid:         { lang:'fa', tweets:[
      'سلام! این فناوری شگفت‌انگیز است. زبان دیگر مانع ارتباط نیست.',
      'امروز با افراد از ده کشور مختلف صحبت کردم!',
      'فارسی زبان شعر و ادب است. خوشحالم که می‌توانم آن را به اشتراک بگذارم.',
      'دنیا بدون مرزهای زبانی زیباتر است.',
      'مویتر پل ارتباطی بین فرهنگ‌هاست.',
      'صبح بخیر به همه! امیدوارم روز خوبی داشته باشید. 🌸',
      'زبان فارسی یکی از زیباترین زبان‌های دنیاست.',
      'امروز با یک ژاپنی و یک برزیلی دوست شدم!',
      'فناوری مرزها را از بین می‌برد.',
      'هر زبانی دنیایی متفاوت را نشان می‌دهد.',
    ]},
    sophie_m:      { lang:'fr', tweets:[
      'Bonjour le monde ! La technologie efface les frontières linguistiques.',
      "J'adore pouvoir communiquer avec des gens du monde entier en français.",
      'La langue française est si belle — content de la partager!',
      "Aujourd'hui j'ai appris trois mots en japonais. 🇯🇵",
      'Merci Mwitter pour cette plateforme incroyable!',
      "Ce matin j'ai parlé avec des gens de 6 pays différents.",
      "La diversité des langues est une richesse pour l'humanité.",
      'Chaque langue raconte une histoire différente du monde.',
      "Bonjour de Paris ! Le soleil brille aujourd'hui. ☀️",
      "La technologie nous rapproche tous, peu importe la langue.",
    ]},
    klausberg:     { lang:'de', tweets:[
      'Hallo zusammen! Technologie verbindet Menschen über Sprachgrenzen hinweg.',
      'Guten Morgen aus Deutschland! Heute ist ein schöner Tag.',
      'Es ist faszinierend, wie Technologie die Welt kleiner macht.',
      'Ich lerne jeden Tag neue Wörter in anderen Sprachen.',
      'Sprache ist Kultur — und Kultur verbindet uns alle.',
      'Heute habe ich mit jemandem auf Arabisch und Japanisch gechattet!',
      'Die Vielfalt der Sprachen ist ein Geschenk der Menschheit.',
      'Guten Abend! Was habt ihr heute Neues gelernt?',
      'Mwitter macht die Welt zu einem globalen Dorf.',
      'Jede Sprache öffnet ein neues Fenster zur Welt.',
    ]},
    wei_zhang:     { lang:'zh', tweets:[
      '大家好！科技让语言不再是障碍，我们可以自由交流。',
      '今天天气很好，心情也很好！🌞',
      '语言是文化的窗口，很高兴能和大家分享。',
      '科技真的很神奇，可以跨越语言交流。',
      '向世界各地的朋友们问好！',
      '今天和来自7个国家的人聊天了，真是太棒了！',
      '汉语是世界上使用人数最多的语言，我为此骄傲。',
      '早上好！愿大家今天都有美好的一天。🌸',
      'Mwitter让世界变得更小、更温暖。',
      '语言不同，心意相通。',
    ]},
    ana_silva:     { lang:'pt', tweets:[
      'Olá a todos! A tecnologia nos aproxima, independentemente do idioma.',
      'Bom dia! Que dia lindo para aprender algo novo.',
      'Adoro poder conversar com pessoas do mundo todo em português.',
      'A diversidade de idiomas é uma das maiores riquezas da humanidade.',
      'Hoje falei com pessoas de 8 países diferentes. Incrível!',
      'O português é falado em tantos países — que língua abençoada!',
      'Boa tarde a todos! Como estão hoje? 😊',
      'A tecnologia derruba barreiras que antes pareciam intransponíveis.',
      'Cada língua tem sua própria música e ritmo.',
      'Mwitter é o futuro da comunicação global.',
    ]},
    jiwon_k:       { lang:'ko', tweets:[
      '안녕하세요! 기술 덕분에 언어 장벽이 사라지고 있어요.',
      '오늘도 좋은 하루 되세요! 🌸',
      '한국어로 전 세계 사람들과 소통할 수 있다니 정말 신기해요.',
      '오늘 새로운 친구를 사귀었어요. 반가워요!',
      '언어는 달라도 마음은 통한다는 걸 느껴요.',
      '오늘 스페인어와 아랍어로 대화를 나눴어요!',
      '한국어가 세계로 퍼져나가는 게 너무 뿌듯해요.',
      '기술이 세상을 더 가깝게 만들어주네요. 감사해요!',
      '좋은 아침이에요! 오늘 하루도 파이팅! 💪',
      'Mwitter 덕분에 전 세계 친구들이 생겼어요.',
    ]},
    giulia_r:      { lang:'it', tweets:[
      'Ciao a tutti! La tecnologia abbatte le barriere linguistiche nel mondo.',
      'Buongiorno! Oggi è una bella giornata per imparare qualcosa di nuovo.',
      'Adoro poter parlare con persone di tutto il mondo in italiano.',
      'La lingua italiana è musica per le orecchie!',
      'Oggi ho chattato con persone di 9 paesi diversi. Fantastico!',
      "L'italiano è la lingua dell'arte, della musica e della cultura.",
      'Buonasera a tutti! Come è andata la vostra giornata?',
      'La diversità linguistica ci arricchisce tutti.',
      'Grazie Mwitter per aver reso il mondo più vicino!',
      'Ogni lingua porta con sé una storia unica da raccontare.',
    ]},
  };

  let seededTweets = 0;
  const insTweet = db.prepare('INSERT INTO tweets (user_id,text,original_lang,created_at) VALUES (?,?,?,?)');
  for (const [uname, { lang, tweets }] of Object.entries(userTweets)) {
    const u = db.prepare('SELECT id FROM users WHERE username=?').get(uname);
    if (!u) continue;
    // Pick between 5 and 10 tweets randomly
    const count = Math.floor(Math.random() * 6) + 5;
    const shuffled = [...tweets].sort(() => Math.random() - 0.5).slice(0, count);
    // Stagger timestamps — oldest tweet furthest back, newest most recent
    shuffled.forEach((text, i) => {
      // Space tweets 10–60 minutes apart going backwards from now
      const minsAgo = (shuffled.length - i) * Math.floor(Math.random() * 50 + 10);
      const ts = new Date(Date.now() - minsAgo * 60 * 1000)
        .toISOString().replace('T',' ').replace(/\.\d+Z$/,'');
      insTweet.run(u.id, text, lang, ts);
      seededTweets++;
    });
  }

  console.log(`[DB] Seeded users and ${seededTweets} tweets`);
})();

// ── Helpers ───────────────────────────────────────────────────────────────────
function publicUser(u) {
  const row = Object.assign({}, u);
  return {
    id:           Number(row.id),
    username:     String(row.username || ''),
    display_name: String(row.display_name || ''),
    lang:         String(row.lang || 'en'),
    bio:          String(row.bio || ''),
    avatar_url:   row.avatar_url || ('https://i.pravatar.cc/80?u=' + row.username),
    verified:     Number(row.verified) === 1,
    created_at:   row.created_at || '',
  };
}

function tweetSQL(userId) {
  const uid = Number(userId) || 0;
  return `
    SELECT t.id, t.text, t.original_lang,
           t.likes_count, t.retweets_count, t.replies_count,
           t.parent_id, t.created_at,
           u.username, u.display_name, u.avatar_url, u.verified,
           (SELECT COUNT(*) FROM tweets WHERE user_id=t.user_id AND parent_id IS NULL) AS user_tweet_count,
           ${uid ? `(SELECT COUNT(*) FROM likes     WHERE user_id=${uid} AND tweet_id=t.id)` : '0'} AS user_liked,
           ${uid ? `(SELECT COUNT(*) FROM retweets  WHERE user_id=${uid} AND tweet_id=t.id)` : '0'} AS user_retweeted,
           ${uid ? `(SELECT COUNT(*) FROM bookmarks WHERE user_id=${uid} AND tweet_id=t.id)` : '0'} AS user_bookmarked
    FROM   tweets t JOIN users u ON u.id = t.user_id
  `;
}

function fmt(r, uid) {
  if (!r) return null;
  const row = Object.assign({}, r);
  return {
    id:               Number(row.id),
    text:             String(row.text || ''),
    original_lang:    String(row.original_lang || 'en'),
    likes_count:      Number(row.likes_count)    || 0,
    retweets_count:   Number(row.retweets_count) || 0,
    replies_count:    Number(row.replies_count)  || 0,
    parent_id:        row.parent_id ? Number(row.parent_id) : null,
    created_at:       row.created_at || '',
    user_tweet_count: Number(row.user_tweet_count) || 1,
    user: {
      name:     String(row.display_name || ''),
      handle:   String(row.username || ''),
      avatar:   row.avatar_url || ('https://i.pravatar.cc/80?u=' + row.username),
      verified: Number(row.verified) === 1,
    },
    liked:      Number(row.user_liked)      > 0,
    retweeted:  Number(row.user_retweeted)  > 0,
    bookmarked: Number(row.user_bookmarked) > 0,
  };
}

function makeToken(u) {
  return jwt.sign({ id: u.id, username: u.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function authRequired(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Verify user still exists in DB
    const user = db.prepare('SELECT id FROM users WHERE id=?').get(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'Session expired — please log in again' });
    }
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token — please log in again' });
  }
}

function authOptional(req, _res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (token) try { req.user = jwt.verify(token, JWT_SECRET); } catch { /* ok */ }
  next();
}

// ── Built-in translation dictionary ──────────────────────────────────────────
// For real translation of user posts, set LIBRETRANSLATE_URL in .env
// Free self-hosted: https://github.com/LibreTranslate/LibreTranslate
const TRANS_DICT = {
  // Common English greetings / phrases
  'Hello': { hi:'नमस्ते', he:'שלום', es:'Hola', fr:'Bonjour', de:'Hallo', zh:'你好', ar:'مرحبا', pt:'Olá', ja:'こんにちは', ru:'Привет', ko:'안녕하세요', it:'Ciao' },
  'Hello!': { hi:'नमस्ते!', he:'שלום!', es:'¡Hola!', fr:'Bonjour!', de:'Hallo!', zh:'你好！', ar:'مرحبا!', pt:'Olá!', ja:'こんにちは！', ru:'Привет!', ko:'안녕하세요!', it:'Ciao!' },
  'Hi': { hi:'नमस्ते', he:'היי', es:'Hola', fr:'Salut', de:'Hallo', zh:'嗨', ar:'مرحبا', pt:'Oi', ja:'やあ', ru:'Привет', ko:'안녕', it:'Ciao' },
  'Hi!': { hi:'नमस्ते!', he:'היי!', es:'¡Hola!', fr:'Salut!', de:'Hallo!', zh:'嗨！', ar:'مرحبا!', pt:'Oi!', ja:'やあ！', ru:'Привет!', ko:'안녕!', it:'Ciao!' },
  'Good morning': { hi:'शुभ प्रभात', he:'בוקר טוב', es:'Buenos días', fr:'Bonjour', de:'Guten Morgen', zh:'早上好', ar:'صباح الخير', pt:'Bom dia', ja:'おはようございます', ru:'Доброе утро', ko:'좋은 아침', it:'Buongiorno' },
  'Good morning!': { hi:'शुभ प्रभात!', he:'בוקר טוב!', es:'¡Buenos días!', fr:'Bonjour!', de:'Guten Morgen!', zh:'早上好！', ar:'صباح الخير!', pt:'Bom dia!', ja:'おはようございます！', ru:'Доброе утро!', ko:'좋은 아침!', it:'Buongiorno!' },
  'Thank you': { hi:'धन्यवाद', he:'תודה', es:'Gracias', fr:'Merci', de:'Danke', zh:'谢谢', ar:'شكراً', pt:'Obrigado', ja:'ありがとう', ru:'Спасибо', ko:'감사합니다', it:'Grazie' },
  'Thank you!': { hi:'धन्यवाद!', he:'תודה!', es:'¡Gracias!', fr:'Merci!', de:'Danke!', zh:'谢谢！', ar:'شكراً!', pt:'Obrigado!', ja:'ありがとう！', ru:'Спасибо!', ko:'감사합니다!', it:'Grazie!' },
  'Welcome': { hi:'स्वागत है', he:'ברוך הבא', es:'Bienvenido', fr:'Bienvenue', de:'Willkommen', zh:'欢迎', ar:'مرحباً', pt:'Bem-vindo', ja:'ようこそ', ru:'Добро пожаловать', ko:'환영합니다', it:'Benvenuto' },
  'Welcome!': { hi:'स्वागत है!', he:'ברוך הבא!', es:'¡Bienvenido!', fr:'Bienvenue!', de:'Willkommen!', zh:'欢迎！', ar:'مرحباً!', pt:'Bem-vindo!', ja:'ようこそ！', ru:'Добро пожаловать!', ko:'환영합니다!', it:'Benvenuto!' },
  'How are you?': { hi:'आप कैसे हैं?', he:'מה שלומך?', es:'¿Cómo estás?', fr:'Comment allez-vous?', de:'Wie geht es Ihnen?', zh:'你好吗？', ar:'كيف حالك؟', pt:'Como vai você?', ja:'お元気ですか？', ru:'Как дела?', ko:'잘 지내세요?', it:'Come stai?' },
  'Good night': { hi:'शुभ रात्रि', he:'לילה טוב', es:'Buenas noches', fr:'Bonne nuit', de:'Gute Nacht', zh:'晚安', ar:'تصبح على خير', pt:'Boa noite', ja:'おやすみなさい', ru:'Спокойной ночи', ko:'잘 자요', it:'Buona notte' },
  'Good night!': { hi:'शुभ रात्रि!', he:'לילה טוב!', es:'¡Buenas noches!', fr:'Bonne nuit!', de:'Gute Nacht!', zh:'晚安！', ar:'تصبح على خير!', pt:'Boa noite!', ja:'おやすみなさい！', ru:'Спокойной ночи!', ko:'잘 자요!', it:'Buona notte!' },

  // Seed tweets
  'שלום לכולם! הטכנולוגיה מחברת בין עמים.': {
    en:'Hello everyone! Technology connects peoples.',
    hi:'सभी को नमस्ते! तकनीक लोगों को जोड़ती है।',
    es:'¡Hola a todos! La tecnología conecta a los pueblos.',
    fr:'Bonjour à tous! La technologie connecte les peuples.',
    de:'Hallo alle! Technologie verbindet Völker.',
    zh:'大家好！科技将人们联系在一起。',
    ar:'مرحبا بالجميع! التكنولوجيا تربط الشعوب.',
    pt:'Olá a todos! A tecnologia conecta os povos.',
    ja:'みなさんこんにちは！テクノロジーが人々をつなぎます。',
    ru:'Всем привет! Технологии объединяют народы.',
    ko:'모두 안녕하세요! 기술이 사람들을 연결합니다.',
    it:'Ciao a tutti! La tecnologia connette i popoli.',
  },
  'नमस्ते! आज का मौसम बहुत अच्छा है।': {
    en:'Hello! The weather is very nice today.',
    es:'¡Hola! El tiempo está muy bien hoy.',
    fr:"Bonjour! Le temps est très beau aujourd'hui.",
    de:'Hallo! Das Wetter ist heute sehr schön.',
    zh:'你好！今天天气很好。', ar:'مرحباً! الطقس جميل جداً اليوم.',
    he:'שלום! מזג האוויר נהדר היום.',
    pt:'Olá! O tempo está muito bom hoje.', ja:'こんにちは！今日の天気はとても良いです。',
    ru:'Привет! Сегодня очень хорошая погода.', ko:'안녕하세요! 오늘 날씨가 매우 좋네요.', it:'Ciao! Il tempo è molto bello oggi.',
  },
  'La tecnología nos une a todos.': {
    en:'Technology unites us all.',
    hi:'प्रौद्योगिकी हम सभी को एकजुट करती है।', fr:'La technologie nous unit tous.',
    de:'Technologie verbindet uns alle.', zh:'技术将我们所有人联合在一起。',
    ar:'التكنولوجيا تجمعنا جميعاً.', he:'הטכנולוגיה מאחדת אותנו כולם.',
    pt:'A tecnologia nos une a todos.',
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
    he:'הטכנולוגיה הזו מדהימה! מחסומי השפה יעלמו.',
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
    he:'שלום לכולם! אנחנו בונים גשרי תקשורת בין עמים.',
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
    he:'הטכנולוגיה משנה את העולם לטובה כל יום.',
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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) app.use(express.static(publicDir));

// ── Upload dir ────────────────────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.use((req, _res, next) => {
  process.stdout.write(`[${new Date().toISOString()}] ${req.method} ${req.path}\n`);
  next();
});

// ── Upload image ──────────────────────────────────────────────────────────────
app.post('/api/upload', authRequired, (req, res) => {
  try {
    const { data, mimeType = 'image/jpeg' } = req.body;
    if (!data) return res.status(400).json({ error: 'No image data provided' });

    // Strip data URL prefix if present
    const base64 = data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');

    // Limit to 5MB
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image too large (max 5MB)' });
    }

    const ext      = mimeType.split('/')[1]?.replace('jpeg','jpg') || 'jpg';
    const filename = `img_${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;
    const filepath = path.join(uploadsDir, filename);

    fs.writeFileSync(filepath, buffer);

    const url = `/uploads/${filename}`;
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

app.get('/api/users/:username/tweets', authOptional, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE').get(req.params.username);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const uid = req.user?.id || 0;
  const rows = db.prepare(`
    ${tweetSQL(uid)}
    WHERE t.user_id = ? AND t.parent_id IS NULL
    ORDER BY t.created_at DESC
    LIMIT 50
  `).all(u.id);
  res.json(rows.map(r => fmt(r, uid)));
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
  try {
    const text = (req.body.text || '').trim();
    if (!text)            return res.status(400).json({ error: 'Text is required' });
    if (text.length>1000) return res.status(400).json({ error: 'Max 1000 characters' });

    const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
    if (!user) return res.status(401).json({ error: 'User not found — please log out and log in again' });

    const u    = Object.assign({}, user);
    const lang = req.body.lang || u.lang || 'en';

    const result = db.prepare('INSERT INTO tweets (user_id,text,original_lang) VALUES (?,?,?)').run(req.user.id, text, lang);
    const newId  = result.lastInsertRowid;

    console.log('[POST tweet] inserted id:', newId, 'user:', req.user.id);

    const t = Object.assign({}, db.prepare('SELECT * FROM tweets WHERE id=?').get(newId));
    if (!t.id) return res.status(500).json({ error: 'Could not retrieve saved tweet' });

    res.status(201).json({
      id:             Number(t.id),
      text:           t.text,
      original_lang:  t.original_lang,
      likes_count:    0,
      retweets_count: 0,
      replies_count:  0,
      parent_id:      null,
      created_at:     t.created_at,
      user: {
        name:     u.display_name,
        handle:   u.username,
        avatar:   u.avatar_url || ('https://i.pravatar.cc/80?u=' + u.username),
        verified: Number(u.verified) === 1,
      },
      liked:      false,
      retweeted:  false,
      bookmarked: false,
    });

  } catch (err) {
    console.error('[POST /api/tweets] Error:', err.message, err.stack);
    res.status(500).json({ error: err.message });
  }
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
  const tweetId  = Number(req.params.id);
  const userId   = req.user.id;

  // Find the author of this tweet
  const tweet = db.prepare('SELECT user_id FROM tweets WHERE id=?').get(tweetId);
  if (!tweet) return res.status(404).json({ error: 'Tweet not found' });

  // Remove any existing bookmark from this user for tweets by the same author
  db.prepare(`
    DELETE FROM bookmarks
    WHERE user_id = ?
      AND tweet_id IN (
        SELECT id FROM tweets WHERE user_id = ?
      )
  `).run(userId, tweet.user_id);

  // Add the new bookmark
  db.prepare('INSERT OR IGNORE INTO bookmarks (user_id,tweet_id) VALUES (?,?)').run(userId, tweetId);
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

app.get('/api/likes', authRequired, (req, res) => {
  const rows = db.prepare(tweetSQL(req.user.id) + ' JOIN likes l ON l.tweet_id=t.id AND l.user_id=? ORDER BY l.created_at DESC').all(req.user.id);
  res.json(rows.map(r => fmt(r, req.user.id)));
});

// ════════════════════════════════════════════════════════════════════════════════
// TRANSLATION
// ════════════════════════════════════════════════════════════════════════════════

// Google Translate language code overrides (where GT uses different codes)
const GT_LANG_MAP = {
  he: 'iw',   // Hebrew: Google uses 'iw' not 'he'
  zh: 'zh-CN', // Chinese simplified
};

function toGTLang(code) {
  return GT_LANG_MAP[code] || code;
}

async function googleTranslate(text, sourceLang, targetLang) {
  const sl = toGTLang(sourceLang);
  const tl = toGTLang(targetLang);

  // Google Translate unofficial endpoint
  const url = 'https://translate.googleapis.com/translate_a/single'
    + '?client=gtx'
    + '&sl=' + encodeURIComponent(sl)
    + '&tl=' + encodeURIComponent(tl)
    + '&dt=t'
    + '&q='  + encodeURIComponent(text);

  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Melify/2.0)',
    },
  });

  if (!r.ok) throw new Error('Google Translate HTTP ' + r.status);

  const data = await r.json();

  // Response format: [[[translated, original, ...], ...], ...]
  // Concatenate all translated segments
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error('Unexpected Google Translate response format');
  }

  const translated = data[0]
    .filter(seg => Array.isArray(seg) && seg[0])
    .map(seg => seg[0])
    .join('');

  if (!translated) throw new Error('Empty translation result');
  return translated;
}

app.get('/api/tweets/:id/translate', authOptional, async (req, res) => {
  const target = (req.query.target || 'en').toLowerCase();
  const tweet  = db.prepare('SELECT * FROM tweets WHERE id=?').get(req.params.id);
  if (!tweet) return res.status(404).json({ error: 'Tweet not found' });

  // Same language — no translation needed
  if (tweet.original_lang === target) {
    return res.json({ translated_text: tweet.text, source_lang: tweet.original_lang, target_lang: target });
  }

  // 1. Built-in dictionary — instant, always correct for seed tweets
  const dictResult = dictLookup(tweet.text, target);
  if (dictResult) {
    db.prepare('INSERT OR REPLACE INTO translations (tweet_id,target_lang,translated) VALUES (?,?,?)').run(tweet.id, target, dictResult);
    return res.json({ translated_text: dictResult, source_lang: tweet.original_lang, target_lang: target });
  }

  // 2. DB cache — previously translated
  const cached = db.prepare('SELECT translated FROM translations WHERE tweet_id=? AND target_lang=?').get(tweet.id, target);
  if (cached) {
    return res.json({ translated_text: cached.translated, source_lang: tweet.original_lang, target_lang: target });
  }

  // 3. Google Translate (unofficial, free)
  let translated = null;
  try {
    translated = await googleTranslate(tweet.text, tweet.original_lang, target);
    console.log('[TRANSLATE] Google: tweet', tweet.id, tweet.original_lang, '->', target, ':', translated.substring(0, 60));
  } catch (err) {
    console.warn('[TRANSLATE] Google Translate failed:', err.message);
  }

  // 4. Last resort — return original text unchanged
  if (!translated) {
    console.log('[TRANSLATE] No translation available for tweet', tweet.id);
    translated = tweet.text;
  }

  // Cache result so next request is instant
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
  console.log('  🔤  Translation: Google Translate (unofficial) + built-in dictionary');
  console.log('\n  Demo accounts  (password: demo1234)');
  console.log('  @mel  @priyasharma  @carlosmendoza  @kenjitanaka  @omarhassan  @natasha_v\n');

  // ── Live tweet publisher ──────────────────────────────────────
  // Every 1–3 minutes, post 1–4 tweets from random users
  const liveTweets = [
    { lang:'en', texts:[
      'Just had an amazing conversation with someone across the globe! 🌍',
      'Mwitter makes the world feel so much smaller. Love this platform!',
      'Technology + language = connection. That\'s what Mwitter is all about.',
      'Good morning world! Ready for another day of global conversations.',
      'Just translated my first post. This is incredible! 🚀',
      'Breaking: language barriers officially defeated. 😄',
      'Can\'t believe I\'m chatting with people in 5 different languages right now.',
      'This is what the future looks like. So proud to be part of it.',
    ]},
    { lang:'he', texts:[
      'פשוט דיברתי עם מישהו מיפן! הטכנולוגיה הזאת מדהימה. 🌸',
      'שלום לכולם! יום נפלא לשיחות בינלאומיות.',
      'מרגש לראות כמה קל לתקשר בכל שפה שתרצה.',
      'הפלטפורמה הזאת שינתה את הדרך שבה אני מתקשר עם העולם.',
    ]},
    { lang:'hi', texts:[
      'आज मैंने 5 अलग-अलग देशों के लोगों से बात की! 🌏',
      'मेलिफाई की वजह से दुनिया बहुत छोटी लग रही है।',
      'भाषा अब बाधा नहीं है। यह जादू है! ✨',
      'सभी को नमस्ते! आज का दिन बहुत अच्छा है।',
    ]},
    { lang:'es', texts:[
      '¡Acabo de hablar con alguien de Corea en español! Increíble. 🎉',
      'Buenos días a todos desde este rincón del mundo. ☀️',
      'La tecnología de traducción ha cambiado mi vida completamente.',
      '¡Mwitter es simplemente lo mejor que le ha pasado a las redes sociales!',
    ]},
    { lang:'ja', texts:[
      '今日もMwitterで新しい友達ができました！🌟',
      'こんにちは！今日は世界中の人と話せて嬉しいです。',
      '翻訳技術って本当にすごいですね。もう言語は壁じゃない！',
      'みんなと繋がれることに感謝しています。ありがとう！',
    ]},
    { lang:'ar', texts:[
      'أهلاً بالجميع! يوم رائع للتواصل مع العالم. 🌍',
      'تحدثت اليوم مع شخص من البرازيل باللغة العربية. رائع!',
      'التكنولوجيا تجعل العالم مكاناً أفضل للجميع.',
      'سعيد بأن أكون جزءاً من هذا المجتمع العالمي الرائع.',
    ]},
    { lang:'ru', texts:[
      'Привет всем! Сегодня замечательный день для общения. ☀️',
      'Только что пообщался с кем-то из Японии. Невероятно!',
      'Мовиттер — лучшее, что случилось с социальными сетями.',
      'Технологии сближают людей. Это просто магия! ✨',
    ]},
    { lang:'fa', texts:[
      'سلام به همه! امروز با افراد از سراسر جهان صحبت کردم. 🌏',
      'فناوری ترجمه واقعاً شگفت‌انگیز است. دیوار زبان دیگر وجود ندارد!',
      'مووتر بهترین چیزی است که در شبکه‌های اجتماعی دیده‌ام.',
      'خوشحالم که بخشی از این جامعه جهانی هستم.',
    ]},
    { lang:'fr', texts:[
      'Bonjour tout le monde ! Belle journée pour échanger avec le monde entier. ☀️',
      'Je viens de parler avec quelqu\'un au Japon. La technologie est magique !',
      'Mwitter a révolutionné ma façon de communiquer avec le monde.',
      'Incroyable de pouvoir parler dans sa langue et être compris partout.',
    ]},
    { lang:'de', texts:[
      'Guten Morgen allerseits! Heute ist ein großartiger Tag für globale Gespräche.',
      'Gerade mit jemandem aus Brasilien auf Deutsch gechattet. Faszinierend!',
      'Mwitter macht die Welt ein Stück kleiner. Tolle Plattform!',
      'Sprachbarrieren gehören der Vergangenheit an. Danke, Mwitter! 🚀',
    ]},
    { lang:'zh', texts:[
      '大家好！今天又认识了来自世界各地的新朋友。🌍',
      '刚刚和一个巴西人用中文聊天，太神奇了！',
      'Mwitter让语言不再是障碍。这就是未来！',
      '感谢这个平台让我们可以自由交流。❤️',
    ]},
    { lang:'pt', texts:[
      'Bom dia a todos! Mais um dia de conversas globais incríveis. ☀️',
      'Acabei de falar com alguém no Japão em português. Que maravilha!',
      'Mwitter mudou completamente a forma como me comunico.',
      'A tecnologia de tradução é simplesmente mágica. Obrigado, Mwitter!',
    ]},
    { lang:'ko', texts:[
      '안녕하세요! 오늘도 전 세계 친구들과 이야기 나눴어요. 🌏',
      '방금 브라질 사람과 한국어로 채팅했어요. 정말 신기해요!',
      'Mwitter 덕분에 언어 장벽이 완전히 사라졌어요. 최고! 🚀',
      '이 플랫폼은 세상을 더 가깝게 만들어줘요. 감사합니다!',
    ]},
    { lang:'it', texts:[
      'Buongiorno a tutti! Oggi ho parlato con persone da 6 paesi diversi. 🌍',
      'Appena chattato con qualcuno in Giappone in italiano. Incredibile!',
      'Mwitter ha rivoluzionato il modo in cui comunico col mondo.',
      'Le barriere linguistiche appartengono al passato. Grazie, Mwitter! 🚀',
    ]},
  ];

  function scheduleLiveTweet() {
    // Random interval 1–3 minutes
    const delay = (60 + Math.floor(Math.random() * 120)) * 1000;
    setTimeout(() => {
      try {
        // Pick 1–4 random tweets to publish
        const count = 1 + Math.floor(Math.random() * 4);
        const users = db.prepare('SELECT id, username, lang FROM users').all();
        if (!users.length) return;

        for (let i = 0; i < count; i++) {
          // Pick a random user
          const user = users[Math.floor(Math.random() * users.length)];
          const u = Object.assign({}, user);

          // Find tweet pool for this user's language
          const pool = liveTweets.find(p => p.lang === u.lang) || liveTweets[0];
          const text = pool.texts[Math.floor(Math.random() * pool.texts.length)];

          db.prepare('INSERT INTO tweets (user_id, text, original_lang) VALUES (?, ?, ?)')
            .run(u.id, text, u.lang);
        }

        process.stdout.write(`[live] Published ${count} auto-tweet${count > 1 ? 's' : ''}\n`);
      } catch (err) {
        console.error('[live] Error publishing tweet:', err.message);
      }
      scheduleLiveTweet(); // schedule next
    }, delay);
  }

  scheduleLiveTweet();
  console.log('  📡  Live tweet publisher active (every 1–3 min)\n');
});
