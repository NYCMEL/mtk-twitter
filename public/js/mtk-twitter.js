/**
 * mtk-twitter.js
 * Melify — Multilingual Social Feed
 * Vanilla JS Class · No frameworks
 * Auto-initializes at bottom of file
 */

// ── wc bus (pub/sub + log) ────────────────────────────────────
window.wc = window.wc || (() => {
  const _ch = {};
  return {
    subscribe(event, cb) {
      (_ch[event] = _ch[event] || []).push(cb);
    },
    publish(event, payload) {
      wc.log(event, payload);
      (_ch[event] || []).forEach(cb => {
        try { cb(payload); } catch (e) { console.error('[wc] handler error:', e); }
      });
    },
    log(event, payload) {
      console.groupCollapsed(`%c[wc.publish] ${event}`, 'color:#38bdf8;font-weight:bold;font-family:monospace');
      console.log('payload →', payload);
      console.groupEnd();
    },
  };
})();


// ═══════════════════════════════════════════════════════════════
class MTKTwitter {
// ═══════════════════════════════════════════════════════════════

  constructor(selector = 'mtk-twitter.mtk-twitter') {
    this._selector = selector;
    this._root     = null;
    this._cfg      = null;

    // App State
    this._state = {
      screen:   'splash',
      user:     null,
      tweets:   [],
      userLang: 'en',
      transCache: {},
      pollTimer: null,
      ws: null,
      activeNav: 'home',
      theme: 'dark',        // 'dark' | 'light' — overwritten by _initTheme()
    };

    this._waitForElement(selector).then(el => {
      this._root = el;
      this._cfg  = MTK_TWITTER_CONFIG;
      this._boot();
    });
  }

  // ── DOM ready wait ──────────────────────────────────────────
  _waitForElement(selector) {
    return new Promise(resolve => {
      const find = () => {
        const el = typeof selector === 'string'
          ? document.querySelector(selector)
          : selector;
        if (el) return resolve(el);
        requestAnimationFrame(find);
      };
      document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', find)
        : find();
    });
  }

  // ── Boot ────────────────────────────────────────────────────
  _boot() {
    this._initTheme();
    // Restore session
    const saved = this._loadSession();
    if (saved) {
      this._state.user = saved;
      // Display language: user's explicit choice, falls back to profile language
      const savedDisplayLang = (() => { try { return localStorage.getItem('mtk_display_lang'); } catch(_){return null;} })();
      this._state.userLang = savedDisplayLang || saved.lang || this._cfg.app.defaultLanguage;
      this._renderApp();
      this._showScreen('app');
      this._loadFeed();
      this._startPolling();
    } else {
      this._renderAll();
      this._showScreen('splash');
    }
    this._subscribeAll();
    console.log('%c[MTKTwitter] booted', 'color:#38bdf8;font-weight:bold');
  }

  // ── Render everything ───────────────────────────────────────
  _renderAll() {
    this._root.innerHTML = `
      ${this._tplSplash()}
      ${this._tplRegister()}
      ${this._tplLogin()}
      ${this._tplApp()}
      ${this._tplLangModal()}
      ${this._tplProfileMenu()}
      <div class="mtk-twitter__toasts" id="mtk-toasts" aria-live="assertive"></div>
    `;
    this._bindSplash();
    this._bindRegister();
    this._bindLogin();
    this._bindApp();
    this._updateThemeUI();
  }

  _renderApp() {
    this._root.innerHTML = `
      ${this._tplSplash()}
      ${this._tplRegister()}
      ${this._tplLogin()}
      ${this._tplApp()}
      ${this._tplLangModal()}
      ${this._tplProfileMenu()}
      <div class="mtk-twitter__toasts" id="mtk-toasts" aria-live="assertive"></div>
    `;
    this._bindSplash();
    this._bindRegister();
    this._bindLogin();
    this._bindApp();
    this._updateAppUser();
    this._updateThemeUI();
  }

  // ── Screen manager ──────────────────────────────────────────
  _showScreen(name) {
    this._state.screen = name;
    this._root.querySelectorAll('.mtk-twitter__screen').forEach(s => {
      s.classList.toggle('mtk-twitter__screen--active', s.dataset.screen === name);
    });
  }

  // ════════════════════════════════════════════════════════════
  // TEMPLATES
  // ════════════════════════════════════════════════════════════

  _tplSplash() {
    const { app, seedTweets } = this._cfg;
    return `
    <div class="mtk-twitter__screen mtk-twitter__splash" data-screen="splash" role="main">
      <div class="mtk-twitter__splash-brand">
        <div class="brand-icon" aria-hidden="true">
          <span class="material-icons-round">T</span>
        </div>
        <h1>${app.name}</h1>
        <p>${app.tagline}</p>
      </div>

      <div class="mtk-twitter__splash-preview" aria-label="Sample posts from around the world">
        <div class="preview-label">Live from the world</div>
        ${seedTweets.slice(0, 3).map(t => this._tplSplashTweet(t)).join('')}
      </div>

      <div class="mtk-twitter__splash-cta">
        <button class="mtk-twitter__btn mtk-twitter__btn--primary" id="mtk-splash-register"
                aria-label="Create your Melify account">
          <span class="material-icons-round" aria-hidden="true">person_add</span>
          Create account
        </button>
        <button class="mtk-twitter__btn mtk-twitter__btn--outline" id="mtk-splash-login"
                aria-label="Sign in to Melify">
          <span class="material-icons-round" aria-hidden="true">login</span>
          Sign in
        </button>
      </div>

      <div class="mtk-twitter__splash-theme">
        <span>Appearance:</span>
        <button id="mtk-splash-theme" aria-label="Toggle light/dark mode">
          <span class="material-icons-round" id="mtk-splash-theme-icon" aria-hidden="true">light_mode</span>
          <span id="mtk-splash-theme-label">Light mode</span>
        </button>
      </div>
    </div>`;
  }

  _tplSplashTweet(t) {
    const lang = this._cfg.languages.find(l => l.code === t.originalLang);
    return `
    <div class="mtk-twitter__splash-tweet">
      <img src="${t.user.avatar}" alt="${t.user.name}" loading="lazy" />
      <div class="st-body">
        <div class="st-header">
          <span class="st-name">${this._esc(t.user.name)}</span>
          <span class="st-handle">@${t.user.handle}</span>
          ${lang ? `<span class="st-flag">${lang.flag} ${lang.label}</span>` : ''}
        </div>
        <div class="st-text">${this._esc(t.text)}</div>
      </div>
    </div>`;
  }

  _tplRegister() {
    const langs = this._cfg.languages;
    return `
    <div class="mtk-twitter__screen mtk-twitter__auth" data-screen="register" role="main" aria-label="Registration">
      <div class="mtk-twitter__auth-card">
        <button class="mtk-twitter__auth-back" id="mtk-reg-back" aria-label="Back to splash">
          <span class="material-icons-round" aria-hidden="true">arrow_back</span> Back
        </button>
        <div class="mtk-twitter__auth-logo">
          <div class="al-icon"><span class="material-icons-round">T</span></div>
          <span>${this._cfg.app.name}</span>
        </div>
        <h1 class="mtk-twitter__auth-heading">Join Melify</h1>
        <p class="mtk-twitter__auth-subheading">Connect with the world in your own language.</p>

        <div class="mtk-twitter__form-error" id="mtk-reg-error" role="alert">
          <span class="material-icons-round" aria-hidden="true">error_outline</span>
          <span id="mtk-reg-error-msg"></span>
        </div>

        <div class="mtk-twitter__field">
          <label for="mtk-reg-name">Display Name</label>
          <div class="mtk-twitter__field-wrap">
            <span class="material-icons-round field-icon" aria-hidden="true">badge</span>
            <input type="text" id="mtk-reg-name" placeholder="Your name" autocomplete="name"
                   maxlength="50" aria-describedby="mtk-reg-name-err" />
          </div>
          <div class="mtk-twitter__field-error" id="mtk-reg-name-err" role="alert"></div>
        </div>

        <div class="mtk-twitter__field">
          <label for="mtk-reg-username">Username</label>
          <div class="mtk-twitter__field-wrap">
            <span class="material-icons-round field-icon" aria-hidden="true">alternate_email</span>
            <input type="text" id="mtk-reg-username" placeholder="username (letters, numbers, _)"
                   autocomplete="username" maxlength="30"
                   aria-describedby="mtk-reg-username-err" />
          </div>
          <div class="mtk-twitter__field-error" id="mtk-reg-username-err" role="alert"></div>
        </div>

        <div class="mtk-twitter__field">
          <label for="mtk-reg-email">Email</label>
          <div class="mtk-twitter__field-wrap">
            <span class="material-icons-round field-icon" aria-hidden="true">email</span>
            <input type="email" id="mtk-reg-email" placeholder="you@example.com"
                   autocomplete="email" aria-describedby="mtk-reg-email-err" />
          </div>
          <div class="mtk-twitter__field-error" id="mtk-reg-email-err" role="alert"></div>
        </div>

        <div class="mtk-twitter__field">
          <label for="mtk-reg-password">Password</label>
          <div class="mtk-twitter__field-wrap">
            <span class="material-icons-round field-icon" aria-hidden="true">lock</span>
            <input type="password" id="mtk-reg-password" placeholder="Min 8 characters"
                   autocomplete="new-password" aria-describedby="mtk-reg-pw-err mtk-pw-strength-label" />
            <button class="field-toggle" id="mtk-reg-pw-toggle" type="button"
                    aria-label="Toggle password visibility">
              <span class="material-icons-round">visibility_off</span>
            </button>
          </div>
          <div class="mtk-twitter__pw-strength">
            <div class="mtk-twitter__pw-strength-bar">
              <div class="mtk-twitter__pw-strength-bar-fill" id="mtk-pw-bar"></div>
            </div>
            <span class="mtk-twitter__pw-strength-label" id="mtk-pw-strength-label" aria-live="polite"></span>
          </div>
          <div class="mtk-twitter__field-error" id="mtk-reg-pw-err" role="alert"></div>
        </div>

        <div class="mtk-twitter__lang-field">
          <label for="mtk-reg-lang">My Language</label>
          <div class="mtk-twitter__lang-field-wrap">
            <span class="material-icons-round" aria-hidden="true">language</span>
            <select id="mtk-reg-lang" aria-label="Select your preferred language">
              ${langs.map(l => `
                <option value="${l.code}" ${l.code === 'en' ? 'selected' : ''}>
                  ${l.flag} ${l.label} — ${l.nativeName}
                </option>`).join('')}
            </select>
          </div>
          <div class="mtk-twitter__field-hint">Posts and replies will be shown in this language</div>
        </div>

        <button class="mtk-twitter__btn mtk-twitter__btn--primary" id="mtk-reg-submit"
                style="margin-top:8px" aria-label="Create account">
          <div class="mtk-twitter__btn-spinner" id="mtk-reg-spinner"></div>
          <span id="mtk-reg-btn-label">Create Account</span>
        </button>

        <div class="mtk-twitter__auth-switch">
          Already have an account?
          <button id="mtk-reg-to-login" aria-label="Go to sign in">Sign in</button>
        </div>
      </div>
    </div>`;
  }

