const MTK_TWITTER_CONFIG = {
  app: {
    name: "Melify",
    tagline: "People Helping People — Worldwide",
    version: "1.0.0",
    defaultLanguage: "en",
    translationDelay: 600, // ms simulated translation delay
    maxPostLength: 280,
    avatarBaseUrl: "https://i.pravatar.cc/48"
  },

  languages: [
    { code: "en", label: "English",    flag: "🇺🇸", nativeName: "English"    },
    { code: "hi", label: "Hindi",      flag: "🇮🇳", nativeName: "हिन्दी"       },
    { code: "es", label: "Spanish",    flag: "🇪🇸", nativeName: "Español"     },
    { code: "fr", label: "French",     flag: "🇫🇷", nativeName: "Français"    },
    { code: "de", label: "German",     flag: "🇩🇪", nativeName: "Deutsch"     },
    { code: "zh", label: "Chinese",    flag: "🇨🇳", nativeName: "中文"         },
    { code: "ar", label: "Arabic",     flag: "🇸🇦", nativeName: "العربية"     },
    { code: "pt", label: "Portuguese", flag: "🇧🇷", nativeName: "Português"   },
    { code: "ja", label: "Japanese",   flag: "🇯🇵", nativeName: "日本語"       },
    { code: "ru", label: "Russian",    flag: "🇷🇺", nativeName: "Русский"     }
  ],

  // Simulated translation map: [sourceLang][targetLang][text] = translated
  // In production this would be replaced by a real translation API call
  translations: {
    "नमस्ते! आज का मौसम बहुत अच्छा है।": {
      en: "Hello! The weather is very nice today.",
      es: "¡Hola! El tiempo está muy bien hoy.",
      fr: "Bonjour! Le temps est très beau aujourd'hui.",
      de: "Hallo! Das Wetter ist heute sehr schön.",
      zh: "你好！今天天气很好。",
      ar: "مرحبا! الطقس جميل جدا اليوم.",
      pt: "Olá! O tempo está muito bom hoje.",
      ja: "こんにちは！今日の天気はとても良いです。",
      ru: "Привет! Сегодня очень хорошая погода."
    },
    "La tecnología nos une a todos.": {
      en: "Technology unites us all.",
      hi: "प्रौद्योगिकी हम सभी को एकजुट करती है।",
      fr: "La technologie nous unit tous.",
      de: "Technologie verbindet uns alle.",
      zh: "技术将我们所有人联合在一起。",
      ar: "التكنولوجيا تجمعنا جميعًا.",
      pt: "A tecnologia nos une a todos.",
      ja: "テクノロジーは私たちみんなをつなげます。",
      ru: "Технологии объединяют нас всех."
    },
    "Bonjour le monde! Je suis heureux de vous retrouver ici.": {
      en: "Hello world! I'm happy to find you here.",
      hi: "नमस्ते दुनिया! मुझे यहाँ आपसे मिलकर खुशी है।",
      es: "¡Hola mundo! Estoy feliz de encontrarte aquí.",
      de: "Hallo Welt! Ich freue mich, Sie hier zu treffen.",
      zh: "你好世界！很高兴在这里见到你。",
      ar: "مرحبا بالعالم! يسعدني أن أجدك هنا.",
      pt: "Olá mundo! Estou feliz em te encontrar aqui.",
      ja: "こんにちは世界！ここで会えて嬉しいです。",
      ru: "Привет мир! Рад видеть тебя здесь."
    },
    "この技術は素晴らしいです！言語の壁がなくなりますね。": {
      en: "This technology is amazing! Language barriers will disappear.",
      hi: "यह तकनीक अद्भुत है! भाषा की बाधाएं गायब हो जाएंगी।",
      es: "¡Esta tecnología es increíble! Las barreras del idioma desaparecerán.",
      fr: "Cette technologie est incroyable! Les barrières linguistiques vont disparaître.",
      de: "Diese Technologie ist erstaunlich! Sprachbarrieren werden verschwinden.",
      zh: "这项技术太棒了！语言障碍将会消失。",
      ar: "هذه التكنولوجيا رائعة! ستختفي الحواجز اللغوية.",
      pt: "Esta tecnologia é incrível! As barreiras linguísticas vão desaparecer.",
      ru: "Эта технология удивительна! Языковые барьеры исчезнут."
    },
    "مرحبا بالجميع! نحن نبني جسور التواصل بين الشعوب.": {
      en: "Hello everyone! We are building bridges of communication between peoples.",
      hi: "सभी को नमस्ते! हम लोगों के बीच संचार के पुल बना रहे हैं।",
      es: "¡Hola a todos! Estamos construyendo puentes de comunicación entre los pueblos.",
      fr: "Bonjour à tous! Nous construisons des ponts de communication entre les peuples.",
      de: "Hallo alle! Wir bauen Kommunikationsbrücken zwischen den Völkern.",
      zh: "大家好！我们正在建立人民之间的沟通桥梁。",
      pt: "Olá a todos! Estamos construindo pontes de comunicação entre os povos.",
      ja: "みなさんこんにちは！私たちは人々の間のコミュニケーションの橋を築いています。",
      ru: "Всем привет! Мы строим мосты общения между народами."
    },
    "Технологии меняют мир к лучшему каждый день.": {
      en: "Technology changes the world for the better every day.",
      hi: "प्रौद्योगिकी हर दिन दुनिया को बेहतर के लिए बदल रही है।",
      es: "La tecnología cambia el mundo para mejor cada día.",
      fr: "La technologie change le monde pour le mieux chaque jour.",
      de: "Technologie verändert die Welt jeden Tag zum Besseren.",
      zh: "技术每天都在让世界变得更美好。",
      ar: "التكنولوجيا تغير العالم إلى الأفضل كل يوم.",
      pt: "A tecnologia muda o mundo para melhor todos os dias.",
      ja: "テクノロジーは毎日世界をより良く変えています。"
    }
  },

  currentUser: {
    id: "user_001",
    name: "Alex Rivera",
    handle: "@alexrivera",
    language: "en",
    avatar: "https://i.pravatar.cc/48?img=11",
    verified: false
  },

  tweets: [
    {
      id: "tweet_001",
      userId: "user_ind_001",
      name: "Priya Sharma",
      handle: "@priyasharma",
      avatar: "https://i.pravatar.cc/48?img=47",
      originalLang: "hi",
      text: "नमस्ते! आज का मौसम बहुत अच्छा है।",
      timestamp: "2m ago",
      likes: 24,
      retweets: 5,
      replies: 3,
      liked: false,
      retweeted: false,
      bookmarked: false,
      verified: false,
      replies_data: []
    },
    {
      id: "tweet_002",
      userId: "user_esp_001",
      name: "Carlos Mendoza",
      handle: "@carlosmendoza",
      avatar: "https://i.pravatar.cc/48?img=52",
      originalLang: "es",
      text: "La tecnología nos une a todos.",
      timestamp: "15m ago",
      likes: 89,
      retweets: 31,
      replies: 12,
      liked: false,
      retweeted: false,
      bookmarked: false,
      verified: true,
      replies_data: []
    },
    {
      id: "tweet_003",
      userId: "user_fr_001",
      name: "Sophie Dubois",
      handle: "@sophiedubois",
      avatar: "https://i.pravatar.cc/48?img=44",
      originalLang: "fr",
      text: "Bonjour le monde! Je suis heureux de vous retrouver ici.",
      timestamp: "32m ago",
      likes: 41,
      retweets: 8,
      replies: 6,
      liked: false,
      retweeted: false,
      bookmarked: false,
      verified: false,
      replies_data: []
    },
    {
      id: "tweet_004",
      userId: "user_jp_001",
      name: "Kenji Tanaka",
      handle: "@kenjitanaka",
      avatar: "https://i.pravatar.cc/48?img=56",
      originalLang: "ja",
      text: "この技術は素晴らしいです！言語の壁がなくなりますね。",
      timestamp: "1h ago",
      likes: 112,
      retweets: 44,
      replies: 19,
      liked: false,
      retweeted: false,
      bookmarked: false,
      verified: true,
      replies_data: []
    },
    {
      id: "tweet_005",
      userId: "user_ar_001",
      name: "Omar Hassan",
      handle: "@omarhassan",
      avatar: "https://i.pravatar.cc/48?img=59",
      originalLang: "ar",
      text: "مرحبا بالجميع! نحن نبني جسور التواصل بين الشعوب.",
      timestamp: "2h ago",
      likes: 67,
      retweets: 22,
      replies: 9,
      liked: false,
      retweeted: false,
      bookmarked: false,
      verified: false,
      replies_data: []
    },
    {
      id: "tweet_006",
      userId: "user_ru_001",
      name: "Natasha Volkova",
      handle: "@natashavolkova",
      avatar: "https://i.pravatar.cc/48?img=45",
      originalLang: "ru",
      text: "Технологии меняют мир к лучшему каждый день.",
      timestamp: "3h ago",
      likes: 55,
      retweets: 17,
      replies: 7,
      liked: false,
      retweeted: false,
      bookmarked: false,
      verified: false,
      replies_data: []
    }
  ],

  navItems: [
    { icon: "home",          label: "Home",          active: true  },
    { icon: "explore",       label: "Explore",       active: false },
    { icon: "notifications", label: "Notifications", active: false },
    { icon: "mail",          label: "Messages",      active: false },
    { icon: "bookmark",      label: "Bookmarks",     active: false },
    { icon: "person",        label: "Profile",       active: false }
  ],

  trendingTopics: [
    { tag: "#MelifyTranslates", tweets: "12.4K" },
    { tag: "#LanguageBarriers",  tweets: "8.1K"  },
    { tag: "#GlobalChat",        tweets: "5.7K"  },
    { tag: "#TechForGood",       tweets: "44.2K" },
    { tag: "#PeopleHelpingPeople", tweets: "3.9K" }
  ],

  whoToFollow: [
    { name: "Melify Team",     handle: "@melifyteam",     avatar: "https://i.pravatar.cc/48?img=12", verified: true  },
    { name: "Global Voices",   handle: "@globalvoices",   avatar: "https://i.pravatar.cc/48?img=20", verified: true  },
    { name: "Lang Bridge",     handle: "@langbridge",     avatar: "https://i.pravatar.cc/48?img=33", verified: false }
  ],

  events: {
    TWEET_POSTED:       "mtk-twitter:tweet-posted",
    TWEET_LIKED:        "mtk-twitter:tweet-liked",
    TWEET_RETWEETED:    "mtk-twitter:tweet-retweeted",
    TWEET_REPLIED:      "mtk-twitter:tweet-replied",
    LANGUAGE_CHANGED:   "mtk-twitter:language-changed",
    TWEET_BOOKMARKED:   "mtk-twitter:tweet-bookmarked",
    TWEET_TRANSLATED:   "mtk-twitter:tweet-translated"
  }
};
