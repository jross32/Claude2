const { chromium } = require('playwright-extra');
try {
  const StealthPlugin = require('puppeteer-extra-plugin-stealth');
  chromium.use(StealthPlugin());
} catch {}
const torManager = require('./tor-manager');
const redisCache = require('./redis-cache');
const { bypassCloudflare } = require('./cloudflare');

// ── User-agent pool (realistic Chrome on Windows strings) ─────────────────
const _UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];
const _VIEWPORT_POOL = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
];
const _randomUA = () => _UA_POOL[Math.floor(Math.random() * _UA_POOL.length)];
const _randomViewport = () => _VIEWPORT_POOL[Math.floor(Math.random() * _VIEWPORT_POOL.length)];
const { extractPageData } = require('./extractor');
const { handleAuth } = require('./auth');
const fs = require('fs');
const path = require('path');

// Semaphore — limits concurrent async operations to `max` at a time
class Semaphore {
  constructor(max) { this._max = max; this._count = 0; this._q = []; }
  acquire() {
    if (this._count < this._max) { this._count++; return Promise.resolve(); }
    return new Promise(r => this._q.push(r));
  }
  release() {
    this._count--;
    if (this._q.length > 0) { this._count++; this._q.shift()(); }
  }
}

const SESSIONS_DIR = path.join(__dirname, '../.scraper-sessions');
const SAVES_DIR = path.join(__dirname, '../scrape-saves');
const SCRAPE_STATES = {
  RUNNING: 'running',
  PAUSED: 'paused',
  WAITING_AUTH: 'waiting_auth',
  WAITING_VERIFICATION: 'waiting_verification',
  STOPPING: 'stopping',
  COMPLETE: 'complete',
  STOPPED: 'stopped',
  ERROR: 'error',
};

function nowIso() {
  return new Date().toISOString();
}

function createSessionSnapshot(sessionId) {
  const now = nowIso();
  return {
    sessionId,
    state: SCRAPE_STATES.RUNNING,
    targetUrl: '',
    startedAt: now,
    updatedAt: now,
    step: '',
    percent: 0,
    visited: 0,
    total: null,
    queued: 0,
    failed: 0,
    partialPageCount: 0,
    graphqlCallCount: 0,
    restCallCount: 0,
    needsAuth: false,
    needsVerification: false,
    lastError: null,
  };
}

function sessionFile(url) {
  try {
    const hostname = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_');
    if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    return path.join(SESSIONS_DIR, `${hostname}.json`);
  } catch { return null; }
}

function credsFile(url) {
  try {
    const hostname = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_');
    if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    return path.join(SESSIONS_DIR, `${hostname}.creds.json`);
  } catch { return null; }
}