  _tplLogin() {
    return `
    <div class="mtk-twitter__screen mtk-twitter__auth" data-screen="login" role="main" aria-label="Sign in">
      <div class="mtk-twitter__auth-card">
        <button class="mtk-twitter__auth-back" id="mtk-login-back" aria-label="Back to splash">
          <span class="material-icons-round" aria-hidden="true">arrow_back</span> Back
        </button>
        <div class="mtk-twitter__auth-logo">
          <div class="al-icon"><span class="material-icons-round">T</span></div>
          <span>${this._cfg.app.name}</span>
        </div>
        <h1 class="mtk-twitter__auth-heading">Welcome back</h1>
        <p class="mtk-twitter__auth-subheading">Sign in to continue your global conversation.</p>

        <div class="mtk-twitter__form-error" id="mtk-login-error" role="alert">
          <span class="material-icons-round" aria-hidden="true">error_outline</span>
          <span id="mtk-login-error-msg"></span>
        </div>

        <div class="mtk-twitter__field">
          <label for="mtk-login-identifier">Username or Email</label>
          <div class="mtk-twitter__field-wrap">
            <span class="material-icons-round field-icon" aria-hidden="true">person</span>
            <input type="text" id="mtk-login-identifier" placeholder="username or email"
                   autocomplete="username" aria-describedby="mtk-login-id-err" />
          </div>
          <div class="mtk-twitter__field-error" id="mtk-login-id-err" role="alert"></div>
        </div>

        <div class="mtk-twitter__field">
          <label for="mtk-login-password">Password</label>
          <div class="mtk-twitter__field-wrap">
            <span class="material-icons-round field-icon" aria-hidden="true">lock</span>
            <input type="password" id="mtk-login-password" placeholder="Your password"
                   autocomplete="current-password" aria-describedby="mtk-login-pw-err" />
            <button class="field-toggle" id="mtk-login-pw-toggle" type="button"
                    aria-label="Toggle password visibility">
              <span class="material-icons-round">visibility_off</span>
            </button>
          </div>
          <div class="mtk-twitter__field-error" id="mtk-login-pw-err" role="alert"></div>
        </div>

        <button class="mtk-twitter__btn mtk-twitter__btn--primary" id="mtk-login-submit"
                style="margin-top:8px" aria-label="Sign in">
          <div class="mtk-twitter__btn-spinner" id="mtk-login-spinner"></div>
          <span id="mtk-login-btn-label">Sign In</span>
        </button>

        <div class="mtk-twitter__auth-switch">
          Don't have an account?
          <button id="mtk-login-to-register" aria-label="Go to registration">Create one</button>
        </div>
      </div>
    </div>`;
  }

  _tplApp() {
    const { navItems, trendingTopics, app } = this._cfg;
    const user = this._state.user;

    return `
    <div class="mtk-twitter__screen mtk-twitter__app" data-screen="app" role="main">

      <!-- Top Bar -->
      <header class="mtk-twitter__topbar" role="banner">
        <div class="mtk-twitter__topbar-brand" aria-hidden="true">
          <span class="material-icons-round">T</span>
          ${app.name}
        </div>
        <div class="mtk-twitter__topbar-title" id="mtk-topbar-title">Home</div>
        <button class="mtk-twitter__topbar-lang" id="mtk-lang-btn"
                aria-label="Change display language" aria-haspopup="dialog">
          <span class="material-icons-round" aria-hidden="true">language</span>
          <span id="mtk-lang-flag">🇺🇸</span>
        </button>
        <button class="mtk-twitter__theme-toggle" id="mtk-theme-toggle"
                aria-label="Toggle light/dark mode" title="Toggle theme">
          <span class="material-icons-round" id="mtk-theme-icon" aria-hidden="true">light_mode</span>
        </button>
        <img class="mtk-twitter__topbar-avatar" id="mtk-avatar-btn"
             src="${user?.avatar_url || this._cfg.app.avatarBaseUrl + '?img=11'}"
             alt="Your profile" tabindex="0" role="button" aria-haspopup="menu" />
      </header>

      <div class="mtk-twitter__app-layout">

        <!-- Left Sidebar (desktop) -->
        <nav class="mtk-twitter__sidebar" aria-label="Primary navigation">
          <div class="mtk-twitter__sidebar-brand" aria-hidden="true">
            <span class="material-icons-round">T</span>
            ${app.name}
          </div>
          <div class="mtk-twitter__nav" role="list">
            ${navItems.map(n => `
              <button class="mtk-twitter__nav-item${n.id === 'home' ? ' mtk-twitter__nav-item--active' : ''}"
                      data-nav="${n.id}" role="listitem"
                      aria-current="${n.id === 'home' ? 'page' : 'false'}"
                      aria-label="${n.label}">
                <span class="material-icons-round" aria-hidden="true">${n.icon}</span>
                ${n.label}
              </button>`).join('')}
          </div>
          <button class="mtk-twitter__sidebar-post-btn" id="mtk-sidebar-post-btn"
                  aria-label="Create new post">
            <span class="material-icons-round" aria-hidden="true">edit</span>
            Post
          </button>
          <button class="mtk-twitter__sidebar-theme" id="mtk-sidebar-theme"
                  aria-label="Toggle light/dark mode">
            <span class="material-icons-round" id="mtk-sidebar-theme-icon" aria-hidden="true">light_mode</span>
            <span id="mtk-sidebar-theme-label">Light mode</span>
          </button>
          <div class="mtk-twitter__sidebar-user" tabindex="0" role="button"
               aria-label="Your profile" id="mtk-sidebar-user">
            <img id="mtk-sidebar-avatar"
                 src="${user?.avatar_url || this._cfg.app.avatarBaseUrl + '?img=11'}"
                 alt="Your avatar" />
            <div class="su-info">
              <div class="su-name" id="mtk-sidebar-name">${user?.display_name || 'User'}</div>
              <div class="su-handle" id="mtk-sidebar-handle">@${user?.username || ''}</div>
            </div>
            <span class="material-icons-round" aria-hidden="true">more_horiz</span>
          </div>
        </nav>

        <!-- Feed -->
        <main class="mtk-twitter__feed" aria-label="Post feed">
          <div class="mtk-twitter__feed-header">
            <h2>Home</h2>
            <div class="mtk-twitter__feed-header-lang" id="mtk-feed-lang-pill">
              <span class="material-icons-round" aria-hidden="true">language</span>
              <span id="mtk-feed-lang-text">English</span>
            </div>
          </div>

          <!-- Compose -->
          <section class="mtk-twitter__compose" aria-label="Compose new post">
            <img class="mtk-twitter__compose-avatar" id="mtk-compose-avatar"
                 src="${user?.avatar_url || this._cfg.app.avatarBaseUrl + '?img=11'}"
                 alt="Your avatar" />
            <div class="mtk-twitter__compose-inner">
              <div class="mtk-twitter__compose-lang-pill" id="mtk-compose-lang-pill">
                <span class="material-icons-round" aria-hidden="true">language</span>
                Posting in <span id="mtk-compose-lang-label">${(() => { const pl = this._cfg.languages.find(l => l.code === (user?.lang || 'en')); return pl ? pl.flag + ' ' + pl.label : '🇺🇸 English'; })()}</span>
              </div>
              <textarea id="mtk-compose-ta" placeholder="What's happening worldwide?"
                        maxlength="280" aria-label="Compose post" rows="3"
                        dir="${(() => { const pl = this._cfg.languages.find(l => l.code === (user?.lang || 'en')); return pl?.rtl ? 'rtl' : 'ltr'; })()}"></textarea>
              <div class="mtk-twitter__compose-footer">
                <div class="mtk-twitter__compose-tools" role="group" aria-label="Compose tools">
                  <button aria-label="Add image" title="Add image">
                    <span class="material-icons-round" aria-hidden="true">image</span>
                  </button>
                  <button aria-label="Add emoji" title="Add emoji">
                    <span class="material-icons-round" aria-hidden="true">emoji_emotions</span>
                  </button>
                </div>
                <div class="mtk-twitter__compose-right">
                  <span class="char-count" id="mtk-char-count" aria-live="polite">280</span>
                  <button class="post-btn" id="mtk-post-btn" disabled aria-label="Submit post">Post</button>
                </div>
              </div>
            </div>
          </section>

          <ul class="mtk-twitter__tweet-list" id="mtk-tweet-list"
              aria-label="Posts" aria-live="polite" aria-atomic="false">
            ${this._tplSkeletons(3)}
          </ul>

          <div class="mtk-twitter__feed-spacer" aria-hidden="true"></div>
        </main>

        <!-- Right sidebar -->
        <aside class="mtk-twitter__sidebar-right" aria-label="Sidebar">
          <div class="mtk-twitter__search-box" role="search">
            <span class="material-icons-round" aria-hidden="true">search</span>
            <input type="search" placeholder="Search Melify" aria-label="Search" />
          </div>
          <div class="mtk-twitter__widget" role="region" aria-label="Trending topics">
            <div class="mtk-twitter__widget-title">Trending</div>
            ${trendingTopics.map((t, i) => `
              <div class="mtk-twitter__trend-item" tabindex="0" role="button"
                   aria-label="Trending: ${t.tag}, ${t.posts} posts">
                <span class="tr-meta">Trending · ${i+1}</span>
                <span class="tr-tag">${t.tag}</span>
                <span class="tr-posts">${t.posts} posts</span>
              </div>`).join('')}
          </div>
        </aside>
      </div>

      <!-- Bottom nav (mobile) -->
      <nav class="mtk-twitter__bottom-nav" aria-label="Mobile navigation">
        ${this._cfg.navItems.map(n => `
          <button data-nav="${n.id}" class="${n.id==='home'?'active':''}"
                  aria-label="${n.label}" aria-current="${n.id==='home'?'page':'false'}">
            <span class="material-icons-round" aria-hidden="true">${n.icon}</span>
            ${n.label}
          </button>`).join('')}
      </nav>

      <!-- FAB -->
      <button class="mtk-twitter__fab" id="mtk-fab" aria-label="Create new post">
        <span class="material-icons-round" aria-hidden="true">edit</span>
      </button>
    </div>`;
  }

