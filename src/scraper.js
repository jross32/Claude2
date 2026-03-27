const puppeteer = require('puppeteer');
const { extractPageData } = require('./extractor');
const { handleAuth } = require('./auth');

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
      // Timeout after 5 minutes
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

  async run(options) {
    const {
      url,
      hasAuth,
      username,
      password,
      verificationType,
      verificationCode,
      scrapeDepth,
      captureGraphQL,
      captureREST,
      captureAssets,
    } = options;

    this.log(`Starting scrape of ${url}`);
    this.progress('Launching browser', 5);

    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
      ],
    });

    try {
      const page = await this.browser.newPage();

      // Set realistic viewport and user agent
      await page.setViewport({ width: 1280, height: 800 });
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Enable request interception
      await page.setRequestInterception(true);

      page.on('request', (request) => {
        if (this.stopped) {
          request.abort();
          return;
        }

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
            try {
              parsedBody = postData ? JSON.parse(postData) : null;
            } catch {}

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

          const isDocument = ['document', 'script', 'stylesheet', 'font', 'image'].includes(request.resourceType());

          if (isAPI && !isDocument && !reqUrl.includes('/graphql')) {
            let parsedBody = null;
            try {
              parsedBody = postData ? JSON.parse(postData) : null;
            } catch {}

            this.restCalls.push({
              url: reqUrl,
              method,
              headers: this._sanitizeHeaders(headers),
              body: parsedBody || postData || null,
              resourceType: request.resourceType(),
              timestamp: new Date().toISOString(),
              response: null,
            });
            this.log(`REST call intercepted: ${method} ${reqUrl}`, 'api');
          }
        }

        // Capture asset URLs
        if (captureAssets) {
          const assetTypes = ['image', 'media', 'font', 'stylesheet', 'script'];
          if (assetTypes.includes(request.resourceType())) {
            this.assets.push({
              url: reqUrl,
              type: request.resourceType(),
              timestamp: new Date().toISOString(),
            });
          }
        }

        request.continue();
      });

      // Capture responses for GraphQL/REST
      page.on('response', async (response) => {
        const respUrl = response.url();
        const status = response.status();

        // Match with graphql calls
        const gqlIdx = this.graphqlCalls.findLastIndex((c) => c.url === respUrl && c.response === null);
        if (gqlIdx !== -1) {
          try {
            const text = await response.text();
            let parsed = null;
            try { parsed = JSON.parse(text); } catch {}
            this.graphqlCalls[gqlIdx].response = { status, body: parsed || text };
          } catch {}
        }

        // Match with REST calls
        const restIdx = this.restCalls.findLastIndex((c) => c.url === respUrl && c.response === null);
        if (restIdx !== -1) {
          try {
            const contentType = response.headers()['content-type'] || '';
            if (contentType.includes('application/json')) {
              const text = await response.text();
              let parsed = null;
              try { parsed = JSON.parse(text); } catch {}
              this.restCalls[restIdx].response = { status, body: parsed || text };
            } else {
              this.restCalls[restIdx].response = { status, body: null };
            }
          } catch {}
        }
      });

      page.on('pageerror', (err) => {
        this.errors.push({ type: 'pageError', message: err.message });
      });

      // Navigate to the page
      this.progress('Navigating to page', 15);
      this.log(`Navigating to ${url}`);

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

      // Detect site info (logo, title, etc.)
      this.progress('Detecting site info', 25);
      const siteInfo = await this._detectSiteInfo(page, url);
      this.log(`Site detected: ${siteInfo.title}`);

      if (siteInfo.hasLoginForm) {
        this.log(`Login form detected`);
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

        // Wait for post-auth navigation
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
        this.log('Authentication complete');
      }

      this.progress('Extracting page data', 55);
      this.log('Extracting page data...');

      const visitedPages = [];
      const pageData = await this._scrapePage(page, url, scrapeDepth, visitedPages);

      this.progress('Formatting results', 85);

      const result = {
        meta: {
          scrapedAt: new Date().toISOString(),
          targetUrl: url,
          totalPages: visitedPages.length,
          totalGraphQLCalls: this.graphqlCalls.length,
          totalRESTCalls: this.restCalls.length,
          totalAssets: this.assets.length,
        },
        siteInfo,
        pages: pageData,
        apiCalls: {
          graphql: this.graphqlCalls,
          rest: this.restCalls,
        },
        assets: captureAssets ? this.assets : [],
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
        .slice(0, 10); // cap at 10 subpages per level

      for (const link of internalLinks) {
        if (this.stopped) break;
        try {
          await page.goto(link.href, { waitUntil: 'networkidle2', timeout: 30000 });
          const subPages = await this._scrapePage(page, link.href, depth - 1, visited);
          results.push(...subPages);
        } catch (err) {
          this.errors.push({ type: 'navigationError', url: link.href, message: err.message });
        }
      }
    }

    return results;
  }

  async _detectSiteInfo(page, url) {
    return page.evaluate((pageUrl) => {
      const origin = new URL(pageUrl).origin;

      // Logo detection
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
        if (el && el.src) {
          logoUrl = el.src;
          break;
        }
      }

      // Login form detection
      const passwordInputs = document.querySelectorAll('input[type="password"]');
      const hasLoginForm = passwordInputs.length > 0;

      // Username/email field
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

      // Verification / 2FA detection
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
      if (sanitized[key]) {
        sanitized[key] = '[REDACTED]';
      }
    }
    return sanitized;
  }
}

module.exports = ScraperSession;
