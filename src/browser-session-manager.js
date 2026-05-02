'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { chromium } = require('playwright-extra');
try {
  const StealthPlugin = require('puppeteer-extra-plugin-stealth');
  chromium.use(StealthPlugin());
} catch {}

const { inspectPage, shortText } = require('./browser-inspector');

const ROOT_DIR = path.join(__dirname, '..');
const BROWSER_ROOT_DIR = path.join(ROOT_DIR, '.browser-sessions');
const BROWSER_SAVES_DIR = path.join(BROWSER_ROOT_DIR, 'saves');
const SCRAPER_SESSIONS_DIR = path.join(ROOT_DIR, '.scraper-sessions');

const MAX_ACTIVE_BROWSER_SESSIONS = Number(process.env.MAX_ACTIVE_BROWSER_SESSIONS) || 4;
const MAX_ACTIVE_HEADFUL_BROWSER_SESSIONS = Number(process.env.MAX_ACTIVE_HEADFUL_BROWSER_SESSIONS) || 2;
const BROWSER_SESSION_IDLE_TTL_MS = Number(process.env.BROWSER_SESSION_IDLE_TTL_MS) || 30 * 60 * 1000;

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeViewMode(value) {
  const normalized = String(value || 'console').trim().toLowerCase();
  if (['console', 'desktop', 'both'].includes(normalized)) return normalized;
  throw new Error('viewMode must be one of: console, desktop, both');
}

function normalizePersistenceMode(value) {
  const normalized = String(value || 'auth_state').trim().toLowerCase();
  if (['ephemeral', 'auth_state', 'full_session'].includes(normalized)) return normalized;
  throw new Error('persistenceMode must be one of: ephemeral, auth_state, full_session');
}

function isTestLikeEnvironment() {
  return process.env.NODE_ENV === 'test' || process.env.CI === 'true';
}

function hashId(value) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 12);
}

function summarizeNarration(text) {
  return shortText(text, 180);
}

function serializeError(err) {
  return {
    message: err?.message || String(err),
    stack: err?.stack || null,
  };
}

function sessionStorageFile(url) {
  const hostname = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_');
  ensureDir(SCRAPER_SESSIONS_DIR);
  return path.join(SCRAPER_SESSIONS_DIR, `${hostname}.json`);
}

function buildNarration(action, details = {}) {
  const label = shortText(details.label || details.text || details.url || 'the target', 80);
  switch (action) {
    case 'open':
      return 'Launching a browser session and opening the requested page.';
    case 'navigate':
      return `Navigating to ${label} and waiting for the page to settle.`;
    case 'inspect':
      return 'Scanning the current page for visible controls, forms, and blockers.';
    case 'click':
      return `Clicking ${label} and checking how the page changes.`;
    case 'type':
      return `Typing into ${label} so the next state can load.`;
    case 'select':
      return `Choosing a new option in ${label} and watching for updates.`;
    case 'wait':
      return 'Waiting for the expected state and confirming the page has settled.';
    case 'save':
      return 'Saving this browser state so it can be restored later.';
    case 'scrape':
      return 'Handing the current browser state to the scraper to capture structured output.';
    case 'close':
      return 'Closing the browser session and cleaning up its resources.';
    default:
      return 'Updating the current browser session.';
  }
}

async function installOverlay(page) {
  await page.evaluate(() => {
    if (window.__wspBrowserOverlay) {
      window.__wspBrowserOverlay.ensure?.();
      return;
    }

    const ensure = () => {
      if (document.getElementById('wsp-browser-overlay-root')) return;

      const root = document.createElement('div');
      root.id = 'wsp-browser-overlay-root';
      root.style.position = 'fixed';
      root.style.inset = '0';
      root.style.pointerEvents = 'none';
      root.style.zIndex = '2147483647';
      root.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

      const cursor = document.createElement('div');
      cursor.id = 'wsp-browser-overlay-cursor';
      cursor.style.position = 'fixed';
      cursor.style.width = '20px';
      cursor.style.height = '20px';
      cursor.style.borderRadius = '999px';
      cursor.style.border = '2px solid rgba(255,255,255,0.95)';
      cursor.style.background = 'rgba(79,142,247,0.45)';
      cursor.style.boxShadow = '0 0 0 6px rgba(79,142,247,0.16)';
      cursor.style.transform = 'translate(-9999px, -9999px)';
      cursor.style.transition = 'transform 0.06s linear, box-shadow 0.12s ease';

      const bubble = document.createElement('div');
      bubble.id = 'wsp-browser-overlay-bubble';
      bubble.style.position = 'fixed';
      bubble.style.right = '16px';
      bubble.style.bottom = '16px';
      bubble.style.maxWidth = '360px';
      bubble.style.padding = '10px 12px';
      bubble.style.borderRadius = '14px';
      bubble.style.background = 'rgba(15,17,23,0.92)';
      bubble.style.color = '#f8fafc';
      bubble.style.fontSize = '13px';
      bubble.style.lineHeight = '1.4';
      bubble.style.boxShadow = '0 10px 28px rgba(0,0,0,0.28)';
      bubble.style.border = '1px solid rgba(255,255,255,0.12)';
      bubble.style.display = 'none';

      root.appendChild(cursor);
      root.appendChild(bubble);
      document.documentElement.appendChild(root);
    };

    window.__wspBrowserOverlay = {
      ensure,
      setPointer(x, y, clickPulse) {
        ensure();
        const cursor = document.getElementById('wsp-browser-overlay-cursor');
        if (!cursor) return;
        cursor.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        if (clickPulse) {
          cursor.style.boxShadow = '0 0 0 10px rgba(79,142,247,0.28)';
          setTimeout(() => {
            cursor.style.boxShadow = '0 0 0 6px rgba(79,142,247,0.16)';
          }, 140);
        }
      },
      setNarration(text) {
        ensure();
        const bubble = document.getElementById('wsp-browser-overlay-bubble');
        if (!bubble) return;
        if (!text) {
          bubble.style.display = 'none';
          bubble.textContent = '';
          return;
        }
        bubble.textContent = text;
        bubble.style.display = 'block';
      },
    };

    window.__wspBrowserOverlay.ensure();
  }).catch(() => {});
}