  _tplLangModal() {
    const langs = this._cfg.languages;
    return `
    <div class="mtk-twitter__modal-overlay" id="mtk-lang-overlay" role="dialog"
         aria-modal="true" aria-label="Choose display language">
      <div class="mtk-twitter__modal">
        <div class="mtk-twitter__modal-header">
          <h3>Display Language</h3>
          <button id="mtk-lang-close" aria-label="Close language picker">
            <span class="material-icons-round">close</span>
          </button>
        </div>
        <div class="mtk-twitter__modal-body" id="mtk-lang-list" role="list">
          ${langs.map(l => `
            <div class="mtk-twitter__lang-option" data-lang="${l.code}"
                 tabindex="0" role="option" aria-selected="false"
                 aria-label="${l.label} — ${l.nativeName}">
              <span class="lo-flag" aria-hidden="true">${l.flag}</span>
              <div class="lo-texts">
                <div class="lo-label">${l.label}</div>
                <div class="lo-native">${l.nativeName}</div>
              </div>
              <span class="material-icons-round lo-check" aria-hidden="true">check_circle</span>
            </div>`).join('')}
        </div>
      </div>
    </div>`;
  }

  _tplProfileMenu() {
    return `
    <div class="mtk-twitter__profile-menu" id="mtk-profile-menu" role="menu" aria-label="Profile menu">
      <button class="mtk-twitter__profile-menu-item" id="mtk-menu-profile" role="menuitem">
        <span class="material-icons-round" aria-hidden="true">person</span> Profile
      </button>
      <button class="mtk-twitter__profile-menu-item" id="mtk-menu-lang" role="menuitem">
        <span class="material-icons-round" aria-hidden="true">language</span> Change Language
      </button>
      <button class="mtk-twitter__profile-menu-item" id="mtk-menu-theme" role="menuitem">
        <span class="material-icons-round" id="mtk-menu-theme-icon" aria-hidden="true">light_mode</span>
        <span id="mtk-menu-theme-label">Light mode</span>
      </button>
      <button class="mtk-twitter__profile-menu-item mtk-twitter__profile-menu-item--danger"
              id="mtk-menu-logout" role="menuitem">
        <span class="material-icons-round" aria-hidden="true">logout</span> Sign Out
      </button>
    </div>`;
  }

  _tplSkeletons(n) {
    return Array.from({length: n}, () => `
      <li class="mtk-twitter__skeleton" aria-hidden="true">
        <div class="mtk-twitter__skeleton-avatar"></div>
        <div class="mtk-twitter__skeleton-lines">
          <div class="mtk-twitter__skeleton-line mtk-twitter__skeleton-line--short"></div>
          <div class="mtk-twitter__skeleton-line mtk-twitter__skeleton-line--long"></div>
          <div class="mtk-twitter__skeleton-line mtk-twitter__skeleton-line--medium"></div>
        </div>
      </li>`).join('');
  }

  _tplTweet(t) {
    const cfg      = this._cfg;
    const origLang = t.original_lang || t.originalLang;
    const lang     = cfg.languages.find(l => l.code === origLang);
    const id       = t.id;
    const user     = t.user || { name: t.display_name, handle: t.username, avatar: t.avatar_url, verified: t.verified };
    const text     = t.text;
    const likes    = t.likes_count ?? t.likes ?? 0;
    const rts      = t.retweets_count ?? t.retweets ?? 0;
    const reps     = t.replies_count  ?? t.replies  ?? 0;

    // If we already have a cached translation, show it immediately
    const cacheKey     = `${id}_${this._state.userLang}`;
    const cachedTrans  = this._state.transCache[cacheKey];
    // Show translation if: target lang differs from original AND we have a cached value
    const needsTrans   = origLang !== this._state.userLang;
    const showingTrans = needsTrans && !!cachedTrans;
    const displayText  = showingTrans ? cachedTrans : text;
    const displayLang  = showingTrans ? this._state.userLang : origLang;

    return `
    <li class="mtk-twitter__tweet${t._new ? ' mtk-twitter__tweet--new' : ''}"
        data-id="${id}" tabindex="0" role="article" aria-label="Post by ${this._esc(user.name || user.display_name || '')}">

      <div class="mtk-twitter__tweet-avatar">
        <img src="${user.avatar || user.avatar_url || cfg.app.avatarBaseUrl+'?img=20'}"
             alt="${this._esc(user.name || user.display_name || '')}" loading="lazy" />
      </div>

      <div class="mtk-twitter__tweet-body">
        <div class="mtk-twitter__tweet-header">
          <span class="mtk-twitter__tweet-name">
            ${this._esc(user.name || user.display_name || '')}
            ${user.verified ? '<span class="material-icons-round verified" aria-label="Verified" title="Verified">verified</span>' : ''}
          </span>
          <span class="mtk-twitter__tweet-handle">@${user.handle || user.username || ''}</span>
          ${lang ? `
            <span class="mtk-twitter__tweet-lang-badge" title="Original: ${lang.label}">
              <span class="material-icons-round" aria-hidden="true">T</span>
              ${lang.flag} ${lang.label}
            </span>` : ''}
          <span class="mtk-twitter__tweet-time${this._isFresh(t.created_at) && !t.timestamp ? ' mtk-twitter__tweet-time--fresh' : ''}"
                ${this._isFresh(t.created_at) && !t.timestamp ? 'style="color:var(--primary);font-weight:600"' : ''}
          >${t.timestamp || this._relTime(t.created_at)}</span>
        </div>

        <!-- Tweet text — shows translation if cached, original otherwise -->
        <p class="mtk-twitter__tweet-text${lang?.rtl ? ' mtk-twitter__tweet-text--rtl' : ''}" id="mtk-txt-${id}"
           lang="${displayLang}"
           dir="${lang?.rtl ? 'rtl' : 'ltr'}"
           data-original="${this._esc(text)}"
           data-original-lang="${origLang}"
           data-showing="${showingTrans ? 'translated' : 'original'}">${this._esc(displayText)}</p>

        <!-- Translation row — shown for ALL tweets when target lang differs from original -->
        <div class="mtk-twitter__tweet-orig-row" id="mtk-orig-row-${id}">
          ${showingTrans
            ? `<button class="mtk-twitter__tweet-orig-btn" data-id="${id}" data-action="show-original"
                       aria-label="Show original ${lang ? lang.label : ''} text">
                 <span class="material-icons-round" aria-hidden="true">T</span>
                 Show original
               </button>`
            : needsTrans
              ? `<span class="mtk-twitter__tweet-translating" id="mtk-translating-${id}">
                   <span class="spin-inline" aria-hidden="true"></span> Translating…
                 </span>`
              : ''
          }
        </div>

        <div class="mtk-twitter__tweet-actions" role="group" aria-label="Post actions">
          <button class="reply-btn" data-id="${id}"
                  aria-label="Reply. ${reps} replies"
                  aria-expanded="false">
            <span class="material-icons-round" aria-hidden="true">chat_bubble_outline</span>
            ${reps}
          </button>
          <button class="rt-btn${t.retweeted ? ' rt-btn--on' : ''}" data-id="${id}"
                  aria-label="${t.retweeted?'Undo repost':'Repost'}. ${rts}"
                  aria-pressed="${!!t.retweeted}">
            <span class="material-icons-round" aria-hidden="true">repeat</span>
            ${rts}
          </button>
          <button class="like-btn${t.liked ? ' like-btn--on' : ''}" data-id="${id}"
                  aria-label="${t.liked?'Unlike':'Like'}. ${likes}"
                  aria-pressed="${!!t.liked}">
            <span class="material-icons-round" aria-hidden="true">${t.liked ? 'favorite' : 'favorite_border'}</span>
            ${likes}
          </button>
          <button class="bk-btn${t.bookmarked ? ' bk-btn--on' : ''}" data-id="${id}"
                  aria-label="${t.bookmarked?'Remove bookmark':'Bookmark'}"
                  aria-pressed="${!!t.bookmarked}">
            <span class="material-icons-round" aria-hidden="true">${t.bookmarked ? 'bookmark' : 'bookmark_border'}</span>
          </button>
          ${(t.user?.handle || t.user?.username) === this._state.user?.username ? `
          <button class="del-btn" data-id="${id}"
                  aria-label="Delete this post"
                  title="Delete post">
            <span class="material-icons-round" aria-hidden="true">delete_outline</span>
          </button>` : ''}
          ${t._hiddenCount > 0 ? `
          <button class="mtk-twitter__tweet-expand-btn" data-group="${t.user?.handle || t.user?.username}"
                  aria-label="Show ${t._hiddenCount} more post${t._hiddenCount > 1 ? 's' : ''} from ${t.user?.name || t.user?.handle}"
                  title="Show more from this user">
            <span class="material-icons-round" aria-hidden="true">expand_more</span>
            ${t._hiddenCount} more
          </button>` : ''}
        </div>

        <div class="mtk-twitter__tweet-reply" id="mtk-reply-${id}" aria-label="Reply to post">
          <div class="reply-lang-note">
            <span class="material-icons-round" aria-hidden="true">language</span>
            Your reply will be shown in ${lang ? lang.label : 'original'} to the author
          </div>
          <textarea placeholder="Write your reply…" data-for="${id}"
                    maxlength="280" aria-label="Write reply" rows="2"></textarea>
          <div class="reply-submit-row">
            <button data-reply-post="${id}" disabled aria-label="Post reply">Reply</button>
          </div>
        </div>
      </div>
    </li>`;
  }

