/**
 * mtk-twitter.js
 * Melify — Real-time Multilingual Social Feed
 * Vanilla JS Class — initialized at bottom of file
 * All events published via wc.publish / subscribed via wc.subscribe
 */

// ── Lightweight wc bus (pub/sub + log) ────────────────────
window.wc = window.wc || (() => {
  const _channels = {};

  return {
    /**
     * Subscribe to a named event channel
     * @param {string} event
     * @param {Function} callback
     */
    subscribe(event, callback) {
      if (!_channels[event]) _channels[event] = [];
      _channels[event].push(callback);
    },

    /**
     * Publish a payload on a named event channel
     * @param {string} event
     * @param {*} payload
     */
    publish(event, payload) {
      wc.log(event, payload);
      (_channels[event] || []).forEach(cb => {
        try { cb(payload); } catch (e) { console.error('[wc.publish] handler error:', e); }
      });
    },

    /**
     * Log a message/event to the console in a structured format
     * @param {string} event
     * @param {*} payload
     */
    log(event, payload) {
      console.groupCollapsed(`%c[wc] ${event}`, 'color:#4fc3f7;font-weight:bold;');
      console.log('payload:', payload);
      console.groupEnd();
    }
  };
})();


// ── MTKTwitter Class ──────────────────────────────────────
class MTKTwitter {
  /**
   * @param {string|HTMLElement} selector - CSS selector or DOM element
   */
  constructor(selector = 'mtk-twitter') {
    this._selector = selector;
    this._root     = null;
    this._config   = null;
    this._state    = {
      tweets:    [],
      userLang:  'en',
      currentUser: null,
      translationCache: {}
    };

    this._waitForElement(selector).then(el => {
      this._root = el;
      this._init();
    });
  }