class BrowserSession {
  constructor(manager, sessionId, options) {
    this.manager = manager;
    this.sessionId = sessionId;
    this.requestedViewMode = normalizeViewMode(options.viewMode);
    this.persistenceMode = normalizePersistenceMode(options.persistenceMode);
    this.createdAt = nowIso();
    this.updatedAt = this.createdAt;
    this.lastActiveAt = this.createdAt;
    this.state = 'opening';
    this.requestedUrl = options.url;
    this.browser = null;
    this.context = null;
    this.activePage = null;
    this.lastSnapshot = null;
    this.currentElementMap = new Map();
    this.pointer = { x: 24, y: 24, clickPulse: false, updatedAt: this.createdAt };
    this.narrationHistory = [];
    this.actionHistory = [];
    this.networkEvents = [];
    this.consoleEvents = [];
    this.pageErrors = [];
    this.lastSaveId = null;
    this.autoSaveOnClose = this.persistenceMode !== 'ephemeral';
    this.restoreSaveId = options.restoreSaveId || null;
    this.frameInterval = null;
    this.closed = false;
    this.forceHeadless = !!options.forceHeadless;
    this.headless = this.forceHeadless || this.requestedViewMode === 'console';
  }

  touch() {
    this.updatedAt = nowIso();
    this.lastActiveAt = this.updatedAt;
  }

  recordAction(action, details = {}) {
    this.actionHistory.push({
      action,
      details,
      at: nowIso(),
    });
    if (this.actionHistory.length > 50) this.actionHistory.shift();
    this.touch();
  }

  async narrate(action, details = {}) {
    const text = summarizeNarration(details.text || buildNarration(action, details));
    this.narrationHistory.push({
      text,
      at: nowIso(),
      action,
    });
    if (this.narrationHistory.length > 50) this.narrationHistory.shift();
    this.manager.broadcast(this.sessionId, {
      type: 'browserNarration',
      text,
      action,
      at: nowIso(),
    });
    await this.applyOverlayState({ narration: text }).catch(() => {});
    this.touch();
    return text;
  }

  getLatestNarration() {
    return this.narrationHistory[this.narrationHistory.length - 1]?.text || '';
  }

  ensureActivePage() {
    if (this.activePage && !this.activePage.isClosed()) return this.activePage;
    const fallback = this.context?.pages?.().find((page) => !page.isClosed()) || null;
    if (!fallback) throw new Error('No active browser page is available for this session');
    this.activePage = fallback;
    return fallback;
  }

  summary() {
    const page = (() => {
      try { return this.ensureActivePage(); } catch { return null; }
    })();
    const currentUrl = page ? page.url() : this.lastSnapshot?.url || this.requestedUrl || '';
    return {
      browserSessionId: this.sessionId,
      state: this.state,
      requestedViewMode: this.requestedViewMode,
      effectiveViewMode: this.headless && this.requestedViewMode !== 'console' ? 'console' : this.requestedViewMode,
      headless: this.headless,
      persistenceMode: this.persistenceMode,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      lastActiveAt: this.lastActiveAt,
      currentUrl,
      title: this.lastSnapshot?.title || '',
      tabCount: this.context?.pages?.().filter((candidate) => !candidate.isClosed()).length || 0,
      restoreSaveId: this.restoreSaveId,
      lastSaveId: this.lastSaveId,
      lastNarration: this.getLatestNarration(),
      warnings: this.lastSnapshot?.warnings || [],
    };
  }