  // ════════════════════════════════════════════════════════════
  // EVENT BINDING
  // ════════════════════════════════════════════════════════════

  _bindSplash() {
    this._on('#mtk-splash-register', 'click', () => this._showScreen('register'));
    this._on('#mtk-splash-login',    'click', () => this._showScreen('login'));
    this._on('#mtk-splash-theme',    'click', () => this._toggleTheme());
  }

  _bindRegister() {
    this._on('#mtk-reg-back',        'click', () => this._showScreen('splash'));
    this._on('#mtk-reg-to-login',    'click', () => this._showScreen('login'));
    this._on('#mtk-reg-pw-toggle',   'click', () => this._togglePw('mtk-reg-password', 'mtk-reg-pw-toggle'));
    this._on('#mtk-reg-submit',      'click', () => this._handleRegister());
    this._on('#mtk-reg-password',    'input', e  => this._updatePwStrength(e.target.value));

    // Enter key submit
    ['mtk-reg-name','mtk-reg-username','mtk-reg-email','mtk-reg-password'].forEach(id => {
      this._on(`#${id}`, 'keydown', e => { if (e.key === 'Enter') this._handleRegister(); });
    });
  }

  _bindLogin() {
    this._on('#mtk-login-back',       'click', () => this._showScreen('splash'));
    this._on('#mtk-login-to-register','click', () => this._showScreen('register'));
    this._on('#mtk-login-pw-toggle',  'click', () => this._togglePw('mtk-login-password', 'mtk-login-pw-toggle'));
    this._on('#mtk-login-submit',     'click', () => this._handleLogin());

    ['mtk-login-identifier','mtk-login-password'].forEach(id => {
      this._on(`#${id}`, 'keydown', e => { if (e.key === 'Enter') this._handleLogin(); });
    });
  }