  // ── DOM Ready Wait ──────────────────────────────────────
  _waitForElement(selector) {
    return new Promise(resolve => {
      const tryFind = () => {
        const el = typeof selector === 'string'
          ? document.querySelector(selector)
          : selector;
        if (el) return resolve(el);
        requestAnimationFrame(tryFind);
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryFind);
      } else {
        tryFind();
      }
    });
  }

  // ── Init ────────────────────────────────────────────────
  _init() {
    if (typeof MTK_TWITTER_CONFIG === 'undefined') {
      console.error('[MTKTwitter] MTK_TWITTER_CONFIG not found. Make sure mtk-twitter.config.js is loaded first.');
      return;
    }

    this._config = MTK_TWITTER_CONFIG;
    this._state.tweets       = JSON.parse(JSON.stringify(this._config.tweets));
    this._state.userLang     = this._config.currentUser.language;
    this._state.currentUser  = this._config.currentUser;

    this._render();
    this._bindEvents();
    this._subscribeAll();

    console.log('%c[MTKTwitter] initialized', 'color:#4fc3f7;font-weight:bold;', this._config.app.name);
  }

  // ── Subscribe to all 4 core events ─────────────────────
  _subscribeAll() {
    const { events } = this._config;

    // 1. Tweet Posted
    wc.subscribe(events.TWEET_POSTED, this.onMessage.bind(this));

    // 2. Tweet Liked
    wc.subscribe(events.TWEET_LIKED, this.onMessage.bind(this));

    // 3. Tweet Retweeted
    wc.subscribe(events.TWEET_RETWEETED, this.onMessage.bind(this));

    // 4. Language Changed
    wc.subscribe(events.LANGUAGE_CHANGED, this.onMessage.bind(this));
  }

  /**
   * Universal message handler passed to wc.subscribe
   * @param {Object} payload - { type, data }
   */
  onMessage(payload) {
    const { events } = this._config;

    switch (payload.type) {
      case events.TWEET_POSTED:
        // External tweet posted — add to feed
        if (payload.data && payload.data.tweet) {
          this._prependTweet(payload.data.tweet);
        }
        break;

      case events.TWEET_LIKED:
        // Sync like state from external source
        if (payload.data && payload.data.tweetId !== undefined) {
          this._syncLike(payload.data.tweetId, payload.data.liked);
        }
        break;

      case events.TWEET_RETWEETED:
        if (payload.data && payload.data.tweetId !== undefined) {
          this._syncRetweet(payload.data.tweetId, payload.data.retweeted);
        }
        break;

      case events.LANGUAGE_CHANGED:
        // Externally triggered language switch
        if (payload.data && payload.data.lang) {
          this._setLanguage(payload.data.lang, false);
        }
        break;

      default:
        console.log('[MTKTwitter] onMessage: unhandled type', payload.type);
    }
  }

  // ── Render ──────────────────────────────────────────────
  _render() {
    const { app, navItems, currentUser, languages, trendingTopics, whoToFollow } = this._config;
    const lang   = this._state.userLang;
    const langObj = languages.find(l => l.code === lang) || languages[0];

    this._root.setAttribute('role', 'main');
    this._root.setAttribute('aria-label', `${app.name} — Multilingual Social Feed`);

    this._root.innerHTML = `
      <div class="mtk-twitter__layout">

        <!-- ── Left Sidebar ── -->
        <nav class="mtk-twitter__sidebar-left" aria-label="Primary navigation">
          <div class="mtk-twitter__logo" role="banner">
            <span class="material-icons-round" aria-hidden="true">translate</span>
            <span class="logo-text">${app.name}</span>
          </div>

          <ul class="mtk-twitter__nav" role="list">
            ${navItems.map((item, i) => `
              <li role="listitem">
                <button
                  class="mtk-twitter__nav-item${item.active ? ' mtk-twitter__nav-item--active' : ''}"
                  data-nav="${i}"
                  aria-current="${item.active ? 'page' : 'false'}"
                  aria-label="${item.label}"
                >
                  <span class="material-icons-round" aria-hidden="true">${item.icon}</span>
                  <span class="nav-label">${item.label}</span>
                </button>
              </li>
            `).join('')}
          </ul>

          <!-- Language Selector -->
          <div class="mtk-twitter__lang-selector" role="region" aria-label="Language preference">
            <label for="mtk-lang-select">
              <span class="material-icons-round" aria-hidden="true">language</span>
              View feed in
            </label>
            <select id="mtk-lang-select" aria-label="Select your preferred language">
              ${languages.map(l => `
                <option value="${l.code}" ${l.code === lang ? 'selected' : ''}>
                  ${l.flag} ${l.label} — ${l.nativeName}
                </option>
              `).join('')}
            </select>
          </div>

          <button class="mtk-twitter__tweet-btn" id="mtk-compose-trigger" aria-label="Compose new post">
            <span class="material-icons-round" aria-hidden="true">edit</span>
            <span class="btn-label">Post</span>
          </button>

          <!-- Current User -->
          <div class="mtk-twitter__profile-card" tabindex="0" role="button" aria-label="Your profile">
            <img src="${currentUser.avatar}" alt="${currentUser.name}" loading="lazy" />
            <div class="profile-info">
              <div class="profile-name">${currentUser.name}</div>
              <div class="profile-handle">${currentUser.handle}</div>
            </div>
          </div>
        </nav>

        <!-- ── Main Feed ── -->
        <main class="mtk-twitter__feed" aria-label="Tweet feed">
          <div class="mtk-twitter__feed-header" role="heading" aria-level="1">
            Home
            <span style="font-size:0.72rem;font-weight:500;color:#8892a4;margin-left:8px;">
              Viewing in ${langObj.flag} ${langObj.label}
            </span>
          </div>

          <!-- Compose -->
          <section class="mtk-twitter__compose" aria-label="Compose a new post">
            <img src="${currentUser.avatar}" alt="${currentUser.name}" loading="lazy" />
            <div class="mtk-twitter__compose-inner">
              <span class="mtk-twitter__compose-lang-indicator">
                <span class="material-icons-round" aria-hidden="true">language</span>
                Posting in ${langObj.flag} ${langObj.label}
              </span>
              <textarea
                id="mtk-compose-textarea"
                placeholder="What's happening worldwide?"
                maxlength="280"
                aria-label="Compose new post"
                rows="3"
              ></textarea>
              <div class="mtk-twitter__compose-actions">
                <div class="mtk-twitter__compose-tools" role="group" aria-label="Post tools">
                  <button aria-label="Add image" title="Add image">
                    <span class="material-icons-round" aria-hidden="true">image</span>
                  </button>
                  <button aria-label="Add emoji" title="Add emoji">
                    <span class="material-icons-round" aria-hidden="true">emoji_emotions</span>
                  </button>
                  <button aria-label="Add location" title="Add location">
                    <span class="material-icons-round" aria-hidden="true">location_on</span>
                  </button>
                </div>
                <div class="mtk-twitter__compose-submit">
                  <span class="char-count" id="mtk-char-count" aria-live="polite">280</span>
                  <button id="mtk-post-btn" disabled aria-label="Submit post">Post</button>
                </div>
              </div>
            </div>
          </section>

          <!-- Tweet List -->
          <ul class="mtk-twitter__tweet-list" id="mtk-tweet-list" aria-label="Tweets" aria-live="polite">
            ${this._renderTweetList()}
          </ul>
        </main>

        <!-- ── Right Sidebar ── -->
        <aside class="mtk-twitter__sidebar-right" aria-label="Sidebar">
          <div class="mtk-twitter__search" role="search">
            <span class="material-icons-round" aria-hidden="true">search</span>
            <input type="search" placeholder="Search Melify" aria-label="Search Melify" />
          </div>

          <!-- Trending -->
          <div class="mtk-twitter__widget" role="region" aria-label="Trending topics">
            <div class="mtk-twitter__widget-title">Trending</div>
            ${trendingTopics.map((t, i) => `
              <div class="mtk-twitter__trending-item" tabindex="0" role="button" aria-label="Trending: ${t.tag}, ${t.tweets} posts">
                <span class="trend-label">Trending · ${i + 1}</span>
                <span class="trend-tag">${t.tag}</span>
                <span class="trend-count">${t.tweets} posts</span>
              </div>
            `).join('')}
          </div>

          <!-- Who to Follow -->
          <div class="mtk-twitter__widget" role="region" aria-label="Who to follow">
            <div class="mtk-twitter__widget-title">Who to follow</div>
            ${whoToFollow.map(u => `
              <div class="mtk-twitter__follow-item">
                <img src="${u.avatar}" alt="${u.name}" loading="lazy" />
                <div class="follow-info">
                  <div class="follow-name">
                    ${u.name}
                    ${u.verified ? '<span class="material-icons-round verified-icon" aria-label="Verified" title="Verified">verified</span>' : ''}
                  </div>
                  <div class="follow-handle">${u.handle}</div>
                </div>
                <button class="follow-btn" data-handle="${u.handle}" aria-label="Follow ${u.name}">
                  Follow
                </button>
              </div>
            `).join('')}
          </div>
        </aside>

      </div>

      <!-- Toast container -->
      <div class="mtk-twitter__toast-container" id="mtk-toast-container" aria-live="assertive" aria-atomic="true"></div>
    `;
  }

  // ── Render tweet list ───────────────────────────────────
  _renderTweetList() {
    if (!this._state.tweets.length) {
      return `<li>
        <div class="mtk-twitter__empty">
          <span class="material-icons-round" aria-hidden="true">chat_bubble_outline</span>
          <p>No posts yet. Be the first to post!</p>
        </div>
      </li>`;
    }
    return this._state.tweets.map(t => this._renderTweetHTML(t)).join('');
  }

  // ── Render single tweet HTML ────────────────────────────
  _renderTweetHTML(tweet) {
    const { languages } = this._config;
    const langObj = languages.find(l => l.code === tweet.originalLang);
    const flagLabel = langObj ? `${langObj.flag} ${langObj.label}` : tweet.originalLang.toUpperCase();
    const isOwnLang = tweet.originalLang === this._state.userLang;

    return `
      <li class="mtk-twitter__tweet${tweet._isNew ? ' mtk-twitter__tweet--new' : ''}"
          data-tweet-id="${tweet.id}"
          tabindex="0"
          role="article"
          aria-label="Post by ${tweet.name}">

        <div class="mtk-twitter__tweet-avatar">
          <img src="${tweet.avatar}" alt="${tweet.name}" loading="lazy" />
        </div>

        <div class="mtk-twitter__tweet-body">
          <div class="mtk-twitter__tweet-header">
            <span class="mtk-twitter__tweet-name">
              ${tweet.name}
              ${tweet.verified ? '<span class="material-icons-round verified-icon" aria-label="Verified" title="Verified" style="font-size:0.95rem">verified</span>' : ''}
            </span>
            <span class="mtk-twitter__tweet-handle">${tweet.handle}</span>
            <span class="mtk-twitter__tweet-lang-badge" title="Original language: ${flagLabel}">
              <span class="material-icons-round" aria-hidden="true">translate</span>
              ${flagLabel}
            </span>
            <span class="mtk-twitter__tweet-time">${tweet.timestamp}</span>
          </div>

          <p class="mtk-twitter__tweet-text" lang="${tweet.originalLang}">${this._escapeHTML(tweet.text)}</p>

          ${!isOwnLang ? `
            <div class="mtk-twitter__tweet-translation" id="mtk-trans-${tweet.id}" aria-live="polite" style="display:none;"></div>
            <button class="mtk-twitter__tweet-translate-btn"
                    data-tweet-id="${tweet.id}"
                    data-translated="false"
                    aria-label="Translate this post">
              <span class="material-icons-round" aria-hidden="true">translate</span>
              Translate post
            </button>
          ` : ''}

          <div class="mtk-twitter__tweet-actions" role="group" aria-label="Post actions for ${tweet.name}">
            <button class="reply-btn"
                    data-tweet-id="${tweet.id}"
                    aria-label="Reply to ${tweet.name}. ${tweet.replies} replies">
              <span class="material-icons-round" aria-hidden="true">chat_bubble_outline</span>
              ${tweet.replies}
            </button>
            <button class="retweet-btn${tweet.retweeted ? ' retweet-btn--active' : ''}"
                    data-tweet-id="${tweet.id}"
                    aria-label="${tweet.retweeted ? 'Undo repost' : 'Repost'}. ${tweet.retweets} reposts"
                    aria-pressed="${tweet.retweeted}">
              <span class="material-icons-round" aria-hidden="true">repeat</span>
              ${tweet.retweets}
            </button>
            <button class="like-btn${tweet.liked ? ' like-btn--active' : ''}"
                    data-tweet-id="${tweet.id}"
                    aria-label="${tweet.liked ? 'Unlike' : 'Like'}. ${tweet.likes} likes"
                    aria-pressed="${tweet.liked}">
              <span class="material-icons-round" aria-hidden="true">${tweet.liked ? 'favorite' : 'favorite_border'}</span>
              ${tweet.likes}
            </button>
            <button class="bookmark-btn${tweet.bookmarked ? ' bookmark-btn--active' : ''}"
                    data-tweet-id="${tweet.id}"
                    aria-label="${tweet.bookmarked ? 'Remove bookmark' : 'Bookmark'}"
                    aria-pressed="${tweet.bookmarked}">
              <span class="material-icons-round" aria-hidden="true">${tweet.bookmarked ? 'bookmark' : 'bookmark_border'}</span>
            </button>
          </div>

          <!-- Reply Box -->
          <div class="mtk-twitter__reply-box" id="mtk-reply-${tweet.id}" aria-label="Reply to ${tweet.name}">
            <div class="reply-lang-indicator">
              <span class="material-icons-round" aria-hidden="true">language</span>
              Replying in your language — ${tweet.name} will see it in ${flagLabel}
            </div>
            <textarea
              placeholder="Write your reply..."
              aria-label="Reply to ${tweet.name}"
              data-reply-for="${tweet.id}"
              maxlength="280"
              rows="2"
            ></textarea>
            <div class="reply-actions">
              <button data-reply-submit="${tweet.id}" disabled aria-label="Send reply">Reply</button>
            </div>
          </div>
        </div>
      </li>
    `;
  }

  // ── Bind Events ─────────────────────────────────────────
  _bindEvents() {
    // Language selector
    const langSelect = this._root.querySelector('#mtk-lang-select');
    if (langSelect) {
      langSelect.addEventListener('change', e => {
        this._setLanguage(e.target.value, true);
      });
    }

    // Compose textarea — char count
    const textarea = this._root.querySelector('#mtk-compose-textarea');
    const charCount = this._root.querySelector('#mtk-char-count');
    const postBtn   = this._root.querySelector('#mtk-post-btn');

    if (textarea) {
      textarea.addEventListener('input', () => {
        const remaining = 280 - textarea.value.length;
        charCount.textContent = remaining;
        charCount.className = 'char-count' +
          (remaining < 20 ? ' char-count--danger' : remaining < 60 ? ' char-count--warning' : '');
        postBtn.disabled = textarea.value.trim().length === 0;
      });
    }

    if (postBtn) {
      postBtn.addEventListener('click', () => this._handlePost());
    }

    // Tweet list — event delegation
    const tweetList = this._root.querySelector('#mtk-tweet-list');
    if (tweetList) {
      tweetList.addEventListener('click', e => this._handleTweetListClick(e));
      tweetList.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          this._handleTweetListClick(e);
        }
      });
    }

    // Follow buttons
    this._root.querySelectorAll('.follow-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const following = btn.classList.toggle('follow-btn--following');
        btn.textContent = following ? 'Following' : 'Follow';
        btn.setAttribute('aria-label', `${following ? 'Unfollow' : 'Follow'} ${btn.dataset.handle}`);
      });
    });
  }

  // ── Handle tweet list delegated clicks ─────────────────
  _handleTweetListClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.classList.contains('like-btn'))         return this._handleLike(btn);
    if (btn.classList.contains('retweet-btn'))      return this._handleRetweet(btn);
    if (btn.classList.contains('reply-btn'))        return this._handleReplyToggle(btn);
    if (btn.classList.contains('bookmark-btn'))     return this._handleBookmark(btn);
    if (btn.classList.contains('mtk-twitter__tweet-translate-btn')) return this._handleTranslate(btn);

    const replySubmit = btn.dataset.replySubmit;
    if (replySubmit) return this._handleReplySubmit(replySubmit);
  }

  // ── Post a new tweet ────────────────────────────────────
  _handlePost() {
    const textarea = this._root.querySelector('#mtk-compose-textarea');
    const text = textarea.value.trim();
    if (!text) return;

    const { currentUser, events } = this._config;
    const tweet = {
      id:          `tweet_${Date.now()}`,
      userId:      currentUser.id,
      name:        currentUser.name,
      handle:      currentUser.handle,
      avatar:      currentUser.avatar,
      originalLang: this._state.userLang,
      text,
      timestamp:   'just now',
      likes:       0,
      retweets:    0,
      replies:     0,
      liked:       false,
      retweeted:   false,
      bookmarked:  false,
      verified:    currentUser.verified,
      replies_data: [],
      _isNew:      true
    };

    this._state.tweets.unshift(tweet);
    this._prependTweet(tweet);

    textarea.value = '';
    this._root.querySelector('#mtk-char-count').textContent = '280';
    this._root.querySelector('#mtk-post-btn').disabled = true;

    const payload = { type: events.TWEET_POSTED, data: { tweet } };
    wc.publish(events.TWEET_POSTED, payload);

    this._toast('Post published!', 'check_circle');
  }

  // ── Prepend tweet to list ───────────────────────────────
  _prependTweet(tweet) {
    tweet._isNew = true;
    const list = this._root.querySelector('#mtk-tweet-list');
    if (!list) return;

    // Remove empty state if present
    const emptyEl = list.querySelector('.mtk-twitter__empty');
    if (emptyEl) emptyEl.closest('li').remove();

    const li = document.createElement('li');
    li.innerHTML = this._renderTweetHTML(tweet);
    const tweetEl = li.firstElementChild;
    list.prepend(tweetEl);

    // Bind reply textarea for newly added tweet
    this._bindReplyTextarea(tweet.id);
  }

  // ── Like ────────────────────────────────────────────────
  _handleLike(btn) {
    const tweetId = btn.dataset.tweetId;
    const tweet   = this._state.tweets.find(t => t.id === tweetId);
    if (!tweet) return;

    tweet.liked = !tweet.liked;
    tweet.likes += tweet.liked ? 1 : -1;

    const icon = btn.querySelector('.material-icons-round');
    icon.textContent = tweet.liked ? 'favorite' : 'favorite_border';
    btn.classList.toggle('like-btn--active', tweet.liked);
    btn.setAttribute('aria-pressed', tweet.liked);
    btn.setAttribute('aria-label', `${tweet.liked ? 'Unlike' : 'Like'}. ${tweet.likes} likes`);
    btn.querySelector('.material-icons-round').nextSibling
      ? null
      : btn.childNodes[1] && (btn.childNodes[1].textContent = ` ${tweet.likes}`);
    // Re-render count text node
    btn.lastChild.textContent = ` ${tweet.likes}`;

    const { events } = this._config;
    const payload = { type: events.TWEET_LIKED, data: { tweetId, liked: tweet.liked, likes: tweet.likes } };
    wc.publish(events.TWEET_LIKED, payload);
  }

  // ── Retweet ─────────────────────────────────────────────
  _handleRetweet(btn) {
    const tweetId = btn.dataset.tweetId;
    const tweet   = this._state.tweets.find(t => t.id === tweetId);
    if (!tweet) return;

    tweet.retweeted = !tweet.retweeted;
    tweet.retweets += tweet.retweeted ? 1 : -1;

    btn.classList.toggle('retweet-btn--active', tweet.retweeted);
    btn.setAttribute('aria-pressed', tweet.retweeted);
    btn.lastChild.textContent = ` ${tweet.retweets}`;

    const { events } = this._config;
    const payload = { type: events.TWEET_RETWEETED, data: { tweetId, retweeted: tweet.retweeted, retweets: tweet.retweets } };
    wc.publish(events.TWEET_RETWEETED, payload);

    if (tweet.retweeted) this._toast('Reposted!', 'repeat');
  }

  // ── Bookmark ────────────────────────────────────────────
  _handleBookmark(btn) {
    const tweetId = btn.dataset.tweetId;
    const tweet   = this._state.tweets.find(t => t.id === tweetId);
    if (!tweet) return;

    tweet.bookmarked = !tweet.bookmarked;
    const icon = btn.querySelector('.material-icons-round');
    icon.textContent = tweet.bookmarked ? 'bookmark' : 'bookmark_border';
    btn.classList.toggle('bookmark-btn--active', tweet.bookmarked);
    btn.setAttribute('aria-pressed', tweet.bookmarked);

    const { events } = this._config;
    const payload = { type: events.TWEET_BOOKMARKED, data: { tweetId, bookmarked: tweet.bookmarked } };
    wc.publish(events.TWEET_BOOKMARKED, payload);

    if (tweet.bookmarked) this._toast('Bookmarked!', 'bookmark');
  }

  // ── Reply Toggle ────────────────────────────────────────
  _handleReplyToggle(btn) {
    const tweetId  = btn.dataset.tweetId;
    const replyBox = this._root.querySelector(`#mtk-reply-${tweetId}`);
    if (!replyBox) return;

    const isVisible = replyBox.classList.contains('mtk-twitter__reply-box--visible');
    replyBox.classList.toggle('mtk-twitter__reply-box--visible', !isVisible);

    if (!isVisible) {
      const ta = replyBox.querySelector('textarea');
      if (ta) ta.focus();
      this._bindReplyTextarea(tweetId);
    }
  }

  // ── Bind reply textarea validation ──────────────────────
  _bindReplyTextarea(tweetId) {
    const replyBox = this._root.querySelector(`#mtk-reply-${tweetId}`);
    if (!replyBox) return;

    const ta  = replyBox.querySelector('textarea');
    const btn = replyBox.querySelector(`[data-reply-submit="${tweetId}"]`);
    if (!ta || !btn) return;

    ta.addEventListener('input', () => {
      btn.disabled = ta.value.trim().length === 0;
    });
  }

  // ── Reply Submit ────────────────────────────────────────
  _handleReplySubmit(tweetId) {
    const replyBox = this._root.querySelector(`#mtk-reply-${tweetId}`);
    if (!replyBox) return;

    const ta   = replyBox.querySelector(`[data-reply-for="${tweetId}"]`);
    const text = ta ? ta.value.trim() : '';
    if (!text) return;

    const tweet = this._state.tweets.find(t => t.id === tweetId);
    if (!tweet) return;

    tweet.replies++;
    // Update reply count in button
    const replyBtn = this._root.querySelector(`.reply-btn[data-tweet-id="${tweetId}"]`);
    if (replyBtn) replyBtn.lastChild.textContent = ` ${tweet.replies}`;

    // Clear and close
    ta.value = '';
    replyBox.classList.remove('mtk-twitter__reply-box--visible');

    const { events } = this._config;
    const payload = {
      type: events.TWEET_REPLIED,
      data: {
        tweetId,
        replyText:    text,
        replyLang:    this._state.userLang,
        originalLang: tweet.originalLang,
        authorName:   tweet.name
      }
    };
    wc.publish(events.TWEET_REPLIED, payload);
    this._toast('Reply sent!', 'send');
  }

  // ── Translate ───────────────────────────────────────────
  _handleTranslate(btn) {
    const tweetId    = btn.dataset.tweetId;
    const translated = btn.dataset.translated === 'true';
    const transEl    = this._root.querySelector(`#mtk-trans-${tweetId}`);
    const tweet      = this._state.tweets.find(t => t.id === tweetId);
    if (!transEl || !tweet) return;

    if (translated) {
      // Hide translation
      transEl.style.display = 'none';
      btn.dataset.translated = 'false';
      btn.innerHTML = `<span class="material-icons-round" aria-hidden="true">translate</span> Translate post`;
      return;
    }

    // Show loading
    transEl.style.display = 'block';
    transEl.innerHTML = `
      <div class="mtk-twitter__tweet-translation-label">
        <span class="material-icons-round" aria-hidden="true">translate</span> Translating…
      </div>
      <div class="translating">
        <div class="spinner" aria-hidden="true"></div>
        Detecting and translating…
      </div>
    `;
    btn.innerHTML = `<span class="material-icons-round" aria-hidden="true">translate</span> Hide translation`;
    btn.dataset.translated = 'true';

    // Check cache
    const cacheKey = `${tweetId}_${this._state.userLang}`;
    if (this._state.translationCache[cacheKey]) {
      setTimeout(() => {
        this._showTranslation(transEl, this._state.translationCache[cacheKey], tweet.originalLang);
      }, 200);
      return;
    }

    // Simulate translation with delay
    setTimeout(() => {
      const translated = this._translate(tweet.text, tweet.originalLang, this._state.userLang);
      this._state.translationCache[cacheKey] = translated;
      this._showTranslation(transEl, translated, tweet.originalLang);

      const { events } = this._config;
      const payload = {
        type: events.TWEET_TRANSLATED,
        data: { tweetId, fromLang: tweet.originalLang, toLang: this._state.userLang, translatedText: translated }
      };
      wc.publish(events.TWEET_TRANSLATED, payload);
    }, this._config.app.translationDelay);
  }

  _showTranslation(transEl, text, fromLang) {
    const { languages } = this._config;
    const toLangObj  = languages.find(l => l.code === this._state.userLang);
    const toLangFlag = toLangObj ? toLangObj.flag : '';

    transEl.innerHTML = `
      <div class="mtk-twitter__tweet-translation-label">
        <span class="material-icons-round" aria-hidden="true">translate</span>
        Translated to ${toLangFlag} ${toLangObj ? toLangObj.label : this._state.userLang}
      </div>
      ${this._escapeHTML(text)}
    `;
  }

  // ── Translation engine (stub + dict) ───────────────────
  _translate(text, fromLang, toLang) {
    if (fromLang === toLang) return text;

    // Check the config translation dictionary
    const dict = this._config.translations;
    if (dict[text] && dict[text][toLang]) {
      return dict[text][toLang];
    }

    // Fallback: return a bracketed notice
    return `[Auto-translated from ${fromLang.toUpperCase()}] ${text}`;
  }

  // ── Set Language ────────────────────────────────────────
  _setLanguage(lang, publishEvent = true) {
    this._state.userLang = lang;

    const { languages, events } = this._config;
    const langObj = languages.find(l => l.code === lang);

    // Update select if triggered externally
    const select = this._root.querySelector('#mtk-lang-select');
    if (select && select.value !== lang) select.value = lang;

    // Re-render compose indicators
    const indicator = this._root.querySelector('.mtk-twitter__compose-lang-indicator');
    if (indicator && langObj) {
      indicator.innerHTML = `
        <span class="material-icons-round" aria-hidden="true">language</span>
        Posting in ${langObj.flag} ${langObj.label}
      `;
    }

    // Update feed header
    const feedHeader = this._root.querySelector('.mtk-twitter__feed-header');
    if (feedHeader && langObj) {
      feedHeader.innerHTML = `Home <span style="font-size:0.72rem;font-weight:500;color:#8892a4;margin-left:8px;">Viewing in ${langObj.flag} ${langObj.label}</span>`;
    }

    // Re-render tweet list (shows/hides translate buttons per lang)
    const tweetList = this._root.querySelector('#mtk-tweet-list');
    if (tweetList) {
      tweetList.innerHTML = this._renderTweetList();
      // Re-bind reply textareas
      this._state.tweets.forEach(t => this._bindReplyTextarea(t.id));
    }

    this._toast(`Language set to ${langObj ? langObj.flag + ' ' + langObj.label : lang}`, 'language');

    if (publishEvent) {
      const payload = { type: events.LANGUAGE_CHANGED, data: { lang, langLabel: langObj ? langObj.label : lang } };
      wc.publish(events.LANGUAGE_CHANGED, payload);
    }
  }

  // ── Sync Like from external ─────────────────────────────
  _syncLike(tweetId, liked) {
    const tweet = this._state.tweets.find(t => t.id === tweetId);
    if (!tweet) return;
    tweet.liked = liked;
    tweet.likes += liked ? 1 : -1;
    const btn = this._root.querySelector(`.like-btn[data-tweet-id="${tweetId}"]`);
    if (btn) {
      btn.classList.toggle('like-btn--active', liked);
      btn.querySelector('.material-icons-round').textContent = liked ? 'favorite' : 'favorite_border';
      btn.lastChild.textContent = ` ${tweet.likes}`;
    }
  }

  // ── Sync Retweet from external ──────────────────────────
  _syncRetweet(tweetId, retweeted) {
    const tweet = this._state.tweets.find(t => t.id === tweetId);
    if (!tweet) return;
    tweet.retweeted = retweeted;
    tweet.retweets += retweeted ? 1 : -1;
    const btn = this._root.querySelector(`.retweet-btn[data-tweet-id="${tweetId}"]`);
    if (btn) {
      btn.classList.toggle('retweet-btn--active', retweeted);
      btn.lastChild.textContent = ` ${tweet.retweets}`;
    }
  }

  // ── Toast ───────────────────────────────────────────────
  _toast(message, icon = 'info') {
    const container = this._root.querySelector('#mtk-toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'mtk-twitter__toast';
    toast.setAttribute('role', 'status');
    toast.innerHTML = `<span class="material-icons-round" aria-hidden="true">${icon}</span> ${message}`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('mtk-twitter__toast--exit');
      toast.addEventListener('animationend', () => toast.remove());
    }, 2800);
  }

  // ── Utility: escape HTML ────────────────────────────────
  _escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}


// ── Auto-initialize ───────────────────────────────────────
const mtkTwitterInstance = new MTKTwitter('mtk-twitter.mtk-twitter');

// Export for external use
if (typeof module !== 'undefined') {
  module.exports = MTKTwitter;
}
