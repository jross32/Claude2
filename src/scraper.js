const { chromium } = require('playwright');
const { extractPageData } = require('./extractor');
const { handleAuth } = require('./auth');

const CHROMIUM_PATH = '/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome';

class ScraperSession {
  constructor(sessionId, broadcast) {
    this.sessionId = sessionId;
    this.broadcast = broadcast;
    this.browser = null;
    this.stopped = false;
    this.verificationResolver = null;

    // Captured network data
    this.graphqlCalls = [];
    this.restCalls = [];
    this.allRequests = [];     // every single network request
    this.assets = [];
    this.errors = [];
    this.websockets = [];
    this.cookies = [];
    this.consoleLogs = [];
    this.securityHeaders = {};
    this.downloadedImages = [];
  }

  log(message, type = 'info') {
    console.log(`[${this.sessionId}] ${message}`);
    this.broadcast(this.sessionId, { type: 'log', level: type, message });
  }

  progress(step, percent) {
    this.broadcast(this.sessionId, { type: 'progress', step, percent });
  }

  async submitVerification(code) {
    if (this.verificationResolver) {
      this.verificationResolver(code);
      this.verificationResolver = null;
    }
  }

  async waitForVerification() {
    this.broadcast(this.sessionId, { type: 'needVerification' });
    return new Promise((resolve) => {
      this.verificationResolver = resolve;
      setTimeout(() => {
        if (this.verificationResolver) {
          this.verificationResolver(null);
          this.verificationResolver = null;
        }
      }, 300000);
    });
  }

  stop() {
    this.stopped = true;
    if (this.browser) {
      this.browser.close().catch(() => {});
    }
  }

