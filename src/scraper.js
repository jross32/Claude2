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
    this.assets = [];
    this.errors = [];
    this.websockets = [];
    this.cookies = [];
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
          if (totalHeight >= document.body.scrollHeight || totalHeight > 15000) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
    await page.waitForTimeout(1000);
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
      clickSequence,
      autoScroll,
    } = options;

    // Batch mode: multiple URLs
    const targetUrls = urls && urls.length > 0 ? urls : (url ? [url] : []);
    if (targetUrls.length === 0) throw new Error('No URL(s) provided');

    const primaryUrl = targetUrls[0];
    this.log(`Starting scrape of ${primaryUrl}`);
    this.progress('Launching browser', 5);

    this.browser = await chromium.launch({
      executablePath: CHROMIUM_PATH,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
      ],
    });

    try {
      const context = await this.browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
      });

      const page = await context.newPage();

      // Request interception using page.route
      await page.route('**/*', async (route) => {
        if (this.stopped) {
          await route.abort().catch(() => {});
          return;
        }

        const request = route.request();
        const reqUrl = request.url();
        const method = request.method();
        const headers = request.headers();
        const postData = request.postData();

        // Capture GraphQL calls
        if (captureGraphQL) {
          const isGraphQL =
            reqUrl.includes('/graphql') ||
            reqUrl.includes('/api/graphql') ||
            (headers['content-type'] &&
              headers['content-type'].includes('application/json') &&
              postData &&
              (postData.includes('"query"') || postData.includes('"mutation"')));

          if (isGraphQL) {
            let parsedBody = null;
            try { parsedBody = postData ? JSON.parse(postData) : null; } catch {}
            this.graphqlCalls.push({
              url: reqUrl,
              method,
              headers: this._sanitizeHeaders(headers),
              body: parsedBody || postData,
              timestamp: new Date().toISOString(),
              response: null,
            });
            this.log(`GraphQL call intercepted: ${reqUrl}`, 'graphql');
          }
        }

        // Capture REST API calls
        if (captureREST) {
          const isAPI =
            reqUrl.includes('/api/') ||
            reqUrl.includes('/v1/') ||
            reqUrl.includes('/v2/') ||
            reqUrl.includes('/v3/') ||
            reqUrl.includes('/rest/') ||
            (headers['accept'] && headers['accept'].includes('application/json') && !reqUrl.includes('/graphql'));

          const resourceType = request.resourceType();
          const isDocument = ['document', 'script', 'stylesheet', 'font', 'image'].includes(resourceType);

          if (isAPI && !isDocument && !reqUrl.includes('/graphql')) {
            let parsedBody = null;
            try { parsedBody = postData ? JSON.parse(postData) : null; } catch {}
            this.restCalls.push({
              url: reqUrl,
              method,
              headers: this._sanitizeHeaders(headers),
              body: parsedBody || postData || null,
              resourceType,
              timestamp: new Date().toISOString(),
              response: null,
            });
            this.log(`REST call intercepted: ${method} ${reqUrl}`, 'api');
          }
        }

        // Capture asset URLs
        if (captureAssets) {
          const resourceType = request.resourceType();
          const assetTypes = ['image', 'media', 'font', 'stylesheet', 'script'];
          if (assetTypes.includes(resourceType)) {
            this.assets.push({
              url: reqUrl,
              type: resourceType,
              timestamp: new Date().toISOString(),
            });
          }
        }

        await route.continue().catch(() => {});
      });

      // Capture responses for GraphQL/REST
      page.on('response', async (response) => {
        const respUrl = response.url();
        const status = response.status();

        const gqlIdx = this.graphqlCalls.findLastIndex((c) => c.url === respUrl && c.response === null);
        if (gqlIdx !== -1) {
          try {
            const responseText = await response.text();
            let parsed = null;
            try { parsed = JSON.parse(responseText); } catch {}
            this.graphqlCalls[gqlIdx].response = { status, body: parsed || responseText };
          } catch {}
        }

        const restIdx = this.restCalls.findLastIndex((c) => c.url === respUrl && c.response === null);
        if (restIdx !== -1) {
          try {
            const contentType = response.headers()['content-type'] || '';
            if (contentType.includes('application/json')) {
              const responseText = await response.text();
              let parsed = null;
              try { parsed = JSON.parse(responseText); } catch {}
              this.restCalls[restIdx].response = { status, body: parsed || responseText };
            } else {
              this.restCalls[restIdx].response = { status, body: null };
            }
          } catch {}
        }
      });

      // WebSocket capture
      page.on('websocket', (ws) => {
        this.websockets.push({ url: ws.url(), frames: [] });
        const entry = this.websockets[this.websockets.length - 1];
        ws.on('framesent', (frame) =>
          entry.frames.push({ dir: 'sent', payload: frame.payload, time: new Date().toISOString() })
        );
        ws.on('framereceived', (frame) =>
          entry.frames.push({ dir: 'received', payload: frame.payload, time: new Date().toISOString() })
        );
      });

      page.on('pageerror', (err) => {
        this.errors.push({ type: 'pageError', message: err.message });
      });

      // Navigate to the primary page
      this.progress('Navigating to page', 15);
      this.log(`Navigating to ${primaryUrl}`);
      await page.goto(primaryUrl, { waitUntil: 'networkidle', timeout: 60000 });

      // Detect site info
      this.progress('Detecting site info', 25);
      const siteInfo = await this._detectSiteInfo(page, primaryUrl);
      this.log(`Site detected: ${siteInfo.title}`);

      if (siteInfo.hasLoginForm) {
        this.log('Login form detected');
        this.broadcast(this.sessionId, { type: 'siteInfo', data: siteInfo });
      }

      // Handle authentication if needed
      if (hasAuth && siteInfo.hasLoginForm) {
        this.progress('Authenticating', 35);
        this.log('Starting authentication...');

        await handleAuth(page, {
          username,
          password,
          verificationType,
          verificationCode,
          waitForVerification: this.waitForVerification.bind(this),
          log: this.log.bind(this),
          sessionId: this.sessionId,
          broadcast: this.broadcast,
        });

        await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
        this.log('Authentication complete');

        // Export cookies after auth
        try {
          this.cookies = await context.cookies();
        } catch {}
      }

      // Execute click sequence if provided
      if (clickSequence && clickSequence.length > 0) {
        this.progress('Executing click sequence', 40);
        for (const step of clickSequence) {
          try {
            await page.click(step.selector, { timeout: 5000 });
            if (step.waitFor) {
              await page.waitForSelector(step.waitFor, { timeout: 5000 }).catch(() => {});
            }
            await page.waitForTimeout(500);
          } catch (err) {
            this.log(`Click step failed for "${step.selector}": ${err.message}`, 'warn');
          }
        }
      }

      // Auto scroll if requested
      if (autoScroll) {
        this.progress('Auto-scrolling page', 48);
        await this._autoScroll(page);
      }

      this.progress('Extracting page data', 55);
      this.log('Extracting page data...');

      // Handle batch or single URL
      let allResults = [];
      if (targetUrls.length > 1) {
        // Batch mode
        for (let i = 0; i < targetUrls.length; i++) {
          const targetUrl = targetUrls[i];
          if (this.stopped) break;
          this.progress(`Scraping ${i + 1}/${targetUrls.length}`, 55 + Math.floor((i / targetUrls.length) * 25));
          try {
            await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 });
            const visitedPages = [];
            const pageData = await this._scrapePage(page, targetUrl, scrapeDepth || 1, visitedPages);
            allResults.push(...pageData);
          } catch (err) {
            this.errors.push({ type: 'batchError', url: targetUrl, message: err.message });
          }
        }
      } else {
        // Single URL
        const visitedPages = [];
        allResults = await this._scrapePage(page, primaryUrl, scrapeDepth || 1, visitedPages);
      }

      // GraphQL introspection: try introspection query on detected graphql endpoint
      const gqlEndpoint = this._detectGraphQLEndpoint();
      if (gqlEndpoint) {
        try {
          const introspectionResult = await page.evaluate(async (endpoint) => {
            const resp = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: '{ __schema { types { name } } }' }),
            });
            return resp.json();
          }, gqlEndpoint);
          this.graphqlCalls.push({
            url: gqlEndpoint,
            method: 'POST',
            headers: {},
            body: { query: '{ __schema { types { name } } }' },
            timestamp: new Date().toISOString(),
            response: { status: 200, body: introspectionResult },
            _introspection: true,
          });
          this.log(`GraphQL introspection completed for ${gqlEndpoint}`, 'graphql');
        } catch {}
      }

      this.progress('Formatting results', 85);

      const result = {
        meta: {
          scrapedAt: new Date().toISOString(),
          targetUrl: primaryUrl,
          targetUrls: targetUrls.length > 1 ? targetUrls : undefined,
          totalPages: allResults.length,
          totalGraphQLCalls: this.graphqlCalls.length,
          totalRESTCalls: this.restCalls.length,
          totalAssets: this.assets.length,
          totalWebSockets: this.websockets.length,
        },
        siteInfo,
        pages: allResults,
        apiCalls: {
          graphql: this.graphqlCalls,
          rest: this.restCalls,
        },
        assets: captureAssets ? this.assets : [],
        websockets: this.websockets,
        cookies: this.cookies.map((c) => ({ name: c.name, domain: c.domain, path: c.path, secure: c.secure })),
        errors: this.errors,
      };

      this.progress('Done', 100);
      this.log('Scraping complete!', 'success');

      return result;
    } finally {
      if (this.browser) {
        await this.browser.close().catch(() => {});
      }
    }
  }

  async _scrapePage(page, url, depth, visited) {
    if (visited.includes(url) || this.stopped) return [];
    visited.push(url);

    this.log(`Scraping page: ${url}`);
    const pageData = await extractPageData(page, url);
    const results = [pageData];

    if (depth > 1) {
      const internalLinks = pageData.links
        .filter((l) => l.isInternal && !visited.includes(l.href))
        .slice(0, 10);

      for (const link of internalLinks) {
        if (this.stopped) break;
        try {
          await page.goto(link.href, { waitUntil: 'networkidle', timeout: 30000 });
          const subPages = await this._scrapePage(page, link.href, depth - 1, visited);
          results.push(...subPages);
        } catch (err) {
          this.errors.push({ type: 'navigationError', url: link.href, message: err.message });
        }
      }
    }

    return results;
  }

  _detectGraphQLEndpoint() {
    const seen = this.graphqlCalls.filter((c) => !c._introspection);
    if (seen.length > 0) return seen[0].url;
    return null;
  }

  async _detectSiteInfo(page, url) {
    return page.evaluate((pageUrl) => {
      const origin = new URL(pageUrl).origin;

      const logoSelectors = [
        'img[src*="logo"]',
        'img[alt*="logo" i]',
        'img[class*="logo" i]',
        'img[id*="logo" i]',
        'a[class*="logo" i] img',
        'header img',
        '.navbar-brand img',
        '.site-logo img',
      ];
      let logoUrl = null;
      for (const sel of logoSelectors) {
        const el = document.querySelector(sel);
        if (el && el.src) { logoUrl = el.src; break; }
      }

      const passwordInputs = document.querySelectorAll('input[type="password"]');
      const hasLoginForm = passwordInputs.length > 0;

      const usernameSelectors = [
        'input[type="email"]',
        'input[name="email"]',
        'input[name="username"]',
        'input[name="user"]',
        'input[id*="email" i]',
        'input[id*="user" i]',
        'input[placeholder*="email" i]',
        'input[placeholder*="username" i]',
      ];
      let hasUsernameField = false;
      for (const sel of usernameSelectors) {
        if (document.querySelector(sel)) { hasUsernameField = true; break; }
      }

      const bodyText = document.body.innerText.toLowerCase();
      const has2FA =
        bodyText.includes('two-factor') ||
        bodyText.includes('2fa') ||
        bodyText.includes('authenticator') ||
        bodyText.includes('verification code') ||
        bodyText.includes('one-time');

      const hasCaptcha =
        document.querySelector('.g-recaptcha') !== null ||
        document.querySelector('[data-sitekey]') !== null ||
        bodyText.includes('captcha') ||
        bodyText.includes('i am not a robot') ||
        bodyText.includes("i'm not a robot");

      return {
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.content || '',
        favicon:
          document.querySelector('link[rel="icon"]')?.href ||
          document.querySelector('link[rel="shortcut icon"]')?.href ||
          `${origin}/favicon.ico`,
        logoUrl,
        hasLoginForm,
        hasUsernameField,
        has2FA,
        hasCaptcha,
        origin,
      };
    }, url);
  }

  _sanitizeHeaders(headers) {
    const sensitive = ['authorization', 'cookie', 'x-auth-token', 'x-api-key'];
    const sanitized = { ...headers };
    for (const key of sensitive) {
      if (sanitized[key]) sanitized[key] = '[REDACTED]';
    }
    return sanitized;
  }
}

module.exports = ScraperSession;