  async applyOverlayState({ pointer = null, narration = null } = {}) {
    const page = this.activePage;
    if (!page || page.isClosed()) return;
    await installOverlay(page);
    if (pointer) {
      await page.evaluate((data) => {
        window.__wspBrowserOverlay?.setPointer?.(data.x, data.y, data.clickPulse);
      }, pointer).catch(() => {});
    }
    if (typeof narration === 'string') {
      await page.evaluate((text) => {
        window.__wspBrowserOverlay?.setNarration?.(text);
      }, narration).catch(() => {});
    }
  }

  async emitPointer(x, y, clickPulse = false) {
    this.pointer = { x, y, clickPulse, updatedAt: nowIso() };
    this.manager.broadcast(this.sessionId, {
      type: 'browserPointer',
      pointer: this.pointer,
    });
    await this.applyOverlayState({ pointer: this.pointer }).catch(() => {});
    this.touch();
  }

  async movePointerTo(box) {
    const page = this.ensureActivePage();
    const targetX = Math.max(6, Math.round(box.x + (box.width || 0) / 2));
    const targetY = Math.max(6, Math.round(box.y + (box.height || 0) / 2));
    const startX = Number.isFinite(this.pointer?.x) ? this.pointer.x : 24;
    const startY = Number.isFinite(this.pointer?.y) ? this.pointer.y : 24;
    const steps = 7;

    for (let index = 1; index <= steps; index += 1) {
      const x = startX + ((targetX - startX) * index) / steps;
      const y = startY + ((targetY - startY) * index) / steps;
      await page.mouse.move(x, y).catch(() => {});
      await this.emitPointer(x, y, false);
      await wait(18);
    }
  }

  async clickPulse() {
    const page = this.ensureActivePage();
    await page.mouse.down().catch(() => {});
    await page.mouse.up().catch(() => {});
    await this.emitPointer(this.pointer.x, this.pointer.y, true);
  }

  async updateSnapshot(snapshot) {
    this.lastSnapshot = {
      ...snapshot,
      browserSessionId: this.sessionId,
      lastNarration: this.getLatestNarration(),
    };
    this.touch();
    this.manager.broadcast(this.sessionId, {
      type: 'browserState',
      summary: this.summary(),
      snapshot: this.lastSnapshot,
    });
    return this.lastSnapshot;
  }

  async inspect(options = {}) {
    const page = this.ensureActivePage();
    await this.narrate('inspect');
    const { snapshot, elementMap } = await inspectPage(page, options);
    this.currentElementMap = elementMap;
    return this.updateSnapshot(snapshot);
  }

  resolveElementRecord(elementId, selector) {
    if (selector) {
      return {
        preferredSelector: selector,
        selectorCandidates: [selector],
        label: selector,
      };
    }
    if (!elementId) throw new Error('Either elementId or selector is required');
    const record = this.currentElementMap.get(String(elementId));
    if (!record) {
      throw new Error(`Unknown elementId: ${elementId}. Call inspect_browser_page first for a fresh element map.`);
    }
    return record;
  }

  async resolveLocator(page, elementId, selector) {
    const record = this.resolveElementRecord(elementId, selector);
    for (const candidate of [record.preferredSelector, ...(record.selectorCandidates || [])].filter(Boolean)) {
      try {
        const locator = page.locator(candidate).first();
        await locator.waitFor({ state: 'attached', timeout: 1500 });
        return { locator, record, selector: candidate };
      } catch {}
    }
    throw new Error(`Could not resolve a live element for ${elementId || selector}`);
  }

  async registerPage(page) {
    if (!page) return;
    this.activePage = page;

    page.on('console', (msg) => {
      this.consoleEvents.push({
        type: msg.type(),
        text: shortText(msg.text(), 240),
        at: nowIso(),
      });
      if (this.consoleEvents.length > 100) this.consoleEvents.shift();
    });

    page.on('pageerror', (err) => {
      this.pageErrors.push({
        message: err.message,
        at: nowIso(),
      });
      if (this.pageErrors.length > 50) this.pageErrors.shift();
    });

    page.on('response', async (response) => {
      try {
        const request = response.request();
        this.networkEvents.push({
          url: shortText(response.url(), 220),
          method: request.method(),
          status: response.status(),
          resourceType: request.resourceType(),
          at: nowIso(),
        });
        if (this.networkEvents.length > 80) this.networkEvents.shift();
      } catch {}
    });

    page.on('load', async () => {
      await installOverlay(page);
      await this.applyOverlayState({ pointer: this.pointer, narration: this.getLatestNarration() }).catch(() => {});
      this.touch();
    });

    page.on('close', () => {
      if (this.activePage === page) {
        this.activePage = this.context?.pages?.().find((candidate) => !candidate.isClosed()) || null;
      }
    });
  }

