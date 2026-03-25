/**
 * seed-tweets.js
 * Run from your mtk-twitter folder:
 *   node --experimental-sqlite seed-tweets.js
 */

'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'melify.db');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = DELETE;');
db.exec('PRAGMA foreign_keys = ON;');

const tweets = [
  // ── English — Mel ──────────────────────────────────────────────────────────
  { username: 'mel', lang: 'en', text: 'The future of communication is breaking language barriers one word at a time.' },
  { username: 'mel', lang: 'en', text: 'Just discovered that music truly is a universal language. No translation needed!' },
  { username: 'mel', lang: 'en', text: 'Working from home today. Coffee in hand, world at my fingertips.' },
  { username: 'mel', lang: 'en', text: 'Amazing sunset tonight. Some things are beautiful in any language.' },
  { username: 'mel', lang: 'en', text: 'Technology should bring us together, not divide us.' },
  { username: 'mel', lang: 'en', text: 'Reading a book in a language you just learned feels like unlocking a superpower.' },
  { username: 'mel', lang: 'en', text: 'Every person you meet knows something you do not. Keep learning.' },
  { username: 'mel', lang: 'en', text: 'The world is smaller than we think when we can actually talk to each other.' },

  // ── Hebrew — Josh ──────────────────────────────────────────────────────────
  { username: 'josh', lang: 'he', text: 'היום למדתי משהו חדש. הידע הוא כוח!' },
  { username: 'josh', lang: 'he', text: 'ירושלים בבוקר - אין כמוה. עיר של זהב.' },
  { username: 'josh', lang: 'he', text: 'אוהב איך הטכנולוגיה מחברת אנשים מכל העולם.' },
  { username: 'josh', lang: 'he', text: 'שבת שלום לכולם! מנוחה וטעינת סוללות.' },
  { username: 'josh', lang: 'he', text: 'המטבח הישראלי הוא מהטובים בעולם. חומוס לכולם!' },
  { username: 'josh', lang: 'he', text: 'תל אביב בלילה היא עיר שלא ישנה. אנרגיה מדהימה.' },
  { username: 'josh', lang: 'he', text: 'כשאתה לומד שפה חדשה, אתה פותח דלת לעולם חדש.' },

  // ── Hindi — Priya ──────────────────────────────────────────────────────────
  { username: 'priyasharma', lang: 'hi', text: 'आज बहुत अच्छा दिन रहा! जीवन खूबसूरत है।' },
  { username: 'priyasharma', lang: 'hi', text: 'भारतीय संगीत और नृत्य दुनिया में सबसे अनोखे हैं।' },
  { username: 'priyasharma', lang: 'hi', text: 'मेरी माँ के हाथ का खाना सबसे स्वादिष्ट होता है।' },
  { username: 'priyasharma', lang: 'hi', text: 'दोस्तों के साथ बिताया वक्त सबसे कीमती होता है।' },
  { username: 'priyasharma', lang: 'hi', text: 'हर दिन कुछ नया सीखना चाहिए। ज्ञान ही शक्ति है।' },
  { username: 'priyasharma', lang: 'hi', text: 'मुंबई की बारिश में भीगना एक अलग ही अनुभव है।' },
  { username: 'priyasharma', lang: 'hi', text: 'योग और ध्यान से मन को शांति मिलती है।' },

  // ── Spanish — Carlos ───────────────────────────────────────────────────────
  { username: 'carlosmendoza', lang: 'es', text: 'La vida es demasiado corta para no bailar. ¡A bailar salsa!' },
  { username: 'carlosmendoza', lang: 'es', text: 'El fútbol no es solo un deporte, es una religión.' },
  { username: 'carlosmendoza', lang: 'es', text: 'Nada como un buen café colombiano para empezar el día.' },
  { username: 'carlosmendoza', lang: 'es', text: 'La familia es lo más importante en la vida.' },
  { username: 'carlosmendoza', lang: 'es', text: 'Hoy cocinamos tamales. La tradición vive en la cocina.' },
  { username: 'carlosmendoza', lang: 'es', text: 'El español es el idioma del amor y la pasión.' },
  { username: 'carlosmendoza', lang: 'es', text: 'Las playas del Caribe son el paraíso en la tierra.' },
  { username: 'carlosmendoza', lang: 'es', text: 'Cuando aprendes otro idioma, ganas otra alma.' },

  // ── Japanese — Kenji ───────────────────────────────────────────────────────
  { username: 'kenjitanaka', lang: 'ja', text: '桜の季節がまた来た。日本の春は本当に美しい。' },
  { username: 'kenjitanaka', lang: 'ja', text: 'ラーメン一杯で幸せになれる。シンプルな喜び。' },
  { username: 'kenjitanaka', lang: 'ja', text: '新幹線に乗るたびに日本の技術に感動する。' },
  { username: 'kenjitanaka', lang: 'ja', text: '茶道は単なるお茶ではなく、心の修行だと思う。' },
  { username: 'kenjitanaka', lang: 'ja', text: '富士山を見るたびに日本人として誇りを感じる。' },
  { username: 'kenjitanaka', lang: 'ja', text: 'アニメと漫画は日本の最大の文化輸出品だと思う。' },
  { username: 'kenjitanaka', lang: 'ja', text: '言語を学ぶことは、新しい世界への扉を開くことだ。' },

  // ── Arabic — Omar ──────────────────────────────────────────────────────────
  { username: 'omarhassan', lang: 'ar', text: 'القهوة العربية أكثر من مشروب، إنها تراث وثقافة.' },
  { username: 'omarhassan', lang: 'ar', text: 'الصحراء تعلمنا الصبر والحكمة. طبيعة خلابة.' },
  { username: 'omarhassan', lang: 'ar', text: 'رمضان كريم! شهر التأمل والتواصل مع الله والناس.' },
  { username: 'omarhassan', lang: 'ar', text: 'اللغة العربية هي أم اللغات وأجملها.' },
  { username: 'omarhassan', lang: 'ar', text: 'الضيافة العربية لا مثيل لها في العالم.' },
  { username: 'omarhassan', lang: 'ar', text: 'الموسيقى العربية تلمس القلب بطريقة لا توصف.' },
  { username: 'omarhassan', lang: 'ar', text: 'نحن شعوب متنوعة لكننا نشترك في الإنسانية.' },

  // ── Russian — Natasha ──────────────────────────────────────────────────────
  { username: 'natasha_v', lang: 'ru', text: 'Москва никогда не спит. Великий город с великой историей.' },
  { username: 'natasha_v', lang: 'ru', text: 'Борщ и чёрный хлеб — это душа русской кухни.' },
  { username: 'natasha_v', lang: 'ru', text: 'Русская литература — величайшее сокровище человечества.' },
  { username: 'natasha_v', lang: 'ru', text: 'Зима в России — это не холод, это красота в белом.' },
  { username: 'natasha_v', lang: 'ru', text: 'Балет — это язык, который понимают все народы мира.' },
  { username: 'natasha_v', lang: 'ru', text: 'Каждый язык — это особый способ видеть мир.' },
  { username: 'natasha_v', lang: 'ru', text: 'Путешествия расширяют горизонты и открывают новые культуры.' },
];

const insTweet = db.prepare(
  'INSERT INTO tweets (user_id, text, original_lang) VALUES (?, ?, ?)'
);

let inserted = 0;
let skipped  = 0;

for (const t of tweets) {
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(t.username);
  if (user) {
    insTweet.run(user.id, t.text, t.lang);
    inserted++;
  } else {
    console.warn('  ⚠ User not found:', t.username);
    skipped++;
  }
}

const total = db.prepare('SELECT COUNT(*) AS c FROM tweets').get().c;

console.log('');
console.log('  ✅  Inserted:', inserted, 'tweets');
if (skipped) console.log('  ⚠   Skipped:', skipped, '(user not found)');
console.log('  📊  Total tweets in DB:', total);
console.log('');