  async _autoScroll(page) {
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 300;
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= document.body.scrollHeight || totalHeight > 20000) {
            clearInterval(timer);
            window.scrollTo(0, 0);
            resolve();
          }
        }, 80);
      });
    });
    await page.waitForTimeout(1500);
  }

  // Download images as base64 (up to N images, capped by size)
  async _downloadImages(page, images, maxImages = 30, maxSizeKB = 500) {
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
    const {
      url,
      urls,
      hasAuth,
      username,
      password,
      verificationType,
      verificationCode,
      scrapeDepth,
      captureGraphQL,
      captureREST,
      captureAssets,
      captureAllRequests,
      captureImages,
      autoScroll,
      clickSequence,
      showBrowser,
      slowMotion,
    } = options;

    const targetUrls = urls && urls.length > 0 ? urls : (url ? [url] : []);
    if (targetUrls.length === 0) throw new Error('No URL(s) provided');

    const primaryUrl = targetUrls[0];
    this.log(`Starting scrape of ${primaryUrl}`);
    this.progress('Launching browser', 5);

    const isHeadless = !showBrowser;
    this.log(showBrowser ? 'Launching visible browser window...' : 'Launching headless browser...');

    this.browser = await chromium.launch({
      executablePath: CHROMIUM_PATH,
      headless: isHeadless,
      slowMo: showBrowser && slowMotion ? parseInt(slowMotion) : 0,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--allow-running-insecure-content',
        ...(showBrowser ? ['--start-maximized'] : []),
      ],
    });

    try {
      const context = await this.browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1440, height: 900 },
        // Accept all content
        ignoreHTTPSErrors: true,
      });

      const page = await context.newPage();

      // ── Console log capture ──────────────────────────────────────────────
      page.on('console', (msg) => {
        this.consoleLogs.push({
          type: msg.type(),
          text: msg.text().substring(0, 1000),
          location: msg.location(),
          timestamp: new Date().toISOString(),
        });
      });

      // ── Request/Response interception (capture everything) ───────────────
      await page.route('**/*', async (route) => {
        if (this.stopped) { await route.abort().catch(() => {}); return; }

        const request = route.request();
        const reqUrl = request.url();
        const method = request.method();
        const headers = request.headers();
        const postData = request.postData();
        const resourceType = request.resourceType();

        // ── GraphQL ──
        if (captureGraphQL) {
          const isGraphQL =
            reqUrl.includes('/graphql') ||
            reqUrl.includes('/api/graphql') ||
            (headers['content-type']?.includes('application/json') &&
              postData && (postData.includes('"query"') || postData.includes('"mutation"')));

          if (isGraphQL) {
            let parsedBody = null;
            try { parsedBody = JSON.parse(postData); } catch {}
            this.graphqlCalls.push({
              url: reqUrl, method,
              headers: this._sanitizeHeaders(headers),
              body: parsedBody || postData,
              timestamp: new Date().toISOString(), response: null,
            });
            this.log(`GraphQL: ${reqUrl}`, 'graphql');
          }
        }

        // ── REST API ──
        if (captureREST) {
          const isAPI =
            reqUrl.match(/\/(api|v\d+|rest|graphql-rest)\//i) ||
            (headers['accept']?.includes('application/json') && !reqUrl.includes('/graphql'));
          const isDocLike = ['document', 'script', 'stylesheet', 'font', 'image'].includes(resourceType);
          if (isAPI && !isDocLike && !reqUrl.includes('/graphql')) {
            let parsedBody = null;
            try { parsedBody = JSON.parse(postData); } catch {}
            this.restCalls.push({
              url: reqUrl, method,
              headers: this._sanitizeHeaders(headers),
              body: parsedBody || postData || null,
              resourceType, timestamp: new Date().toISOString(), response: null,
            });
            this.log(`REST: ${method} ${reqUrl}`, 'api');
          }
        }

        // ── All requests (captureAllRequests mode) ──
        if (captureAllRequests) {
          this.allRequests.push({
            url: reqUrl, method, resourceType,
            headers: this._sanitizeHeaders(headers),
            postData: postData ? postData.substring(0, 2000) : null,
            timestamp: new Date().toISOString(),
            response: null,
          });
        }

        // ── Assets ──
        if (captureAssets) {
          if (['image','media','font','stylesheet','script'].includes(resourceType)) {
            this.assets.push({ url: reqUrl, type: resourceType, timestamp: new Date().toISOString() });
          }
        }

        await route.continue().catch(() => {});
      });

      // ── Response handler ─────────────────────────────────────────────────
      page.on('response', async (response) => {
        const respUrl = response.url();
        const status = response.status();
        const respHeaders = response.headers();

        // Capture security headers from main document
        if (response.request().resourceType() === 'document') {
          this.securityHeaders = {
            url: respUrl,
            status,
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

        // Attach responses to GraphQL calls
        const gqlIdx = this.graphqlCalls.findLastIndex(c => c.url === respUrl && c.response === null);
        if (gqlIdx !== -1) {
          try {
            const text = await response.text();
            let parsed = null; try { parsed = JSON.parse(text); } catch {}
            this.graphqlCalls[gqlIdx].response = { status, headers: respHeaders, body: parsed || text };
          } catch {}
        }

        // Attach responses to REST calls
        const restIdx = this.restCalls.findLastIndex(c => c.url === respUrl && c.response === null);
        if (restIdx !== -1) {
          try {
            const ct = respHeaders['content-type'] || '';
            if (ct.includes('application/json')) {
              const text = await response.text();
              let parsed = null; try { parsed = JSON.parse(text); } catch {}
              this.restCalls[restIdx].response = { status, headers: respHeaders, body: parsed || text };
            } else {
              this.restCalls[restIdx].response = { status, headers: respHeaders, body: null };
            }
          } catch {}
        }

        // Attach responses to all-requests
        if (captureAllRequests) {
          const idx = this.allRequests.findLastIndex(c => c.url === respUrl && c.response === null);
          if (idx !== -1) {
            try {
              const ct = respHeaders['content-type'] || '';
              const isText = ct.includes('json') || ct.includes('text') || ct.includes('xml');
              let body = null;
              if (isText) {
                const text = await response.text();
                if (ct.includes('json')) {
                  try { body = JSON.parse(text); } catch { body = text.substring(0, 2000); }
                } else {
                  body = text.substring(0, 2000);
                }
              }
              this.allRequests[idx].response = { status, contentType: ct, headers: respHeaders, body };
            } catch {}
          }
        }
      });

      // ── WebSocket capture ────────────────────────────────────────────────
      page.on('websocket', (ws) => {
        const entry = { url: ws.url(), frames: [], openedAt: new Date().toISOString() };
        this.websockets.push(entry);
        ws.on('framesent', f => entry.frames.push({ dir: 'sent', payload: String(f.payload).substring(0, 2000), time: new Date().toISOString() }));
        ws.on('framereceived', f => entry.frames.push({ dir: 'received', payload: String(f.payload).substring(0, 2000), time: new Date().toISOString() }));
        ws.on('close', () => { entry.closedAt = new Date().toISOString(); });
      });

      // ── Page errors ──────────────────────────────────────────────────────
      page.on('pageerror', (err) => {
        this.errors.push({ type: 'pageError', message: err.message, stack: err.stack?.substring(0, 500) });
      });
      page.on('requestfailed', (req) => {
        this.errors.push({ type: 'requestFailed', url: req.url(), failure: req.failure()?.errorText });
      });

      // ── Navigate ─────────────────────────────────────────────────────────
      this.progress('Navigating to page', 15);
      this.log(`Navigating to ${primaryUrl}`);
      await page.goto(primaryUrl, { waitUntil: 'networkidle', timeout: 60000 });

      // ── Detect site info ─────────────────────────────────────────────────
      this.progress('Detecting site info', 22);
      const siteInfo = await this._detectSiteInfo(page, primaryUrl);
      this.log(`Site detected: ${siteInfo.title}`);
      this.broadcast(this.sessionId, { type: 'siteInfo', data: siteInfo });

      // ── Authentication ───────────────────────────────────────────────────
      if (hasAuth && siteInfo.hasLoginForm) {
        this.progress('Authenticating', 30);
        this.log('Starting authentication...');
        await handleAuth(page, {
          username, password, verificationType, verificationCode,
          waitForVerification: this.waitForVerification.bind(this),
          log: this.log.bind(this),
          sessionId: this.sessionId,
          broadcast: this.broadcast,
        });
        await page.waitForLoadState('networkidle').catch(() => {});
        this.log('Authentication complete');
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
            else await page.waitForLoadState('networkidle').catch(() => {});
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
        await page.waitForLoadState('networkidle').catch(() => {});
      }

      // ── Scrape pages ─────────────────────────────────────────────────────
      this.progress('Extracting page data', 50);
      let allResults = [];

      if (targetUrls.length > 1) {
        for (let i = 0; i < targetUrls.length; i++) {
          if (this.stopped) break;
          this.progress(`Batch: scraping ${i + 1}/${targetUrls.length}`, 50 + Math.floor((i / targetUrls.length) * 30));
          try {
            await page.goto(targetUrls[i], { waitUntil: 'networkidle', timeout: 60000 });
            if (autoScroll) await this._autoScroll(page);
            const visited = [];
            allResults.push(...await this._scrapePage(page, targetUrls[i], scrapeDepth || 1, visited));
          } catch (err) {
            this.errors.push({ type: 'batchError', url: targetUrls[i], message: err.message });
          }
        }
      } else {
        const visited = [];
        allResults = await this._scrapePage(page, primaryUrl, scrapeDepth || 1, visited, autoScroll);
      }

      // ── Download images as base64 ────────────────────────────────────────
      if (captureImages && allResults.length > 0) {
        this.progress('Downloading images', 80);
        this.log('Downloading images as base64...');
        const firstPageImages = allResults[0]?.images || [];
        this.downloadedImages = await this._downloadImages(page, firstPageImages);
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
          totalAssets: this.assets.length,
          totalWebSockets: this.websockets.length,
          totalImages: (allResults[0]?.images?.length || 0),
          totalDownloadedImages: this.downloadedImages.length,
          totalConsoleLogs: this.consoleLogs.length,
          totalErrors: this.errors.length,
        },
        siteInfo,
        pages: allResults,
        apiCalls: {
          graphql: this.graphqlCalls,
          rest: this.restCalls,
          all: captureAllRequests ? this.allRequests : [],
        },
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
      return result;

    } finally {
      if (this.browser) await this.browser.close().catch(() => {});
    }
  }

  async _scrapePage(page, url, depth, visited, autoScroll = false) {
    if (visited.includes(url) || this.stopped) return [];
    visited.push(url);
    this.log(`Extracting: ${url}`);
    if (autoScroll && depth >= 1) await this._autoScroll(page);
    const pageData = await extractPageData(page, url);
    const results = [pageData];

    if (depth > 1) {
      const links = (pageData.links || [])
        .filter(l => l.isInternal && !visited.includes(l.href) && l.href?.startsWith('http'))
        .slice(0, 8);

      for (const link of links) {
        if (this.stopped) break;
        try {
          await page.goto(link.href, { waitUntil: 'networkidle', timeout: 30000 });
          if (autoScroll) await this._autoScroll(page);
          results.push(...await this._scrapePage(page, link.href, depth - 1, visited));
        } catch (err) {
          this.errors.push({ type: 'navigationError', url: link.href, message: err.message });
        }
      }
    }
    return results;
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

  _sanitizeHeaders(headers) {
    const redact = ['authorization','cookie','x-auth-token','x-api-key','x-csrf-token'];
    const out = { ...headers };
    for (const k of redact) if (out[k]) out[k] = '[REDACTED]';
    return out;
  }
}

module.exports = ScraperSession;