  startFrameLoop() {
    this.stopFrameLoop();
    this.frameInterval = setInterval(async () => {
      if (this.closed) {
        this.stopFrameLoop();
        return;
      }
      const page = this.activePage;
      if (!page || page.isClosed()) return;
      try {
        const buffer = await page.screenshot({ type: 'jpeg', quality: 55 });
        this.manager.broadcast(this.sessionId, {
          type: 'browserFrame',
          dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}`,
          pointer: this.pointer,
        });
      } catch {}
    }, 900);
    this.frameInterval.unref?.();
  }

  stopFrameLoop() {
    if (this.frameInterval) {
      clearInterval(this.frameInterval);
      this.frameInterval = null;
    }
  }

  async open(options = {}) {
    this.state = 'opening';
    this.touch();

    const launchOptions = {
      headless: this.headless,
      args: ['--disable-blink-features=AutomationControlled'],
      slowMo: this.requestedViewMode === 'desktop' || this.requestedViewMode === 'both' ? 30 : 0,
    };
    this.browser = await chromium.launch(launchOptions);
    const saveData = options.restoreSave || null;
    const storageState = saveData?.storageState || null;

    this.context = await this.browser.newContext({
      userAgent: DEFAULT_USER_AGENT,
      viewport: { width: 1440, height: 900 },
      ...(storageState ? { storageState } : {}),
    });
    await this.context.addInitScript(() => {
      window.__WSP_BROWSER_SESSION = { startedAt: Date.now() };
    }).catch(() => {});
    await this.context.addInitScript(() => {
      if (!window.chrome) window.chrome = { runtime: {} };
    }).catch(() => {});

    this.context.on('page', async (page) => {
      await this.registerPage(page);
    });

    const targetUrl = saveData?.lastUrl || saveData?.tabStates?.[saveData.activeTabIndex || 0]?.url || this.requestedUrl;
    if (!targetUrl) throw new Error('A url is required to open a browser session');

    if (saveData?.tabStates?.length) {
      const openedPages = [];
      for (const tabState of saveData.tabStates) {
        const page = await this.context.newPage();
        await this.registerPage(page);
        await page.goto(tabState.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await installOverlay(page);
        await this.restoreTabState(page, tabState);
        openedPages.push(page);
      }
      this.activePage = openedPages[Math.min(saveData.activeTabIndex || 0, Math.max(0, openedPages.length - 1))] || openedPages[0];
    } else {
      const page = await this.context.newPage();
      await this.registerPage(page);
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      this.activePage = page;
    }

    await this.narrate('open', { url: targetUrl });
    await installOverlay(this.ensureActivePage());
    await this.applyOverlayState({ pointer: this.pointer, narration: this.getLatestNarration() });
    this.startFrameLoop();
    this.state = 'ready';
    const snapshot = await this.inspect();
    this.manager.broadcast(this.sessionId, {
      type: 'browserSessionOpened',
      summary: this.summary(),
      snapshot,
    });
    return {
      ...this.summary(),
      snapshot,
    };
  }

  async captureTabState(page) {
    return page.evaluate(() => {
      const buildSelector = (el) => {
        if (!el) return null;
        if (el.id) return `#${CSS.escape(el.id)}`;
        const name = el.getAttribute('name');
        if (name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
        return null;
      };

      const formValues = Array.from(document.querySelectorAll('input, select, textarea'))
        .slice(0, 30)
        .map((field) => {
          const type = field.getAttribute('type') || field.tagName.toLowerCase();
          if (/password/i.test(type)) return null;
          const selector = buildSelector(field);
          if (!selector) return null;
          return {
            selector,
            type,
            value: field.value,
          };
        })
        .filter(Boolean);

      return {
        url: window.location.href,
        title: document.title || '',
        scroll: { x: window.scrollX, y: window.scrollY },
        formValues,
      };
    }).catch(async () => ({
      url: page.url(),
      title: await page.title().catch(() => ''),
      scroll: { x: 0, y: 0 },
      formValues: [],
    }));
  }

  async restoreTabState(page, tabState) {
    if (!tabState) return;
    const values = Array.isArray(tabState.formValues) ? tabState.formValues : [];
    for (const value of values) {
      try {
        await page.locator(value.selector).first().fill(String(value.value ?? ''), { timeout: 1200 });
      } catch {}
    }
    const scrollX = Number(tabState.scroll?.x || 0);
    const scrollY = Number(tabState.scroll?.y || 0);
    await page.evaluate(({ x, y }) => window.scrollTo(x, y), { x: scrollX, y: scrollY }).catch(() => {});
  }

  async navigate(url, options = {}) {
    const page = this.ensureActivePage();
    const narration = options.narration || buildNarration('navigate', { url });
    await this.narrate('navigate', { text: narration, url });
    await page.goto(url, {
      waitUntil: options.waitUntil || 'domcontentloaded',
      timeout: Number.isFinite(options.timeoutMs) ? options.timeoutMs : 30000,
    });
    if (Number.isFinite(options.waitMs) && options.waitMs > 0) await page.waitForTimeout(options.waitMs);
    const snapshot = await this.inspect();
    this.recordAction('navigate', { url });
    this.manager.broadcast(this.sessionId, {
      type: 'browserActionResult',
      action: 'navigate',
      success: true,
      snapshot,
    });
    return snapshot;
  }

  async click(input = {}) {
    const page = this.ensureActivePage();
    const { locator, record, selector } = await this.resolveLocator(page, input.elementId, input.selector);
    const box = await locator.boundingBox();
    await this.narrate('click', { label: record.label || selector });
    if (box) await this.movePointerTo(box);
    await locator.scrollIntoViewIfNeeded().catch(() => {});
    await locator.click({ timeout: Number.isFinite(input.timeoutMs) ? input.timeoutMs : 5000 });
    if (box) await this.clickPulse();
    if (Number.isFinite(input.waitMs) && input.waitMs > 0) await page.waitForTimeout(input.waitMs);
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    const snapshot = await this.inspect();
    this.recordAction('click', { elementId: input.elementId || null, selector });
    this.manager.broadcast(this.sessionId, {
      type: 'browserActionResult',
      action: 'click',
      success: true,
      selector,
      snapshot,
    });
    return snapshot;
  }

  async type(input = {}) {
    const page = this.ensureActivePage();
    const value = String(input.value ?? '');
    const { locator, record, selector } = await this.resolveLocator(page, input.elementId, input.selector);
    const box = await locator.boundingBox();
    await this.narrate('type', { label: record.label || selector });
    if (box) await this.movePointerTo(box);
    await locator.scrollIntoViewIfNeeded().catch(() => {});
    await locator.click({ timeout: Number.isFinite(input.timeoutMs) ? input.timeoutMs : 5000 }).catch(() => {});
    if (box) await this.clickPulse();
    await locator.fill('');
    if (value) {
      await locator.type(value, { delay: input.typeDelayMs || 22 });
    }
    if (Number.isFinite(input.waitMs) && input.waitMs > 0) await page.waitForTimeout(input.waitMs);
    const snapshot = await this.inspect();
    this.recordAction('type', { elementId: input.elementId || null, selector, valueLength: value.length });
    this.manager.broadcast(this.sessionId, {
      type: 'browserActionResult',
      action: 'type',
      success: true,
      selector,
      snapshot,
    });
    return snapshot;
  }

  async select(input = {}) {
    const page = this.ensureActivePage();
    const { locator, record, selector } = await this.resolveLocator(page, input.elementId, input.selector);
    const box = await locator.boundingBox();
    await this.narrate('select', { label: record.label || selector });
    if (box) await this.movePointerTo(box);
    await locator.scrollIntoViewIfNeeded().catch(() => {});
    await locator.selectOption(input.value != null ? { value: String(input.value) } : { label: String(input.label || '') });
    if (box) await this.clickPulse();
    if (Number.isFinite(input.waitMs) && input.waitMs > 0) await page.waitForTimeout(input.waitMs);
    const snapshot = await this.inspect();
    this.recordAction('select', { elementId: input.elementId || null, selector, value: input.value ?? input.label ?? null });
    this.manager.broadcast(this.sessionId, {
      type: 'browserActionResult',
      action: 'select',
      success: true,
      selector,
      snapshot,
    });
    return snapshot;
  }

  async waitForState(input = {}) {
    const page = this.ensureActivePage();
    await this.narrate('wait');

    if (input.selector) {
      await page.waitForSelector(input.selector, {
        state: input.state || 'visible',
        timeout: Number.isFinite(input.timeoutMs) ? input.timeoutMs : 15000,
      });
    }
    if (input.urlIncludes) {
      await page.waitForURL((candidate) => String(candidate).includes(String(input.urlIncludes)), {
        timeout: Number.isFinite(input.timeoutMs) ? input.timeoutMs : 15000,
      }).catch(() => {
        throw new Error(`Timed out waiting for URL containing "${input.urlIncludes}"`);
      });
    }
    if (input.textIncludes) {
      await page.waitForFunction((needle) => document.body?.innerText?.includes(needle), String(input.textIncludes), {
        timeout: Number.isFinite(input.timeoutMs) ? input.timeoutMs : 15000,
      });
    }
    if (input.loadState) {
      await page.waitForLoadState(input.loadState, {
        timeout: Number.isFinite(input.timeoutMs) ? input.timeoutMs : 15000,
      }).catch(() => {});
    }
    if (Number.isFinite(input.settleMs) && input.settleMs > 0) await page.waitForTimeout(input.settleMs);

    const snapshot = await this.inspect();
    this.recordAction('wait', {
      selector: input.selector || null,
      urlIncludes: input.urlIncludes || null,
      textIncludes: input.textIncludes || null,
    });
    this.manager.broadcast(this.sessionId, {
      type: 'browserActionResult',
      action: 'wait',
      success: true,
      snapshot,
    });
    return snapshot;
  }

  async screenshot(options = {}) {
    const page = this.ensureActivePage();
    if (Number.isFinite(options.waitMs) && options.waitMs > 0) {
      await page.waitForTimeout(options.waitMs);
    }
    const buffer = await page.screenshot({
      type: 'png',
      fullPage: !!options.fullPage,
    });
    this.recordAction('screenshot', { fullPage: !!options.fullPage });
    const result = {
      browserSessionId: this.sessionId,
      url: page.url(),
      title: await page.title().catch(() => ''),
      screenshotBase64: buffer.toString('base64'),
      fullPage: !!options.fullPage,
      capturedAt: nowIso(),
    };
    this.manager.broadcast(this.sessionId, {
      type: 'browserActionResult',
      action: 'screenshot',
      success: true,
      result: {
        ...result,
        screenshotBase64: '[base64]',
      },
    });
    return result;
  }

  async save(options = {}) {
    await this.narrate('save', { text: options.narration || buildNarration('save') });
    ensureDir(BROWSER_SAVES_DIR);
    const browserSaveId = options.browserSaveId || `browser-save-${hashId(`${this.sessionId}-${Date.now()}`)}`;
    const storageState = await this.context.storageState();
    const pages = this.context.pages().filter((page) => !page.isClosed());
    const tabStates = [];
    for (const page of pages) {
      tabStates.push(await this.captureTabState(page));
    }
    const activeTabIndex = Math.max(0, pages.indexOf(this.ensureActivePage()));
    const payload = {
      browserSaveId,
      browserSessionId: this.sessionId,
      name: options.name || shortText(this.summary().title || this.summary().currentUrl || browserSaveId, 120),
      createdAt: options.createdAt || nowIso(),
      updatedAt: nowIso(),
      persistenceMode: this.persistenceMode,
      requestedViewMode: this.requestedViewMode,
      effectiveViewMode: this.summary().effectiveViewMode,
      lastUrl: this.summary().currentUrl,
      activeTabIndex,
      tabStates,
      storageState,
      lastSnapshot: this.lastSnapshot,
      actionHistory: this.actionHistory,
      narrationHistory: this.narrationHistory,
      autoSaved: !!options.autoSave,
    };
    fs.writeFileSync(path.join(BROWSER_SAVES_DIR, `${browserSaveId}.json`), JSON.stringify(payload, null, 2));
    this.lastSaveId = browserSaveId;
    this.recordAction('save', { browserSaveId, autoSave: !!options.autoSave });
    this.manager.broadcast(this.sessionId, {
      type: 'browserSaved',
      summary: {
        browserSaveId,
        name: payload.name,
        updatedAt: payload.updatedAt,
        persistenceMode: payload.persistenceMode,
        lastUrl: payload.lastUrl,
        autoSaved: !!options.autoSave,
      },
    });
    return {
      browserSaveId,
      name: payload.name,
      updatedAt: payload.updatedAt,
      persistenceMode: payload.persistenceMode,
      lastUrl: payload.lastUrl,
      activeTabIndex,
      tabCount: tabStates.length,
      autoSaved: !!options.autoSave,
    };
  }

  async persistForScraper(url) {
    const targetUrl = url || this.summary().currentUrl;
    if (!targetUrl) throw new Error('Cannot persist browser state without a current URL');
    const file = sessionStorageFile(targetUrl);
    await this.context.storageState({ path: file });
    return file;
  }

  async runSteps(steps = []) {
    if (!Array.isArray(steps) || steps.length === 0) throw new Error('steps must be a non-empty array');
    if (steps.length > 12) throw new Error('steps may contain at most 12 actions');

    const results = [];
    const failures = [];

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index] || {};
      const type = String(step.type || '').trim().toLowerCase();
      try {
        let result;
        if (type === 'navigate') result = await this.navigate(step.url, step);
        else if (type === 'inspect') result = await this.inspect(step);
        else if (type === 'click') result = await this.click(step);
        else if (type === 'type') result = await this.type(step);
        else if (type === 'select') result = await this.select(step);
        else if (type === 'wait') result = await this.waitForState(step);
        else if (type === 'screenshot') result = await this.screenshot(step);
        else if (type === 'scrape') {
          result = await this.manager.scrapeBrowserSession(this.sessionId, step);
        } else {
          throw new Error(`Unsupported browser step type: ${type}`);
        }
        results.push({ index, type, success: true, result });
      } catch (err) {
        const failure = { index, type, success: false, error: serializeError(err) };
        results.push(failure);
        failures.push(failure);
        if (step.continueOnError !== true) break;
      }
    }

    return {
      browserSessionId: this.sessionId,
      steps: results,
      failures,
      finalSnapshot: this.lastSnapshot,
      narrationTrail: this.narrationHistory.slice(-Math.max(steps.length, 1)),
    };
  }

