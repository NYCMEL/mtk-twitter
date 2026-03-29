/**
 * mtk-twitter.config.js
 * Single source of truth for all mtk-twitter configuration & data.
 * No hardcoded values anywhere else in the component.
 */
const MTK_TWITTER_CONFIG = {

  app: {
    name:             'Melify',
    tagline:          'People Helping People — Worldwide',
    version:          '2.0.0',
    apiBase:          '/api',
    wsBase:           'ws://localhost:3001',
    defaultLanguage:  'en',
    maxPostLength:    280,
    avatarBaseUrl:    'https://i.pravatar.cc/80',
    pollInterval:     8000,   // ms — fallback polling when WS unavailable
  },

  languages: [
    { code: 'en', label: 'English',    flag: '🇺🇸', nativeName: 'English',    rtl: false },
    { code: 'hi', label: 'Hindi',      flag: '🇮🇳', nativeName: 'हिन्दी',       rtl: false },
    { code: 'he', label: 'Hebrew',     flag: '🇮🇱', nativeName: 'עברית',       rtl: true  },
    { code: 'ar', label: 'Arabic',     flag: '🇸🇦', nativeName: 'العربية',     rtl: true  },
    { code: 'es', label: 'Spanish',    flag: '🇪🇸', nativeName: 'Español',     rtl: false },
    { code: 'fr', label: 'French',     flag: '🇫🇷', nativeName: 'Français',    rtl: false },
    { code: 'de', label: 'German',     flag: '🇩🇪', nativeName: 'Deutsch',     rtl: false },
    { code: 'zh', label: 'Chinese',    flag: '🇨🇳', nativeName: '中文',         rtl: false },
    { code: 'pt', label: 'Portuguese', flag: '🇧🇷', nativeName: 'Português',   rtl: false },
    { code: 'ja', label: 'Japanese',   flag: '🇯🇵', nativeName: '日本語',       rtl: false },
    { code: 'ru', label: 'Russian',    flag: '🇷🇺', nativeName: 'Русский',     rtl: false },
    { code: 'ko', label: 'Korean',     flag: '🇰🇷', nativeName: '한국어',       rtl: false },
    { code: 'it', label: 'Italian',    flag: '🇮🇹', nativeName: 'Italiano',    rtl: false },
    { code: 'fa', label: 'Persian',    flag: '🇮🇷', nativeName: 'فارسی',       rtl: true  },
  ],

  // Client-side fallback translation dictionary (backend handles real translation)
  // Keys MUST exactly match the text stored in the DB seed
  translations: {

    // ── Hindi ─────────────────────────────────────────────────
    'नमस्ते! आज का मौसम बहुत अच्छा है।': {
      en: 'Hello! The weather is very nice today.',
      es: '¡Hola! El tiempo está muy bien hoy.',
      fr: 'Bonjour! Le temps est très beau aujourd\'hui.',
      de: 'Hallo! Das Wetter ist heute sehr schön.',
      zh: '你好！今天天气很好。',
      ar: 'مرحباً! الطقس جميل جداً اليوم.',
      pt: 'Olá! O tempo está muito bom hoje.',
      ja: 'こんにちは！今日の天気はとても良いです。',
      he: 'שלום! מזג האוויר נהדר היום.',
      ru: 'Привет! Сегодня очень хорошая погода.',
      ko: '안녕하세요! 오늘 날씨가 매우 좋네요.',
      it: 'Ciao! Il tempo è molto bello oggi.',
    },

    // ── Spanish ───────────────────────────────────────────────
    'La tecnología nos une a todos.': {
      en: 'Technology unites us all.',
      hi: 'प्रौद्योगिकी हम सभी को एकजुट करती है।',
      fr: 'La technologie nous unit tous.',
      de: 'Technologie verbindet uns alle.',
      zh: '技术将我们所有人联合在一起。',
      ar: 'التكنولوجيا تجمعنا جميعاً.',
      pt: 'A tecnologia nos une a todos.',
      ja: 'テクノロジーは私たちみんなをつなげます。',
      he: 'הטכנולוגיה מאחדת אותנו כולם.',
      ru: 'Технологии объединяют нас всех.',
      ko: '기술은 우리 모두를 하나로 묶어줍니다.',
      it: 'La tecnologia ci unisce tutti.',
    },

    // ── Japanese ──────────────────────────────────────────────
    'この技術は素晴らしいです！言語の壁がなくなりますね。': {
      en: 'This technology is amazing! Language barriers will disappear.',
      hi: 'यह तकनीक अद्भुत है! भाषा की बाधाएं गायब हो जाएंगी।',
      es: '¡Esta tecnología es increíble! Las barreras del idioma desaparecerán.',
      fr: 'Cette technologie est incroyable! Les barrières linguistiques vont disparaître.',
      de: 'Diese Technologie ist erstaunlich! Sprachbarrieren werden verschwinden.',
      zh: '这项技术太棒了！语言障碍将会消失。',
      ar: 'هذه التكنولوجيا رائعة! ستختفي الحواجز اللغوية.',
      pt: 'Esta tecnologia é incrível! As barreiras linguísticas vão desaparecer.',
      he: 'הטכנולוגיה הזו מדהימה! מחסומי השפה יעלמו.',
      ru: 'Эта технология удивительна! Языковые барьеры исчезнут.',
      ko: '이 기술은 놀랍습니다! 언어 장벽이 사라질 것입니다.',
      it: 'Questa tecnologia è incredibile! Le barriere linguistiche scompariranno.',
    },

    // ── Arabic ────────────────────────────────────────────────
    'مرحبا بالجميع! نحن نبني جسور التواصل بين الشعوب.': {
      en: 'Hello everyone! We are building bridges of communication between peoples.',
      hi: 'सभी को नमस्ते! हम लोगों के बीच संचार के पुल बना रहे हैं।',
      es: '¡Hola a todos! Estamos construyendo puentes de comunicación entre los pueblos.',
      fr: 'Bonjour à tous! Nous construisons des ponts de communication entre les peuples.',
      de: 'Hallo alle! Wir bauen Kommunikationsbrücken zwischen den Völkern.',
      zh: '大家好！我们正在建立人民之间的沟通桥梁。',
      pt: 'Olá a todos! Estamos construindo pontes de comunicação entre os povos.',
      ja: 'みなさんこんにちは！私たちは人々の間のコミュニケーションの橋を築いています。',
      he: 'שלום לכולם! אנחנו בונים גשרי תקשורת בין עמים.',
      ru: 'Всем привет! Мы строим мосты общения между народами.',
      ko: '모두 안녕하세요! 우리는 사람들 사이의 소통 다리를 만들고 있습니다.',
      it: 'Ciao a tutti! Stiamo costruendo ponti di comunicazione tra i popoli.',
    },

    // ── Russian ───────────────────────────────────────────────
    'Технологии меняют мир к лучшему каждый день.': {
      en: 'Technology changes the world for the better every day.',
      hi: 'प्रौद्योगिकी हर दिन दुनिया को बेहतर बना रही है।',
      es: 'La tecnología cambia el mundo para mejor cada día.',
      fr: 'La technologie change le monde pour le mieux chaque jour.',
      de: 'Technologie verändert die Welt jeden Tag zum Besseren.',
      zh: '技术每天都在让世界变得更美好。',
      ar: 'التكنولوجيا تغير العالم نحو الأفضل كل يوم.',
      he: 'הטכנולוגיה משנה את העולם לטובה כל יום.',
      pt: 'A tecnologia muda o mundo para melhor todos os dias.',
      ja: 'テクノロジーは毎日世界をより良い方向に変えています。',
      ko: '기술은 매일 세상을 더 좋게 변화시킵니다.',
      it: 'La tecnologia cambia il mondo in meglio ogni giorno.',
    },
  },

  // Seed / demo tweets visible on the splash screen before login
  seedTweets: [
    {
      id: 'seed_001',
      user: { name: 'Priya Sharma',   handle: 'priyasharma',   avatar: 'https://i.pravatar.cc/80?img=47', verified: false },
      text: 'नमस्ते! आज का मौसम बहुत अच्छा है।',
      originalLang: 'hi', timestamp: '2m ago',
      likes: 24, retweets: 5, replies: 3, liked: false, retweeted: false, bookmarked: false,
    },
    {
      id: 'seed_002',
      user: { name: 'Carlos Mendoza', handle: 'carlosmendoza', avatar: 'https://i.pravatar.cc/80?img=52', verified: true  },
      text: 'La tecnología nos une a todos.',
      originalLang: 'es', timestamp: '15m ago',
      likes: 89, retweets: 31, replies: 12, liked: false, retweeted: false, bookmarked: false,
    },
    {
      id: 'seed_003',
      user: { name: 'Kenji Tanaka',   handle: 'kenjitanaka',   avatar: 'https://i.pravatar.cc/80?img=56', verified: true  },
      text: 'この技術は素晴らしいです！言語の壁がなくなりますね。',
      originalLang: 'ja', timestamp: '1h ago',
      likes: 112, retweets: 44, replies: 19, liked: false, retweeted: false, bookmarked: false,
    },
    {
      id: 'seed_004',
      user: { name: 'Omar Hassan',    handle: 'omarhassan',    avatar: 'https://i.pravatar.cc/80?img=59', verified: false },
      text: 'مرحبا بالجميع! نحن نبني جسور التواصل بين الشعوب.',
      originalLang: 'ar', timestamp: '2h ago',
      likes: 67, retweets: 22, replies: 9,  liked: false, retweeted: false, bookmarked: false,
    },
    {
      user: { name: 'Sophie Martin', handle: 'sophie_m', avatar: 'https://i.pravatar.cc/80?img=25', verified: false },
      text: 'Bonjour le monde ! La technologie efface les frontières linguistiques.',
      originalLang: 'fr', timestamp: '3h ago',
      likes: 41, retweets: 10, replies: 5, liked: false, retweeted: false, bookmarked: false,
    },
    {
      user: { name: 'Klaus Berg', handle: 'klausberg', avatar: 'https://i.pravatar.cc/80?img=12', verified: false },
      text: 'Hallo zusammen! Technologie verbindet Menschen über Sprachgrenzen hinweg.',
      originalLang: 'de', timestamp: '4h ago',
      likes: 38, retweets: 8, replies: 4, liked: false, retweeted: false, bookmarked: false,
    },
    {
      user: { name: 'Wei Zhang', handle: 'wei_zhang', avatar: 'https://i.pravatar.cc/80?img=35', verified: true },
      text: '大家好！科技让语言不再是障碍，我们可以自由交流。',
      originalLang: 'zh', timestamp: '5h ago',
      likes: 89, retweets: 31, replies: 14, liked: false, retweeted: false, bookmarked: false,
    },
    {
      user: { name: 'Ana Silva', handle: 'ana_silva', avatar: 'https://i.pravatar.cc/80?img=48', verified: false },
      text: 'Olá a todos! A tecnologia nos aproxima, independentemente do idioma.',
      originalLang: 'pt', timestamp: '6h ago',
      likes: 52, retweets: 17, replies: 7, liked: false, retweeted: false, bookmarked: false,
    },
    {
      user: { name: 'Jiwon Kim', handle: 'jiwon_k', avatar: 'https://i.pravatar.cc/80?img=62', verified: false },
      text: '안녕하세요! 기술 덕분에 언어 장벽이 사라지고 있어요.',
      originalLang: 'ko', timestamp: '7h ago',
      likes: 63, retweets: 19, replies: 8, liked: false, retweeted: false, bookmarked: false,
    },
    {
      user: { name: 'Giulia Russo', handle: 'giulia_r', avatar: 'https://i.pravatar.cc/80?img=15', verified: false },
      text: 'Ciao a tutti! La tecnologia abbatte le barriere linguistiche nel mondo.',
      originalLang: 'it', timestamp: '8h ago',
      likes: 44, retweets: 12, replies: 6, liked: false, retweeted: false, bookmarked: false,
    },
    {
      user: { name: 'Farid', handle: 'farid', avatar: 'https://i.pravatar.cc/80?img=68', verified: false },
      text: 'سلام! این فناوری شگفت‌انگیز است. زبان دیگر مانع ارتباط نیست.',
      originalLang: 'fa', timestamp: '9h ago',
      likes: 57, retweets: 15, replies: 6, liked: false, retweeted: false, bookmarked: false,
    },
  ],

  trendingTopics: [
    { tag: '#MelifyTranslates',    posts: '12.4K' },
    { tag: '#LanguageBarriers',    posts: '8.1K'  },
    { tag: '#GlobalChat',          posts: '5.7K'  },
    { tag: '#TechForGood',         posts: '44.2K' },
    { tag: '#PeopleHelpingPeople', posts: '3.9K'  },
  ],

  navItems: [
    { icon: 'home',          label: 'Home',          id: 'home',          active: true  },
    { icon: 'explore',       label: 'Explore',       id: 'explore',       active: false },
    { icon: 'notifications', label: 'Notifications', id: 'notifications', active: false },
    { icon: 'mail',          label: 'Messages',      id: 'messages',      active: false },
    { icon: 'bookmark',      label: 'Bookmarks',     id: 'bookmarks',     active: false },
    { icon: 'person',        label: 'Profile',       id: 'profile',       active: false },
  ],

  // UI string translations
  uiLabels: {
    post:          { en:'Post',            fa:'ارسال',            he:'פרסם',          ar:'نشر',               hi:'पोस्ट',       es:'Publicar',       fr:'Publier',        de:'Posten',              zh:'发布',      pt:'Publicar',      ja:'投稿',         ru:'Опубликовать',   ko:'게시',      it:'Pubblica'       },
    darkMode:      { en:'Dark mode',       fa:'حالت تاریک',       he:'מצב כהה',       ar:'الوضع الداكن',      hi:'डार्क मोड',   es:'Modo oscuro',    fr:'Mode sombre',    de:'Dunkelmodus',         zh:'深色模式',  pt:'Modo escuro',   ja:'ダークモード', ru:'Тёмная тема',    ko:'다크 모드', it:'Modalità scura' },
    lightMode:     { en:'Light mode',      fa:'حالت روشن',      he:'מצב בהיר',      ar:'الوضع الفاتح',      hi:'लाइट मोड',    es:'Modo claro',     fr:'Mode clair',     de:'Hellmodus',           zh:'浅色模式',  pt:'Modo claro',    ja:'ライトモード', ru:'Светлая тема',   ko:'라이트 모드',it:'Modalità chiara'},
    search:        { en:'Search Mwitter',  fa:'جستجو',  he:'חיפוש',         ar:'بحث',               hi:'खोजें',       es:'Buscar',         fr:'Rechercher',     de:'Suchen',              zh:'搜索',      pt:'Pesquisar',     ja:'検索',         ru:'Поиск',          ko:'검색',      it:'Cerca'          },
    trending:      { en:'Trending',        fa:'داغ‌ترین‌ها',        he:'טרנדים',         ar:'الرائج',            hi:'ट्रेंडिंग',   es:'Tendencias',     fr:'Tendances',      de:'Trends',              zh:'趋势',      pt:'Tendências',    ja:'トレンド',     ru:'Тренды',         ko:'트렌드',    it:'Tendenze'       },
    trendingMeta:  { en:'Trending',        fa:'داغ',        he:'טרנד',           ar:'رائج',              hi:'ट्रेंड',      es:'Tendencia',      fr:'Tendance',       de:'Trend',               zh:'趋势',      pt:'Tendência',     ja:'トレンド',     ru:'Тренд',          ko:'트렌드',    it:'Tendenza'       },
    posts:         { en:'posts',           fa:'پست',           he:'פוסטים',         ar:'منشورات',           hi:'पोस्ट',       es:'publicaciones',  fr:'publications',   de:'Beiträge',            zh:'帖子',      pt:'publicações',   ja:'投稿',         ru:'постов',         ko:'게시물',    it:'post'           },
    noPostsYet:    { en:'No posts yet. Be the first!', fa:'هنوز پستی نیست. اول باش!', he:'אין פוסטים עדיין. היה הראשון!', ar:'لا منشورات بعد. كن الأول!', hi:'अभी कोई पोस्ट नहीं। पहले बनें!', es:'Sin publicaciones aún. ¡Sé el primero!', fr:'Aucune publication. Soyez le premier!', de:'Noch keine Beiträge. Sei der Erste!', zh:'还没有帖子。成为第一个！', pt:'Nenhuma publicação ainda. Seja o primeiro!', ja:'まだ投稿がありません。最初に投稿しましょう！', ru:'Нет постов. Будьте первым!', ko:'아직 게시물이 없습니다. 첫 번째가 되세요!', it:'Ancora nessun post. Sii il primo!' },
    newPosts:      { en:'new post',        fa:'پست جدید',        he:'פוסט חדש',       ar:'منشور جديد',        hi:'नई पोस्ट',    es:'nueva publicación', fr:'nouvelle publication', de:'neuer Beitrag', zh:'新帖子',    pt:'nova publicação',ja:'新しい投稿',   ru:'новый пост',     ko:'새 게시물', it:'nuovo post'     },
    newPostsPlural:{ en:'new posts',       fa:'پست‌های جدید',       he:'פוסטים חדשים',   ar:'منشورات جديدة',     hi:'नई पोस्ट',    es:'nuevas publicaciones', fr:'nouvelles publications', de:'neue Beiträge', zh:'新帖子',  pt:'novas publicações',ja:'新しい投稿',  ru:'новых постов',   ko:'새 게시물', it:'nuovi post'     },
    reply:         { en:'Reply',           fa:'پاسخ',           he:'השב',            ar:'رد',                hi:'जवाब दें',    es:'Responder',      fr:'Répondre',       de:'Antworten',           zh:'回复',      pt:'Responder',     ja:'返信',         ru:'Ответить',       ko:'답글',      it:'Rispondi'       },
    signOut:       { en:'Sign Out',        fa:'خروج',        he:'התנתק',          ar:'تسجيل الخروج',      hi:'साइन आउट',    es:'Cerrar sesión',  fr:'Se déconnecter', de:'Abmelden',            zh:'退出',      pt:'Sair',          ja:'サインアウト', ru:'Выйти',          ko:'로그아웃',  it:'Esci'           },
    changeLanguage:{ en:'Change Language', fa:'تغییر زبان', he:'שנה שפה',        ar:'تغيير اللغة',       hi:'भाषा बदलें',  es:'Cambiar idioma', fr:'Changer de langue', de:'Sprache ändern',   zh:'更改语言',  pt:'Mudar idioma',  ja:'言語を変更', ru:'Изменить язык',  ko:'언어 변경', it:'Cambia lingua'  },
    profile:       { en:'Profile',        fa:'پروفایل',  he:'פרופיל',          ar:'الملف الشخصي',      hi:'प्रोफ़ाइल',   es:'Perfil',         fr:'Profil',         de:'Profil',              zh:'个人资料',  pt:'Perfil',        ja:'プロフィール', ru:'Профиль',        ko:'프로필',    it:'Profilo'        },
    writeReply:    { en:'Write a reply…',  fa:'پاسخ بنویس…',  he:'כתוב תגובה…',   ar:'اكتب رداً…',        hi:'जवाब लिखें…', es:'Escribe una respuesta…', fr:'Rédigez une réponse…', de:'Antwort schreiben…', zh:'写回复…', pt:'Escreva uma resposta…', ja:'返信を書く…', ru:'Напишите ответ…', ko:'답글 작성…', it:'Scrivi una risposta…' },
    noReplies:     { en:'No replies yet. Be the first!', fa:'هنوز پاسخی نیست.', he:'אין תגובות עדיין. היה הראשון!', ar:'لا ردود بعد. كن الأول!', hi:'अभी कोई जवाब नहीं।', es:'Sin respuestas aún.', fr:'Aucune réponse.', de:'Noch keine Antworten.', zh:'还没有回复。', pt:'Sem respostas ainda.', ja:'まだ返信がありません。', ru:'Нет ответов.', ko:'아직 답글이 없습니다.', it:'Ancora nessuna risposta.' },
  },

  // Nav label translations per language code
  navLabels: {
    home:          { en:'My Mweets',     fa:'مووت‌های من',     he:'המוויטים שלי',       ar:'مويطاتي',            hi:'मेरे मवीट्स',   es:'Mis Mweets',      fr:'Mes Mweets',      de:'Meine Mweets',         zh:'我的帖子',   pt:'Meus Mweets',  ja:'自分の投稿',   ru:'Мои Мвиты',      ko:'내 게시물', it:'I Miei Mweet' },
    explore:       { en:'Explore',       fa:'کاوش',       he:'גלה',                ar:'استكشف',              hi:'खोजें',         es:'Explorar',        fr:'Explorer',        de:'Entdecken',            zh:'探索',       pt:'Explorar',     ja:'探索',         ru:'Обзор',          ko:'탐색',      it:'Esplora'      },
    notifications: { en:'Notifications', fa:'اعلان‌ها', he:'התראות',             ar:'الإشعارات',           hi:'सूचनाएं',       es:'Notificaciones',  fr:'Notifications',   de:'Benachrichtigungen',   zh:'通知',       pt:'Notificações', ja:'通知',         ru:'Уведомления',    ko:'알림',      it:'Notifiche'    },
    messages:      { en:'Messages',      fa:'پیام‌ها',      he:'הודעות',             ar:'الرسائل',             hi:'संदेश',         es:'Mensajes',        fr:'Messages',        de:'Nachrichten',          zh:'消息',       pt:'Mensagens',    ja:'メッセージ',   ru:'Сообщения',      ko:'메시지',    it:'Messaggi'     },
    bookmarks:     { en:'Bookmarks',     fa:'نشانک‌ها',     he:'סימניות',            ar:'المفضلة',             hi:'बुकमार्क',      es:'Guardados',       fr:'Favoris',         de:'Lesezeichen',          zh:'书签',       pt:'Favoritos',    ja:'ブックマーク', ru:'Закладки',       ko:'북마크',    it:'Segnalibri'   },
    profile:       { en:'Profile',       fa:'پروفایل',  he:'פרופיל',             ar:'الملف الشخصي',        hi:'प्रोफ़ाइल',     es:'Perfil',          fr:'Profil',          de:'Profil',               zh:'个人资料',   pt:'Perfil',       ja:'プロフィール', ru:'Профиль',        ko:'프로필',    it:'Profilo'      },
  },

  // All wc.publish / wc.subscribe event names
  events: {
    TWEET_POSTED:     'mtk-twitter:tweet-posted',
    TWEET_LIKED:      'mtk-twitter:tweet-liked',
    TWEET_RETWEETED:  'mtk-twitter:tweet-retweeted',
    TWEET_REPLIED:    'mtk-twitter:tweet-replied',
    TWEET_BOOKMARKED: 'mtk-twitter:tweet-bookmarked',
    TWEET_TRANSLATED: 'mtk-twitter:tweet-translated',
    LANGUAGE_CHANGED: 'mtk-twitter:language-changed',
    USER_REGISTERED:  'mtk-twitter:user-registered',
    USER_LOGGED_IN:   'mtk-twitter:user-logged-in',
    USER_LOGGED_OUT:  'mtk-twitter:user-logged-out',
    FEED_REFRESHED:   'mtk-twitter:feed-refreshed',
    AUTH_ERROR:       'mtk-twitter:auth-error',
  },

  validation: {
    username:    { min: 3,  max: 30,  pattern: '^[a-zA-Z0-9_]+$' },
    password:    { min: 8,  max: 128 },
    displayName: { min: 2,  max: 50  },
    bio:         { max: 160 },
  },
};