  _bindApp() {
    // Compose
    this._on('#mtk-compose-ta', 'input', e => this._onComposeInput(e));
    this._on('#mtk-post-btn',   'click', () => this._handlePost());
    this._on('#mtk-fab',        'click', () => {
      this._root.querySelector('#mtk-compose-ta')?.focus();
      this._root.querySelector('.mtk-twitter__compose')?.scrollIntoView({behavior:'smooth'});
    });
    this._on('#mtk-sidebar-post-btn', 'click', () => {
      this._root.querySelector('#mtk-compose-ta')?.focus();
    });

    // Tweet list (delegation)
    const list = this._root.querySelector('#mtk-tweet-list');
    if (list) {
      list.addEventListener('click',   e => this._delegateTweetClick(e));
      list.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' ') this._delegateTweetClick(e); });
    }

    // Theme toggles
    this._on('#mtk-theme-toggle',  'click', () => this._toggleTheme());
    this._on('#mtk-sidebar-theme', 'click', () => this._toggleTheme());
    this._on('#mtk-menu-theme',    'click', () => { this._closeProfileMenu(); this._toggleTheme(); });

    // Language picker
    this._on('#mtk-lang-btn',   'click', () => this._openLangModal());
    this._on('#mtk-lang-close', 'click', () => this._closeLangModal());
    this._on('#mtk-lang-overlay','click', e => {
      if (e.target.id === 'mtk-lang-overlay') this._closeLangModal();
    });
    this._root.querySelectorAll('.mtk-twitter__lang-option').forEach(el => {
      el.addEventListener('click',   () => this._setLanguage(el.dataset.lang));
      el.addEventListener('keydown', e => { if(e.key==='Enter') this._setLanguage(el.dataset.lang); });
    });

    // Profile menu
    this._on('#mtk-avatar-btn', 'click',   () => this._toggleProfileMenu());
    this._on('#mtk-avatar-btn', 'keydown', e => { if(e.key==='Enter') this._toggleProfileMenu(); });
    this._on('#mtk-sidebar-user','click',  () => this._toggleProfileMenu());
    this._on('#mtk-menu-lang',  'click',   () => { this._closeProfileMenu(); this._openLangModal(); });
    this._on('#mtk-menu-logout','click',   () => this._handleLogout());

    // Nav
    this._root.querySelectorAll('[data-nav]').forEach(btn => {
      btn.addEventListener('click', () => this._setActiveNav(btn.dataset.nav));
    });

    // Escape closes menus/modals
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { this._closeLangModal(); this._closeProfileMenu(); }
    });
    document.addEventListener('click', e => {
      if (!e.target.closest('#mtk-profile-menu') &&
          !e.target.closest('#mtk-avatar-btn') &&
          !e.target.closest('#mtk-sidebar-user')) {
        this._closeProfileMenu();
      }
    });
  }

  // ── Delegation ──────────────────────────────────────────────
  _delegateTweetClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.classList.contains('like-btn'))         return this._handleLike(btn, id);
    if (btn.classList.contains('rt-btn'))           return this._handleRetweet(btn, id);
    if (btn.classList.contains('reply-btn'))        return this._handleReplyToggle(btn, id);
    if (btn.classList.contains('bk-btn'))           return this._handleBookmark(btn, id);
    if (btn.classList.contains('del-btn'))          return this._handleDelete(btn, id);
    if (btn.classList.contains('mtk-twitter__tweet-orig-btn')) return this._handleOrigToggle(btn, btn.dataset.id);
    const rp = btn.dataset.replyPost;
    if (rp) return this._handleReplySubmit(rp);
  }

  // ════════════════════════════════════════════════════════════
  // AUTH
  // ════════════════════════════════════════════════════════════

  async _handleRegister() {
    const name     = this._val('#mtk-reg-name');
    const username = this._val('#mtk-reg-username');
    const email    = this._val('#mtk-reg-email');
    const password = this._val('#mtk-reg-password');
    const lang     = this._val('#mtk-reg-lang');

    this._clearFormErrors('reg');
    let valid = true;

    if (!name || name.length < 2)    { this._fieldErr('mtk-reg-name-err', 'Name must be at least 2 characters'); valid=false; }
    if (!username || username.length < 3 || !/^[a-zA-Z0-9_]+$/.test(username)) {
      this._fieldErr('mtk-reg-username-err', 'Username: 3+ chars, letters/numbers/_ only'); valid=false;
    }
    if (!email || !email.includes('@')) { this._fieldErr('mtk-reg-email-err', 'Enter a valid email'); valid=false; }
    if (!password || password.length < 8) { this._fieldErr('mtk-reg-pw-err', 'Password must be at least 8 characters'); valid=false; }

    if (!valid) return;

    this._setLoading('mtk-reg-submit', 'mtk-reg-spinner', 'mtk-reg-btn-label', true);

    try {
      const res = await this._api('POST', '/auth/register', { display_name: name, username, email, password, lang });
      this._saveSession(res.user, res.token);
      this._state.user     = { ...res.user, token: res.token };
      const savedDL = (() => { try { return localStorage.getItem('mtk_display_lang'); } catch(_){return null;} })();
      this._state.userLang = savedDL || res.user.lang || 'en';

      const payload = { type: this._cfg.events.USER_REGISTERED, data: { user: res.user } };
      wc.publish(this._cfg.events.USER_REGISTERED, payload);

      this._toast('Welcome to Melify! 🌍', 'check_circle', 'success');
      this._renderApp();
      this._showScreen('app');
      this._loadFeed();
      this._startPolling();

    } catch (err) {
      this._showFormError('mtk-reg-error', 'mtk-reg-error-msg', err.message || 'Registration failed. Please try again.');

      const errPayload = { type: this._cfg.events.AUTH_ERROR, data: { action: 'register', error: err.message } };
      wc.publish(this._cfg.events.AUTH_ERROR, errPayload);
    } finally {
      this._setLoading('mtk-reg-submit', 'mtk-reg-spinner', 'mtk-reg-btn-label', false);
    }
  }

  async _handleLogin() {
    const identifier = this._val('#mtk-login-identifier');
    const password   = this._val('#mtk-login-password');

    this._clearFormErrors('login');
    let valid = true;

    if (!identifier) { this._fieldErr('mtk-login-id-err', 'Enter your username or email'); valid=false; }
    if (!password)   { this._fieldErr('mtk-login-pw-err', 'Enter your password'); valid=false; }
    if (!valid) return;

    this._setLoading('mtk-login-submit', 'mtk-login-spinner', 'mtk-login-btn-label', true);

    try {
      const res = await this._api('POST', '/auth/login', { identifier, password });
      this._saveSession(res.user, res.token);
      this._state.user     = { ...res.user, token: res.token };
      const savedDL = (() => { try { return localStorage.getItem('mtk_display_lang'); } catch(_){return null;} })();
      this._state.userLang = savedDL || res.user.lang || 'en';

      const payload = { type: this._cfg.events.USER_LOGGED_IN, data: { user: res.user } };
      wc.publish(this._cfg.events.USER_LOGGED_IN, payload);

      this._toast(`Welcome back, ${res.user.display_name}!`, 'waving_hand', 'success');
      this._renderApp();
      this._showScreen('app');
      this._loadFeed();
      this._startPolling();

    } catch (err) {
      this._showFormError('mtk-login-error', 'mtk-login-error-msg', err.message || 'Invalid credentials. Please try again.');

      const errPayload = { type: this._cfg.events.AUTH_ERROR, data: { action: 'login', error: err.message } };
      wc.publish(this._cfg.events.AUTH_ERROR, errPayload);
    } finally {
      this._setLoading('mtk-login-submit', 'mtk-login-spinner', 'mtk-login-btn-label', false);
    }
  }

  _handleLogout() {
    this._clearSession();
    this._state.user   = null;
    this._state.tweets = [];
    if (this._state.pollTimer) clearInterval(this._state.pollTimer);
    if (this._state.ws)        this._state.ws.close();

    const payload = { type: this._cfg.events.USER_LOGGED_OUT, data: {} };
    wc.publish(this._cfg.events.USER_LOGGED_OUT, payload);

    this._closeProfileMenu();
    this._renderAll();
    this._showScreen('splash');
    this._toast('You\'ve been signed out.', 'logout');
  }

  // ════════════════════════════════════════════════════════════
  // FEED
  // ════════════════════════════════════════════════════════════

  async _loadFeed() {
    try {
      const tweets = await this._api('GET', `/tweets?lang=${this._state.userLang}`);
      this._state.tweets = tweets;
      this._renderTweetList();

      const payload = { type: this._cfg.events.FEED_REFRESHED, data: { count: tweets.length, lang: this._state.userLang } };
      wc.publish(this._cfg.events.FEED_REFRESHED, payload);

      // Auto-translate all foreign tweets immediately
      this._autoTranslateFeed();

    } catch (err) {
      // Fallback to seed tweets if backend unavailable
      this._state.tweets = this._cfg.seedTweets.map(t => ({
        ...t, user: t.user, original_lang: t.originalLang,
      }));
      this._renderTweetList();
      this._autoTranslateFeed();
      console.warn('[MTKTwitter] Backend unavailable, showing seed data:', err.message);
    }
  }

  _renderTweetList() {
    const list = this._root.querySelector('#mtk-tweet-list');
    if (!list) return;

    if (!this._state.tweets.length) {
      list.innerHTML = `<li><div class="mtk-twitter__empty">
        <span class="material-icons-round">chat_bubble_outline</span>
        <p>No posts yet. Be the first!</p>
      </div></li>`;
      return;
    }

    // Group by user handle — keep insertion order (latest first), collect hidden ones
    const groups   = new Map();   // handle → { latest, hidden[] }
    const ordered  = [];          // handles in order of first appearance

    this._state.tweets.forEach(t => {
      const handle = t.user?.handle || t.user?.username || String(t.id);
      if (!groups.has(handle)) {
        groups.set(handle, { latest: t, hidden: [] });
        ordered.push(handle);
      } else {
        // tweets are newest-first, so subsequent ones are older → hidden
        groups.get(handle).hidden.push(t);
      }
    });

    // Build HTML — one visible tweet per user, hidden tweets stored in data attr
    let html = '';
    for (const handle of ordered) {
      const { latest, hidden } = groups.get(handle);
      const hiddenCount = hidden.length;

      // Render the visible tweet with _hiddenCount injected
      html += this._tplTweet({ ...latest, _hiddenCount: hiddenCount });

      // Render hidden tweets in a div wrapper (not li — avoids invalid nesting)
      if (hiddenCount > 0) {
        html += `<li class="mtk-twitter__tweet-group-hidden" data-group="${handle}" style="display:none">
          <ul class="mtk-twitter__tweet-group-inner">
            ${hidden.map(t => this._tplTweet(t)).join('')}
          </ul>
        </li>`;
      }
    }

    list.innerHTML = html;

    // Bind reply textareas
    list.querySelectorAll('[data-reply-post]').forEach(btn => {
      const id = btn.dataset.replyPost;
      const ta = list.querySelector(`[data-for="${id}"]`);
      if (ta) ta.addEventListener('input', () => { btn.disabled = !ta.value.trim(); });
    });

    // Bind expand buttons
    list.querySelectorAll('.mtk-twitter__tweet-expand-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        this._expandUserTweets(btn.dataset.group, btn);
      });
    });
  }

  _startPolling() {
    if (this._state.pollTimer) clearInterval(this._state.pollTimer);
    this._state.pollTimer = setInterval(() => {
      if (this._state.user) this._pollNewTweets();
    }, this._cfg.app.pollInterval);
  }

  async _pollNewTweets() {
    // Only poll if we have tweets with real numeric IDs
    const newest = this._state.tweets[0];
    if (!newest || !newest.id || typeof newest.id !== 'number') return;

    try {
      const tweets = await this._api('GET', `/tweets?since=${newest.id}`);
      if (!tweets || !tweets.length) return;

      // Only add tweets we don't already have
      const existingIds = new Set(this._state.tweets.map(t => String(t.id)));
      const newTweets   = tweets.filter(t => !existingIds.has(String(t.id)));
      if (!newTweets.length) return;

      newTweets.forEach(t => {
        t._new = true;
        this._state.tweets.unshift(t);
        this._prependTweet(t);
      });

      // Translate all new tweets AFTER they are all in the DOM
      // Use a small delay to ensure DOM is fully updated
      setTimeout(() => {
        newTweets.forEach(t => {
          this._autoTranslateTweet(String(t.id));
        });
      }, 100);
    } catch (_) { /* silent */ }
  }

  _prependTweet(tweet) {
    const list = this._root.querySelector('#mtk-tweet-list');
    if (!list) return;

    const empty = list.querySelector('.mtk-twitter__empty');
    if (empty) empty.closest('li').remove();

    const tmp = document.createElement('ul');
    tmp.innerHTML = this._tplTweet({ ...tweet, _new: true });
    const li = tmp.firstElementChild;
    list.prepend(li);

    // Bind reply textarea for new tweet
    const btn = li.querySelector('[data-reply-post]');
    const ta  = li.querySelector('textarea[data-for]');
    if (btn && ta) ta.addEventListener('input', () => { btn.disabled = !ta.value.trim(); });
  }

  _expandUserTweets(handle, btn) {
    const list  = this._root.querySelector('#mtk-tweet-list');
    const group = list?.querySelector(`.mtk-twitter__tweet-group-hidden[data-group="${handle}"]`);
    if (!group) return;

    // Reveal the hidden tweets
    group.style.display = '';
    group.querySelectorAll('.mtk-twitter__tweet').forEach((li, i) => {
      li.style.animationDelay = (i * 60) + 'ms';
      li.classList.add('mtk-twitter__tweet--new');
    });

    // Bind reply textareas inside the now-visible group
    group.querySelectorAll('[data-reply-post]').forEach(b => {
      const id = b.dataset.replyPost;
      const ta = group.querySelector(`[data-for="${id}"]`);
      if (ta) ta.addEventListener('input', () => { b.disabled = !ta.value.trim(); });
    });

    // Auto-translate newly visible tweets
    const ids = [...group.querySelectorAll('[data-id]')]
      .map(el => el.dataset.id)
      .filter(Boolean);
    setTimeout(() => ids.forEach(id => this._autoTranslateTweet(id)), 100);

    // Flip to collapse button
    const count = ids.length;
    btn.innerHTML = `<span class="material-icons-round" aria-hidden="true">expand_less</span> Hide`;
    btn.setAttribute('aria-label', 'Hide older posts from this user');
    btn.onclick = e => {
      e.stopPropagation();
      group.style.display = 'none';
      btn.innerHTML = `<span class="material-icons-round" aria-hidden="true">expand_more</span> ${count} more`;
      btn.setAttribute('aria-label', `Show ${count} more posts from this user`);
      btn.onclick = null;
      btn.addEventListener('click', ev => {
        ev.stopPropagation();
        this._expandUserTweets(handle, btn);
      });
    };
  }

  _onComposeInput(e) {
    const v   = e.target.value;
    const rem = 280 - v.length;
    const cc  = this._root.querySelector('#mtk-char-count');
    const btn = this._root.querySelector('#mtk-post-btn');
    if (cc) {
      cc.textContent = rem;
      cc.className = 'char-count' + (rem < 20 ? ' char-count--danger' : rem < 60 ? ' char-count--warn' : '');
    }
    if (btn) btn.disabled = !v.trim();
  }

  async _handlePost() {
    const ta   = this._root.querySelector('#mtk-compose-ta');
    const text = ta?.value.trim();
    if (!text || !this._state.user) return;

    const btn = this._root.querySelector('#mtk-post-btn');
    if (btn) btn.disabled = true;

    // Always post in the user's PROFILE language, not the display language
    const lang = this._state.user.lang || 'en';

    try {
      const tweet = await this._api('POST', '/tweets', { text, lang });
      tweet._new  = true;
      this._state.tweets.unshift(tweet);
      this._prependTweet(tweet);

      // Translate if display language differs from post language
      setTimeout(() => this._autoTranslateTweet(String(tweet.id)), 100);

      ta.value = '';
      if (this._root.querySelector('#mtk-char-count')) {
        this._root.querySelector('#mtk-char-count').textContent = '280';
        this._root.querySelector('#mtk-char-count').className = 'char-count';
      }

      const payload = { type: this._cfg.events.TWEET_POSTED, data: { tweet } };
      wc.publish(this._cfg.events.TWEET_POSTED, payload);
      this._toast('Posted! 🌍', 'check_circle', 'success');

    } catch (err) {
      // Offline fallback
      const fakeTweet = {
        id: `local_${Date.now()}`,
        user: {
          name: this._state.user.display_name, handle: this._state.user.username,
          avatar: this._state.user.avatar_url, verified: false,
        },
        text, original_lang: lang, timestamp: 'just now',
        likes: 0, retweets: 0, replies: 0, liked: false, retweeted: false, bookmarked: false,
        _new: true,
      };
      this._state.tweets.unshift(fakeTweet);
      this._prependTweet(fakeTweet);
      ta.value = '';

      const payload = { type: this._cfg.events.TWEET_POSTED, data: { tweet: fakeTweet } };
      wc.publish(this._cfg.events.TWEET_POSTED, payload);
      this._toast('Posted locally (offline mode)', 'wifi_off');
    }
  }

  async _handleLike(btn, id) {
    const tweet = this._state.tweets.find(t => String(t.id) === String(id));
    if (!tweet) return;

    tweet.liked = !tweet.liked;
    tweet.likes_count = (tweet.likes_count ?? tweet.likes ?? 0) + (tweet.liked ? 1 : -1);
    tweet.likes = tweet.likes_count;

    const icon = btn.querySelector('.material-icons-round');
    icon.textContent = tweet.liked ? 'favorite' : 'favorite_border';
    btn.classList.toggle('like-btn--on', tweet.liked);
    btn.setAttribute('aria-pressed', tweet.liked);
    btn.lastChild.textContent = ` ${tweet.likes}`;

    const payload = { type: this._cfg.events.TWEET_LIKED, data: { tweetId: id, liked: tweet.liked, likes: tweet.likes } };
    wc.publish(this._cfg.events.TWEET_LIKED, payload);

    try { await this._api(tweet.liked ? 'POST' : 'DELETE', `/tweets/${id}/like`); } catch (_) {}
  }

  async _handleRetweet(btn, id) {
    const tweet = this._state.tweets.find(t => String(t.id) === String(id));
    if (!tweet) return;

    tweet.retweeted = !tweet.retweeted;
    tweet.retweets_count = (tweet.retweets_count ?? tweet.retweets ?? 0) + (tweet.retweeted ? 1 : -1);
    tweet.retweets = tweet.retweets_count;

    btn.classList.toggle('rt-btn--on', tweet.retweeted);
    btn.setAttribute('aria-pressed', tweet.retweeted);
    btn.lastChild.textContent = ` ${tweet.retweets}`;

    const payload = { type: this._cfg.events.TWEET_RETWEETED, data: { tweetId: id, retweeted: tweet.retweeted } };
    wc.publish(this._cfg.events.TWEET_RETWEETED, payload);

    if (tweet.retweeted) this._toast('Reposted!', 'repeat');
    try { await this._api(tweet.retweeted ? 'POST' : 'DELETE', `/tweets/${id}/retweet`); } catch (_) {}
  }

  _handleReplyToggle(btn, id) {
    const box = this._root.querySelector(`#mtk-reply-${id}`);
    if (!box) return;
    const open = box.classList.toggle('mtk-twitter__tweet-reply--open');
    btn.setAttribute('aria-expanded', open);
    if (open) box.querySelector('textarea')?.focus();
  }

  async _handleReplySubmit(id) {
    const box  = this._root.querySelector(`#mtk-reply-${id}`);
    const ta   = box?.querySelector(`[data-for="${id}"]`);
    const text = ta?.value.trim();
    if (!text) return;

    const tweet = this._state.tweets.find(t => String(t.id) === String(id));
    const originalLang = tweet?.original_lang || tweet?.originalLang || 'en';
    const lang = this._cfg.languages.find(l => l.code === originalLang);

    try {
      await this._api('POST', `/tweets/${id}/replies`, { text, lang: this._state.userLang });
      if (tweet) {
        tweet.replies_count = (tweet.replies_count ?? tweet.replies ?? 0) + 1;
        tweet.replies = tweet.replies_count;
        const replyBtn = this._root.querySelector(`.reply-btn[data-id="${id}"]`);
        if (replyBtn) replyBtn.lastChild.textContent = ` ${tweet.replies}`;
      }
    } catch (_) {
      if (tweet) {
        tweet.replies = (tweet.replies_count ?? tweet.replies ?? 0) + 1;
        const replyBtn = this._root.querySelector(`.reply-btn[data-id="${id}"]`);
        if (replyBtn) replyBtn.lastChild.textContent = ` ${tweet.replies}`;
      }
    }

    ta.value = '';
    box.querySelector('[data-reply-post]').disabled = true;
    box.classList.remove('mtk-twitter__tweet-reply--open');

    const payload = {
      type: this._cfg.events.TWEET_REPLIED,
      data: { tweetId: id, text, replyLang: this._state.userLang, originalLang, authorLang: lang?.label },
    };
    wc.publish(this._cfg.events.TWEET_REPLIED, payload);
    this._toast('Reply sent!', 'send', 'success');
  }

  _handleBookmark(btn, id) {
    const tweet = this._state.tweets.find(t => String(t.id) === String(id));
    if (!tweet) return;

    tweet.bookmarked = !tweet.bookmarked;
    const icon = btn.querySelector('.material-icons-round');
    icon.textContent = tweet.bookmarked ? 'bookmark' : 'bookmark_border';
    btn.classList.toggle('bk-btn--on', tweet.bookmarked);
    btn.setAttribute('aria-pressed', tweet.bookmarked);

    // Persist to server
    const method = tweet.bookmarked ? 'POST' : 'DELETE';
    this._api(method, `/tweets/${id}/bookmark`).catch(err => {
      // Revert on failure
      tweet.bookmarked = !tweet.bookmarked;
      icon.textContent = tweet.bookmarked ? 'bookmark' : 'bookmark_border';
      btn.classList.toggle('bk-btn--on', tweet.bookmarked);
      this._toast('Could not save bookmark', 'error_outline');
      console.error('[bookmark]', err.message);
    });

    const payload = { type: this._cfg.events.TWEET_BOOKMARKED, data: { tweetId: id, bookmarked: tweet.bookmarked } };
    wc.publish(this._cfg.events.TWEET_BOOKMARKED, payload);

    if (tweet.bookmarked) this._toast('Bookmarked!', 'bookmark');
  }

  async _handleDelete(btn, id) {
    // Confirm before deleting
    if (!confirm('Delete this post?')) return;

    // Remove from DOM immediately (optimistic)
    const li = btn.closest('li');
    if (li) {
      li.style.transition = 'opacity 0.2s, transform 0.2s';
      li.style.opacity    = '0';
      li.style.transform  = 'translateX(40px)';
      setTimeout(() => li.remove(), 200);
    }

    // Remove from state
    this._state.tweets = this._state.tweets.filter(t => String(t.id) !== String(id));

    try {
      await this._api('DELETE', `/tweets/${id}`);
      this._toast('Post deleted', 'delete_outline');
    } catch (err) {
      // Restore on failure
      this._toast('Could not delete: ' + err.message, 'error_outline');
      this._loadFeed();
    }
  }

  // Toggle between showing original and translated text inline
  _handleOrigToggle(btn, id) {
    const tweet    = this._state.tweets.find(t => String(t.id) === String(id));
    const textEl   = this._root.querySelector(`#mtk-txt-${id}`);
    const origRow  = this._root.querySelector(`#mtk-orig-row-${id}`);
    if (!tweet || !textEl || !origRow) return;

    const showing = textEl.dataset.showing;
    const origLang = textEl.dataset.originalLang;
    const origText = textEl.dataset.original;
    const cacheKey = `${id}_${this._state.userLang}`;
    const transText = this._state.transCache[cacheKey];
    const lang = this._cfg.languages.find(l => l.code === origLang);
    const userLangObj = this._cfg.languages.find(l => l.code === this._state.userLang);

    if (showing === 'translated') {
      // Switch to original
      textEl.textContent = origText;
      textEl.lang = origLang;
      textEl.dataset.showing = 'original';
      origRow.innerHTML = `
        <button class="mtk-twitter__tweet-orig-btn" data-id="${id}" data-action="show-translated"
                aria-label="Show translation">
          <span class="material-icons-round" aria-hidden="true">T</span>
          Show in ${userLangObj ? userLangObj.flag + ' ' + userLangObj.label : 'your language'}
        </button>`;
    } else {
      // Switch back to translation
      if (transText) {
        textEl.textContent = transText;
        textEl.lang = this._state.userLang;
        textEl.dataset.showing = 'translated';
        origRow.innerHTML = `
          <button class="mtk-twitter__tweet-orig-btn" data-id="${id}" data-action="show-original"
                  aria-label="Show original ${lang ? lang.label : ''} text">
            <span class="material-icons-round" aria-hidden="true">T</span>
            Show original
          </button>`;
      }
    }
  }

  // Auto-translate a single tweet and update its DOM in place
  async _autoTranslateTweet(id) {
    const tweet    = this._state.tweets.find(t => String(t.id) === String(id));
    const textEl   = this._root.querySelector(`#mtk-txt-${id}`);
    const origRow  = this._root.querySelector(`#mtk-orig-row-${id}`);
    if (!tweet || !textEl || !origRow) return;

    const origLang = textEl.dataset.originalLang;
    if (origLang === this._state.userLang) {
      // Same language — clear any translating spinner and return
      if (origRow) origRow.innerHTML = '';
      return;
    }

    const cacheKey = `${id}_${this._state.userLang}`;
    const lang = this._cfg.languages.find(l => l.code === origLang);
    const userLangObj = this._cfg.languages.find(l => l.code === this._state.userLang);

    let translated = this._state.transCache[cacheKey];

    if (!translated) {
      try {
        const res = await this._api('GET', `/tweets/${id}/translate?target=${this._state.userLang}`);
        translated = res.translated_text;
        this._state.transCache[cacheKey] = translated;

        const payload = {
          type: this._cfg.events.TWEET_TRANSLATED,
          data: { tweetId: id, from: res.source_lang, to: this._state.userLang, text: translated },
        };
        wc.publish(this._cfg.events.TWEET_TRANSLATED, payload);

      } catch (_) {
        // Client-side dict fallback
        translated = this._clientTranslate(tweet.text, origLang, this._state.userLang);
        this._state.transCache[cacheKey] = translated;
      }
    }

    // Update DOM — show translated text, add "Show original" link
    // Skip if: no translation, same as original, or clearly not translated (same script)
    const originalText = textEl.dataset.original;
    const noTranslation = !translated
      || translated === tweet.text
      || translated === originalText
      || translated.trim() === originalText?.trim();

    if (noTranslation) {
      textEl.dataset.showing = 'original';
      origRow.innerHTML = '';
      return;
    }

    textEl.textContent = translated;
    textEl.lang = this._state.userLang;
    // Set direction based on TARGET language
    const targetLangObj = this._cfg.languages.find(l => l.code === this._state.userLang);
    textEl.dir = targetLangObj?.rtl ? 'rtl' : 'ltr';
    textEl.classList.toggle('mtk-twitter__tweet-text--rtl', !!targetLangObj?.rtl);
    textEl.dataset.showing = 'translated';

    origRow.innerHTML = `
      <button class="mtk-twitter__tweet-orig-btn" data-id="${id}" data-action="show-original"
              aria-label="Show original ${lang ? lang.label : ''} text">
        <span class="material-icons-round" aria-hidden="true">T</span>
        Show original
      </button>`;
  }

  // Auto-translate all visible foreign tweets in the feed
  _autoTranslateFeed() {
    const userLang = this._state.userLang;
    this._state.tweets.forEach(t => {
      const origLang = t.original_lang || t.originalLang;
      if (origLang && origLang !== userLang) {
        // Stagger requests slightly to avoid hammering the server
        setTimeout(() => this._autoTranslateTweet(String(t.id)), 0);
      }
    });
  }

  _showTransBox() {}  // kept for compatibility — no longer used directly

  _clientTranslate(text, from, to) {
    const dict = this._cfg.translations;

    // 1. Exact match first
    if (dict[text] && dict[text][to]) return dict[text][to];

    // 2. Normalised match — strip extra whitespace, trim
    const norm = s => s.trim().replace(/\s+/g, ' ');
    const normText = norm(text);
    for (const key of Object.keys(dict)) {
      if (norm(key) === normText && dict[key][to]) return dict[key][to];
    }

    // 3. Nothing found — return original text unchanged (no ugly bracket prefix)
    return text;
  }

  // ════════════════════════════════════════════════════════════
  // LANGUAGE
  // ════════════════════════════════════════════════════════════

  _setLanguage(code) {
    this._state.userLang = code;
    // Clear translation cache so everything re-translates in new language
    this._state.transCache = {};
    const lang = this._cfg.languages.find(l => l.code === code);

    // Update UI atoms — feed header lang indicator only
    const flagEl = this._root.querySelector('#mtk-lang-flag');
    if (flagEl && lang) flagEl.textContent = lang.flag;

    const pillText = this._root.querySelector('#mtk-feed-lang-text');
    if (pillText && lang) pillText.textContent = lang.label;

    // Compose pill always shows PROFILE language, not display language
    // (don't update it here)

    // Mark selected in modal
    this._root.querySelectorAll('.mtk-twitter__lang-option').forEach(el => {
      const sel = el.dataset.lang === code;
      el.classList.toggle('mtk-twitter__lang-option--selected', sel);
      el.setAttribute('aria-selected', sel);
    });

    this._closeLangModal();

    // Persist display language preference (separate from profile/writing language)
    // We store displayLang in localStorage but do NOT update the user's profile lang
    try { localStorage.setItem('mtk_display_lang', code); } catch (_) {}

    // Do NOT call PATCH /users/me here — that would change the posting language

    const payload = { type: this._cfg.events.LANGUAGE_CHANGED, data: { lang: code, label: lang?.label } };
    wc.publish(this._cfg.events.LANGUAGE_CHANGED, payload);

    this._toast(`Language: ${lang ? lang.flag + ' ' + lang.label : code}`, 'language');

    // Re-translate all visible tweets in-place (don't re-render the whole list)
    this._autoTranslateFeed();
  }

  _openLangModal() {
    const overlay = this._root.querySelector('#mtk-lang-overlay');
    if (overlay) {
      overlay.classList.add('mtk-twitter__modal-overlay--open');
      overlay.querySelector('.mtk-twitter__lang-option--selected')?.focus();
    }
  }

  _closeLangModal() {
    this._root.querySelector('#mtk-lang-overlay')?.classList.remove('mtk-twitter__modal-overlay--open');
  }

  // ════════════════════════════════════════════════════════════
  // wc SUBSCRIPTIONS
  // ════════════════════════════════════════════════════════════

  _subscribeAll() {
    const { events } = this._cfg;

    // 1. Tweet posted (from external source)
    wc.subscribe(events.TWEET_POSTED, this.onMessage.bind(this));
    // 2. Tweet liked
    wc.subscribe(events.TWEET_LIKED, this.onMessage.bind(this));
    // 3. Tweet retweeted
    wc.subscribe(events.TWEET_RETWEETED, this.onMessage.bind(this));
    // 4. Language changed
    wc.subscribe(events.LANGUAGE_CHANGED, this.onMessage.bind(this));
  }

  /**
   * Universal message handler for all wc.subscribe callbacks
   * @param {Object} payload — { type, data }
   */
  onMessage(payload) {
    const { events } = this._cfg;
    switch (payload.type) {
      case events.TWEET_POSTED:
        if (payload.data?.tweet && payload._external) this._prependTweet(payload.data.tweet);
        break;
      case events.TWEET_LIKED:
        if (payload._external) this._syncLike(payload.data.tweetId, payload.data.liked, payload.data.likes);
        break;
      case events.TWEET_RETWEETED:
        if (payload._external) this._syncRetweet(payload.data.tweetId, payload.data.retweeted);
        break;
      case events.LANGUAGE_CHANGED:
        if (payload._external && payload.data?.lang) this._setLanguage(payload.data.lang);
        break;
    }
  }

  _syncLike(id, liked, likes) {
    const tweet = this._state.tweets.find(t => String(t.id) === String(id));
    if (!tweet) return;
    tweet.liked = liked;
    tweet.likes = likes;
    const btn = this._root.querySelector(`.like-btn[data-id="${id}"]`);
    if (btn) {
      btn.classList.toggle('like-btn--on', liked);
      btn.querySelector('.material-icons-round').textContent = liked ? 'favorite' : 'favorite_border';
      btn.lastChild.textContent = ` ${likes}`;
    }
  }

  _syncRetweet(id, retweeted) {
    const tweet = this._state.tweets.find(t => String(t.id) === String(id));
    if (!tweet) return;
    tweet.retweeted = retweeted;
    const btn = this._root.querySelector(`.rt-btn[data-id="${id}"]`);
    if (btn) btn.classList.toggle('rt-btn--on', retweeted);
  }

  // ════════════════════════════════════════════════════════════
  // UI HELPERS
  // ════════════════════════════════════════════════════════════

  // ════════════════════════════════════════════════════════════
  // THEME
  // ════════════════════════════════════════════════════════════

  _initTheme() {
    // Load persisted theme, fallback to system preference
    const saved = localStorage.getItem('mtk-theme');
    if (saved === 'light' || saved === 'dark') {
      this._state.theme = saved;
    } else {
      // Read system preference
      this._state.theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    this._applyTheme();
  }

  _toggleTheme() {
    this._state.theme = this._state.theme === 'dark' ? 'light' : 'dark';
    this._applyTheme();
    try { localStorage.setItem('mtk-theme', this._state.theme); } catch (_) {}
    this._toast(
      this._state.theme === 'light' ? 'Light mode on' : 'Dark mode on',
      this._state.theme === 'light' ? 'light_mode' : 'dark_mode'
    );
  }

  _applyTheme() {
    const isDark = this._state.theme === 'dark';
    this._root.classList.toggle('mtk-twitter--dark',  isDark);
    this._root.classList.toggle('mtk-twitter--light', !isDark);
    this._updateThemeUI();
  }

  _updateThemeUI() {
    const isDark = this._state.theme === 'dark';
    const icon   = isDark ? 'light_mode' : 'dark_mode';
    const label  = isDark ? 'Light mode' : 'Dark mode';

    // All theme icon/label elements
    [
      ['#mtk-theme-icon',          null],
      ['#mtk-sidebar-theme-icon',  null],
      ['#mtk-splash-theme-icon',   null],
      ['#mtk-menu-theme-icon',     null],
    ].forEach(([sel]) => {
      const el = this._root.querySelector(sel);
      if (el) el.textContent = icon;
    });

    [
      ['#mtk-sidebar-theme-label', label],
      ['#mtk-splash-theme-label',  label],
      ['#mtk-menu-theme-label',    label],
    ].forEach(([sel, text]) => {
      const el = this._root.querySelector(sel);
      if (el) el.textContent = text;
    });

    // Update aria-labels
    ['#mtk-theme-toggle','#mtk-sidebar-theme','#mtk-splash-theme','#mtk-menu-theme'].forEach(sel => {
      const el = this._root.querySelector(sel);
      if (el) el.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    });
  }

  _updateAppUser() {
    const u = this._state.user;
    if (!u) return;
    const lang = this._cfg.languages.find(l => l.code === this._state.userLang);

    ['#mtk-avatar-btn','#mtk-compose-avatar','#mtk-sidebar-avatar'].forEach(sel => {
      const el = this._root.querySelector(sel);
      if (el) el.src = u.avatar_url || this._cfg.app.avatarBaseUrl + '?img=11';
    });
    const nameEl = this._root.querySelector('#mtk-sidebar-name');
    if (nameEl) nameEl.textContent = u.display_name || u.username;
    const handleEl = this._root.querySelector('#mtk-sidebar-handle');
    if (handleEl) handleEl.textContent = '@' + (u.username || '');
    const flagEl = this._root.querySelector('#mtk-lang-flag');
    if (flagEl && lang) flagEl.textContent = lang.flag;
    const feedText = this._root.querySelector('#mtk-feed-lang-text');
    if (feedText && lang) feedText.textContent = lang.label;

    // Compose pill shows PROFILE language (the language you write in)
    const profileLang = this._cfg.languages.find(l => l.code === (u.lang || 'en'));
    const compLabel   = this._root.querySelector('#mtk-compose-lang-label');
    if (compLabel && profileLang) compLabel.textContent = `${profileLang.flag} ${profileLang.label}`;

    // Mark selected language
    this._root.querySelectorAll('.mtk-twitter__lang-option').forEach(el => {
      const sel = el.dataset.lang === this._state.userLang;
      el.classList.toggle('mtk-twitter__lang-option--selected', sel);
      el.setAttribute('aria-selected', sel);
    });
  }

  _setActiveNav(id) {
    this._state.activeNav = id;
    this._root.querySelectorAll('[data-nav]').forEach(btn => {
      const active = btn.dataset.nav === id;
      btn.classList.toggle('mtk-twitter__nav-item--active', active);
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-current', active ? 'page' : 'false');
    });

    // Update feed header title
    const titleEl = this._root.querySelector('#mtk-topbar-title');
    const feedH2  = this._root.querySelector('.mtk-twitter__feed-header h2');
    const titles  = { home: 'Home', explore: 'Explore', notifications: 'Notifications', messages: 'Messages', bookmarks: 'Bookmarks', profile: 'Profile' };
    const title   = titles[id] || 'Home';
    if (titleEl)  titleEl.textContent = title;
    if (feedH2)   feedH2.textContent  = title;

    // Show/hide compose box — only on Home
    const compose = this._root.querySelector('.mtk-twitter__compose');
    if (compose) compose.style.display = id === 'home' ? '' : 'none';

    // Load appropriate content
    if (id === 'bookmarks') {
      this._loadBookmarks();
    } else if (id === 'home') {
      this._loadFeed();
    }
    // other nav items (explore, notifications, etc.) can be wired up later
  }

  async _loadBookmarks() {
    const list = this._root.querySelector('#mtk-tweet-list');
    if (list) list.innerHTML = this._tplSkeletons(3);

    try {
      const tweets = await this._api('GET', '/bookmarks');
      this._state.tweets = tweets;
      this._renderTweetList();

      if (!tweets.length) {
        if (list) list.innerHTML = `
          <li><div class="mtk-twitter__empty">
            <span class="material-icons-round">bookmark_border</span>
            <p>No bookmarks yet. Tap the bookmark icon on any post.</p>
          </div></li>`;
        return;
      }

      this._autoTranslateFeed();
    } catch (err) {
      if (list) list.innerHTML = `
        <li><div class="mtk-twitter__empty">
          <span class="material-icons-round">error_outline</span>
          <p>Could not load bookmarks: ${err.message}</p>
        </div></li>`;
    }
  }

  _toggleProfileMenu() {
    const menu = this._root.querySelector('#mtk-profile-menu');
    menu?.classList.toggle('mtk-twitter__profile-menu--open');
  }

  _closeProfileMenu() {
    this._root.querySelector('#mtk-profile-menu')?.classList.remove('mtk-twitter__profile-menu--open');
  }

  _togglePw(inputId, btnId) {
    const input = this._root.querySelector(`#${inputId}`);
    const btn   = this._root.querySelector(`#${btnId}`);
    if (!input || !btn) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.querySelector('.material-icons-round').textContent = show ? 'visibility' : 'visibility_off';
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  }

  _updatePwStrength(pw) {
    const bar   = this._root.querySelector('#mtk-pw-bar');
    const label = this._root.querySelector('#mtk-pw-strength-label');
    if (!bar || !label) return;

    let score = 0;
    if (pw.length >= 8)  score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;

    const levels = [
      { cls: '',         text: '' },
      { cls: '--weak',   text: 'Weak' },
      { cls: '--fair',   text: 'Fair' },
      { cls: '--good',   text: 'Good' },
      { cls: '--strong', text: 'Strong' },
    ];
    const lvl = score <= 1 ? 1 : score === 2 ? 2 : score === 3 ? 3 : 4;
    const { cls, text } = levels[pw ? lvl : 0];

    bar.className = `mtk-twitter__pw-strength-bar-fill${cls}`;
    label.className = `mtk-twitter__pw-strength-label${cls}`;
    label.textContent = text;
    label.id = 'mtk-pw-strength-label';
  }

  _fieldErr(id, msg) {
    const el = this._root.querySelector(`#${id}`);
    if (!el) return;
    el.textContent = msg;
    el.classList.add('mtk-twitter__field-error--visible');
    const input = el.previousElementSibling?.querySelector('input');
    if (input) input.dataset.error = 'true';
  }

  _clearFormErrors(prefix) {
    this._root.querySelectorAll(`[id^="mtk-${prefix}-"]`).forEach(el => {
      if (el.classList.contains('mtk-twitter__field-error')) {
        el.textContent = '';
        el.classList.remove('mtk-twitter__field-error--visible');
      }
      if (el.classList.contains('mtk-twitter__form-error')) {
        el.classList.remove('mtk-twitter__form-error--visible');
      }
    });
    this._root.querySelectorAll(`input[data-error]`).forEach(i => delete i.dataset.error);
  }

  _showFormError(elId, msgId, msg) {
    const el  = this._root.querySelector(`#${elId}`);
    const msg_el = this._root.querySelector(`#${msgId}`);
    if (el)     el.classList.add('mtk-twitter__form-error--visible');
    if (msg_el) msg_el.textContent = msg;
  }

  _setLoading(btnId, spinnerId, labelId, loading) {
    const btn     = this._root.querySelector(`#${btnId}`);
    const spinner = this._root.querySelector(`#${spinnerId}`);
    const label   = this._root.querySelector(`#${labelId}`);
    if (btn)     btn.disabled = loading;
    if (spinner) spinner.classList.toggle('mtk-twitter__btn-spinner--visible', loading);
    if (label)   label.style.opacity = loading ? '0' : '1';
  }

  _toast(message, icon = 'info', type = '') {
    const container = this._root.querySelector('#mtk-toasts');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `mtk-twitter__toast${type ? ' mtk-twitter__toast--' + type : ''}`;
    toast.setAttribute('role', 'status');
    toast.innerHTML = `<span class="material-icons-round" aria-hidden="true">${icon}</span>${this._esc(message)}`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('mtk-twitter__toast--exit');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, 2800);
  }

  // ════════════════════════════════════════════════════════════
  // API
  // ════════════════════════════════════════════════════════════

  async _api(method, apiPath, body) {
    const { apiBase } = this._cfg.app;
    const headers     = { 'Content-Type': 'application/json' };
    if (this._state.user?.token) {
      headers['Authorization'] = 'Bearer ' + this._state.user.token;
    }

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    let res;
    try {
      res = await fetch(apiBase + apiPath, opts);
    } catch (networkErr) {
      throw new Error('Cannot reach server — is it running at ' + apiBase + '?');
    }

    let data;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      data = await res.json();
    } else {
      const text = await res.text();
      data = { error: text || ('HTTP ' + res.status) };
    }

    // Auto-logout on 401 — session is stale (DB was reset, token expired, etc.)
    if (res.status === 401) {
      this._clearSession();
      this._state.user = null;
      if (this._state.pollTimer) clearInterval(this._state.pollTimer);
      this._renderAll();
      this._showScreen('login');
      throw new Error(data.error || 'Session expired — please log in again');
    }

    if (!res.ok) {
      throw new Error(data.error || data.message || ('Server error HTTP ' + res.status));
    }
    return data;
  }

  // ════════════════════════════════════════════════════════════
  // SESSION
  // ════════════════════════════════════════════════════════════

  _saveSession(user, token) {
    try { localStorage.setItem('mtk_session', JSON.stringify({ ...user, token })); } catch (_) {}
  }

  _loadSession() {
    try { return JSON.parse(localStorage.getItem('mtk_session')); } catch (_) { return null; }
  }

  _clearSession() {
    try { localStorage.removeItem('mtk_session'); } catch (_) {}
  }

  // ════════════════════════════════════════════════════════════
  // UTILITIES
  // ════════════════════════════════════════════════════════════

  _on(selector, event, handler) {
    const el = this._root.querySelector(selector);
    if (el) el.addEventListener(event, handler);
  }

  _val(selector) {
    return this._root.querySelector(selector)?.value?.trim() || '';
  }

  _esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  _relTime(ts) {
    if (!ts) return 'now';
    // SQLite returns "2026-03-23 18:00:00" without Z — append Z so JS treats it as UTC
    const normalized = String(ts).replace(' ', 'T').replace(/Z?$/, 'Z');
    const diff = Date.now() - new Date(normalized).getTime();
    const s    = Math.floor(diff / 1000);
    if (s < 5)    return 'just now';
    if (s < 60)   return s + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm';
    if (s < 86400)return Math.floor(s / 3600) + 'h';
    return Math.floor(s / 86400) + 'd';
  }

  _isFresh(ts) {
    if (!ts) return false;
    const normalized = String(ts).replace(' ', 'T').replace(/Z?$/, 'Z');
    const s = Math.floor((Date.now() - new Date(normalized).getTime()) / 1000);
    return s < 90; // within 90 seconds = fresh
  }
}


// ── Auto-initialize ───────────────────────────────────────────
window.mtkTwitterInstance = new MTKTwitter('mtk-twitter.mtk-twitter');

// Export for external module use
if (typeof module !== 'undefined' && module.exports) module.exports = MTKTwitter;