  async close(options = {}) {
    if (this.closed) return { browserSessionId: this.sessionId, closed: true, autoSaved: false };
    let autoSaved = null;
    await this.narrate('close', { text: options.narration || buildNarration('close') });
    if (this.autoSaveOnClose && options.skipAutoSave !== true) {
      try {
        autoSaved = await this.save({ autoSave: true, name: options.autoSaveName });
      } catch {}
    }
    this.stopFrameLoop();
    this.closed = true;
    this.state = 'closed';
    this.touch();
    try { await this.context?.close?.(); } catch {}
    try { await this.browser?.close?.(); } catch {}
    this.manager.broadcast(this.sessionId, {
      type: 'browserClosed',
      summary: this.summary(),
      autoSaved,
    });
    return {
      browserSessionId: this.sessionId,
      closed: true,
      autoSaved,
    };
  }
}

class BrowserSessionManager {
  constructor(options = {}) {
    ensureDir(BROWSER_ROOT_DIR);
    ensureDir(BROWSER_SAVES_DIR);
    this.sessions = new Map();
    this.broadcast = typeof options.broadcast === 'function' ? options.broadcast : () => {};
    this.startScrapeJob = typeof options.startScrapeJob === 'function' ? options.startScrapeJob : null;
    this.cleanupTimer = setInterval(() => {
      this.cleanupIdleSessions().catch(() => {});
    }, 30_000);
    this.cleanupTimer.unref?.();
  }