function loadSavedCreds(url) {
  // Check the given URL and also the root domain (e.g. poolplayers.com covers both subdomains)
  const urlsToCheck = [url];
  try {
    const u = new URL(url);
    const parts = u.hostname.split('.');
    if (parts.length > 2) urlsToCheck.push(`${u.protocol}//${parts.slice(-2).join('.')}`);
  } catch {}
  for (const u of urlsToCheck) {
    try {
      const file = credsFile(u);
      if (file && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {}
    // Also check sibling subdomains (accounts.x.com → league.x.com creds)
    try {
      const dir = SESSIONS_DIR;
      if (fs.existsSync(dir)) {
        const domain = new URL(u).hostname.split('.').slice(-2).join('_');
        const files = fs.readdirSync(dir).filter(f => f.includes(domain) && f.endsWith('.creds.json'));
        for (const f of files) {
          const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
          if (data.username && data.password) return data;
        }
      }
    } catch {}
  }
  return null;
}

function saveCreds(url, username, password) {
  try {
    const file = credsFile(url);
    if (file) fs.writeFileSync(file, JSON.stringify({ username, password }));
  } catch {}
}

function loadSession(url) {
  // Try exact hostname first
  try {
    const file = sessionFile(url);
    if (file && fs.existsSync(file)) return file;
  } catch {}
  // Fallback: try any saved session for the same root domain (e.g. league.x.com → accounts.x.com)
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.split('.');
    if (parts.length > 2) {
      const rootDomain = parts.slice(-2).join('.');
      if (fs.existsSync(SESSIONS_DIR)) {
        const files = fs.readdirSync(SESSIONS_DIR)
          .filter(f => f.endsWith('.json') && !f.includes('.spa-routes') && !f.includes('.creds') && f.includes(rootDomain));
        if (files.length) return path.join(SESSIONS_DIR, files[0]);
      }
    }
  } catch {}
  return null;
}

function clearSession(url) {
  try {
    const file = sessionFile(url);
    if (file && fs.existsSync(file)) { fs.unlinkSync(file); return true; }
    const cf = credsFile(url);
    if (cf && fs.existsSync(cf)) fs.unlinkSync(cf);
  } catch {}
  return false;
}

// ── SPA route memory ─────────────────────────────────────────────────────────
// URLs that 504 on direct server access but work via client-side SPA navigation

function spaRoutesFile(url) {
  try {
    const hostname = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_');
    if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    return path.join(SESSIONS_DIR, `${hostname}.spa-routes.json`);
  } catch { return null; }
}

function loadSpaRoutes(url) {
  try {
    const file = spaRoutesFile(url);
    if (file && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {}
  return [];
}

function saveSpaRoute(url) {
  try {
    const hostname = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_');
    const file = spaRoutesFile(url);
    const parsed = new URL(url);
    if (!file) return;
    const routes = loadSpaRoutes(`${parsed.protocol}//${hostname}`);
    // Store the path prefix up to the second segment so siblings are also covered
    // e.g. /RioGrandeValley/divisions/ → /RioGrandeValley/
    const segments = parsed.pathname.split('/').filter(Boolean);
    const prefix = '/' + (segments[0] || '');
    if (prefix !== '/' && !routes.includes(prefix)) {
      routes.push(prefix);
      fs.writeFileSync(file, JSON.stringify(routes, null, 2));
    }
  } catch {}
}

function isSpaRoute(url, routes) {
  if (!routes?.length) return false;
  try {
    const { pathname } = new URL(url);
    return routes.some(prefix => pathname === prefix || pathname.startsWith(prefix + '/'));
  } catch { return false; }
}

async function closeBrowserSafely(browser, timeoutMs = 2000) {
  if (!browser) return;

  try {
    await Promise.race([
      browser.close().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch {}
}


class ScraperSession {
  constructor(sessionId, broadcast) {
    this.sessionId = sessionId;
    this.broadcast = broadcast;
    this.browser = null;
    this.stopped = false;
    this.paused = false;
    this._resumeResolve = null;
    this.verificationResolver = null;

    // Captured network data
    this.graphqlCalls = [];
    this.restCalls = [];
    this.allRequests = [];     // every single network request
    this.assets = [];
    this.errors = [];
    this.websockets = [];
    this.sseCalls = [];        // Server-Sent Events (EventSource streams)
    this.beaconCalls = [];     // navigator.sendBeacon() / ping requests
    this.binaryResponses = []; // MessagePack / Protobuf / CBOR / binary API responses
    this.serviceWorkers = [];  // detected service worker registrations
    this.cookies = [];
    this.consoleLogs = [];
    this.securityHeaders = {};
    this.downloadedImages = [];
    this.credentialsResolver = null;
    this.authRedirectedPages = [];  // pages that bounced to login mid-crawl
    this.failedPages = [];          // pages that failed to load (after retry)
    this._partialPageCount = 0;
    this._statusSnapshot = createSessionSnapshot(sessionId);
  }

  _setStatus(state, patch = {}) {
    if (state) this._statusSnapshot.state = state;
    Object.assign(this._statusSnapshot, patch, {
      updatedAt: nowIso(),
    });
  }

  _setRunningState(patch = {}) {
    const state = this._statusSnapshot.state;
    const nextState = [SCRAPE_STATES.PAUSED, SCRAPE_STATES.WAITING_AUTH, SCRAPE_STATES.WAITING_VERIFICATION, SCRAPE_STATES.STOPPING, SCRAPE_STATES.ERROR, SCRAPE_STATES.COMPLETE, SCRAPE_STATES.STOPPED].includes(state)
      ? state
      : SCRAPE_STATES.RUNNING;
    this._setStatus(nextState, patch);
  }

  _incrementPartialPageCount(count = 1) {
    this._partialPageCount += Math.max(0, count);
    this._setStatus(null, { partialPageCount: this._partialPageCount });
  }

  markComplete(result = null) {
    this._partialPageCount = Array.isArray(result?.pages) ? result.pages.length : this._partialPageCount;
    this._setStatus(SCRAPE_STATES.COMPLETE, {
      percent: 100,
      step: 'Done',
      needsAuth: false,
      needsVerification: false,
      lastError: null,
      partialPageCount: this._partialPageCount,
      visited: Array.isArray(result?.visitedUrls) ? result.visitedUrls.length : this._statusSnapshot.visited,
      total: Array.isArray(result?.pages) ? result.pages.length : this._statusSnapshot.total,
    });
  }

  markStopped() {
    this._setStatus(SCRAPE_STATES.STOPPED, {
      needsAuth: false,
      needsVerification: false,
      partialPageCount: this._partialPageCount,
    });
  }

  markError(error) {
    this._setStatus(SCRAPE_STATES.ERROR, {
      lastError: error?.message || String(error),
      needsAuth: false,
      needsVerification: false,
      partialPageCount: this._partialPageCount,
    });
  }

  getStatusSnapshot() {
    return {
      ...this._statusSnapshot,
      failed: Math.max(
        Number.isFinite(this._statusSnapshot.failed) ? this._statusSnapshot.failed : 0,
        this.failedPages.length
      ),
      partialPageCount: this._partialPageCount,
      graphqlCallCount: this.graphqlCalls.length,
      restCallCount: this.restCalls.length,
    };
  }

  log(message, type = 'info') {
    console.log(`[${this.sessionId}] ${message}`);
    this._setStatus(null, {
      updatedAt: nowIso(),
      lastError: type === 'error' ? message : this._statusSnapshot.lastError,
    });
    this.broadcast(this.sessionId, { type: 'log', level: type, message });
  }

  _startLiveStream(page, intervalMs = 800) {
    this._liveStreamInterval = setInterval(async () => {
      if (this.stopped || !page) { this._stopLiveStream(); return; }
      try {
        const buf = await page.screenshot({ type: 'jpeg', quality: 50 });
        this.broadcast(this.sessionId, {
          type: 'liveFrame',
          dataUrl: 'data:image/jpeg;base64,' + buf.toString('base64'),
        });
      } catch {}
    }, intervalMs);
  }

  _stopLiveStream() {
    if (this._liveStreamInterval) {
      clearInterval(this._liveStreamInterval);
      this._liveStreamInterval = null;
    }
  }

  progress(step, percent, extra = {}) {
    this._setRunningState({
      step,
      percent,
      visited: typeof extra.visited === 'number' ? extra.visited : this._statusSnapshot.visited,
      total: typeof extra.total === 'number' ? extra.total : this._statusSnapshot.total,
      queued: typeof extra.queued === 'number' ? extra.queued : this._statusSnapshot.queued,
      failed: typeof extra.failed === 'number' ? extra.failed : this.failedPages.length,
      partialPageCount: this._partialPageCount,
    });
    this.broadcast(this.sessionId, { type: 'progress', step, percent, ...extra });
  }

  async submitVerification(code) {
    if (this.verificationResolver) {
      this._setStatus(this.paused ? SCRAPE_STATES.PAUSED : SCRAPE_STATES.RUNNING, {
        needsVerification: false,
      });
      this.verificationResolver(code);
      this.verificationResolver = null;
    }
  }

  async waitForVerification() {
    this._setStatus(SCRAPE_STATES.WAITING_VERIFICATION, {
      needsVerification: true,
      needsAuth: false,
    });
    this.broadcast(this.sessionId, { type: 'needVerification' });
    return new Promise((resolve) => {
      this.verificationResolver = resolve;
      const timer = setTimeout(() => {
        if (this.verificationResolver) {
          this._setStatus(SCRAPE_STATES.RUNNING, {
            needsVerification: false,
          });
          this.verificationResolver(null);
          this.verificationResolver = null;
        }
      }, 300000);
      timer.unref?.();
    });
  }

  async waitForCredentials() {
    this._setStatus(SCRAPE_STATES.WAITING_AUTH, {
      needsAuth: true,
      needsVerification: false,
    });
    this.broadcast(this.sessionId, { type: 'needsAuth' });
    return new Promise((resolve) => {
      this.credentialsResolver = resolve;
      // 10 minute timeout
      const timer = setTimeout(() => {
        if (this.credentialsResolver) {
          this._setStatus(SCRAPE_STATES.RUNNING, {
            needsAuth: false,
          });
          this.credentialsResolver(null);
          this.credentialsResolver = null;
        }
      }, 600000);
      timer.unref?.();
    });
  }

  submitCredentials(username, password) {
    if (this.credentialsResolver) {
      this._setStatus(this.paused ? SCRAPE_STATES.PAUSED : SCRAPE_STATES.RUNNING, {
        needsAuth: false,
      });
      this.credentialsResolver({ username, password });
      this.credentialsResolver = null;
    }
  }

  stop() {
    this.stopped = true;
    this._setStatus(SCRAPE_STATES.STOPPING, {
      needsAuth: false,
      needsVerification: false,
    });
    // Wake any paused wait before closing so the loop can exit cleanly
    if (this._resumeResolve) { this._resumeResolve(); this._resumeResolve = null; }
    this._stopLiveStream();
    if (this._popupWatcherInterval) { clearInterval(this._popupWatcherInterval); this._popupWatcherInterval = null; }
    if (this.browser) {
      this.browser.close().catch(() => {});
    }
  }

  pause() {
    if (this.stopped || this.paused) return;
    this.paused = true;
    this._resumePromise = new Promise(resolve => { this._resumeResolve = resolve; });
    this._setStatus(SCRAPE_STATES.PAUSED, {});
    this.log('Scrape paused by user.', 'warn');
    this.broadcast(this.sessionId, { type: 'paused' });
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    if (this._resumeResolve) { this._resumeResolve(); this._resumeResolve = null; }
    this._resumePromise = null;
    this._setStatus(SCRAPE_STATES.RUNNING, {});
    this.log('Scrape resumed.', 'success');
    this.broadcast(this.sessionId, { type: 'resumed' });
  }

  // Suspend execution at the next checkpoint until resumed (or stopped)
  async _checkPause() {
    if (!this.paused || this.stopped) return;
    await this._resumePromise;
  }

  // Find a dismiss button and return its center coordinates via DOM
  async _findDismissCoords(page) {
    const dismissRe = /no[\s,]*thanks?|not\s+now|maybe\s+later|\bskip\b|^dismiss$|don.t\s+(ask|show|notify)/i;
    try {
      return await page.evaluate((reStr) => {
        const re = new RegExp(reStr, 'i');
        const sel = 'button, [role="button"], input[type="button"], input[type="submit"]';
        for (const el of document.querySelectorAll(sel)) {
          const text = (el.textContent || el.value || el.getAttribute('aria-label') || '').trim();
          if (!re.test(text)) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          // Must be in the visible viewport
          if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, text };
        }
        return null;
      }, dismissRe.source);
    } catch { return null; }
  }

  async _dismissPopups(page, waitMs = 5000) {
    const tryDismiss = async () => {
      // ── PRE-STEP: tick "Don't ask me again" checkbox inside any visible modal ──
      await page.evaluate(() => {
        const containers = [
          document.querySelector('#modal'),
          document.querySelector('[role="dialog"]'),
          ...Array.from(document.querySelectorAll('[class*="modal"],[class*="Modal"],[class*="dialog"],[class*="Dialog"]')),
        ].filter(Boolean);
        const checkboxKws = ["don't ask", "don't show", "do not ask", "not again"];
        for (const container of containers) {
          for (const label of container.querySelectorAll('label')) {
            const t = (label.textContent || '').toLowerCase();
            if (checkboxKws.some(kw => t.includes(kw))) {
              const cb = label.querySelector('input[type="checkbox"]') || (label.htmlFor && document.getElementById(label.htmlFor));
              if (cb && !cb.checked) cb.click();
            }
          }
        }
      }).catch(() => {});

      // ── PRIMARY: el.click() from page context — fires all JS/React handlers directly ──
      const dismissed = await page.evaluate(() => {
        const texts = ['no thanks', 'no, thanks', 'not now', 'maybe later', 'skip', 'dismiss', "don't show", "don't ask"];
        for (const el of document.querySelectorAll('button, [role="button"], input[type="button"], a[role="button"]')) {
          const t = (el.textContent || el.value || el.getAttribute('aria-label') || '').trim().toLowerCase();
          if (texts.some(kw => t.includes(kw))) {
            el.click();
            return t;
          }
        }
        return null;
      }).catch(() => null);
      if (dismissed) {
        this.log(`Dismissed popup (JS click): "${dismissed}"`);
        return true;
      }

      // ── SECONDARY: real mouse click at button coordinates ──
      const coords = await this._findDismissCoords(page).catch(() => null);
      if (coords) {
        try {
          await page.mouse.move(coords.x, coords.y);
          await page.mouse.click(coords.x, coords.y);
          this.log(`Dismissed popup (mouse): "${coords.text}" at (${Math.round(coords.x)},${Math.round(coords.y)})`);
          return true;
        } catch {}
      }

      // ── FALLBACK: Playwright locator with force ──
      for (const text of ['No Thanks', 'No, Thanks', 'Not Now', 'Maybe Later', 'Skip', 'Dismiss']) {
        try {
          await page.click(`button:has-text("${text}")`, { timeout: 200, force: true });
          this.log(`Dismissed popup (locator): "${text}"`);
          return true;
        } catch {}
      }

      return false;
    };

    if (await tryDismiss()) return;

    const start = Date.now();
    while (Date.now() - start < waitMs) {
      await page.waitForTimeout(400);
      if (this.stopped) return;
      if (await tryDismiss()) return;
    }
  }

  // Register a persistent popup watcher for the whole page lifetime
  _registerPopupWatcher(page) {
    page.on('dialog', async (dialog) => { try { await dialog.dismiss(); } catch {} });

    const interval = setInterval(async () => {
      if (this.stopped) { clearInterval(interval); return; }

      // Primary: real mouse click via coordinates
      const coords = await this._findDismissCoords(page).catch(() => null);
      if (coords) {
        try {
          await page.mouse.move(coords.x, coords.y);
          await page.mouse.click(coords.x, coords.y);
          this.log(`Auto-dismissed popup: "${coords.text}"`);
          return;
        } catch {}
      }

      // Fallback: locator with force
      for (const text of ['No Thanks', 'No, Thanks', 'Not Now', 'Maybe Later']) {
        try {
          await page.click(`button:has-text("${text}")`, { timeout: 200, force: true });
          this.log(`Auto-dismissed popup (locator): "${text}"`);
          return;
        } catch {}
      }
    }, 1000);
    return interval;
  }

  async _autoScroll(page) {
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        const SCROLL_DIST     = 400;    // px per tick
        const TICK_PAUSE_MS   = 150;    // wait after each scroll for lazy-loads to fire
        const TICK_INTERVAL   = 50;     // ms between ticks
        const MAX_IDLE_PASSES = 5;      // stop when bottom reached with no new content for N ticks
        const DEADLINE_MS     = 30000;  // hard cap

        const start = Date.now();
        let noNewContentStreak = 0;

        // Lightweight content probe — counts recognisable content nodes
        const countNodes = () =>
          document.querySelectorAll(
            'article, section > *, li, tr, [class*="card"], [class*="item"], [class*="row"], [class*="product"], [class*="result"]'
          ).length || document.body?.childElementCount || 0;

        let prevNodes  = countNodes();
        let prevHeight = document.body?.scrollHeight || 0;

        const tick = async () => {
          if (!document.body) { resolve(); return; }

          window.scrollBy(0, SCROLL_DIST);
          await new Promise(r => setTimeout(r, TICK_PAUSE_MS));

          const nowNodes  = countNodes();
          const nowHeight = document.body.scrollHeight;
          const newContent = nowNodes > prevNodes || nowHeight > prevHeight;

          if (newContent) {
            noNewContentStreak = 0;
            prevNodes  = nowNodes;
            prevHeight = nowHeight;
          } else {
            noNewContentStreak++;
          }

          const atBottom = window.scrollY + window.innerHeight >= nowHeight - 50;
          const timedOut = Date.now() - start >= DEADLINE_MS;
          const idle     = atBottom && noNewContentStreak >= MAX_IDLE_PASSES;

          if (idle || timedOut) {
            window.scrollTo(0, 0);
            resolve();
          } else {
            setTimeout(tick, TICK_INTERVAL);
          }
        };
        setTimeout(tick, 0);
      });
    }).catch(() => {}); // page may navigate away mid-scroll
    await page.waitForTimeout(500); // extra wait for lazy-loaded content to render
  }

  // Click through tabs, "load more" buttons, and pagination to surface links that are
  // only visible after user interaction. Returns array of additional internal URLs found.
  async _discoverViaInteraction(page, url, origin) {
    const discovered = new Set();
    const norm = u => u.split('#')[0].replace(/\/$/, '') || u;
    const safe = u => {
      try { return new URL(u).origin === origin && !/login|logout|signin|signout|sign-out|log-out/i.test(u); }
      catch { return false; }
    };
    const harvestLinks = async () => {
      const links = await page.evaluate(({ _origin, _base }) => {
        const out = [];
        // Include [role="link"] and React-router data attributes in addition to plain <a href>
        document.querySelectorAll(
          'a[href],[data-href],[data-url],[role="link"],[data-route],[data-path],[data-to]'
        ).forEach(el => {
          try {
            const raw = el.href
              || el.getAttribute('data-href')
              || el.getAttribute('data-url')
              || el.getAttribute('data-route')
              || el.getAttribute('data-path')
              || el.getAttribute('data-to');
            if (!raw) return;
            const h = new URL(raw, _base).href;
            if (h.startsWith(_origin)) out.push(h);
          } catch {}
        });
        return out;
      }, { _origin: origin, _base: page.url() }).catch(() => []);
      links.forEach(h => discovered.add(h));
    };

    try {
      // ── 1. "Load more" / "Show more" / "View all" buttons (expand hidden list items) ──
      const loadMoreRe = /^(load\s*more|show\s*more|view\s*all|see\s*all|show\s*all)/i;
      for (let pass = 0; pass < 8; pass++) {
        const btns = await page.$$('button:not([disabled]), a[role="button"]').catch(() => []);
        let clicked = false;
        for (const btn of btns) {
          try {
            const text = await btn.evaluate(el => el.innerText?.trim() || el.getAttribute('aria-label') || '').catch(() => '');
            if (!loadMoreRe.test(text)) continue;
            if (!await btn.isVisible().catch(() => false)) continue;
            const beforeUrl = norm(page.url());
            await btn.click();
            await page.waitForTimeout(700);
            await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {});
            if (norm(page.url()) !== beforeUrl) {
              const newUrl = page.url();
              if (safe(newUrl)) discovered.add(newUrl);
              await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
              await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
            }
            clicked = true;
            break; // one button per pass — re-scan after DOM update
          } catch {}
        }
        if (!clicked) break;
      }
      await harvestLinks(); // harvest after all "load more" expansions

      // ── 2. Tab click-through (role="tab") ────────────────────────────────
      const hasTabList = await page.$('[role="tablist"]').then(el => !!el).catch(() => false);
      if (hasTabList) {
        const tabs = await page.$$('[role="tab"]:not([aria-selected="true"]):not([aria-disabled="true"]):not([disabled])').catch(() => []);
        for (const tab of tabs.slice(0, 10)) {
          try {
            const beforeUrl = norm(page.url());
            await tab.click();
            await page.waitForTimeout(600);
            await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {});
            const afterUrl = page.url();
            if (safe(afterUrl)) discovered.add(afterUrl);
            await harvestLinks();
            // If tab changed the URL, go back before clicking next tab
            if (norm(afterUrl) !== beforeUrl) {
              await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
              await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
            }
          } catch {}
        }
        // Restore to original URL after all tabs are clicked
        if (norm(page.url()) !== norm(url)) {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
          await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
        }
      }

      // ── 3. Pagination "Next" button following ─────────────────────────────
      // Follows paginated lists and harvests links from every page
      const paginationSelectors = [
        'a[rel="next"]',
        '[aria-label="Go to next page"]:not([disabled])',
        '[aria-label="next page" i]:not([disabled])',
        'button[aria-label*="next" i]:not([disabled])',
        '[class*="pagination"] [class*="next"]:not([disabled])',
        '[class*="MuiPagination"] button[aria-label*="next" i]:not([disabled])',
        '[data-testid*="pagination"] [class*="next"]:not([disabled])',
      ];
      for (let pageNum = 0; pageNum < 20; pageNum++) {
        let nextBtn = null;
        for (const sel of paginationSelectors) {
          nextBtn = await page.$(sel).catch(() => null);
          if (nextBtn) break;
        }
        if (!nextBtn) break;
        try {
          if (!await nextBtn.isVisible().catch(() => false)) break;
          if (await nextBtn.isDisabled().catch(() => false)) break;
          const beforeUrl = norm(page.url());
          await nextBtn.click();
          await page.waitForTimeout(800);
          await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
          const afterUrl = page.url();
          if (norm(afterUrl) === beforeUrl || !safe(afterUrl)) break;
          discovered.add(afterUrl);
          await harvestLinks();
        } catch { break; }
      }

      // Restore to original URL if pagination left us elsewhere
      if (norm(page.url()) !== norm(url)) {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
      }

      // ── 4. SPA nav button/div click-through ──────────────────────────────
      // Finds buttons and non-link elements inside navigation containers that drive
      // React-router / SPA navigation via onClick, then clicks each to surface routes.
      const navItems = await page.evaluate(({ _origin }) => {
        const skipTexts = /logout|log.?out|sign.?out|delete|remove|cancel|close/i;
        const navContainers = Array.from(document.querySelectorAll(
          'nav, [role="navigation"], [role="menu"], [role="menubar"], aside, ' +
          '[class*="sidebar"], [class*="Sidebar"], [class*="NavMenu"], [class*="navMenu"], ' +
          '[class*="nav-menu"], [class*="menu-list"], [class*="MenuList"]'
        ));
        const items = [];
        for (const container of navContainers) {
          for (const el of container.querySelectorAll(
            'button:not([disabled]), [role="menuitem"], [role="option"], ' +
            'li > div, li > span, [class*="nav-item"], [class*="NavItem"], [class*="menu-item"]'
          )) {
            // Skip plain links — those are already caught by harvestLinks
            if (el.tagName === 'A' && el.href) continue;
            const text = (el.textContent || el.getAttribute('aria-label') || '').trim();
            if (text.length < 2 || skipTexts.test(text)) continue;
            const box = el.getBoundingClientRect();
            if (box.width === 0 || box.height === 0) continue;
            items.push({ text, x: box.x + box.width / 2, y: box.y + box.height / 2 });
          }
        }
        // Deduplicate by text (case-insensitive)
        const seen = new Set();
        return items.filter(it => {
          const k = it.text.toLowerCase();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        }).slice(0, 25);
      }, { _origin: origin }).catch(() => []);

      for (const item of navItems) {
        if (this.stopped) break;
        try {
          const beforeUrl = norm(page.url());
          await page.mouse.move(item.x, item.y);
          await page.mouse.click(item.x, item.y);
          await page.waitForTimeout(600);
          await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
          const afterUrl = page.url();
          if (safe(afterUrl)) discovered.add(afterUrl);
          await harvestLinks();
          // Restore if click navigated away from origin page
          if (norm(afterUrl) !== beforeUrl) {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
            await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
          }
        } catch {}
      }

      // Final harvest after all interaction passes
      await harvestLinks();

    } catch (err) {
      this.log(`Interaction discovery error on ${url}: ${err.message}`, 'warn');
      if (norm(page.url()) !== norm(url)) {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {});
      }
    }

    return [...discovered].filter(u => safe(u) && norm(u) !== norm(url));
  }

  // Detect and interact with all <select> dropdowns on the page; capture page data per option
  async _interactDropdowns(page, url) {
    const results = [];
    try {
      // Get all native select elements with more than one option
      const selectCount = await page.evaluate(() =>
        document.querySelectorAll('select:not([disabled])').length
      );
      if (selectCount === 0) return results;

      this.log(`Found ${selectCount} dropdown(s) on ${url} — interacting...`);

      for (let si = 0; si < selectCount; si++) {
        try {
          const selectInfo = await page.evaluate((idx) => {
            const selects = [...document.querySelectorAll('select:not([disabled])')];
            const el = selects[idx];
            if (!el) return null;
            const options = [...el.options].map((o, i) => ({
              index: i, value: o.value, text: o.text.trim(), selected: o.selected,
            }));
            const label = el.getAttribute('aria-label') || el.getAttribute('name') || el.id || `select-${idx}`;
            return { options, label, currentIndex: el.selectedIndex };
          }, si);

          if (!selectInfo || selectInfo.options.length <= 1) continue;

          const originalIndex = selectInfo.currentIndex;
          this.log(`Dropdown "${selectInfo.label}": ${selectInfo.options.length} options`);

          for (const option of selectInfo.options) {
            if (option.index === originalIndex) continue;
            if (!option.value && !option.text) continue;
            try {
              // Re-locate the select each time (page may re-render)
              const selHandle = await page.evaluateHandle((idx) => {
                return document.querySelectorAll('select:not([disabled])')[idx];
              }, si);

              await selHandle.asElement().selectOption({ index: option.index });
              await page.waitForTimeout(400);
              await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});

              const stateData = await extractPageData(page, url, { captureScreenshots: this._captureScreenshots });
              stateData._dropdownState = { label: selectInfo.label, option: option.text, value: option.value };
              results.push(stateData);
              this.log(`  Captured: "${selectInfo.label}" = "${option.text}"`);
            } catch (err) {
              this.log(`  Option "${option.text}" failed: ${err.message}`, 'warn');
            }
          }

          // Restore original selection
          try {
            const selHandle = await page.evaluateHandle((idx) => {
              return document.querySelectorAll('select:not([disabled])')[idx];
            }, si);
            await selHandle.asElement().selectOption({ index: originalIndex });
            await page.waitForTimeout(600);
          } catch {}
        } catch (err) {
          this.log(`Dropdown ${si} interaction failed: ${err.message}`, 'warn');
        }
      }
    } catch (err) {
      this.log(`_interactDropdowns error: ${err.message}`, 'warn');
    }
    return results;
  }

  // ── Infinite scroll capture ────────────────────────────────────────────────
  async _captureInfiniteScroll(page, opts = {}) {
    const steps = Math.min(opts.infiniteScrollSteps || 5, 20);
    const results = [];
    try {
      const getSnapshot = () => page.evaluate(() => ({
        textCount: document.querySelectorAll('p, li, article, [data-testid]').length,
        imageCount: document.images.length,
        linkCount: document.links.length,
        lastItemText: (() => {
          const items = document.querySelectorAll('article, [data-testid], li, .item, .post, .card');
          const last = items[items.length - 1];
          return last ? last.innerText?.trim().substring(0, 100) : null;
        })(),
      }));

      let prev = await getSnapshot();

      for (let step = 1; step <= steps; step++) {
        // Scroll to bottom
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1500);

        // Wait for new content (network idle for 1s)
        try { await page.waitForLoadState('networkidle', { timeout: 3000 }); } catch {}

        const next = await getSnapshot();
        const delta = {
          step,
          newElements: Math.max(0, next.textCount - prev.textCount),
          newImages: Math.max(0, next.imageCount - prev.imageCount),
          newLinks: Math.max(0, next.linkCount - prev.linkCount),
          lastItemText: next.lastItemText,
        };
        results.push(delta);

        // Stop if nothing new loaded
        if (delta.newElements === 0 && delta.newImages === 0 && delta.newLinks === 0) {
          this.log(`Infinite scroll: no new content at step ${step} — stopping early`);
          break;
        }
        prev = next;
      }
    } catch (err) {
      this.log(`_captureInfiniteScroll error: ${err.message}`, 'warn');
    }
    return results;
  }

  // ── Pagination traversal ───────────────────────────────────────────────────
  async _traversePagination(page, url, extractFn, opts = {}) {
    const maxPages = Math.min(opts.maxPaginationPages || 10, 50);
    const results = [];
    let currentUrl = url;
    const visited = new Set([url]);

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      try {
        const pageData = await extractFn(page);
        pageData._paginationPage = pageNum;
        pageData._paginationUrl = currentUrl;
        results.push(pageData);

        // Find next page link
        const nextUrl = await page.evaluate((currentUrl) => {
          // rel="next" is the most reliable
          const relNext = document.querySelector('link[rel="next"]');
          if (relNext) return relNext.href;

          // Aria-label patterns
          const ariaNext = document.querySelector('[aria-label*="next" i], [aria-label*="Next"]');
          if (ariaNext?.href) return ariaNext.href;

          // Pagination container links — find one that looks like "next"
          const paginationLinks = Array.from(document.querySelectorAll('.pagination a, [class*="pagination"] a, [class*="pager"] a'));
          const nextLink = paginationLinks.find(a =>
            /next|›|»|→|>/i.test(a.innerText.trim()) && a.href !== currentUrl
          );
          if (nextLink) return nextLink.href;

          // URL pattern: ?page=N or ?p=N
          const url = new URL(currentUrl);
          const pageParam = url.searchParams.get('page') || url.searchParams.get('p') || url.searchParams.get('pg');
          if (pageParam) {
            url.searchParams.set(url.searchParams.has('page') ? 'page' : url.searchParams.has('p') ? 'p' : 'pg',
              parseInt(pageParam) + 1);
            // Can't verify it exists — caller will detect no-content and stop
            return null; // safer to rely on rel="next" only for URL patterns
          }

          return null;
        }, currentUrl);

        if (!nextUrl || visited.has(nextUrl) || nextUrl === currentUrl) break;
        visited.add(nextUrl);

        await page.goto(nextUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(500);
        currentUrl = nextUrl;
      } catch (err) {
        this.log(`_traversePagination error on page ${pageNum}: ${err.message}`, 'warn');
        break;
      }
    }
    return results;
  }

  // ── Modal / dialog content capture ────────────────────────────────────────
  async _captureModals(page) {
    const modals = [];
    try {
      const triggers = await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll(
          '[data-modal], [data-toggle="modal"], [data-bs-toggle="modal"], ' +
          '[aria-haspopup="dialog"], [data-open], [data-target*="modal"]'
        ));
        // Also find buttons with modal-suggesting text
        const buttons = Array.from(document.querySelectorAll('button, [role="button"], a[href="#"]'));
        const modalButtons = buttons.filter(el =>
          /modal|popup|dialog|overlay|lightbox|learn more|view details/i.test(el.innerText + el.getAttribute('aria-label') + el.className)
        );
        const all = [...new Set([...candidates, ...modalButtons])].slice(0, 15);
        return all.map((el, i) => ({
          index: i,
          tag: el.tagName,
          text: el.innerText?.trim().substring(0, 100),
          ariaLabel: el.getAttribute('aria-label'),
          selector: el.id ? `#${el.id}` : (el.className ? `.${el.className.split(' ')[0]}` : el.tagName.toLowerCase()),
        }));
      });

      for (const trigger of triggers) {
        try {
          // Click the trigger
          const el = await page.$(`${trigger.tag.toLowerCase()}:nth-of-type(${trigger.index + 1})`);
          if (!el) continue;

          await el.click({ timeout: 3000 });
          // Wait for a dialog/modal to appear
          await page.waitForSelector(
            '[role="dialog"], .modal, .modal-content, [class*="modal"], [class*="overlay"], [class*="lightbox"]',
            { timeout: 2000 }
          );

          const modalContent = await page.evaluate(() => {
            const dialog = document.querySelector('[role="dialog"], .modal:not(.d-none), .modal-content');
            if (!dialog) return null;
            return {
              text: dialog.innerText?.trim().substring(0, 3000),
              html: dialog.innerHTML?.substring(0, 5000),
              ariaLabel: dialog.getAttribute('aria-label'),
              links: Array.from(dialog.querySelectorAll('a[href]')).map(a => ({ href: a.href, text: a.innerText?.trim() })),
              buttons: Array.from(dialog.querySelectorAll('button')).map(b => b.innerText?.trim()),
            };
          });

          if (modalContent) {
            modals.push({ trigger: { text: trigger.text, ariaLabel: trigger.ariaLabel }, ...modalContent });
          }

          // Dismiss: try Escape key first, then close button
          await page.keyboard.press('Escape').catch(() => {});
          await page.waitForTimeout(300);
          const stillOpen = await page.$('[role="dialog"]');
          if (stillOpen) {
            const closeBtn = await page.$('[aria-label="Close"], [aria-label="close"], .modal-close, .close-modal, button.close');
            if (closeBtn) await closeBtn.click().catch(() => {});
          }
          await page.waitForTimeout(300);
        } catch { /* trigger failed — skip */ }
      }
    } catch (err) {
      this.log(`_captureModals error: ${err.message}`, 'warn');
    }
    return modals;
  }

  // ── Accordion / tab content capture ───────────────────────────────────────
  async _captureAccordions(page) {
    const accordions = [];
    try {
      const triggers = await page.evaluate(() => {
        const SELECTORS = [
          '[data-accordion]', '.accordion-button', '[role="tab"]',
          'details > summary', '[data-toggle="collapse"]',
          '[aria-expanded="false"]', '.accordion-header',
        ];
        const found = [];
        for (const sel of SELECTORS) {
          document.querySelectorAll(sel).forEach(el => {
            if (!found.includes(el)) found.push(el);
          });
        }
        return found.slice(0, 20).map((el, i) => ({
          index: i,
          tag: el.tagName.toLowerCase(),
          text: el.innerText?.trim().substring(0, 100),
          expanded: el.getAttribute('aria-expanded'),
          selector: el.id ? `#${el.id}` : null,
        }));
      });

      for (const trigger of triggers) {
        try {
          const el = trigger.selector
            ? await page.$(trigger.selector)
            : (await page.$$(`${trigger.tag}`))[trigger.index];
          if (!el) continue;

          const before = await page.evaluate(() => document.body.innerText.length);
          await el.click({ timeout: 2000 });
          await page.waitForTimeout(600);
          const after = await page.evaluate(() => document.body.innerText.length);

          if (after > before) {
            const revealed = await el.evaluate(node => {
              // Walk siblings and children for revealed content
              const panel = node.nextElementSibling || node.parentElement?.nextElementSibling;
              if (!panel) return null;
              return {
                text: panel.innerText?.trim().substring(0, 2000),
                links: Array.from(panel.querySelectorAll('a[href]')).map(a => ({ href: a.href, text: a.innerText?.trim() })),
              };
            });
            if (revealed?.text) {
              accordions.push({ trigger: trigger.text, revealed });
            }
          }
        } catch { /* skip failed triggers */ }
      }
    } catch (err) {
      this.log(`_captureAccordions error: ${err.message}`, 'warn');
    }
    return accordions;
  }

  // ── Search / autocomplete suggestion capture ───────────────────────────────
  async _captureSearchSuggestions(page) {
    const results = [];
    try {
      const searchInputs = await page.$$('input[type="search"], input[name*="search" i], input[placeholder*="search" i], input[aria-label*="search" i]');
      const QUERIES = ['a', 'the', 'pro', 'new'];

      for (const input of searchInputs.slice(0, 2)) {
        try {
          await input.click({ timeout: 1500 });
          for (const query of QUERIES) {
            await input.fill('');
            await input.type(query, { delay: 80 });
            // Wait for autocomplete to appear (network idle or visible dropdown)
            await page.waitForTimeout(800);
            try { await page.waitForLoadState('networkidle', { timeout: 2000 }); } catch {}

            const suggestions = await page.evaluate(() => {
              const SUGGESTION_SELECTORS = [
                '[role="listbox"] [role="option"]',
                '[role="combobox"] + ul li',
                '.autocomplete-results li',
                '.suggestions li',
                '[class*="suggestion"] li',
                '[class*="autocomplete"] li',
                '[class*="dropdown"] li',
                '.pac-item', // Google Maps Places
              ];
              for (const sel of SUGGESTION_SELECTORS) {
                const items = Array.from(document.querySelectorAll(sel));
                if (items.length > 0) return items.map(el => el.innerText?.trim()).filter(Boolean).slice(0, 10);
              }
              return [];
            });

            if (suggestions.length > 0) {
              results.push({ query, suggestions });
              await page.keyboard.press('Escape').catch(() => {});
              break; // one successful query per input is enough
            }
          }
        } catch { /* skip */ }
      }
    } catch (err) {
      this.log(`_captureSearchSuggestions error: ${err.message}`, 'warn');
    }
    return results;
  }

  // Build avoidance filter from user-selected tags
  _buildAvoidFilter(tags = []) {
    if (!tags || tags.length === 0) return null;
    const MAP = {
      logout:   { url: /logout|signout|log-out|sign-out/i,   text: /sign[\s-]?out|log[\s-]?out|logout|signout/i },
      cart:     { url: /\/cart|\/checkout|\/basket/i,         text: /\bcart\b|checkout|basket|shopping\s+bag|buy\s+now/i },
      delete:   { url: /\/delete|\/deactivate|\/remove-account|\/close-account/i, text: /delete\s+(my\s+)?account|remove\s+account|deactivate|close\s+account/i },
      register: { url: /\/signup|\/register|\/join|\/create-account/i, text: /sign[\s-]?up|register|create\s+(an?\s+)?account|\bjoin\b/i },
      print:    { url: /\/print|print=/i,                     text: /\bprint\b|print\s+page|export\s+pdf/i },
      social:   { url: /facebook\.com|twitter\.com|instagram\.com|linkedin\.com|pinterest\.com|tiktok\.com|youtube\.com/i, text: /share\s+on|follow\s+(us|me)|tweet\s+this/i },
      legal:    { url: /\/privacy|\/terms|\/cookies|\/legal|\/disclaimer|\/accessibility/i, text: /privacy\s+policy|terms\s+(of\s+(service|use))?|cookie\s+policy|legal\s+notice|disclaimer/i },
      external: null, // handled separately
    };
    const patterns = tags.map(t => MAP[t]).filter(Boolean);
    const includeExternal = tags.includes('external');
    return { patterns, includeExternal };
  }

  _isAvoidedLink(link, filter, pageOrigin) {
    if (!filter) return false;
    const href = (link.href || '').toLowerCase();
    const text = (link.text || '').trim();
    if (filter.includeExternal && pageOrigin) {
      try { if (new URL(link.href).origin !== pageOrigin) return true; } catch {}
    }
    for (const p of filter.patterns) {
      if (p.url.test(href) || p.text.test(text)) return true;
    }
    return false;
  }

  // Download images as base64 (up to N images, capped by size)
  async _downloadImages(page, images, maxImages = Infinity, maxSizeKB = 500) {
    const downloaded = [];
    const toFetch = images.filter(img => img.src && !img.src.startsWith('data:')).slice(0, maxImages);
    for (const img of toFetch) {
      try {
        const result = await page.evaluate(async ({ src, maxBytes }) => {
          try {
            const resp = await fetch(src, { mode: 'no-cors' });
            if (!resp.ok && resp.type !== 'opaque') return null;
            const buf = await resp.arrayBuffer();
            if (buf.byteLength > maxBytes) return { src, tooLarge: true, size: buf.byteLength };
            const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
            return { src, data: b64, size: buf.byteLength, type: resp.headers.get('content-type') || 'image/jpeg' };
          } catch { return null; }
        }, { src: img.src, maxBytes: maxSizeKB * 1024 });

        if (result && result.data) {
          downloaded.push({
            src: result.src,
            dataUrl: `data:${result.type};base64,${result.data}`,
            size: result.size,
            width: img.width,
            height: img.height,
            alt: img.alt,
          });
        }
      } catch {}
    }
    return downloaded;
  }

  async run(options) {
    // --- Credential Extraction & Bypass Logic ---
    // 1. Attempt to scrape credentials from the login page (e.g., visible hints, comments, JS variables)
    // 2. Try default/common credentials if scraping fails
    // 3. Optionally brute force if allowed by config
    // 4. Save any discovered credentials for future use
    // 5. Only use Playwright for visualization after successful login/bypass

    // Helper: Try to extract credentials from visible page content
    async function extractCredentialsFromPage(page) {
      // Look for username/password in visible text, comments, or JS variables
      const creds = await page.evaluate(() => {
        // Visible hints
        const hints = Array.from(document.querySelectorAll('p, .info, .hint, code, pre')).map(e => e.textContent);
        const joined = hints.join('\n');
        // Regex for username/password patterns
        const userMatch = joined.match(/([\w.-]+)\s*\/\s*([\w.-]+)/);
        if (userMatch) {
          return { username: userMatch[1], password: userMatch[2] };
        }
        // Look for JS variables (window, inline scripts)
        const scripts = Array.from(document.scripts).map(s => s.textContent).join('\n');
        const jsMatch = scripts.match(/([\w.-]+)\s*[:=]\s*['\"]([\w.-]+)['\"]/);
        if (jsMatch) {
          return { username: jsMatch[1], password: jsMatch[2] };
        }
        return null;
      });
      return creds;
    }

    // Helper: Try default/common credentials
    async function tryDefaultCredentials(page, loginHandler) {
      const commonCreds = [
        { username: 'admin', password: 'admin' },
        { username: 'admin', password: 'password' },
        { username: 'user', password: 'user' },
        { username: 'test', password: 'test' },
        { username: 'vendor_a', password: 'password123' },
        { username: 'vendor_b', password: 'password456' },
      ];
      for (const creds of commonCreds) {
        try {
          await loginHandler(page, creds.username, creds.password);
          // Check if login succeeded (not on login page)
          if (!/login|signin|sign-in|auth/i.test(page.url())) {
            return creds;
          }
        } catch {}
      }
      return null;
    }

    // Helper: Brute force (if allowed)
    async function bruteForceCredentials(page, loginHandler, bruteList) {
      for (const creds of bruteList) {
        try {
          await loginHandler(page, creds.username, creds.password);
          if (!/login|signin|sign-in|auth/i.test(page.url())) {
            return creds;
          }
        } catch {}
      }
      return null;
    }

    // Helper: Perform login using the page and credentials
    async function loginHandler(page, username, password) {
      // Try to fill username/password fields and submit
      await page.fill('#username', username);
      await page.fill('#password', password);
      const btn = await page.$('button[type="submit"],button');
      if (btn) await btn.click();
      await page.waitForTimeout(1200);
    }

    // --- End helpers ---
    const {
      url,
      urls,
      hasAuth,
      username,
      password,
      verificationType,
      verificationCode,
      scrapeDepth,
      avoidTags,
      capturePageUrls,
      captureGraphQL,
      captureREST,
      captureAssets,
      captureAllRequests,
      captureIframeAPIs,
      captureSSE,
      captureBeacons,
      captureBinaryResponses,
      captureServiceWorkers,
      bypassServiceWorkers,
      captureImages,
      imageLimit,
      autoScroll,
      captureDropdowns,
      captureScreenshots,
      captureSpeed,
      workerCount,
      politeDelay,
      clickSequence,
      liveView,
      slowMotion,
      fullCrawl,
      maxPages,
      saveId,
      resumeFrom,
      proxy,
      uiVisible,
      initiatedBy,
      totpSecret,
      ssoProvider,
      useTor,
      redisDedupe,
      captureModals,
      captureAccordions,
      captureInfiniteScroll,
      infiniteScrollSteps,
      captureSearchSuggestions,
      capturePagination,
      maxPaginationPages,
    } = options;

    this._captureScreenshots = captureScreenshots || false;
    this._politeDelay = parseInt(politeDelay, 10) || 0;
    this._useTor = !!useTor;
    this._redisDedupe = !!redisDedupe;
    this._options = options;

    const targetUrls = urls && urls.length > 0 ? urls : (url ? [url] : []);
    if (targetUrls.length === 0) throw new Error('No URL(s) provided');

    const primaryUrl = targetUrls[0];
    this._partialPageCount = 0;
    this._setStatus(SCRAPE_STATES.RUNNING, {
      targetUrl: primaryUrl,
      startedAt: nowIso(),
      step: 'Preparing scrape',
      percent: 0,
      visited: 0,
      total: Number.isFinite(maxPages) && maxPages > 0 ? maxPages : null,
      queued: 0,
      needsAuth: false,
      needsVerification: false,
      lastError: null,
      partialPageCount: 0,
    });

    // ── Autosave / resume setup ──────────────────────────────────────────────
    this._saveId = saveId || null;
    this._saveStartUrl = primaryUrl;
    this._saveStartedAt = new Date().toISOString();
    this._saveUiVisible = uiVisible !== false;
    this._saveInitiatedBy = typeof initiatedBy === 'string' && initiatedBy.trim()
      ? initiatedBy.trim()
      : (this._saveUiVisible ? 'ui' : 'mcp');
    this._saveOptions = {
      url: primaryUrl,
      maxPages,
      workerCount,
      captureSpeed,
      fullCrawl,
      autoScroll,
      politeDelay: politeDelay || 0,
      captureGraphQL,
      captureREST,
      captureAssets,
      captureAllRequests,
    };
    this._savePages = null;
    this._saveVisited = null;
    this._saveWorkers = null;

    // Load resume data if continuing from a previous save
    let resumeData = null;
    if (resumeFrom) {
      try {
        const savePath = path.join(SAVES_DIR, `${resumeFrom}.json`);
        if (fs.existsSync(savePath)) {
          resumeData = JSON.parse(fs.readFileSync(savePath, 'utf8'));
          this._partialPageCount = resumeData.pages?.length || 0;
          this._setStatus(null, {
            partialPageCount: this._partialPageCount,
            visited: resumeData.visitedUrls?.length || 0,
            failed: resumeData.failedPages?.length || 0,
          });
          this.log(`Resuming save ${resumeFrom}: ${resumeData.pages?.length || 0} pages already captured`, 'info');
          this.graphqlCalls.push(...(resumeData.apiCalls?.graphql || []));
          this.restCalls.push(...(resumeData.apiCalls?.rest || []));
          this.assets.push(...(resumeData.assets || []));
          this.failedPages.push(...(resumeData.failedPages || []));
        }
      } catch (err) {
        this.log(`Could not load resume data: ${err.message}`, 'warn');
      }
    }

    // Write initial save immediately so the session appears in the saves list
    if (saveId) this._writeAutosave('running');

    // Load remembered SPA-only routes for this domain
    this._spaRoutes = loadSpaRoutes(primaryUrl);
    this.log(`Starting scrape of ${primaryUrl}`);
    this.progress('Launching browser', 5);

    this.log('Launching browser...');

    // Support PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH env var (used when bundled browser version differs)
    const launchOpts = {
      headless: true,
      slowMo: slowMotion ? parseInt(slowMotion) : 0,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-features=VizDisplayCompositor',
      ],
    };
    if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
      launchOpts.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    }
    // Pass system proxy to the browser if configured (e.g. in sandboxed/containerised environments)
    const _proxyEnv = process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.HTTP_PROXY;
    if (_proxyEnv) {
      try {
        const _proxyRaw = _proxyEnv.replace(/^https?:\/\//, '');
        const _atIdx = _proxyRaw.lastIndexOf('@');
        if (_atIdx > 0) {
          const _server = 'http://' + _proxyRaw.substring(_atIdx + 1);
          const _userpass = _proxyRaw.substring(0, _atIdx);
          const _ci = _userpass.indexOf(':');
          launchOpts.proxy = {
            server: _server,
            username: _userpass.substring(0, _ci),
            password: _userpass.substring(_ci + 1),
          };
        } else {
          launchOpts.proxy = { server: 'http://' + _proxyRaw };
        }
      } catch {}
    }
    // Per-scrape proxy (takes precedence over env var proxy)
    if (proxy && proxy.server) {
      launchOpts.proxy = { server: proxy.server };
      if (proxy.username) launchOpts.proxy.username = proxy.username;
      if (proxy.password) launchOpts.proxy.password = proxy.password;
    }
    // Tor SOCKS5 — lowest precedence (env proxy and per-scrape proxy override it)
    if (this._useTor && !launchOpts.proxy) {
      if (await torManager.isAvailable()) {
        launchOpts.proxy = torManager.getProxyConfig();
        this.log(`Tor SOCKS5 proxy active (${torManager.address}) — traffic routed through Tor`, 'info');
      } else {
        this.log(`useTor requested but Tor SOCKS5 is not reachable at ${torManager.address} — continuing without proxy`, 'warn');
      }
    }
    this.browser = await chromium.launch(launchOpts);

    // Pick a random UA and viewport for this session
    const _sessionUA = _randomUA();
    const _sessionViewport = _randomViewport();

    let allResults = [];
    try {
      const savedSession = loadSession(primaryUrl);
      if (savedSession) this.log('Restoring saved session state...', 'info');

      const context = await this.browser.newContext({
        userAgent: _sessionUA,
        viewport: _sessionViewport,
        ignoreHTTPSErrors: true,
        ...(savedSession ? { storageState: savedSession } : {}),
      });
      this.context = context;

      const page = await context.newPage();

      // ── Stealth: canvas/WebGL/hardware fingerprint noise ─────────────────
      // Runs before any page script — spoofs headless-detectable APIs
      await page.addInitScript(() => {
        // 1. Canvas — subtle per-session pixel noise defeats canvas fingerprinting
        try {
          const _origGID = CanvasRenderingContext2D.prototype.getImageData;
          CanvasRenderingContext2D.prototype.getImageData = function(x, y, w, h) {
            const img = _origGID.call(this, x, y, w, h);
            for (let i = 0; i < img.data.length; i += 4) {
              if (Math.random() < 0.05) { img.data[i] ^= 1; }       // R
              if (Math.random() < 0.05) { img.data[i + 1] ^= 1; }   // G
            }
            return img;
          };
        } catch {}

        // 2. WebGL — replace headless renderer string with real Intel GPU string
        const _wglVendor   = 'Google Inc. (Intel)';
        const _wglRenderer = 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11-27.20.100.8681)';
        function _patchWebGL(ctor) {
          try {
            const _orig = ctor.prototype.getParameter;
            ctor.prototype.getParameter = function(p) {
              if (p === 37445) return _wglVendor;    // UNMASKED_VENDOR_WEBGL
              if (p === 37446) return _wglRenderer;  // UNMASKED_RENDERER_WEBGL
              return _orig.call(this, p);
            };
          } catch {}
        }
        _patchWebGL(WebGLRenderingContext);
        try { _patchWebGL(WebGL2RenderingContext); } catch {}

        // 3. Hardware concurrency — headless default is 2; pick realistic value
        const _hwConc = [4, 8, 8, 12, 16][Math.floor(Math.random() * 5)];
        try { Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => _hwConc }); } catch {}

        // 4. Device memory — Chromium headless can expose unusual values
        const _devMem = [4, 8, 8, 16][Math.floor(Math.random() * 4)];
        try { Object.defineProperty(navigator, 'deviceMemory', { get: () => _devMem }); } catch {}

        // 5. Hide the automation driver property (belt-and-suspenders alongside stealth plugin)
        try { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); } catch {}
      });

      // Native dialog dismissal only (alert/confirm/prompt boxes)
      page.on('dialog', async (dialog) => { try { await dialog.dismiss(); } catch {} });

      // ── Live screenshot stream ────────────────────────────────────────────
      if (liveView !== false) this._startLiveStream(page);

      const captureOptions = { captureGraphQL, captureREST, captureAssets, captureAllRequests, captureIframeAPIs, captureSSE, captureBeacons, captureBinaryResponses, captureImages, imageLimit, captureScreenshots: captureScreenshots || false };

      // ── Request/Response/Console/Error interception ──────────────────────
      await this._setupPageCapture(page, this, captureOptions);

      // ── Navigate ─────────────────────────────────────────────────────────
      this.progress('Navigating to page', 15);
      this.log(`Navigating to ${primaryUrl}`);
      try {
        await page.goto(primaryUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      } catch (navErr) {
        const isNetworkErr = /ERR_INVALID_AUTH_CREDENTIALS|ERR_PROXY|ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_REFUSED|ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|context or browser has been closed|browser has been closed|Target closed/i.test(navErr.message);
        if (isNetworkErr) {
          this.log('Playwright navigation blocked (proxy/network). Switching to static HTTP fallback...', 'warn');
          await this.browser.close().catch(() => {});
          this.browser = null;
          const pageData = await this._staticScrape(primaryUrl);
          this._partialPageCount = 1;
          this._setStatus(null, { partialPageCount: this._partialPageCount });
          this.progress('Done (static fallback)', 100);
          this.log('Static scrape complete.', 'success');
          const result = {
            meta: {
              scrapedAt: new Date().toISOString(),
              targetUrl: primaryUrl,
              totalPages: 1,
              totalGraphQLCalls: 0,
              totalRESTCalls: 0,
              totalAllRequests: 0,
              totalAssets: 0,
              totalWebSockets: 0,
              totalImages: pageData.images?.length || 0,
              totalDownloadedImages: 0,
              totalConsoleLogs: 0,
              totalErrors: 0,
              _scrapeMode: 'static-fallback',
            },
            siteInfo: { title: pageData.meta?.title || primaryUrl, origin: primaryUrl, hasLoginForm: false },
            pages: [pageData],
            apiCalls: { graphql: [], rest: [], all: [] },
            assets: [],
            downloadedImages: [],
            websockets: [],
            cookies: [],
            securityHeaders: pageData._responseHeaders || {},
            consoleLogs: [],
            errors: [],
          };
          this.markComplete(result);
          return result;
        }
        throw navErr;
      }

      // ── Detect site info ─────────────────────────────────────────────────
      this.progress('Detecting site info', 22);
      const siteInfo = await this._detectSiteInfo(page, primaryUrl);
      this.log(`Site detected: ${siteInfo.title}`);
      this.broadcast(this.sessionId, { type: 'siteInfo', data: siteInfo });

      // ── Authentication ───────────────────────────────────────────────────
      // If saved session was loaded and we're no longer on the login page — already logged in
      const currentUrl = page.url();
      const stillOnLoginPage = siteInfo.hasLoginForm &&
        /login|signin|sign-in|auth/i.test(currentUrl);

      if (savedSession && !stillOnLoginPage) {
        this.log('Session restored — already logged in, skipping auth.', 'success');
      } else if (siteInfo.hasLoginForm) {
        let authUser = username;
        let authPass = password;
        let credsFound = false;

        // 1. Try scraping credentials from the page
        if (!authUser || !authPass) {
          const scraped = await extractCredentialsFromPage(page);
          if (scraped) {
            authUser = scraped.username;
            authPass = scraped.password;
            credsFound = true;
            this.log('Credentials scraped from page.', 'info');
          }
        }

        // 2. Try default/common credentials
        if ((!authUser || !authPass) && !credsFound) {
          const tried = await tryDefaultCredentials(page, loginHandler);
          if (tried) {
            authUser = tried.username;
            authPass = tried.password;
            credsFound = true;
            this.log('Default/common credentials worked.', 'info');
          }
        }

        // 3. Brute force (if allowed by config)
        if ((!authUser || !authPass) && !credsFound && options.allowBruteForce) {
          const bruteList = options.bruteList || [];
          const brute = await bruteForceCredentials(page, loginHandler, bruteList);
          if (brute) {
            authUser = brute.username;
            authPass = brute.password;
            credsFound = true;
            this.log('Brute force credentials worked.', 'info');
          }
        }

        // 4. Fallback: try locally saved credentials
        if ((!authUser || !authPass) && !credsFound) {
          const saved = loadSavedCreds(primaryUrl);
          if (saved) {
            authUser = saved.username;
            authPass = saved.password;
            credsFound = true;
            this.log('Using saved credentials.', 'info');
          }
        }

        // 5. Last resort: prompt user via live view
        if ((!authUser || !authPass) && !credsFound) {
          this.log('Login form detected — waiting for credentials...', 'warn');
          this.progress('Waiting for credentials', 28);
          const creds = await this.waitForCredentials();
          if (creds) {
            authUser = creds.username; authPass = creds.password;
            saveCreds(primaryUrl, authUser, authPass); // save for next time
            credsFound = true;
          } else this.log('No credentials provided — scraping public page only.', 'warn');
        } else if (authUser && authPass) {
          this.log('Login form detected — authenticating automatically.', 'info');
        }

        if (authUser && authPass) {
          this.progress('Authenticating', 32);
          this.log(`Logging in as ${authUser}...`);
          try {
            await handleAuth(page, {
              username: authUser,
              password: authPass,
              verificationCode,
              totpSecret: totpSecret || null,
              ssoProvider: ssoProvider || null,
              context: this.context,
              waitForVerification: this.waitForVerification.bind(this),
              log: this.log.bind(this),
            });
          } catch (authErr) {
            this.log(`Auth error: ${authErr.message}`, 'error');
          }
          this.log(`After auth — current URL: ${page.url()}`);
          await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
          await page.waitForTimeout(500);
          this.log(`Settled URL: ${page.url()}`);
          // Dismiss any post-login notification/permission popups (wait up to 5s for slow modals)
          await this._dismissPopups(page, 2500);
          this.log('Authentication complete', 'success');

          // Save session keyed to the post-login URL (may differ from login URL)
          const postLoginUrl = page.url();
          const sessionUrl = postLoginUrl.startsWith('http') ? postLoginUrl : primaryUrl;
          try {
            const file = sessionFile(sessionUrl);
            if (file) {
              await context.storageState({ path: file });
              // Also save under the original login URL so it's found next time
              const loginFile = sessionFile(primaryUrl);
              if (loginFile && loginFile !== file) await context.storageState({ path: loginFile });
              this.savedSession = file;
              this.log(`Session saved (${new URL(sessionUrl).hostname}) — future scrapes will skip login`, 'success');
              this.broadcast(this.sessionId, { type: 'sessionSaved', hostname: new URL(sessionUrl).hostname });
            }
          } catch {}
        }
      } else {
        this.log('No login form detected — proceeding without authentication.');
      }

      // Always capture cookies
      try { this.cookies = await context.cookies(); } catch {}

      // ── Click sequence ───────────────────────────────────────────────────
      if (clickSequence && clickSequence.length > 0) {
        this.progress('Executing click sequence', 38);
        for (const step of clickSequence) {
          try {
            await page.click(step.selector, { timeout: 5000 });
            if (step.waitFor) await page.waitForSelector(step.waitFor, { timeout: 5000 }).catch(() => {});
            else await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
            this.log(`Clicked: ${step.selector}`);
          } catch (err) {
            this.log(`Click failed on ${step.selector}: ${err.message}`, 'warn');
          }
        }
      }

      // ── Auto scroll ──────────────────────────────────────────────────────
      if (autoScroll) {
        this.progress('Scrolling page (loading lazy content)', 42);
        this.log('Auto-scrolling to trigger lazy loads...');
        await this._autoScroll(page);
        await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
      }

      // ── Infinite scroll capture ──────────────────────────────────────────
      if (captureInfiniteScroll) {
        this.progress('Capturing infinite scroll steps', 44);
        this.infiniteScrollCaptures = await this._captureInfiniteScroll(page, { infiniteScrollSteps });
        this.log(`Infinite scroll: captured ${this.infiniteScrollCaptures.length} step(s)`);
        // Scroll back to top after capture
        await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
        await page.waitForTimeout(500);
      }

      // ── Modal content capture ────────────────────────────────────────────
      if (captureModals) {
        this.progress('Capturing modal/dialog content', 45);
        this.capturedModals = await this._captureModals(page);
        this.log(`Modals: captured ${this.capturedModals.length} modal(s)`);
      }

      // ── Accordion / tab capture ───────────────────────────────────────────
      if (captureAccordions) {
        this.progress('Capturing accordion/tab content', 46);
        this.capturedAccordions = await this._captureAccordions(page);
        this.log(`Accordions: captured ${this.capturedAccordions.length} accordion(s)`);
      }

      // ── Search suggestion capture ─────────────────────────────────────────
      if (captureSearchSuggestions) {
        this.progress('Capturing search suggestions', 47);
        this.capturedSearchSuggestions = await this._captureSearchSuggestions(page);
        this.log(`Search suggestions: captured ${this.capturedSearchSuggestions.length} query result(s)`);
      }

      // ── Scrape pages ─────────────────────────────────────────────────────
      // Use current page URL as crawl start (may differ from primaryUrl after auth redirect)
      const crawlStartUrl = page.url().startsWith('http') ? page.url() : primaryUrl;
      if (crawlStartUrl !== primaryUrl) this.log(`Scraping from post-auth URL: ${crawlStartUrl}`);

      this.progress('Extracting page data', 50);
      const avoidFilter = this._buildAvoidFilter(avoidTags);

      if (targetUrls.length > 1) {
        for (let i = 0; i < targetUrls.length; i++) {
          if (this.stopped) break;
          this.progress(`Batch: scraping ${i + 1}/${targetUrls.length}`, 50 + Math.floor((i / targetUrls.length) * 30));
          try {
            await page.goto(targetUrls[i], { waitUntil: 'domcontentloaded', timeout: 60000 });
            if (autoScroll) await this._autoScroll(page);
            const visited = new Set();
            allResults.push(...await this._scrapePage(page, targetUrls[i], scrapeDepth || 1, visited, autoScroll, Infinity, null, captureDropdowns));
          } catch (err) {
            this.errors.push({ type: 'batchError', url: targetUrls[i], message: err.message });
          }
        }
      } else if (fullCrawl) {
        // workerCount overrides speed preset; speed preset maps 1→1, 2→4, 3→8, 4→20, 5→40
        const SPEED_WORKERS = { 1: 1, 2: 4, 3: 8, 4: 20, 5: 40 };
        const numWorkers = (workerCount > 0 ? Math.min(parseInt(workerCount), 100) : null)
          ?? (SPEED_WORKERS[captureSpeed] || 1);
        if (numWorkers > 1) {
          allResults = await this._fullCrawlParallel(
            crawlStartUrl, maxPages > 0 ? maxPages : Infinity,
            numWorkers, captureOptions, autoScroll, avoidFilter, captureDropdowns, resumeData
          );
        } else {
          allResults = await this._fullCrawl(page, crawlStartUrl, maxPages > 0 ? maxPages : Infinity, autoScroll, avoidFilter, captureDropdowns, resumeData);
        }
      } else {
        const visited = new Set();
        const pageLimit = maxPages > 0 ? maxPages : Infinity;
        allResults = await this._scrapePage(
          page,
          crawlStartUrl,
          scrapeDepth || 1,
          visited,
          autoScroll,
          pageLimit,
          avoidFilter,
          captureDropdowns
        );
        if (allResults.length >= pageLimit) {
          this.log(`Page limit reached (${pageLimit} pages).`, 'warn');
        }
      }

      // ── Service Worker detection / bypass ────────────────────────────────
      if (captureServiceWorkers || bypassServiceWorkers) {
        this.progress('Checking service workers', 78);
        const swList = await this._detectServiceWorkers(page);
        if (swList.length > 0) {
          this.serviceWorkers.push(...swList);
          this.log(`Service workers detected: ${swList.map(s => s.scope).join(', ')}`, 'warn');
          if (bypassServiceWorkers) {
            this.log('Bypassing service workers and re-scraping...', 'info');
            await this._bypassServiceWorkers(page);
            // Re-scrape with SW gone so network calls are now visible
            const bypassVisited = new Set();
            const bypassResults = await this._scrapePage(page, page.url(), scrapeDepth || 1, bypassVisited, autoScroll, Infinity, null, captureDropdowns);
            // Merge — prefer SW-bypassed results
            if (bypassResults.length > 0) allResults = bypassResults;
          }
        } else {
          this.log('No service workers detected.', 'info');
        }
      }

      // ── Flush SSE events collected by the EventSource patcher ────────────
      if (captureSSE) {
        await this._flushSSECaptures(page, this.sseCalls);
        if (this.sseCalls.length > 0) {
          this.log(`SSE streams captured: ${this.sseCalls.length} connection(s), ${this.sseCalls.reduce((n, s) => n + s.events.length, 0)} total events`, 'info');
        }
      }

      // ── Flush injected capture buffers (CSP violations, WebRTC, device APIs) ──
      await this._flushInjectedCaptures(page);

      // ── Download images as base64 ────────────────────────────────────────
      if (captureImages && allResults.length > 0) {
        this.progress('Downloading images', 80);
        const imgMax = (imageLimit === 0 || imageLimit === undefined) ? Infinity : imageLimit;
        this.log(`Downloading images as base64${imgMax === Infinity ? ' (unlimited)' : ` (first ${imgMax})`}...`);
        const firstPageImages = allResults[0]?.images || [];
        this.downloadedImages = await this._downloadImages(page, firstPageImages, imgMax);
        this.log(`Downloaded ${this.downloadedImages.length} images`);
      }

      // ── GraphQL introspection ────────────────────────────────────────────
      const gqlEndpoint = this._detectGraphQLEndpoint();
      if (gqlEndpoint) {
        this.log(`Attempting GraphQL introspection on ${gqlEndpoint}`, 'graphql');
        try {
          const introspResult = await page.evaluate(async (endpoint) => {
            const r = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                query: `{
                  __schema {
                    queryType { name }
                    mutationType { name }
                    types {
                      name kind description
                      fields { name description type { name kind ofType { name kind } } }
                    }
                  }
                }`,
              }),
            });
            return r.json();
          }, gqlEndpoint);

          this.graphqlCalls.unshift({
            url: gqlEndpoint, method: 'POST', headers: {},
            body: { query: '__schema introspection' },
            timestamp: new Date().toISOString(),
            response: { status: 200, body: introspResult },
            _introspection: true,
          });
          this.log('GraphQL introspection complete', 'graphql');
        } catch (err) {
          this.log(`GraphQL introspection failed: ${err.message}`, 'warn');
        }
      }

      this.progress('Formatting results', 90);

      // Attach console logs to first page
      if (allResults.length > 0) {
        allResults[0].consoleLogs = this.consoleLogs;
      }

      const result = {
        meta: {
          scrapedAt: new Date().toISOString(),
          targetUrl: primaryUrl,
          targetUrls: targetUrls.length > 1 ? targetUrls : undefined,
          totalPages: allResults.length,
          totalGraphQLCalls: this.graphqlCalls.length,
          totalRESTCalls: this.restCalls.length,
          totalAllRequests: this.allRequests.length,
          totalSSEStreams: this.sseCalls.length,
          totalSSEEvents: this.sseCalls.reduce((n, s) => n + (s.events?.length || 0), 0),
          totalBeaconCalls: this.beaconCalls.length,
          totalBinaryResponses: this.binaryResponses.length,
          totalServiceWorkers: this.serviceWorkers.length,
          totalAssets: this.assets.length,
          totalWebSockets: this.websockets.length,
          totalImages: (allResults[0]?.images?.length || 0),
          totalDownloadedImages: this.downloadedImages.length,
          totalConsoleLogs: this.consoleLogs.length,
          totalErrors: this.errors.length,
          totalAuthRedirects: this.authRedirectedPages.length,
          totalFailedPages: this.failedPages.length,
        },
        siteInfo,
        visitedUrls: capturePageUrls !== false ? allResults.map(p => p.meta?.url).filter(Boolean) : [],
        authRedirectedPages: this.authRedirectedPages,
        failedPages: this.failedPages,
        pages: allResults,
        apiCalls: {
          graphql: this.graphqlCalls,
          rest: this.restCalls,
          all: captureAllRequests ? this.allRequests : [],
          sse: this.sseCalls,
          beacons: this.beaconCalls,
          binary: this.binaryResponses,
        },
        serviceWorkers: this.serviceWorkers,
        assets: this.assets,
        downloadedImages: this.downloadedImages,
        websockets: this.websockets,
        cookies: this.cookies.map(c => ({
          name: c.name,
          value: c.name.toLowerCase().includes('token') || c.name.toLowerCase().includes('session') || c.name.toLowerCase().includes('auth')
            ? '[REDACTED]' : c.value?.substring(0, 200),
          domain: c.domain,
          path: c.path,
          expires: c.expires,
          httpOnly: c.httpOnly,
          secure: c.secure,
          sameSite: c.sameSite,
        })),
        securityHeaders: this.securityHeaders,
        consoleLogs: this.consoleLogs,
        errors: this.errors,
      };

      this.progress('Done', 100);
      this.log('Scraping complete!', 'success');
      this.markComplete(result);
      return result;

    } finally {
      if (this.stopped) {
        this.markStopped();
      }
      // Always write a final save — even if stop() closed the browser mid-crawl
      if (this._saveId) {
        this._savePages = allResults;
        this._writeAutosave(this.stopped ? 'stopped' : 'complete');
      }
      this._stopLiveStream();
      await closeBrowserSafely(this.browser);
      this.browser = null;
    }
  }

  async _scrapePage(page, url, depth, visited, autoScroll = false, maxPages = Infinity, avoidFilter = null, captureDropdowns = false) {
    if (visited.has(url) || this.stopped || visited.size >= maxPages) return [];
    visited.add(url);
    this.log(`Extracting (${visited.size}${maxPages !== Infinity ? `/${maxPages}` : ''}): ${url}`);
    // Update progress header with live counts
    {
      const done = visited.size;
      const pathname = (() => { try { return new URL(url).pathname || '/'; } catch { return url; } })();
      const pct = maxPages !== Infinity
        ? Math.min(99, Math.round(50 + (done / maxPages) * 49))
        : Math.min(75, 50 + done);
      this.progress(`Crawling ${pathname}`, pct, { visited: done, total: maxPages !== Infinity ? maxPages : done, queued: 0, failed: this.failedPages.length });
    }

    const origin = (() => { try { return new URL(url).origin; } catch { return ''; } })();

    // Check if the page is currently on a login redirect (first call after auth)
    if (this._isLoginRedirect(page.url(), url, origin)) {
      this.log(`Current page is a login redirect for ${url} — re-authenticating...`, 'warn');
      if (!this.authRedirectedPages.includes(url)) this.authRedirectedPages.push(url);
      const ok = await this._reAuthenticate(page, url);
      if (!ok) {
        this.failedPages.push({ url, reason: 'auth-redirect' });
        return [];
      }
    }

    if (autoScroll && depth >= 1) await this._autoScroll(page);
    const pageData = await extractPageData(page, url, { captureScreenshots: this._captureScreenshots, lightMode: true });
    const results = [pageData];

    // Always interact with dropdowns — captures new data exposed by each selection
    const dropdownResults = await this._interactDropdowns(page, url);
    results.push(...dropdownResults);
    this._incrementPartialPageCount(results.length);

    // ── IFRAME CONTENT ────────────────────────────────────────────────────────
    try {
      const childFrames = page.frames().filter(f =>
        f !== page.mainFrame() &&
        f.url() &&
        !f.url().startsWith('about:') &&
        !f.url().startsWith('data:')
      );
      if (childFrames.length > 0) {
        const iframeContents = [];
        for (const frame of childFrames.slice(0, 10)) {
          try {
            const content = await frame.evaluate(() => ({
              url: window.location.href,
              title: document.title,
              text: document.body?.innerText?.trim().substring(0, 2000) || '',
              links: Array.from(document.querySelectorAll('a[href]')).slice(0, 20).map(a => ({
                href: a.href,
                text: a.innerText.trim().substring(0, 100),
              })),
              hasForm: document.forms.length > 0,
              inputCount: document.querySelectorAll('input').length,
            }));
            if (content) iframeContents.push({ frameUrl: frame.url(), ...content });
          } catch { /* cross-origin frame — skip */ }
        }
        if (iframeContents.length > 0) pageData.iframeContents = iframeContents;
      }
    } catch { /* frame API unavailable — skip */ }

    if (depth > 1) {
      const links = (pageData.links || [])
        .filter(l => l.isInternal && !visited.has(l.href) && l.href?.startsWith('http'))
        .filter(l => !this._isAvoidedLink(l, avoidFilter, origin))
        .filter(l => !/\/login|\/signin|\/sign-in\b/i.test(l.href))  // skip login page links
        .slice(0, 8);

      for (const link of links) {
        await this._checkPause();
        if (this.stopped || visited.size >= maxPages) break;
        const nav = await this._navigateWithRetry(page, link.href, origin, url); // url = current page = referrer
        if (!nav.success) continue;
        if (autoScroll) await this._autoScroll(page);
        results.push(...await this._scrapePage(page, link.href, depth - 1, visited, autoScroll, maxPages, avoidFilter, captureDropdowns));
      }
    }
    return results;
  }

  // BFS full-site crawl — visits every reachable internal link, ordered by path depth
  async _fullCrawl(page, startUrl, maxPages = 100, autoScroll = false, avoidFilter = null, captureDropdowns = false, resumeData = null) {
    const origin = new URL(startUrl).origin;
    this._crawlStartUrl = startUrl;
    const visited = new Set();
    // Priority queue sorted by URL path depth (shallow first)
    const queue = [startUrl];
    const queued = new Set([startUrl]);
    const results = [];

    // Pre-populate from resume data (skip already-visited URLs)
    if (resumeData) {
      const norm = (u) => u.split('#')[0].replace(/\/$/, '') || u;
      (resumeData.visitedUrls || []).forEach(u => { const n = norm(u); visited.add(n); queued.add(n); });
      results.push(...(resumeData.pages || []));
      this._partialPageCount = results.length;
      this._setStatus(null, { partialPageCount: this._partialPageCount });
      this.log(`Resume: loaded ${results.length} pages, skipping ${visited.size} URLs`, 'info');
    }

    // Autosave setup — sequential mode, captures go directly to this.*
    this._savePages = results;
    this._saveVisited = visited;
    this._saveWorkers = null;
    let _saveSize = results.length;
    const saveTimer = this._saveId ? setInterval(() => {
      if (results.length > _saveSize) { _saveSize = results.length; this._writeAutosave('running'); }
    }, 3000) : null;

    const pathDepth = (url) => { try { return new URL(url).pathname.split('/').filter(Boolean).length; } catch { return 0; } };
    const normalize = (url) => url.split('#')[0].replace(/\/$/, '') || url;
    const isSkippable = (url) => /\.(pdf|zip|png|jpg|jpeg|gif|svg|ico|css|js|woff|woff2|ttf|mp4|mp3|xml|json|rss|atom)(\?|$)/i.test(url);
    const getSection = (url) => { try { return new URL(url).pathname.split('/').filter(Boolean)[0] || '(root)'; } catch { return '(root)'; } };

    // Inbound link tracking: url -> count of pages that link to it
    const inboundCount = new Map();
    // Discovery order: url -> position when first queued
    const discoveryOrder = new Map([[normalize(startUrl), 0]]);
    let discoveryCounter = 1;

    const maxLabel = isFinite(maxPages) ? `${maxPages} pages` : 'unlimited';
    this.log(`Full crawl starting from ${startUrl} (${maxLabel})`, 'info');

    while (queue.length > 0 && results.length < maxPages && !this.stopped) {
      await this._checkPause();
      if (this.stopped) break;
      const url = queue.shift();
      const norm = normalize(url);
      if (visited.has(norm)) continue;
      // Cross-session URL dedup — skip pages already scraped in a previous session
      if (this._redisDedupe && redisCache.connected) {
        if (await redisCache.isVisitedCrossSession(new URL(url).hostname, norm)) {
          visited.add(norm); // populate in-memory cache so we don't re-check Redis
          this.log(`[redis] Skipping previously scraped: ${norm}`, 'info');
          continue;
        }
      }
      visited.add(norm);

      const pathname = (() => { try { return new URL(url).pathname || '/'; } catch { return url; } })();
      {
        const done = results.length;
        const inQueue = queue.length;
        const totalDiscovered = done + inQueue;
        this._fcMaxDiscovered = Math.max(this._fcMaxDiscovered || 0, totalDiscovered);
        let pct;
        // Scale to 50-99% so crawl progress never goes backwards from pre-crawl 50%
        if (maxPages !== Infinity) {
          pct = Math.min(99, Math.round(50 + (done / maxPages) * 49));
        } else {
          pct = Math.min(99, Math.round(50 + (done / Math.max(this._fcMaxDiscovered, 1)) * 49));
        }
        const totalLabel = maxPages !== Infinity ? maxPages : totalDiscovered;
        this.progress(
          `Crawling ${pathname}`,
          pct,
          { visited: done, total: totalLabel, queued: inQueue, failed: this.failedPages.length }
        );
      }

      try {
        // Skip navigation if the page is already at this URL (e.g. post-auth dashboard)
        const currentNorm = normalize(page.url());
        if (currentNorm !== normalize(url)) {
          const nav = await this._navigateWithRetry(page, url, origin);
          if (!nav.success) {
            this.log(`Skipping ${pathname} — ${nav.reason}`, 'warn');
            if (nav.reason === 'page-closed') break; // page is gone — stop this crawl
            continue;
          }
          await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
        }

        if (autoScroll) await this._autoScroll(page);
        await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
        const pageData = await extractPageData(page, url, { captureScreenshots: this._captureScreenshots, lightMode: true });

        // Always interact with dropdowns — captures new data exposed by each selection
        const dropdownResults = await this._interactDropdowns(page, url);
        dropdownResults.forEach(dr => {
          dr._crawl = { depth: pathDepth(url), index: results.length + 1, pathname, section: getSection(url), discoveryOrder: 0, parent: null, inboundCount: 0 };
          results.push(dr);
        });
        this._incrementPartialPageCount(dropdownResults.length);

        // Attach crawl metadata to each page
        pageData._crawl = {
          depth: pathDepth(url),
          index: results.length + 1,
          pathname,
          section: getSection(url),
          discoveryOrder: discoveryOrder.get(norm) ?? 0,
          parent: results.length > 0 ? results[results.length - 1].meta?.url : null,
          // inboundCount filled in after full crawl completes
        };

        results.push(pageData);
        this._incrementPartialPageCount();
        // Persist URL in Redis for cross-session dedup (fire-and-forget)
        if (this._redisDedupe) redisCache.markVisitedCrossSession(new URL(url).hostname, norm).catch(() => {});
        // Tor circuit rotation — request a new exit IP every N pages
        if (this._useTor) torManager.tickPage().catch(() => {});
        this.log(`[${results.length}] (depth ${pageData._crawl.depth}) ${pathname}`);

        // Collect new internal links
        const newLinks = (pageData.links || [])
          .map(l => l.href)
          .filter(href => {
            if (!href?.startsWith(origin)) return false;
            if (isSkippable(href)) return false;
            if (/\/login|\/signin|\/sign-in|\/logout|\/signout|\/log-out|\/sign-out/i.test(href)) return false;
            return true;
          });

        // Count inbound links for every internal URL seen (including already-visited)
        newLinks.forEach(href => {
          const n = normalize(href);
          inboundCount.set(n, (inboundCount.get(n) || 0) + 1);
        });

        // O(1) link text lookup for avoid filter
        const linkTextMap = new Map((pageData.links || []).map(l => [l.href, l.text || '']));

        // Only queue unvisited, unqueued, non-avoided, non-login links
        const toQueue = newLinks.filter(href => {
          const n = normalize(href);
          if (visited.has(n) || queued.has(n)) return false;
          if (/\/login|\/signin|\/sign-in\b/i.test(href)) return false;
          if (avoidFilter) {
            const linkText = linkTextMap.get(href) || '';
            if (this._isAvoidedLink({ href, text: linkText }, avoidFilter, origin)) return false;
          }
          return true;
        });

        // Sort new links by depth then binary-insert into already-sorted queue (avoids O(n log n) full re-sort)
        toQueue.sort((a, b) => pathDepth(a) - pathDepth(b));
        toQueue.forEach(href => {
          const n = normalize(href);
          queued.add(n);
          discoveryOrder.set(n, discoveryCounter++);
          const depth = pathDepth(href);
          let lo = 0, hi = queue.length;
          while (lo < hi) { const mid = (lo + hi) >> 1; pathDepth(queue[mid]) <= depth ? lo = mid + 1 : hi = mid; }
          queue.splice(lo, 0, href);
        });

        this.log(`  +${toQueue.length} new links queued (${queue.length} total in queue)`, 'info');

        // Interactive discovery: click tabs, "load more" buttons, and follow pagination
        // to surface links only visible after user interaction
        const interactLinks = await this._discoverViaInteraction(page, url, origin);
        const newInteract = interactLinks.filter(href => {
          const n = normalize(href);
          if (visited.has(n) || queued.has(n)) return false;
          if (isSkippable(href)) return false;
          if (/\/login|\/signin|\/sign-in|\/logout|\/signout|\/log-out|\/sign-out/i.test(href)) return false;
          return true;
        });
        if (newInteract.length > 0) {
          newInteract.sort((a, b) => pathDepth(a) - pathDepth(b));
          newInteract.forEach(href => {
            const n = normalize(href);
            queued.add(n);
            discoveryOrder.set(n, discoveryCounter++);
            const depth = pathDepth(href);
            let lo = 0, hi = queue.length;
            while (lo < hi) { const mid = (lo + hi) >> 1; pathDepth(queue[mid]) <= depth ? lo = mid + 1 : hi = mid; }
            queue.splice(lo, 0, href);
          });
          this.log(`  +${newInteract.length} links via interaction (tabs/pagination/load-more)`, 'info');
        }

        if (this._politeDelay > 0) {
          const _rateDomain = (() => { try { return new URL(url).hostname; } catch { return url; } })();
          await redisCache.enforceDomainRate(_rateDomain, this._politeDelay);
        }
      } catch (err) {
        if (this._isPageClosed(err)) {
          this.log(`Page closed unexpectedly at ${pathname} — stopping crawl.`, 'error');
          break;
        }
        this.errors.push({ type: 'crawlError', url, message: err.message });
        this.log(`  Failed: ${pathname} — ${err.message}`, 'warn');
      }
    }

    // Backfill inbound counts now that the full crawl is done
    results.forEach(p => {
      const norm = normalize(p.meta?.url || '');
      p._crawl.inboundCount = inboundCount.get(norm) || 0;
    });

    if (saveTimer) clearInterval(saveTimer);

    const remaining = queue.length;
    if (results.length >= maxPages && remaining > 0) {
      this.log(`Crawl limit reached (${maxPages} pages). ${remaining} links not visited.`, 'warn');
    } else {
      this.log(`Full crawl complete — all ${results.length} reachable pages visited.`, 'success');
    }

    // Build structured sitemap tree attached to results
    results._siteTree = this._buildSiteTree(results, origin);
    return results;
  }

  // Build a nested tree of pages grouped by URL path segments
  _isLoginRedirect(currentUrl, intendedUrl, origin) {
    if (currentUrl === intendedUrl) return false;
    const loginPattern = /\/(login|signin|sign-in|auth\/login|sso\/login|account\/login)(\?|$)/i;
    // Cross-domain redirect to login (e.g. league.poolplayers.com → accounts.poolplayers.com/login)
    if (!currentUrl.startsWith(origin)) return loginPattern.test(currentUrl);
    // Same-domain redirect to login path
    return /login|signin|sign-in|auth|sso|account\/login/i.test(currentUrl);
  }

  async _restoreSession(page, retryUrl) {
    if (!this.savedSession && !loadSession(retryUrl)) return false;
    try {
      const file = this.savedSession || loadSession(retryUrl);
      const state = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (this.context) {
        await this.context.clearCookies();
        if (state.cookies?.length) await this.context.addCookies(state.cookies);
      }
      // Restore localStorage
      if (state.origins?.length) {
        for (const o of state.origins) {
          for (const item of (o.localStorage || [])) {
            await page.evaluate(([k, v]) => { try { localStorage.setItem(k, v); } catch {} }, [item.name, item.value]);
          }
        }
      }
      await page.goto(retryUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      return !this._isLoginRedirect(page.url(), retryUrl, new URL(retryUrl).origin);
    } catch { return false; }
  }

  // Re-authenticate when a mid-crawl session expires — tries saved session first,
  // then falls back to a full credential-based login
  async _reAuthenticate(page, retryUrl) {
    // 1. Try restoring saved session cookies
    if (await this._restoreSession(page, retryUrl)) {
      this.log('Session cookie restore succeeded', 'info');
      return true;
    }

    // 2. Try full login with saved credentials
    const creds = loadSavedCreds(retryUrl);
    if (!creds?.username || !creds?.password) {
      this.log('No saved credentials — cannot re-authenticate', 'warn');
      return false;
    }

    this.log(`Re-logging in as ${creds.username}...`, 'info');
    try {
      const { handleAuth } = require('./auth');
      // Page is currently on the login page (redirected there), run auth
      await handleAuth(page, {
        username: creds.username,
        password: creds.password,
        verificationCode: null,
        totpSecret: this._options?.totpSecret || null,
        ssoProvider: this._options?.ssoProvider || null,
        context: this.context,
        waitForVerification: this.waitForVerification.bind(this),
        log: this.log.bind(this),
      });
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(500);

      // Save refreshed session
      try {
        const file = sessionFile(retryUrl);
        if (file) {
          await this.context.storageState({ path: file });
          this.savedSession = file;
          this.log('Session re-saved after re-login', 'success');
        }
      } catch {}

      // Navigate back to intended URL
      await page.goto(retryUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const origin = (() => { try { return new URL(retryUrl).origin; } catch { return ''; } })();
      return !this._isLoginRedirect(page.url(), retryUrl, origin);
    } catch (err) {
      this.log(`Re-authentication failed: ${err.message}`, 'error');
      return false;
    }
  }

  // Ensure we are on a page with the SPA framework loaded (not an error page).
  // Uses this._crawlStartUrl (the known-working entry point) instead of bare origin,
  // because many SPAs redirect / or return 504 on the root but work via their main route.
  async _ensureReactPage(page, origin) {
    try {
      const cur = page.url();
      if (cur.startsWith(origin)) return true;
      const target = this._crawlStartUrl || origin;
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      return true;
    } catch { return false; }
  }

  // Click an <a> link on the current page whose href matches the target path.
  // Returns true if the link was found, clicked, and the page updated.
  async _tryClickLink(page, targetUrl) {
    try {
      const targetPath = (() => {
        try { const u = new URL(targetUrl); return u.pathname + u.search + u.hash; }
        catch { return targetUrl; }
      })();
      // Try with and without trailing slash
      const variants = [targetPath, targetPath.endsWith('/') ? targetPath.slice(0, -1) : targetPath + '/'];
      const clicked = await page.evaluate((paths) => {
        for (const p of paths) {
          // Prefer visible links; also check relative hrefs
          const candidates = [
            ...document.querySelectorAll(`a[href="${p}"]`),
            ...document.querySelectorAll(`a[href="${p.replace(/^\//, '')}"]`),
          ];
          for (const a of candidates) {
            // Make sure it's rendered (has a bounding box)
            const rect = a.getBoundingClientRect();
            if (rect.width > 0 || rect.height > 0) {
              a.click();
              return true;
            }
          }
        }
        return false;
      }, variants);

      if (clicked) {
        await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
        return true;
      }
    } catch {}
    return false;
  }

  // SPA navigation: try clicking the link first (most reliable for tab-based SPAs),
  // then fall back to parent-page link click, then pushState as a last resort.
  async _spaNavigate(page, url, origin) {
    try {
      await this._ensureReactPage(page, origin);

      const targetPath = (() => {
        try { const u = new URL(url); return u.pathname + u.search + u.hash; }
        catch { return url; }
      })();

      // ── Strategy 1: click a matching link on the CURRENT page ──────────────
      this.log(`SPA navigate → ${targetPath} (trying link click on current page)`, 'info');
      if (await this._tryClickLink(page, url)) {
        const landed = page.url();
        this.log(`SPA nav (link click, same page) landed: ${landed}`, 'info');
        if (!this._isLoginRedirect(landed, url, origin)) return true;
      }

      // ── Strategy 2: navigate to parent page, click link from there ─────────
      const segments = targetPath.replace(/\/$/, '').split('/').filter(Boolean);
      if (segments.length > 1) {
        const parentPath = '/' + segments.slice(0, -1).join('/') + '/';
        const parentUrl = origin + parentPath;
        this.log(`SPA nav: trying parent ${parentPath} → click to ${targetPath}`, 'info');
        try {
          await page.goto(parentUrl, { waitUntil: 'domcontentloaded', timeout: 8000 });
          await page.waitForTimeout(800);
        } catch {}
        if (await this._tryClickLink(page, url)) {
          const landed = page.url();
          this.log(`SPA nav (link click, parent page) landed: ${landed}`, 'info');
          if (!this._isLoginRedirect(landed, url, origin)) return true;
        }
      }

      // ── Strategy 3: pushState / history API fallback ───────────────────────
      this.log(`SPA nav: falling back to pushState for ${targetPath}`, 'info');
      await page.evaluate((p) => {
        window.history.pushState({}, '', p);
        window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
        window.dispatchEvent(new Event('locationchange'));
      }, targetPath);
      await page.waitForTimeout(1000);
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      const landed = page.url();
      this.log(`SPA nav (pushState) landed: ${landed}`, 'info');
      return !this._isLoginRedirect(landed, url, origin);
    } catch { return false; }
  }

  // Navigate to a URL with SPA pre-check, retry-on-failure, and session recovery
  async _navigateWithRetry(page, url, origin, referrer = null) {
    // ── Pre-check: known SPA route — skip page.goto() entirely ──────────────
    if (isSpaRoute(url, this._spaRoutes)) {
      this.log(`Known SPA route: ${url} — skipping server request`, 'info');
      const ok = await this._spaNavigate(page, url, origin);
      if (ok) return { success: true, spa: true };
      this.log(`SPA navigation failed for known route ${url}`, 'warn');
      this.failedPages.push({ url, reason: 'spa-nav-failed' });
      return { success: false, reason: 'spa-nav-failed' };
    }

    // ── Try clicking a visible link on the current page before doing a full goto ──
    // This handles SPA tab-links (e.g. NEWS/EVENTS/DIVISIONS tabs) that update
    // content client-side and would 504 if loaded directly from the server.
    const _norm = (u) => u.split('#')[0].replace(/\/$/, '') || u;
    if (await this._tryClickLink(page, url)) {
      const landed = page.url();
      if (_norm(landed) === _norm(url) && !this._isLoginRedirect(landed, url, origin)) {
        this.log(`Navigated via link click: ${url}`, 'info');
        return { success: true, clicked: true };
      }
      // URL didn't change (link may have scrolled or done something else) — fall through to goto
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

        // Rate limited (429) — back off and retry
        if (response && response.status() === 429) {
          const retryAfterSec = parseInt(response.headers()['retry-after'] || '8', 10);
          const delayMs = Math.min(Math.max(retryAfterSec * 1000, 3000), 60000);
          this.log(`Rate limited (429) on ${url} — backing off ${delayMs}ms`, 'warn');
          await page.waitForTimeout(delayMs);
          // Try again after back-off (only on first attempt)
          if (attempt === 0) continue;
          this.failedPages.push({ url, reason: 'HTTP 429 rate-limited' });
          return { success: false, reason: 'HTTP 429' };
        }

        // Server returned 5xx — remember it, go back to a React page, then SPA nav
        if (response && response.status() >= 500) {
          this.log(`HTTP ${response.status()} on ${url} — saving as SPA route and retrying...`, 'warn');
          saveSpaRoute(url);
          this._spaRoutes = loadSpaRoutes(url); // refresh in-memory list
          // We're now on the error page (React not loaded) — navigate back first
          await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(async () => {
            await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
          });
          const ok = await this._spaNavigate(page, url, origin);
          if (ok) return { success: true, spa: true };
          this.errors.push({ type: 'serverError', url, status: response.status() });
          this.failedPages.push({ url, reason: `HTTP ${response.status()}` });
          return { success: false, reason: `HTTP ${response.status()}` };
        }

        // Detect mid-crawl logout redirect
        if (this._isLoginRedirect(page.url(), url, origin)) {
          this.log(`Redirected to login on ${url} — re-authenticating...`, 'warn');
          if (!this.authRedirectedPages.includes(url)) this.authRedirectedPages.push(url);
          const ok = await this._reAuthenticate(page, url);
          if (ok) { this.log('Re-authenticated, continuing...', 'info'); return { success: true }; }
          this.failedPages.push({ url, reason: 'auth-redirect' });
          return { success: false, reason: 'auth' };
        }

        return { success: true };
      } catch (err) {
        // If the page/context/browser is gone there is no point retrying
        if (this._isPageClosed(err)) {
          this.log(`Page closed during navigation to ${url} — aborting.`, 'error');
          this.failedPages.push({ url, reason: 'page-closed' });
          return { success: false, reason: 'page-closed' };
        }
        if (attempt === 0) {
          this.log(`Load failed for ${url} — retrying in 1s... (${err.message})`, 'warn');
          await page.waitForTimeout(1000).catch(() => {});
        } else if (attempt === 1) {
          this.log(`Load failed for ${url} — retrying in 3s... attempt 2/3 (${err.message})`, 'warn');
          await page.waitForTimeout(3000).catch(() => {});
        } else {
          // Last resort: try SPA client-side navigation (handles pages like /divisions
          // that 504 or timeout when loaded directly but work via in-app link clicks)
          const isTimeout = /timeout|Timeout/i.test(err.message);
          if (isTimeout) {
            this.log(`Timeout on ${url} — attempting SPA navigation fallback...`, 'warn');
            saveSpaRoute(url);
            this._spaRoutes = loadSpaRoutes(url);
            // First: go back to the page that originally linked here and click from there
            if (referrer && referrer !== url) {
              this.log(`SPA fallback: returning to referrer ${referrer} to click link`, 'info');
              try {
                await page.goto(referrer, { waitUntil: 'domcontentloaded', timeout: 10000 });
                await page.waitForTimeout(500);
              } catch {}
              if (await this._tryClickLink(page, url)) {
                const landed = page.url();
                if (!this._isLoginRedirect(landed, url, origin)) {
                  this.log(`SPA fallback via referrer succeeded for ${url}`, 'info');
                  return { success: true, spa: true };
                }
              }
            }
            // Then fall back to generic SPA nav strategies
            const ok = await this._spaNavigate(page, url, origin);
            if (ok) {
              this.log(`SPA fallback succeeded for ${url}`, 'info');
              return { success: true, spa: true };
            }
          }
          this.errors.push({ type: 'navigationError', url, message: err.message });
          this.failedPages.push({ url, reason: err.message });
          this.log(`Could not load ${url}: ${err.message}`, 'error');
          return { success: false, reason: 'error', message: err.message };
        }
      }
    }
    return { success: false, reason: 'unknown' };
  }

  _isPageClosed(err) {
    return /Target page|context or browser has been closed|browser has been closed|Target closed/i.test(err?.message || '');
  }

  // ── Service Worker detection & bypass ────────────────────────────────────
  // Service Workers can intercept and serve requests from cache, hiding them
  // from Playwright's route() interception. Detecting and unregistering them
  // forces the app to fetch fresh from the network so we capture all API calls.
  async _detectServiceWorkers(page) {
    try {
      const registrations = await page.evaluate(async () => {
        if (!navigator.serviceWorker) return [];
        const regs = await navigator.serviceWorker.getRegistrations();
        return regs.map(r => ({
          scope: r.scope,
          scriptURL: r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || null,
          state: r.active?.state || r.installing?.state || r.waiting?.state || null,
          updateViaCache: r.updateViaCache,
        }));
      });

      // Phase 5: Enhance with strategy analysis — fetch SW script and pattern-match
      for (const reg of registrations) {
        if (!reg.scriptURL) continue;
        try {
          const analysis = await page.evaluate(async (swUrl) => {
            try {
              const resp = await fetch(swUrl);
              const text = await resp.text();
              const usesWorkbox = /workbox/i.test(text);
              const strategies = [];
              if (/cache[\s-]?first|cacheFirst/i.test(text)) strategies.push('cache-first');
              if (/network[\s-]?first|networkFirst/i.test(text)) strategies.push('network-first');
              if (/stale[\s-]?while[\s-]?revalidate|staleWhileRevalidate/i.test(text)) strategies.push('stale-while-revalidate');
              if (/network[\s-]?only|networkOnly/i.test(text)) strategies.push('network-only');
              if (/cache[\s-]?only|cacheOnly/i.test(text)) strategies.push('cache-only');
              // Count precache entries
              const precacheMatch = text.match(/precacheAndRoute\s*\(\s*\[([^\]]+)\]/);
              const precacheCount = precacheMatch
                ? (precacheMatch[1].match(/\{/g) || []).length
                : (text.match(/"url"\s*:/g) || []).length;
              return { usesWorkbox, strategies, precacheCount, scriptSize: text.length };
            } catch { return null; }
          }, reg.scriptURL);

          if (analysis) Object.assign(reg, analysis);
        } catch { /* skip analysis */ }
      }

      return registrations;
    } catch { return []; }
  }

  async _bypassServiceWorkers(page) {
    try {
      const { count, scopes } = await page.evaluate(async () => {
        if (!navigator.serviceWorker) return { count: 0, scopes: [] };
        const regs = await navigator.serviceWorker.getRegistrations();
        const scopes = regs.map(r => r.scope);
        await Promise.all(regs.map(r => r.unregister()));
        return { count: regs.length, scopes };
      });
      if (count > 0) {
        this.log(`Bypassed ${count} service worker(s): ${scopes.join(', ')}`, 'info');
        // Reload to force fresh network requests now that SW is gone
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      }
      return count;
    } catch { return 0; }
  }

  // ── Flush SSE events captured by the init script patcher ─────────────────
  async _flushSSECaptures(page, sseCalls) {
    try {
      const captured = await page.evaluate(() => window.__capturedSSE || []);
      // Merge events into sseCalls matched by URL
      for (const entry of captured) {
        const existing = sseCalls.find(s => s.url === entry.url);
        if (existing) {
          existing.events.push(...entry.events);
          if (entry.closedAt) existing.closedAt = entry.closedAt;
        } else {
          sseCalls.push(entry);
        }
      }
    } catch {}
  }

  // ── gRPC binary frame parser ───────────────────────────────────────────────
  // gRPC framing: byte 0 = compressed flag, bytes 1-4 = message length (big-endian uint32),
  // bytes 5+ = protobuf-encoded message body.
  _parseGrpcFrame(buf) {
    if (!buf || buf.length < 5) return null;
    try {
      const compressed = buf[0] === 1;
      const msgLength = buf.readUInt32BE(1);
      const body = buf.slice(5, 5 + msgLength);
      const hexDump = body.slice(0, 256).toString('hex').match(/.{1,2}/g).join(' ');

      const fields = this._parseProtobufFields(body);
      return { compressed, messageLength: msgLength, fields, hexDump: hexDump.substring(0, 400) };
    } catch { return null; }
  }

  // Decode protobuf wire types from a buffer into readable fields.
  // Wire type 0 = varint, wire type 2 = length-delimited (string or nested).
  _parseProtobufFields(buf, depth = 0) {
    const fields = [];
    if (!buf || buf.length === 0 || depth > 3) return fields;

    let offset = 0;
    const maxOffset = Math.min(buf.length, 10000);

    while (offset < maxOffset) {
      try {
        // Read field tag (varint)
        const { value: tag, bytesRead: tagBytes } = this._readVarint(buf, offset);
        if (!tagBytes) break;
        offset += tagBytes;

        const fieldNumber = Number(tag >> 3n);
        const wireType = Number(tag & 7n);

        if (wireType === 0) {
          // Varint value
          const { value, bytesRead } = this._readVarint(buf, offset);
          offset += bytesRead;
          if (!bytesRead) break;
          fields.push({ field: fieldNumber, type: 'varint', value: Number(value) });

        } else if (wireType === 2) {
          // Length-delimited
          const { value: len, bytesRead: lenBytes } = this._readVarint(buf, offset);
          offset += lenBytes;
          if (!lenBytes) break;
          const length = Number(len);
          const data = buf.slice(offset, offset + length);
          offset += length;

          // Try UTF-8 decode first
          const str = data.toString('utf8');
          const isPrintable = /^[\x20-\x7E\t\n\rÀ-￿]*$/.test(str) && str.length > 0;

          if (isPrintable) {
            fields.push({ field: fieldNumber, type: 'string', value: str.substring(0, 500) });
          } else if (length > 0 && length < 5000 && depth < 2) {
            // Try nested protobuf decode
            const nested = this._parseProtobufFields(data, depth + 1);
            if (nested.length > 0) {
              fields.push({ field: fieldNumber, type: 'nested', value: nested });
            } else {
              fields.push({ field: fieldNumber, type: 'bytes', value: data.slice(0, 32).toString('hex') });
            }
          } else {
            fields.push({ field: fieldNumber, type: 'bytes', value: data.slice(0, 32).toString('hex') });
          }

        } else if (wireType === 1) {
          // 64-bit fixed
          if (offset + 8 > buf.length) break;
          const hi = buf.readUInt32LE(offset + 4);
          const lo = buf.readUInt32LE(offset);
          fields.push({ field: fieldNumber, type: 'fixed64', value: `0x${hi.toString(16).padStart(8,'0')}${lo.toString(16).padStart(8,'0')}` });
          offset += 8;

        } else if (wireType === 5) {
          // 32-bit fixed
          if (offset + 4 > buf.length) break;
          fields.push({ field: fieldNumber, type: 'fixed32', value: buf.readUInt32LE(offset) });
          offset += 4;

        } else {
          break; // Unknown wire type — stop
        }
      } catch { break; }
    }
    return fields;
  }

  _readVarint(buf, offset) {
    let result = 0n;
    let shift = 0n;
    let bytesRead = 0;
    while (offset + bytesRead < buf.length) {
      const byte = buf[offset + bytesRead];
      result |= BigInt(byte & 0x7F) << shift;
      shift += 7n;
      bytesRead++;
      if (!(byte & 0x80)) break;
      if (bytesRead > 10) return { value: 0n, bytesRead: 0 }; // varint too long
    }
    return { value: result, bytesRead };
  }

  // ── Flush injected capture buffers from window.__ globals ──────────────────
  async _flushInjectedCaptures(page) {
    try {
      const [cspViolations, webrtcCaptures, deviceApiCalls] = await page.evaluate(() => [
        window.__cspViolations || [],
        window.__webrtcCaptures || [],
        window.__deviceApiCalls || [],
      ]);
      if (cspViolations.length) {
        this.cspViolations = [...(this.cspViolations || []), ...cspViolations];
      }
      if (webrtcCaptures.length) {
        this.webrtcConnections = [...(this.webrtcConnections || []), ...webrtcCaptures];
      }
      if (deviceApiCalls.length) {
        this.deviceApiCalls = [...(this.deviceApiCalls || []), ...deviceApiCalls];
      }
    } catch { /* page may be closed */ }
  }

  // ── Reusable network/console/error interception setup ─────────────────────
  // `captures` is either `this` (for single-worker) or a plain object with the
  // same array properties (for parallel workers).
  async _setupPageCapture(page, captures, opts) {
    const { captureGraphQL, captureREST, captureAssets, captureAllRequests, captureIframeAPIs,
            captureSSE, captureBeacons, captureBinaryResponses } = opts;

    // Ensure new capture arrays exist on the captures object (workers may not have them yet)
    if (!captures.sseCalls) captures.sseCalls = [];
    if (!captures.beaconCalls) captures.beaconCalls = [];
    if (!captures.binaryResponses) captures.binaryResponses = [];
    if (!captures.corsPreflights) captures.corsPreflights = [];
    if (!captures.cspViolations) captures.cspViolations = [];
    if (!captures.webrtcConnections) captures.webrtcConnections = [];
    if (!captures.deviceApiCalls) captures.deviceApiCalls = [];

    // ── SSE PATCHER — injected before page load so EventSource is hooked from the start ──
    // Patches window.EventSource to record every event fired on every SSE connection.
    // Read back via page.evaluate(() => window.__capturedSSE) at the end of the scrape.
    if (captureSSE) {
      await page.addInitScript(() => {
        if (window.__capturedSSE) return; // already patched
        window.__capturedSSE = [];
        const _OriginalEventSource = window.EventSource;
        if (!_OriginalEventSource) return;
        function PatchedEventSource(url, init) {
          const es = new _OriginalEventSource(url, init);
          const entry = { url: String(url), openedAt: new Date().toISOString(), events: [], closedAt: null };
          window.__capturedSSE.push(entry);
          // Wrap addEventListener to capture all named event types
          const _origAddEventListener = es.addEventListener.bind(es);
          es.addEventListener = function(type, handler, ...rest) {
            return _origAddEventListener(type, function(e) {
              entry.events.push({ type, data: e.data?.substring(0, 2000), lastEventId: e.lastEventId || null, time: new Date().toISOString() });
              if (typeof handler === 'function') handler.call(this, e);
            }, ...rest);
          };
          es.onmessage = null; // reset so assignment below routes through our proxy
          Object.defineProperty(es, 'onmessage', {
            set(fn) { es.addEventListener('message', fn); },
            get() { return null; },
          });
          es.onerror = () => { entry.closedAt = new Date().toISOString(); };
          return es;
        }
        PatchedEventSource.CONNECTING = 0;
        PatchedEventSource.OPEN = 1;
        PatchedEventSource.CLOSED = 2;
        window.EventSource = PatchedEventSource;
      }).catch(() => {});
    }

    // O(1) pending-request lookup maps (replace O(n) findLastIndex on every response)
    const pendingGql  = new Map();
    const pendingRest = new Map();
    const pendingAll  = new Map();

    // Console log noise filter — skip debug/log/verbose level messages and
    // known harmless third-party library promotions/warnings that clutter results
    const _CONSOLE_NOISE = [
      /google maps javascript api has been loaded/i,
      /for best-practice loading patterns/i,
      /loadable.*requires state/i,
      /getscripttags.*getscriptelements/i,
      /download the apollo devtools/i,
      /apollo client developer/i,
      /react.*devtools/i,
      /redux.*devtools/i,
      /you are running vue in development mode/i,
    ];
    const _SKIP_TYPES = new Set(['debug', 'verbose', 'dir', 'dirxml', 'table',
      'trace', 'group', 'groupCollapsed', 'groupEnd', 'time', 'timeEnd', 'clear']);

    page.on('console', (msg) => {
      const type = msg.type();
      // Skip noisy debug-level output
      if (_SKIP_TYPES.has(type)) return;
      // Skip plain 'log' messages — sites spam these with internal debug info
      if (type === 'log') return;
      const text = msg.text();
      // Skip known harmless third-party library warnings
      if (_CONSOLE_NOISE.some(p => p.test(text))) return;
      captures.consoleLogs.push({
        type,
        text: text.substring(0, 1000),
        location: msg.location(),
        timestamp: new Date().toISOString(),
      });
    });

    // ── CSP VIOLATION MONITOR — injected before page load ──────────────────
    // Listens for CSP policy violation events fired by the browser itself.
    await page.addInitScript(() => {
      if (window.__cspViolations) return;
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (e) => {
        window.__cspViolations.push({
          blockedURI: e.blockedURI,
          violatedDirective: e.violatedDirective,
          effectiveDirective: e.effectiveDirective,
          originalPolicy: e.originalPolicy?.substring(0, 500),
          sourceFile: e.sourceFile,
          lineNumber: e.lineNumber,
          columnNumber: e.columnNumber,
          statusCode: e.statusCode,
          disposition: e.disposition,
          timestamp: new Date().toISOString(),
        });
      }, true);
    });

    // ── WEBRTC DETECTION — proxy RTCPeerConnection before page load ─────────
    // Captures ICE candidates (revealing real infrastructure IPs) and SDP signals.
    await page.addInitScript(() => {
      if (window.__webrtcCaptures) return;
      window.__webrtcCaptures = [];
      const _OrigRTC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
      if (!_OrigRTC) return;

      window.RTCPeerConnection = window.webkitRTCPeerConnection = function(config, constraints) {
        const conn = new _OrigRTC(config, constraints);
        const entry = {
          createdAt: new Date().toISOString(),
          config: config ? { iceServers: (config.iceServers || []).map(s => ({ urls: s.urls })) } : null,
          iceCandidates: [],
          sdpOffers: [],
          sdpAnswers: [],
          state: 'new',
        };
        window.__webrtcCaptures.push(entry);

        conn.addEventListener('icecandidate', (e) => {
          if (e.candidate) {
            const c = e.candidate;
            entry.iceCandidates.push({
              candidate: c.candidate?.substring(0, 200),
              protocol: c.protocol,
              address: c.address,
              port: c.port,
              type: c.type,
            });
          }
        });
        conn.addEventListener('connectionstatechange', () => { entry.state = conn.connectionState; });

        const _origCreateOffer = conn.createOffer.bind(conn);
        conn.createOffer = async function(...args) {
          const sdp = await _origCreateOffer(...args);
          entry.sdpOffers.push(sdp?.sdp?.substring(0, 1000));
          return sdp;
        };

        return conn;
      };

      try { Object.defineProperty(window.RTCPeerConnection, 'name', { value: 'RTCPeerConnection' }); } catch {}
    });

    // ── DEVICE API ACCESS DETECTION — proxy browser capability APIs ──────────
    // Detects if the page attempts to access geolocation, camera, microphone,
    // notifications, or permissions without user intent.
    await page.addInitScript(() => {
      if (window.__deviceApiCalls) return;
      window.__deviceApiCalls = [];

      const _track = (api, method, args) => {
        window.__deviceApiCalls.push({ api, method, args, timestamp: new Date().toISOString() });
      };

      // Geolocation
      if (navigator.geolocation) {
        const _origGeo = navigator.geolocation;
        const _origGetCurrent = _origGeo.getCurrentPosition.bind(_origGeo);
        const _origWatch = _origGeo.watchPosition.bind(_origGeo);
        navigator.geolocation.getCurrentPosition = function(success, error, opts) {
          _track('geolocation', 'getCurrentPosition', { enableHighAccuracy: opts?.enableHighAccuracy });
          return _origGetCurrent(success, error, opts);
        };
        navigator.geolocation.watchPosition = function(success, error, opts) {
          _track('geolocation', 'watchPosition', { enableHighAccuracy: opts?.enableHighAccuracy });
          return _origWatch(success, error, opts);
        };
      }

      // MediaDevices (camera/microphone)
      if (navigator.mediaDevices?.getUserMedia) {
        const _origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = function(constraints) {
          _track('mediaDevices', 'getUserMedia', constraints);
          return _origGUM(constraints);
        };
      }

      // Notifications
      if (window.Notification) {
        const _origReqPerm = Notification.requestPermission.bind(Notification);
        Notification.requestPermission = function(...args) {
          _track('Notification', 'requestPermission', {});
          return _origReqPerm(...args);
        };
      }

      // Permissions API
      if (navigator.permissions?.query) {
        const _origQuery = navigator.permissions.query.bind(navigator.permissions);
        navigator.permissions.query = function(descriptor) {
          _track('permissions', 'query', { name: descriptor?.name });
          return _origQuery(descriptor);
        };
      }

      // Clipboard
      if (navigator.clipboard?.readText) {
        const _origRead = navigator.clipboard.readText.bind(navigator.clipboard);
        navigator.clipboard.readText = function() {
          _track('clipboard', 'readText', {});
          return _origRead();
        };
      }
    });

    await page.route('**/*', async (route) => {
      if (this.stopped) { await route.abort().catch(() => {}); return; }

      const request = route.request();
      const reqUrl = request.url();
      const method = request.method();
      const headers = request.headers();
      const postData = request.postData();
      const resourceType = request.resourceType();

      // ── CORS PREFLIGHT CAPTURE ──────────────────────────────────────────────
      if (method === 'OPTIONS') {
        const preflightEntry = {
          url: reqUrl,
          method: 'OPTIONS',
          origin: headers['origin'] || headers['Origin'] || null,
          requestMethod: headers['access-control-request-method'] || null,
          requestHeaders: headers['access-control-request-headers'] || null,
          timestamp: new Date().toISOString(),
        };
        // Let the request proceed and capture the CORS response headers
        try {
          const response = await route.fetch();
          const respHeaders = response.headers();
          preflightEntry.responseStatus = response.status();
          preflightEntry.allowOrigin = respHeaders['access-control-allow-origin'] || null;
          preflightEntry.allowMethods = respHeaders['access-control-allow-methods'] || null;
          preflightEntry.allowHeaders = respHeaders['access-control-allow-headers'] || null;
          preflightEntry.maxAge = respHeaders['access-control-max-age'] || null;
          preflightEntry.allowCredentials = respHeaders['access-control-allow-credentials'] || null;
          captures.corsPreflights.push(preflightEntry);
          await route.fulfill({ response });
          return;
        } catch {
          captures.corsPreflights.push(preflightEntry);
          await route.continue().catch(() => {});
          return;
        }
      }

      if (captureGraphQL) {
        const isGraphQL =
          reqUrl.includes('/graphql') ||
          reqUrl.includes('/api/graphql') ||
          (headers['content-type']?.includes('application/json') &&
            postData && (postData.includes('"query"') || postData.includes('"mutation"')));
        if (isGraphQL) {
          // Sniff auth token from the raw (un-sanitized) headers before we redact them.
          // Broadcast once per session so the APA API tab can auto-populate.
          const rawAuth = headers['authorization'];
          if (rawAuth && !this._broadcastedAuthToken) {
            this._broadcastedAuthToken = true;
            this.broadcast(this.sessionId, { type: 'authToken', token: rawAuth, endpoint: reqUrl.replace(/\?.*$/, '') });
          }
          let parsedBody = null;
          try { parsedBody = JSON.parse(postData); } catch {}
          captures.graphqlCalls.push({
            url: reqUrl, method,
            headers: this._sanitizeHeaders(headers),
            body: parsedBody || postData,
            timestamp: new Date().toISOString(),
            requestMs: Date.now(),
            response: null,
          });
          pendingGql.set(reqUrl, captures.graphqlCalls.length - 1);
          this.log(`GraphQL: ${reqUrl}`, 'graphql');
        }
      }

      if (captureREST) {
        // xhr/fetch resource types are always XHR/fetch API calls regardless of URL shape.
        // Also match common URL patterns for APIs that don't use /api/ (e.g. /flyerkit/, /flyers/, /v2/).
        const isXHRorFetch = resourceType === 'xhr' || resourceType === 'fetch';
        const isAPI =
          isXHRorFetch ||
          reqUrl.match(/\/(api|v\d+|rest|graphql-rest|flyerkit|flyers|publication|publications)\//i) ||
          (headers['accept']?.includes('application/json') && !reqUrl.includes('/graphql'));
        const isDocLike = ['document', 'script', 'stylesheet', 'font', 'image'].includes(resourceType);
        if (isAPI && !isDocLike && !reqUrl.includes('/graphql')) {
          let parsedBody = null;
          try { parsedBody = JSON.parse(postData); } catch {}
          captures.restCalls.push({
            url: reqUrl, method,
            headers: this._sanitizeHeaders(headers),
            body: parsedBody || postData || null,
            resourceType, timestamp: new Date().toISOString(),
            requestMs: Date.now(),
            response: null,
          });
          pendingRest.set(reqUrl, captures.restCalls.length - 1);
          this.log(`REST: ${method} ${reqUrl}`, 'api');
        }
      }

      // ── BEACON capture (navigator.sendBeacon — fired on page unload, analytics POST) ──
      if (captureBeacons && (resourceType === 'ping' || (resourceType === 'other' && method === 'POST'))) {
        let parsedBody = null;
        try { parsedBody = JSON.parse(postData); } catch {}
        captures.beaconCalls.push({
          url: reqUrl, method, resourceType,
          body: parsedBody || (postData ? postData.substring(0, 2000) : null),
          timestamp: new Date().toISOString(),
          note: 'navigator.sendBeacon() or ping — often contains analytics/tracking payload',
        });
        this.log(`Beacon: ${method} ${reqUrl}`, 'api');
      }

      if (captureAllRequests) {
        captures.allRequests.push({
          url: reqUrl, method, resourceType,
          headers: this._sanitizeHeaders(headers),
          postData: postData ? postData.substring(0, 2000) : null,
          timestamp: new Date().toISOString(), response: null,
        });
        pendingAll.set(reqUrl, captures.allRequests.length - 1);
      }

      if (captureAssets) {
        if (['image','media','font','stylesheet','script'].includes(resourceType)) {
          captures.assets.push({ url: reqUrl, type: resourceType, timestamp: new Date().toISOString() });
        }
      }

      await route.continue().catch(() => {});
    });

    // ── Context-level iframe API capture ───────────────────────────────────
    // page.route() already fires for same-page frames, but some cross-origin
    // iframes (e.g. flippenterprise widgets, embedded ad units) make XHR/fetch
    // calls that are only reliably intercepted at the context level.
    // We use a seen-URLs set to deduplicate against requests already captured
    // by the page-level route handler above.
    if (captureIframeAPIs && captureREST) {
      const _seenIframeUrls = new Set();
      await page.context().route('**/*', async (route) => {
        if (this.stopped) { await route.continue().catch(() => {}); return; }
        const request = route.request();
        const frame = request.frame();
        // Only process requests originating from a child frame (not the main frame)
        if (!frame || frame === page.mainFrame()) { await route.continue().catch(() => {}); return; }
        const reqUrl = request.url();
        const resourceType = request.resourceType();
        const isXHRorFetch = resourceType === 'xhr' || resourceType === 'fetch';
        if (!isXHRorFetch) { await route.continue().catch(() => {}); return; }
        // Skip URLs already captured by the page-level route
        if (_seenIframeUrls.has(reqUrl)) { await route.continue().catch(() => {}); return; }
        _seenIframeUrls.add(reqUrl);
        const headers = request.headers();
        const postData = request.postData();
        let parsedBody = null;
        try { parsedBody = JSON.parse(postData); } catch {}
        captures.restCalls.push({
          url: reqUrl,
          method: request.method(),
          headers: this._sanitizeHeaders(headers),
          body: parsedBody || postData || null,
          resourceType,
          fromIframe: true,
          iframeUrl: frame.url(),
          timestamp: new Date().toISOString(),
          response: null,
        });
        pendingRest.set(reqUrl, captures.restCalls.length - 1);
        this.log(`REST (iframe): ${request.method()} ${reqUrl}`, 'api');
        await route.continue().catch(() => {});
      });
    }

    page.on('response', async (response) => {
      const respUrl = response.url();
      const status = response.status();
      const respHeaders = response.headers();

      // Security headers + HTTP version — write to captures (not this) so workers populate correctly
      if (response.request().resourceType() === 'document') {
        // Detect HTTP version from PerformanceResourceTiming (most accurate)
        // Falls back to header heuristics: alt-svc h3/h2, or absence of HTTP/1.1 markers
        if (!captures.httpVersion) {
          const altSvc = respHeaders['alt-svc'] || '';
          const via = respHeaders['via'] || '';
          if (/h3/i.test(altSvc)) captures.httpVersion = 'h3';
          else if (/h2/i.test(altSvc) || /2\s+/i.test(via)) captures.httpVersion = 'h2';
          else if (/1\.1/i.test(via)) captures.httpVersion = 'http/1.1';
          else captures.httpVersion = null; // will be filled by page.evaluate performance timing
        }

        captures.securityHeaders = {
          url: respUrl, status,
          'content-security-policy': respHeaders['content-security-policy'],
          'strict-transport-security': respHeaders['strict-transport-security'],
          'x-frame-options': respHeaders['x-frame-options'],
          'x-content-type-options': respHeaders['x-content-type-options'],
          'x-xss-protection': respHeaders['x-xss-protection'],
          'referrer-policy': respHeaders['referrer-policy'],
          'permissions-policy': respHeaders['permissions-policy'],
          'access-control-allow-origin': respHeaders['access-control-allow-origin'],
          'server': respHeaders['server'],
          'x-powered-by': respHeaders['x-powered-by'],
          'cache-control': respHeaders['cache-control'],
          'set-cookie': respHeaders['set-cookie'],
          all: respHeaders,
        };
      }

      // O(1) response matching via pending maps
      // ── Granular per-request network timing (DNS, TCP, SSL, TTFB, transfer) ──
      const _getTiming = (resp) => {
        try {
          const t = resp.timing();
          if (!t) return null;
          return {
            dns: t.dnsEnd >= 0 && t.dnsStart >= 0 ? Math.round(t.dnsEnd - t.dnsStart) : null,
            connect: t.connectEnd >= 0 && t.connectStart >= 0 ? Math.round(t.connectEnd - t.connectStart) : null,
            ssl: t.sslEnd >= 0 && t.sslStart >= 0 ? Math.round(t.sslEnd - t.sslStart) : null,
            send: t.sendEnd >= 0 && t.sendStart >= 0 ? Math.round(t.sendEnd - t.sendStart) : null,
            ttfb: t.receiveHeadersEnd >= 0 && t.sendStart >= 0 ? Math.round(t.receiveHeadersEnd - t.sendStart) : null,
          };
        } catch { return null; }
      };

      const gqlIdx = pendingGql.get(respUrl);
      if (gqlIdx !== undefined) {
        try {
          const text = await response.text();
          let parsed = null; try { parsed = JSON.parse(text); } catch {}
          const reqMs = captures.graphqlCalls[gqlIdx].requestMs;
          captures.graphqlCalls[gqlIdx].duration = reqMs ? Date.now() - reqMs : undefined;
          captures.graphqlCalls[gqlIdx].timing = _getTiming(response);
          captures.graphqlCalls[gqlIdx].response = { status, headers: respHeaders, body: parsed || text };
        } catch {}
        pendingGql.delete(respUrl);
      }

      const restIdx = pendingRest.get(respUrl);
      if (restIdx !== undefined) {
        try {
          const ct = respHeaders['content-type'] || '';
          const reqMs = captures.restCalls[restIdx].requestMs;
          captures.restCalls[restIdx].duration = reqMs ? Date.now() - reqMs : undefined;
          captures.restCalls[restIdx].timing = _getTiming(response);
          // Binary protocol detection — flag before attempting text parse
          const _BINARY_CTS = ['application/octet-stream', 'application/msgpack', 'application/x-msgpack',
            'application/x-protobuf', 'application/protobuf', 'application/cbor', 'application/x-cbor',
            'application/grpc', 'application/grpc-web'];
          const isBinary = _BINARY_CTS.some(t => ct.includes(t));
          if (isBinary) {
            const isGrpc = ct.includes('application/grpc');
            let grpcParsed = null;
            if (isGrpc && captureBinaryResponses) {
              try {
                const buf = await response.body();
                grpcParsed = this._parseGrpcFrame(buf);
              } catch { /* skip */ }
            }
            captures.restCalls[restIdx].response = { status, headers: respHeaders, body: null, binary: true, encoding: ct, grpc: grpcParsed };
            if (captureBinaryResponses) {
              captures.binaryResponses.push({
                url: respUrl, status, contentType: ct,
                contentLength: respHeaders['content-length'] || null,
                grpc: grpcParsed,
                note: isGrpc
                  ? 'gRPC response — protobuf framing parsed (field values may be hex for non-UTF8 content)'
                  : 'Binary-encoded response (MessagePack/Protobuf/CBOR). Requires binary decoder.',
                timestamp: new Date().toISOString(),
              });
              this.log(`Binary response${isGrpc ? ' (gRPC)' : ''}: ${ct} at ${respUrl}`, 'warn');
            }
          } else if (ct.includes('application/json') || ct.includes('text/')) {
            const text = await response.text();
            let parsed = null; try { parsed = JSON.parse(text); } catch {}
            captures.restCalls[restIdx].response = { status, headers: respHeaders, body: parsed || text };
          } else {
            captures.restCalls[restIdx].response = { status, headers: respHeaders, body: null };
          }
        } catch {}
        pendingRest.delete(respUrl);
      }

      // ── SSE stream detection ──
      // The actual events are captured via the injected EventSource patcher.
      // Here we record the HTTP connection establishment (URL + status).
      if (captureSSE) {
        const ct = respHeaders['content-type'] || '';
        if (ct.includes('text/event-stream')) {
          captures.sseCalls.push({
            url: respUrl, status,
            openedAt: new Date().toISOString(),
            note: 'SSE stream opened. Events captured via EventSource patcher in window.__capturedSSE.',
            events: [],
          });
          this.log(`SSE stream: ${respUrl}`, 'api');
        }
      }

      if (captureAllRequests) {
        const allIdx = pendingAll.get(respUrl);
        if (allIdx !== undefined) {
          try {
            const ct = respHeaders['content-type'] || '';
            const isText = ct.includes('json') || ct.includes('text') || ct.includes('xml');
            let body = null;
            if (isText) {
              const text = await response.text();
              if (ct.includes('json')) { try { body = JSON.parse(text); } catch { body = text.substring(0, 2000); } }
              else { body = text.substring(0, 2000); }
            }
            captures.allRequests[allIdx].response = { status, contentType: ct, headers: respHeaders, body };
          } catch {}
          pendingAll.delete(respUrl);
        }
      }
    });

    page.on('websocket', (ws) => {
      const entry = { url: ws.url(), frames: [], openedAt: new Date().toISOString() };
      captures.websockets.push(entry);
      ws.on('framesent', f => entry.frames.push({ dir: 'sent', payload: String(f.payload).substring(0, 2000), time: new Date().toISOString() }));
      ws.on('framereceived', f => entry.frames.push({ dir: 'received', payload: String(f.payload).substring(0, 2000), time: new Date().toISOString() }));
      ws.on('close', () => { entry.closedAt = new Date().toISOString(); });
    });

    const _PAGE_ERROR_NOISE = [
      /messaging.*permission.*blocked/i,       // Firebase FCM notification permission
      /notification.*not granted/i,
      /ResizeObserver loop/i,                  // harmless browser resize observer warning
      /Non-Error promise rejection/i,          // generic catch-all that hides real message
    ];
    page.on('pageerror', (err) => {
      if (_PAGE_ERROR_NOISE.some(p => p.test(err.message))) return;
      captures.errors.push({ type: 'pageError', message: err.message, stack: err.stack?.substring(0, 500) });
    });

    page.on('requestfailed', (req) => {
      const failure = req.failure()?.errorText;
      if (failure === 'net::ERR_ABORTED') return; // expected from resource blocking & mid-nav aborts
      captures.errors.push({ type: 'requestFailed', url: req.url(), failure });
    });
  }

  // ── Create an isolated browser context for a parallel worker ──────────────
  async _createWorkerContext(primaryUrl, captureOptions) {
    const savedSession = loadSession(primaryUrl);
    const context = await this.browser.newContext({
      userAgent: _randomUA(),
      viewport: _randomViewport(),
      ignoreHTTPSErrors: true,
      ...(savedSession ? { storageState: savedSession } : {}),
    });
    const page = await context.newPage();
    page.on('dialog', async (d) => { try { await d.dismiss(); } catch {} });

    const captures = {
      graphqlCalls: [], restCalls: [], assets: [], allRequests: [],
      sseCalls: [], beaconCalls: [], binaryResponses: [],
      consoleLogs: [], errors: [], websockets: [], downloadedImages: [],
      securityHeaders: {}, httpVersion: null,
      corsPreflights: [], cspViolations: [], webrtcConnections: [], deviceApiCalls: [],
    };
    await this._setupPageCapture(page, captures, captureOptions);
    return { context, page, captures };
  }

  // ── Per-worker BFS loop — shares queue/visited/results with all other workers ──
  async _workerLoop(page, shared, opts, workerId = 1) {
    const { avoidFilter, autoScroll, captureDropdowns } = opts;
    const { queue, queued, visited, results, origin, maxPages } = shared;
    const normalize = (u) => u.split('#')[0].replace(/\/$/, '') || u;
    const pathDepth = (u) => { try { return new URL(u).pathname.split('/').filter(Boolean).length; } catch { return 0; } };
    const getSection = (u) => { try { return new URL(u).pathname.split('/').filter(Boolean)[0] || '(root)'; } catch { return '(root)'; } };
    const isSkippable = (u) => /\.(pdf|zip|png|jpg|jpeg|gif|svg|ico|css|js|woff|woff2|ttf|mp4|mp3|xml|json|rss|atom)(\?|$)/i.test(u);

    while (!this.stopped) {
      await this._checkPause();
      if (this.stopped) break;

      if (queue.length === 0) {
        if (results.length >= maxPages) break;
        // Only exit if no other worker is actively processing (and could add new links)
        if (shared.active === 0) break;
        // Wait for a URL to be added (up to 500ms safety timeout)
        await Promise.race([
          shared.waitForQueue(),
          page.waitForTimeout(500).catch(() => {}),
        ]);
        continue;
      }
      if (results.length >= maxPages) break;

      const url = queue.shift();
      const norm = normalize(url);
      if (visited.has(norm)) continue;
      visited.add(norm);

      const pathname = (() => { try { return new URL(url).pathname || '/'; } catch { return url; } })();
      const referrer = shared.referrers.get(norm) || null;

      shared.active++;
      try {
        const currentNorm = normalize(page.url());
        if (currentNorm !== norm) {
          // Semaphore: limit concurrent page.goto() calls to avoid thundering-herd timeouts
          await shared.navSemaphore.acquire();
          let nav;
          try {
            nav = await this._navigateWithRetry(page, url, origin, referrer);
          } finally {
            shared.navSemaphore.release();
          }
          if (!nav.success) {
            if (nav.reason === 'page-closed') { shared.active--; break; }
            this.log(`[W${workerId}] Failed ${pathname} — ${nav.reason}`, 'warn');
            shared.active--;
            continue;
          }
          // Wait for SPA to finish rendering — resource blocking means only API calls remain,
          // so networkidle fires much faster (images/fonts/CSS are already blocked)
          await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
        }

        if (autoScroll) await this._autoScroll(page);
        // Second networkidle after scroll (lazy-loaded API content); short timeout with resource blocking
        await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});

        // ── EARLY LINK DISCOVERY ──────────────────────────────────────────────
        // Grab all <a href> + data-href/data-url/onclick links immediately (~50ms)
        // and queue them NOW so idle workers have URLs to navigate while this
        // worker does the heavy extraction. extractPageData() takes 2-5s; without
        // this, all other workers starve.
        try {
          const earlyHrefs = await page.evaluate(({ _origin, _pageUrl }) => {
            const seen = new Set();
            const out = [];
            function push(raw) {
              if (!raw) return;
              let resolved;
              try { resolved = new URL(raw, _pageUrl).href; } catch { return; }
              if (seen.has(resolved)) return;
              seen.add(resolved);
              out.push(resolved);
            }
            Array.from(document.querySelectorAll('a[href]')).forEach(el => push(el.href));
            Array.from(document.querySelectorAll('[data-href],[data-url]')).forEach(el => {
              push(el.getAttribute('data-href') || el.getAttribute('data-url'));
            });
            const re = /['"]((?:https?:\/\/[^'"?\s]{2,}|\/[^'"?\s]{1,})[^'"]*)['"]/g;
            Array.from(document.querySelectorAll('[onclick]')).forEach(el => {
              const oc = el.getAttribute('onclick') || '';
              let m; re.lastIndex = 0;
              while ((m = re.exec(oc)) !== null) {
                if (/^\/\/|^\/\*|\s/.test(m[1])) continue;
                push(m[1]);
              }
            });
            return out;
          }, { _origin: origin, _pageUrl: url });
          let added = 0;
          earlyHrefs
            .filter(href => {
              if (!href.startsWith(origin)) return false;
              if (isSkippable(href)) return false;
              // Block login AND logout/signout — visiting a logout URL destroys the auth session
              // NOTE: intentionally NOT applying avoidFilter here. Early discovery queues links
              // before link text is known, so URL-only matching would cause false positives and
              // block entire site branches. avoidFilter runs in the full extraction loop instead.
              if (/\/login|\/signin|\/sign-in|\/logout|\/signout|\/log-out|\/sign-out/i.test(href)) return false;
              return true;
            })
            .forEach(href => {
              const n = normalize(href);
              if (visited.has(n) || queued.has(n)) return;
              queued.add(n);
              shared.discoveryOrder.set(n, shared.discoveryCounter++);
              if (!shared.referrers.has(n)) shared.referrers.set(n, url);
              const depth = pathDepth(href);
              let lo = 0, hi = queue.length;
              while (lo < hi) { const mid = (lo + hi) >> 1; pathDepth(queue[mid]) <= depth ? lo = mid + 1 : hi = mid; }
              queue.splice(lo, 0, href);
              added++;
            });
          if (added > 0 && shared._queueWaiters.length > 0) shared.notifyQueue();
        } catch {} // non-fatal — full extraction below will catch any missed links
        // ─────────────────────────────────────────────────────────────────────

        const pageData = await extractPageData(page, url, { captureScreenshots: this._captureScreenshots, lightMode: true });
        if (!pageData) { shared.active--; continue; }

        // Always interact with dropdowns — captures new data exposed by each selection
        const dr = await this._interactDropdowns(page, url);
        results.push(...dr);
        this._incrementPartialPageCount(dr.length);

        pageData._crawl = {
          depth: pathDepth(url),
          index: results.length + 1,
          pathname,
          section: getSection(url),
          discoveryOrder: shared.discoveryOrder.get(norm) ?? 0,
          parent: shared.referrers.get(norm) || null,
          inboundCount: 0,
        };
        results.push(pageData);
        this._incrementPartialPageCount();
        // Persist URL in Redis for cross-session dedup (fire-and-forget)
        if (this._redisDedupe) redisCache.markVisitedCrossSession(new URL(url).hostname, norm).catch(() => {});
        // Tor circuit rotation — tickPage() auto-fires NEWNYM every TOR_ROTATE_EVERY pages
        if (this._useTor) torManager.tickPage().catch(() => {});
        this.log(`[W${workerId}] [${results.length}] ${pathname}`);
        {
          const done = results.length;
          const inQueue = queue.length;
          const inProgress = shared.active;
          const totalDiscovered = done + inQueue + inProgress;
          // Running max prevents percentage going backwards as queue grows
          shared.maxDiscovered = Math.max(shared.maxDiscovered || 0, totalDiscovered);
          const failedCount = this.failedPages.length;
          let pct;
          // Scale to 50-99% so crawl progress never goes backwards from pre-crawl 50%
          if (maxPages !== Infinity) {
            pct = Math.min(99, Math.round(50 + (done / maxPages) * 49));
          } else {
            pct = Math.min(99, Math.round(50 + (done / Math.max(shared.maxDiscovered, 1)) * 49));
          }
          const totalLabel = maxPages !== Infinity ? maxPages : totalDiscovered;
          this.progress(
            `Crawling ${pathname}`,
            pct,
            { visited: done, total: totalLabel, queued: inQueue, failed: failedCount }
          );
        }

        // Discover and enqueue new links (synchronous ops — safe between awaits)
        // O(1) link text lookup for avoid filter
        const linkTextMap = new Map((pageData.links || []).map(l => [l.href, l.text || '']));
        const newLinks = (pageData.links || [])
          .map(l => l.href)
          .filter(href => {
            if (!href?.startsWith(origin)) return false;
            if (isSkippable(href)) return false;
            if (/\/login|\/signin|\/sign-in|\/logout|\/signout|\/log-out|\/sign-out/i.test(href)) return false;
            return true;
          });

        newLinks.forEach(href => {
          const n = normalize(href);
          shared.inboundCount.set(n, (shared.inboundCount.get(n) || 0) + 1);
        });

        newLinks
          .filter(href => {
            const n = normalize(href);
            if (visited.has(n) || queued.has(n)) return false;
            if (avoidFilter) {
              const linkText = linkTextMap.get(href) || '';
              if (this._isAvoidedLink({ href, text: linkText }, avoidFilter, origin)) return false;
            }
            return true;
          })
          .sort((a, b) => pathDepth(a) - pathDepth(b))
          .forEach(href => {
            const n = normalize(href);
            queued.add(n);
            shared.discoveryOrder.set(n, shared.discoveryCounter++);
            if (!shared.referrers.has(n)) shared.referrers.set(n, url); // track which page linked here
            // Binary-insert into already-sorted queue instead of full re-sort
            const depth = pathDepth(href);
            let lo = 0, hi = queue.length;
            while (lo < hi) { const mid = (lo + hi) >> 1; pathDepth(queue[mid]) <= depth ? lo = mid + 1 : hi = mid; }
            queue.splice(lo, 0, href);
          });
        if (shared._queueWaiters.length > 0) shared.notifyQueue();

        // Interactive discovery: click tabs, "load more", and follow pagination
        const interactLinks = await this._discoverViaInteraction(page, url, origin);
        const newInteract = interactLinks.filter(href => {
          const n = normalize(href);
          if (visited.has(n) || queued.has(n)) return false;
          if (isSkippable(href)) return false;
          if (/\/login|\/signin|\/sign-in|\/logout|\/signout|\/log-out|\/sign-out/i.test(href)) return false;
          return true;
        });
        if (newInteract.length > 0) {
          newInteract.sort((a, b) => pathDepth(a) - pathDepth(b));
          newInteract.forEach(href => {
            const n = normalize(href);
            queued.add(n);
            shared.discoveryOrder.set(n, shared.discoveryCounter++);
            if (!shared.referrers.has(n)) shared.referrers.set(n, url);
            const depth = pathDepth(href);
            let lo = 0, hi = queue.length;
            while (lo < hi) { const mid = (lo + hi) >> 1; pathDepth(queue[mid]) <= depth ? lo = mid + 1 : hi = mid; }
            queue.splice(lo, 0, href);
          });
          if (shared._queueWaiters.length > 0) shared.notifyQueue();
          this.log(`[W${workerId}] +${newInteract.length} via interaction (tabs/pagination/load-more)`, 'info');
        }

        if (this._politeDelay > 0) {
          const _rateDomain = (() => { try { return new URL(url).hostname; } catch { return url; } })();
          await redisCache.enforceDomainRate(_rateDomain, this._politeDelay);
        }
      } catch (err) {
        shared.active--;
        if (this._isPageClosed(err)) {
          this.log(`[W${workerId}] Page closed at ${pathname} — this worker stopping.`, 'error');
          break;
        }
        this.errors.push({ type: 'crawlError', url, message: err.message });
        this.log(`[W${workerId}] Failed: ${pathname} — ${err.message}`, 'warn');
        continue;
      }
      shared.active--;
    }
  }

  // ── Parallel full-site crawl with N concurrent workers ────────────────────
  // Uses a page pool: groups workers into shared contexts (16 pages per context)
  // so 100 workers = 7 contexts × 16 pages — far cheaper than 100 separate contexts
  async _fullCrawlParallel(startUrl, maxPages, numWorkers, captureOptions, autoScroll, avoidFilter, captureDropdowns, resumeData = null) {
    const origin = new URL(startUrl).origin;
    const norm0 = startUrl.split('#')[0].replace(/\/$/, '');
    this._crawlStartUrl = startUrl; // used by _ensureReactPage so SPA workers load the known-good entry point

    const shared = {
      queue: [startUrl],
      queued: new Set([norm0]),
      visited: new Set(),
      results: [],
      origin,
      maxPages,
      navSemaphore: new Semaphore(Math.max(6, Math.ceil(numWorkers * 0.3))), // ~30% navigate at once (6→6, 20→6, 40→12)
      inboundCount: new Map(),
      discoveryOrder: new Map([[norm0, 0]]),
      discoveryCounter: 1,
      referrers: new Map(), // normalized href → URL of page that discovered it
      active: 0,   // workers currently processing a URL — idle workers wait when this > 0
      // Queue notification — resolves idle workers immediately when a URL is added
      _queueWaiters: [],
      notifyQueue() { while (this._queueWaiters.length > 0) this._queueWaiters.shift()(); },
      waitForQueue() { return new Promise(r => this._queueWaiters.push(r)); },
    };

    // Pre-populate from resume data (skip already-visited URLs, load saved pages)
    if (resumeData) {
      const norm = (u) => u.split('#')[0].replace(/\/$/, '') || u;
      (resumeData.visitedUrls || []).forEach(u => { const n = norm(u); shared.visited.add(n); shared.queued.add(n); });
      shared.results.push(...(resumeData.pages || []));
      this._partialPageCount = shared.results.length;
      this._setStatus(null, { partialPageCount: this._partialPageCount });
      this.log(`Resume: loaded ${shared.results.length} pages, skipping ${shared.visited.size} URLs`, 'info');
    }

    const PAGES_PER_CTX = 16; // pages per browser context
    const numContexts = Math.max(1, Math.ceil(numWorkers / PAGES_PER_CTX));
    this.log(`Parallel crawl: ${numWorkers} workers across ${numContexts} context(s), max ${maxPages === Infinity ? '∞' : maxPages} pages`, 'info');

    const savedSession = loadSession(startUrl);
    const ctxOpts = {
      userAgent: _randomUA(),
      viewport: _randomViewport(),
      ignoreHTTPSErrors: true,
      ...(savedSession ? { storageState: savedSession } : {}),
    };

    // Create all contexts + pages in parallel (page pool)
    // Block heavy resources only when the user isn't trying to capture them —
    // images/fonts are not needed for DOM/text scraping and slow page loads significantly
    const shouldBlockMedia = !captureOptions.captureImages && !captureOptions.captureAssets;
    const BLOCK_EXTENSIONS = /\.(png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|otf|eot)(\?|$)/i;
    let workerIdx = 0;
    const contextSetups = await Promise.allSettled(
      Array.from({ length: numContexts }, async (_, ci) => {
        const ctx = await this.browser.newContext(ctxOpts);
        if (shouldBlockMedia) {
          await ctx.route('**/*', (route) => {
            const type = route.request().resourceType();
            if (type === 'image' || type === 'font' || type === 'media' || type === 'stylesheet' || BLOCK_EXTENSIONS.test(route.request().url())) {
              return route.abort();
            }
            return route.continue();
          });
        }
        const pagesInCtx = Math.min(PAGES_PER_CTX, numWorkers - ci * PAGES_PER_CTX);
        const pages = await Promise.allSettled(
          Array.from({ length: pagesInCtx }, async () => {
            const page = await ctx.newPage();
            page.on('dialog', async (d) => { try { await d.dismiss(); } catch {} });
            const captures = {
              graphqlCalls: [], restCalls: [], assets: [], allRequests: [],
              sseCalls: [], beaconCalls: [], binaryResponses: [],
              consoleLogs: [], errors: [], websockets: [], downloadedImages: [],
              securityHeaders: {},
            };
            await this._setupPageCapture(page, captures, captureOptions);
            return { page, captures };
          })
        );
        return {
          context: ctx,
          workers: pages.filter(r => r.status === 'fulfilled').map(r => r.value),
        };
      })
    );

    const allContexts = contextSetups.filter(r => r.status === 'fulfilled').map(r => r.value.context);
    const workers = contextSetups
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value.workers);

    const failedCtx = contextSetups.filter(r => r.status === 'rejected').length;
    if (failedCtx > 0) this.log(`${failedCtx} context(s) failed to create`, 'warn');
    if (workers.length === 0) throw new Error('Could not create any worker pages');
    this.log(`${workers.length} workers ready across ${allContexts.length} context(s)`, 'info');

    // Set save references — _writeAutosave reads these
    this._saveWorkers = workers;
    this._savePages = shared.results;
    this._saveVisited = shared.visited;

    // Autosave + live broadcast timer — fires every 3s when new pages arrive
    let _saveSize = shared.results.length;
    const saveTimer = setInterval(() => {
      if (shared.results.length > _saveSize) {
        _saveSize = shared.results.length;
        if (this._saveId) this._writeAutosave('running');
        // Broadcast partial results so frontend can show live progress
        this.broadcast(this.sessionId, {
          type: 'partialResults',
          pageCount: shared.results.length,
          queueSize: shared.queue.length,
        });
      }
    }, 3000);

    // Run all workers concurrently — stagger startup by 100ms each to avoid initial burst
    const opts = { autoScroll, avoidFilter, captureDropdowns };
    await Promise.all(workers.map((w, i) =>
      new Promise(r => setTimeout(r, i * 100)).then(() =>
        this._workerLoop(w.page, shared, opts, i + 1)
      )
    ));

    if (saveTimer) clearInterval(saveTimer);

    // Backfill inbound counts
    const normalize = (u) => u.split('#')[0].replace(/\/$/, '') || u;
    shared.results.forEach(p => {
      const n = normalize(p.meta?.url || '');
      if (p._crawl) p._crawl.inboundCount = shared.inboundCount.get(n) || 0;
    });

    // Merge all worker captures into session arrays
    for (const w of workers) {
      this.graphqlCalls.push(...w.captures.graphqlCalls);
      this.restCalls.push(...w.captures.restCalls);
      this.assets.push(...w.captures.assets);
      this.allRequests.push(...w.captures.allRequests);
      this.sseCalls.push(...(w.captures.sseCalls || []));
      this.beaconCalls.push(...(w.captures.beaconCalls || []));
      this.binaryResponses.push(...(w.captures.binaryResponses || []));
      this.consoleLogs.push(...w.captures.consoleLogs);
      this.errors.push(...w.captures.errors);
      this.websockets.push(...w.captures.websockets);
      this.downloadedImages.push(...w.captures.downloadedImages);
      if (w.captures.securityHeaders && w.captures.securityHeaders.url) {
        this.securityHeaders = w.captures.securityHeaders;
      }
    }

    clearInterval(saveTimer);

    // Close all contexts (browser stays open — closed by run())
    await Promise.all(allContexts.map(ctx => ctx.close().catch(() => {})));

    const results = shared.results;
    results._siteTree = this._buildSiteTree(results, origin);

    if (results.length >= maxPages && shared.queue.length > 0) {
      this.log(`Crawl limit reached (${maxPages} pages). ${shared.queue.length} links not visited.`, 'warn');
    } else {
      this.log(`Parallel crawl complete — ${results.length} pages by ${workers.length} workers.`, 'success');
    }
    return results;
  }

  // ── Autosave helper — writes current crawl state to disk ─────────────────
  _writeAutosave(status = 'running') {
    const saveId = this._saveId;
    if (!saveId) return;
    const HEAVY = ['htmlSource', 'layoutTree', 'stylesheetContents', 'screenshot', 'viewportScreenshot'];
    const strip = obj => JSON.parse(JSON.stringify(obj, (k, v) => HEAVY.includes(k) ? undefined : v));
    try {
      // In parallel mode workers have per-worker captures; in sequential they go to this.*
      const ws = this._saveWorkers || [];
      const graphql = ws.length ? ws.flatMap(w => w.captures.graphqlCalls) : this.graphqlCalls;
      const rest = ws.length ? ws.flatMap(w => w.captures.restCalls) : this.restCalls;
      const assets = ws.length ? ws.flatMap(w => w.captures.assets) : this.assets;
      const consoleLogs = ws.length ? ws.flatMap(w => w.captures.consoleLogs) : this.consoleLogs;
      const errors = ws.length ? ws.flatMap(w => w.captures.errors) : this.errors;
      const websockets = ws.length ? ws.flatMap(w => w.captures.websockets) : this.websockets;
      const downloadedImages = ws.length ? ws.flatMap(w => w.captures.downloadedImages) : this.downloadedImages;
      const saveData = {
        sessionId: saveId,
        startUrl: this._saveStartUrl,
        startedAt: this._saveStartedAt,
        lastSavedAt: new Date().toISOString(),
        status,
        uiVisible: this._saveUiVisible !== false,
        initiatedBy: this._saveInitiatedBy || 'ui',
        options: this._saveOptions,
        visitedUrls: this._saveVisited ? [...this._saveVisited] : [],
        pages: strip(this._savePages || []),
        apiCalls: { graphql: strip(graphql), rest: strip(rest) },
        assets: strip(assets),
        downloadedImages: strip(downloadedImages),
        cookies: strip((this.cookies || []).map((cookie) => ({
          name: cookie.name,
          domain: cookie.domain,
          path: cookie.path,
          expires: cookie.expires,
          httpOnly: cookie.httpOnly,
          secure: cookie.secure,
          sameSite: cookie.sameSite,
        }))),
        securityHeaders: strip(this.securityHeaders || {}),
        consoleLogs: strip(consoleLogs),
        errors: strip(errors),
        websockets: strip(websockets),
        failedPages: this.failedPages || [],
      };
      if (!fs.existsSync(SAVES_DIR)) fs.mkdirSync(SAVES_DIR, { recursive: true });
      fs.writeFileSync(path.join(SAVES_DIR, `${saveId}.json`), JSON.stringify(saveData));
    } catch {}
  }

  _buildSiteTree(pages, origin) {
    const tree = { path: '/', url: origin, children: {}, pages: [] };
    for (const page of pages) {
      const url = page.meta?.url || '';
      let pathname = '/';
      try { pathname = new URL(url).pathname || '/'; } catch {}
      const segments = pathname.split('/').filter(Boolean);
      let node = tree;
      for (const seg of segments) {
        if (!node.children[seg]) node.children[seg] = { path: seg, children: {}, pages: [] };
        node = node.children[seg];
      }
      node.pages.push({ url, title: page.meta?.title, depth: segments.length });
    }
    return tree;
  }

  _detectGraphQLEndpoint() {
    const real = this.graphqlCalls.filter(c => !c._introspection);
    return real.length > 0 ? real[0].url : null;
  }

  async _detectSiteInfo(page, url) {
    return page.evaluate((pageUrl) => {
      const origin = new URL(pageUrl).origin;
      const logoSelectors = [
        'img[src*="logo"]','img[alt*="logo" i]','img[class*="logo" i]',
        'img[id*="logo" i]','a[class*="logo" i] img','header img',
        '.navbar-brand img','.site-logo img','[class*="brand"] img',
      ];
      let logoUrl = null;
      for (const sel of logoSelectors) {
        const el = document.querySelector(sel);
        if (el?.src) { logoUrl = el.src; break; }
      }
      const hasLoginForm = document.querySelectorAll('input[type="password"]').length > 0;
      const bodyText = document.body.innerText.toLowerCase();
      return {
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.content || '',
        favicon:
          document.querySelector('link[rel="icon"]')?.href ||
          document.querySelector('link[rel="shortcut icon"]')?.href ||
          `${origin}/favicon.ico`,
        logoUrl,
        hasLoginForm,
        has2FA: bodyText.includes('two-factor') || bodyText.includes('2fa') || bodyText.includes('authenticator'),
        hasCaptcha: !!document.querySelector('.g-recaptcha, [data-sitekey]') || bodyText.includes('captcha'),
        origin,
      };
    }, url);
  }

  // ── Static HTTP fallback (no browser, no JS execution) ──────────────────
  async _staticScrape(url) {
    this.log('Fetching HTML via Node.js https...', 'info');
    const https = require('https');
    const http = require('http');

    const fetchHTML = (targetUrl, redirects = 0) => new Promise((resolve, reject) => {
      if (redirects > 5) return reject(new Error('Too many redirects'));
      const client = targetUrl.startsWith('https') ? https : http;
      const req = client.get(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'identity',
        },
        timeout: 15000,
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, targetUrl).href;
          return fetchHTML(next, redirects + 1).then(resolve).catch(reject);
        }
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve({ html: data, status: res.statusCode, headers: res.headers }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    });

    const { html, status, headers } = await fetchHTML(url);
    this.log(`Static fetch: HTTP ${status}, ${html.length} bytes`, 'info');

    const getFirst = (re) => { const m = html.match(re); return m ? (m[1] || m[0]).trim() : null; };
    const getAll = (re) => { const out = []; let m; const g = new RegExp(re.source, 'gi'); while ((m = g.exec(html)) !== null) out.push(m[1]?.trim()); return out.filter(Boolean); };
    const decodeEntities = (s) => s ? s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'") : s;

    const origin = new URL(url).origin;
    const title = decodeEntities(getFirst(/<title[^>]*>([^<]{1,300})<\/title>/i));
    const description = decodeEntities(getFirst(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,500})["']/i) ||
                        getFirst(/<meta[^>]+content=["']([^"']{1,500})["'][^>]+name=["']description["']/i));
    const charset = getFirst(/<meta[^>]+charset=["']?([^"'\s>]+)/i);
    const viewport = getFirst(/<meta[^>]+name=["']viewport["'][^>]+content=["']([^"']+)["']/i);
    const canonical = getFirst(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
    const favicon = getFirst(/<link[^>]+rel=["'](?:icon|shortcut icon)["'][^>]+href=["']([^"']+)["']/i);

    const ogTags = {};
    [...html.matchAll(/<meta[^>]+property=["'](og:[^"']+)["'][^>]+content=["']([^"']*)["']/gi)]
      .forEach(m => { ogTags[m[1]] = decodeEntities(m[2]); });

    const headings = {};
    for (let i = 1; i <= 6; i++) {
      headings[`h${i}`] = getAll(new RegExp(`<h${i}[^>]*>([^<]{1,300})<\\/h${i}>`, 'i')).map(t => ({ text: decodeEntities(t) }));
    }

    const links = [...html.matchAll(/href=["']([^"'#][^"']*?)["']/gi)]
      .map(m => m[1]).filter(l => l.startsWith('http') || l.startsWith('/'))
      .map(href => {
        const abs = href.startsWith('http') ? href : `${origin}${href}`;
        let isInternal = false;
        try { isInternal = new URL(abs).origin === origin; } catch {}
        return { href: abs, isInternal, text: null };
      });

    const images = [...html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*/gi)].map(m => ({
      src: m[1].startsWith('http') ? m[1] : `${origin}${m[1]}`,
      alt: m[0].match(/alt=["']([^"']*)["']/i)?.[1] || null,
      isBackgroundImage: false,
    }));

    const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
      .map(m => ({ src: m[1], inline: false, type: 'text/javascript' }));

    const stylesheets = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi)]
      .map(m => ({ href: m[1].startsWith('http') ? m[1] : `${origin}${m[1]}` }));

    const fullText = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 100000);

    const { extractEntities } = require('./entity-extractor');

    return {
      meta: { title, url, description, charset, viewport, canonical, favicon, ogTags, allMeta: [], jsonLD: [], twitterTags: {} },
      headings,
      fullText,
      textBlocks: fullText.split('. ').slice(0, 50).map(t => ({ tag: 'p', text: t.trim() })).filter(b => b.text.length > 10),
      links,
      images,
      svgs: [],
      media: [],
      fontFaces: [],
      navigation: [],
      forms: [],
      buttons: [],
      tables: [],
      lists: [],
      iframes: [],
      scripts,
      stylesheets,
      inlineStyles: [],
      cssVariables: {},
      colors: [],
      typography: [],
      animations: [],
      mediaQueries: [],
      ariaElements: [],
      layoutTree: null,
      localStorage: {},
      sessionStorage: {},
      tech: { frameworks: [], analytics: [], cms: [], cdn: [], other: [] },
      domStats: { totalElements: 0, totalImages: images.length, totalLinks: links.length, totalForms: 0, totalScripts: scripts.length, totalStyleSheets: stylesheets.length, totalIframes: 0, totalInputs: 0, totalButtons: 0, totalTables: 0 },
      headHTML: null,
      htmlSource: html.substring(0, 500000),
      customElements: [],
      screenshot: null,
      viewportScreenshot: null,
      stylesheetContents: [],
      performance: null,
      entities: extractEntities(fullText),
      _responseHeaders: headers,
      _httpStatus: status,
      _scrapeMode: 'static',
      _staticNote: 'JavaScript was not executed. Dynamic content, cookies, API calls, and tech fingerprinting are unavailable in static mode.',
    };
  }

  _sanitizeHeaders(headers) {
    const redact = ['authorization','cookie','x-auth-token','x-api-key','x-csrf-token'];
    const out = { ...headers };
    for (const k of redact) if (out[k]) out[k] = '[REDACTED]';
    return out;
  }
}

// Assign static properties for legacy test compatibility (must be immediately after class definition)
ScraperSession.clearSession = clearSession;
ScraperSession.loadSession = loadSession;
ScraperSession.createSessionSnapshot = createSessionSnapshot;
module.exports = ScraperSession;