  setScrapeJobStarter(fn) {
    this.startScrapeJob = fn;
  }

  countHeadfulSessions() {
    let total = 0;
    for (const session of this.sessions.values()) {
      if (!session.headless && session.state !== 'closed') total += 1;
    }
    return total;
  }

  listSessions() {
    return Array.from(this.sessions.values())
      .map((session) => ({
        ...session.summary(),
        snapshot: session.lastSnapshot,
      }))
      .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));
  }

  getSession(sessionId) {
    const session = this.sessions.get(String(sessionId));
    if (!session) throw new Error(`Unknown browserSessionId: ${sessionId}`);
    return session;
  }

  async openSession(options = {}) {
    if (this.sessions.size >= MAX_ACTIVE_BROWSER_SESSIONS) {
      const err = new Error('Too many active browser sessions');
      err.statusCode = 429;
      err.details = {
        activeBrowserSessions: this.sessions.size,
        maxActiveBrowserSessions: MAX_ACTIVE_BROWSER_SESSIONS,
      };
      throw err;
    }

    const requestedViewMode = normalizeViewMode(options.viewMode);
    const forceHeadless = isTestLikeEnvironment() && requestedViewMode !== 'console';
    if (!forceHeadless && requestedViewMode !== 'console' && this.countHeadfulSessions() >= MAX_ACTIVE_HEADFUL_BROWSER_SESSIONS) {
      const err = new Error('Too many visible desktop browser sessions');
      err.statusCode = 429;
      err.details = {
        activeHeadfulBrowserSessions: this.countHeadfulSessions(),
        maxActiveHeadfulBrowserSessions: MAX_ACTIVE_HEADFUL_BROWSER_SESSIONS,
      };
      throw err;
    }

    const restoreSave = options.restoreSaveId ? this.getSave(options.restoreSaveId) : null;
    const sessionId = options.browserSessionId || `browser-${uuidv4()}`;
    const session = new BrowserSession(this, sessionId, {
      ...options,
      viewMode: requestedViewMode,
      forceHeadless,
      restoreSaveId: options.restoreSaveId || null,
    });
    this.sessions.set(sessionId, session);

    try {
      return await session.open({ restoreSave });
    } catch (err) {
      this.sessions.delete(sessionId);
      try { await session.close({ skipAutoSave: true }); } catch {}
      throw err;
    }
  }

  async cleanupIdleSessions() {
    const cutoff = Date.now() - BROWSER_SESSION_IDLE_TTL_MS;
    for (const [sessionId, session] of this.sessions.entries()) {
      const lastActiveAt = new Date(session.lastActiveAt).getTime();
      if (!Number.isFinite(lastActiveAt) || lastActiveAt >= cutoff) continue;
      try {
        await session.close({ skipAutoSave: false, narration: 'Closing an idle browser session to free resources.' });
      } catch {}
      this.sessions.delete(sessionId);
    }
  }

  async getSessionState(sessionId, options = {}) {
    const session = this.getSession(sessionId);
    if (options.refreshSnapshot || !session.lastSnapshot) {
      await session.inspect();
    }
    return {
      ...session.summary(),
      snapshot: session.lastSnapshot,
      pointer: session.pointer,
      narrationTrail: session.narrationHistory,
      actionHistory: session.actionHistory,
      consoleEvents: session.consoleEvents.slice(-20),
      pageErrors: session.pageErrors.slice(-10),
      networkEvents: session.networkEvents.slice(-20),
    };
  }

  async navigateSession(sessionId, url, options = {}) {
    const session = this.getSession(sessionId);
    return session.navigate(url, options);
  }

  async inspectSession(sessionId, options = {}) {
    return this.getSession(sessionId).inspect(options);
  }

  async clickElement(sessionId, input = {}) {
    return this.getSession(sessionId).click(input);
  }

  async typeIntoElement(sessionId, input = {}) {
    return this.getSession(sessionId).type(input);
  }

  async selectOption(sessionId, input = {}) {
    return this.getSession(sessionId).select(input);
  }

  async waitForState(sessionId, input = {}) {
    return this.getSession(sessionId).waitForState(input);
  }

  async screenshotSession(sessionId, options = {}) {
    return this.getSession(sessionId).screenshot(options);
  }

  async runBrowserSteps(sessionId, steps = []) {
    return this.getSession(sessionId).runSteps(steps);
  }

  async saveSession(sessionId, options = {}) {
    return this.getSession(sessionId).save(options);
  }

  async closeSession(sessionId, options = {}) {
    const session = this.getSession(sessionId);
    const result = await session.close(options);
    this.sessions.delete(sessionId);
    return result;
  }

  listSaves() {
    ensureDir(BROWSER_SAVES_DIR);
    return fs.readdirSync(BROWSER_SAVES_DIR)
      .filter((entry) => entry.endsWith('.json'))
      .map((entry) => {
        try {
          const save = JSON.parse(fs.readFileSync(path.join(BROWSER_SAVES_DIR, entry), 'utf8'));
          return {
            browserSaveId: save.browserSaveId,
            name: save.name,
            updatedAt: save.updatedAt,
            createdAt: save.createdAt,
            lastUrl: save.lastUrl,
            persistenceMode: save.persistenceMode,
            requestedViewMode: save.requestedViewMode,
            tabCount: Array.isArray(save.tabStates) ? save.tabStates.length : 0,
            autoSaved: !!save.autoSaved,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));
  }

  getSave(browserSaveId) {
    const file = path.join(BROWSER_SAVES_DIR, `${browserSaveId}.json`);
    if (!fs.existsSync(file)) throw new Error(`Unknown browserSaveId: ${browserSaveId}`);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  deleteSave(browserSaveId) {
    const file = path.join(BROWSER_SAVES_DIR, `${browserSaveId}.json`);
    if (!fs.existsSync(file)) throw new Error(`Unknown browserSaveId: ${browserSaveId}`);
    const save = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.unlinkSync(file);
    return {
      browserSaveId: save.browserSaveId,
      name: save.name,
      lastUrl: save.lastUrl,
      updatedAt: save.updatedAt,
    };
  }

  async scrapeBrowserSession(sessionId, options = {}) {
    if (typeof this.startScrapeJob !== 'function') {
      throw new Error('Browser session scraping is not configured on this server');
    }
    const session = this.getSession(sessionId);
    const activeUrl = options.url || session.summary().currentUrl;
    if (!activeUrl) throw new Error('No current page URL is available to scrape');

    await session.narrate('scrape');
    await session.persistForScraper(activeUrl);
    const requestBody = {
      url: activeUrl,
      maxPages: Number.isFinite(options.maxPages) ? options.maxPages : 3,
      scrapeDepth: Number.isFinite(options.scrapeDepth) ? options.scrapeDepth : 1,
      captureGraphQL: options.captureGraphQL !== false,
      captureREST: options.captureREST !== false,
      captureAssets: options.captureAssets !== false,
      autoScroll: !!options.autoScroll,
      fullCrawl: !!options.fullCrawl,
      showBrowser: false,
      liveView: false,
      uiVisible: false,
      initiatedBy: 'browser-session',
      proxy: options.proxy || null,
    };

    const launched = this.startScrapeJob(requestBody);
    if (!launched?.completionPromise || !launched.sessionId) {
      throw new Error('Scrape launcher did not return a completion promise');
    }
    const result = await launched.completionPromise;
    return {
      browserSessionId: sessionId,
      scrapeSessionId: launched.sessionId,
      result,
    };
  }

  async closeAll() {
    const closing = [];
    for (const [sessionId, session] of this.sessions.entries()) {
      closing.push(session.close({ skipAutoSave: false }).catch(() => {}));
      this.sessions.delete(sessionId);
    }
    await Promise.allSettled(closing);
  }
}

module.exports = BrowserSessionManager;
