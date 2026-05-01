/**
 * Extracts EVERYTHING from a Playwright page — the most comprehensive
 * site capture possible without native browser internals.
 */
const { extractEntities } = require('./entity-extractor');

async function extractPageData(page, url, opts = {}) {
  // ── 1. Core DOM + content extraction ──────────────────────────────────────
  const data = await page.evaluate(({ pageUrl, lightMode }) => {
    const origin = new URL(pageUrl).origin;

    function abs(src) {
      if (!src) return null;
      try { return new URL(src, pageUrl).href; } catch { return src; }
    }

    // ── SHADOW DOM PIERCE ──────────────────────────────────────────────────────
    // Recursively traverses open shadow roots — invisible to normal querySelectorAll.
    // Used for Web Components (Shopify Polaris, LitElement, Stencil, etc.)
    function extractShadowContent(root, depth) {
      const found = [];
      if (depth <= 0 || !root) return found;
      try {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
        let node;
        while ((node = walker.nextNode())) {
          if (node.shadowRoot) {
            const sr = node.shadowRoot;
            const text = sr.textContent?.replace(/\s+/g, ' ').trim().substring(0, 1000) || '';
            const links = Array.from(sr.querySelectorAll('a[href]')).map(a => ({
              href: abs(a.href), text: a.textContent?.trim().substring(0, 200)
            })).filter(l => l.href);
            const buttons = Array.from(sr.querySelectorAll('button,[role="button"]'))
              .map(b => b.textContent?.trim().substring(0, 100)).filter(Boolean);
            const inputs = Array.from(sr.querySelectorAll('input,select,textarea')).map(el => ({
              type: el.type || null, name: el.name || null, placeholder: el.placeholder || null,
              id: el.id || null,
            }));
            const images = Array.from(sr.querySelectorAll('img')).map(el => abs(el.src || el.getAttribute('data-src'))).filter(Boolean);
            if (text || links.length || buttons.length || inputs.length) {
              found.push({
                host: node.tagName.toLowerCase(),
                hostId: node.id || null,
                hostClass: node.className?.toString().substring(0, 100) || null,
                text, links, buttons, inputs, images,
              });
            }
            // Recurse into nested shadow roots
            found.push(...extractShadowContent(sr, depth - 1));
          }
        }
      } catch {}
      return found;
    }
    const shadowDOMContent = (() => { try { return extractShadowContent(document, 6); } catch { return []; } })();

    // ── META ──
    const meta = {
      title: document.title,
      url: pageUrl,
      charset: document.characterSet,
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      viewport: document.querySelector('meta[name="viewport"]')?.content,
      description: document.querySelector('meta[name="description"]')?.content,
      keywords: document.querySelector('meta[name="keywords"]')?.content,
      author: document.querySelector('meta[name="author"]')?.content,
      robots: document.querySelector('meta[name="robots"]')?.content,
      themeColor: document.querySelector('meta[name="theme-color"]')?.content,
      canonical: document.querySelector('link[rel="canonical"]')?.href,
      language: document.documentElement.lang ||
                document.querySelector('meta[http-equiv="content-language"]')?.content ||
                navigator.language || null,
      hreflang: Array.from(document.querySelectorAll('link[hreflang]')).map(el => ({
        lang: el.getAttribute('hreflang'),
        url: el.href,
      })),
      favicon: document.querySelector('link[rel="icon"]')?.href ||
               document.querySelector('link[rel="shortcut icon"]')?.href,
      appleTouchIcon: document.querySelector('link[rel="apple-touch-icon"]')?.href,
      ogTags: {},
      twitterTags: {},
      jsonLD: [],
      allMeta: [],
    };
    document.querySelectorAll('meta').forEach(el => {
      const name = el.name || el.getAttribute('property') || el.httpEquiv;
      if (name) meta.allMeta.push({ name, content: el.content });
      if (el.getAttribute('property')?.startsWith('og:')) meta.ogTags[el.getAttribute('property')] = el.content;
      if (el.name?.startsWith('twitter:')) meta.twitterTags[el.name] = el.content;
    });
    document.querySelectorAll('script[type="application/ld+json"]').forEach(el => {
      try { meta.jsonLD.push(JSON.parse(el.textContent)); } catch {}
    });

    // ── HEADINGS ──
    const headings = {};
    for (let i = 1; i <= 6; i++) {
      headings[`h${i}`] = Array.from(document.querySelectorAll(`h${i}`)).map(el => ({
        text: el.innerText.trim(),
        id: el.id || null,
        class: el.className || null,
        html: el.innerHTML.trim().substring(0, 500),
      }));
    }

    // ── HEADING OUTLINE (document order — H1–H6 as a flat ordered list) ──
    const headingOutline = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))
      .map(el => ({ level: parseInt(el.tagName[1]), text: el.innerText.trim(), id: el.id || null }))
      .filter(h => h.text);

    // ── FULL TEXT ──
    const fullText = document.body?.innerText?.replace(/\s+/g, ' ').trim().substring(0, 100000) || '';

    // ── TEXT BLOCKS ──
    const textBlocks = Array.from(document.querySelectorAll('p, article, section, blockquote, li, td, th, caption, figcaption, label, button, a'))
      .filter(el => el.innerText?.trim().length > 5)
      .slice(0, 500)
      .map(el => ({
        tag: el.tagName.toLowerCase(),
        text: el.innerText.trim().substring(0, 1000),
        id: el.id || null,
        class: el.className?.toString().substring(0, 100) || null,
        href: el.tagName === 'A' ? el.href : null,
      }));

    // ── ALL LINKS (a[href] + SPA data attrs + onclick URLs) ──
    const _seenHrefs = new Set();
    const links = [];
    function _addLink(href, text, extra) {
      if (!href) return;
      let resolved;
      try { resolved = new URL(href, pageUrl).href; } catch { return; }
      if (_seenHrefs.has(resolved)) return;
      _seenHrefs.add(resolved);
      let isInternal = false;
      try { isInternal = new URL(resolved).origin === origin; } catch {}
      links.push(Object.assign({ href: resolved, text: text || null, isInternal }, extra || {}));
    }

    // Standard <a href> links
    Array.from(document.querySelectorAll('a[href]')).forEach(el => {
      _addLink(el.href,
        el.innerText.trim() || el.title || el.getAttribute('aria-label'),
        { rel: el.rel || null, target: el.target || null, download: el.download || null, type: el.type || null });
    });

    // React SPA / data-href / data-url navigable elements
    Array.from(document.querySelectorAll('[data-href],[data-url]')).forEach(el => {
      _addLink(el.getAttribute('data-href') || el.getAttribute('data-url'),
        el.innerText.trim() || el.title || el.getAttribute('aria-label'));
    });

    // onclick handler URL extraction (catches navigate('/path') and window.location patterns)
    const _onclickRe = /['"]((?:https?:\/\/[^'"?\s]{2,}|\/[^'"?\s]{1,})[^'"]*)['"]/g;
    Array.from(document.querySelectorAll('[onclick]')).forEach(el => {
      const oc = el.getAttribute('onclick') || '';
      let m;
      _onclickRe.lastIndex = 0;
      while ((m = _onclickRe.exec(oc)) !== null) {
        // Skip obviously non-URL strings (JS identifiers, CSS values, etc.)
        if (/^\/\/|^\/\*|\s/.test(m[1])) continue;
        _addLink(m[1], el.innerText.trim() || null);
      }
    });

    // [role="link"] / [role="menuitem"] semantic nav elements (React components as div/span/li)
    Array.from(document.querySelectorAll('[role="link"]:not(a), [role="menuitem"]:not(a)')).forEach(el => {
      const href = el.getAttribute('href') || el.getAttribute('data-href') ||
                   el.getAttribute('data-url') || el.getAttribute('data-path') ||
                   el.getAttribute('data-to');
      if (href) _addLink(href, el.innerText.trim() || el.getAttribute('aria-label'));
    });

    // Mine inline scripts for React Router route path definitions
    // Matches: path: "/foo", to: "/foo", href: "/foo" as JS object properties
    const _scriptRouteRe = /(?:^|[,{(\s])(?:path|to|href)\s*:\s*["'`](\/[a-zA-Z0-9][a-zA-Z0-9\-_/.]*)[`'"]/gm;
    Array.from(document.querySelectorAll('script:not([src])')).forEach(script => {
      const src = script.textContent || '';
      let m;
      _scriptRouteRe.lastIndex = 0;
      while ((m = _scriptRouteRe.exec(src)) !== null) {
        const p = m[1];
        // Skip static assets, API endpoints, and build artifacts
        if (/\.(js|css|png|jpg|gif|svg|woff2?|ttf|eot|ico|map|json|xml)$/i.test(p)) continue;
        if (/^\/static\/|^\/assets\/|^\/api\/|^\/_next\/|^\/cdn-cgi\//i.test(p)) continue;
        _addLink(p, null);
      }
    });

    // ── ALL IMAGES (deep) ──
    const images = Array.from(document.querySelectorAll('img, [style*="background-image"], picture source, [data-src], [data-lazy]')).map(el => {
      const tag = el.tagName.toLowerCase();
      let src = null;
      if (tag === 'img') {
        src = abs(el.currentSrc || el.src || el.getAttribute('data-src') || el.getAttribute('data-lazy'));
      } else if (tag === 'source') {
        src = abs(el.srcset?.split(' ')[0] || el.src);
      } else {
        const bg = window.getComputedStyle(el).backgroundImage;
        const m = bg.match(/url\(["']?([^"')]+)["']?\)/);
        if (m) src = abs(m[1]);
      }
      return {
        src,
        alt: el.alt || null,
        title: el.title || null,
        width: el.naturalWidth || el.width || parseInt(el.getAttribute('width')) || null,
        height: el.naturalHeight || el.height || parseInt(el.getAttribute('height')) || null,
        loading: el.loading || null,
        srcset: el.srcset || el.getAttribute('srcset') || null,
        dataSrc: el.getAttribute('data-src') || el.getAttribute('data-lazy') || null,
        class: el.className?.toString().substring(0, 100) || null,
        id: el.id || null,
        isBackgroundImage: !['img', 'source'].includes(tag),
        tag,
      };
    }).filter(img => img.src);

    // ── TRACKING PIXELS ──
    const PIXEL_PATTERNS = [
      { re: /facebook\.com\/tr/, name: 'Facebook Pixel' },
      { re: /google-analytics\.com\/collect/, name: 'Google Analytics Collect' },
      { re: /doubleclick\.net/, name: 'DoubleClick/Google Ads' },
      { re: /bat\.bing\.com/, name: 'Microsoft Bing Ads' },
      { re: /analytics\.twitter\.com/, name: 'Twitter/X Ads' },
      { re: /px\.ads\.linkedin\.com/, name: 'LinkedIn Insight Tag' },
      { re: /tr\.snapchat\.com/, name: 'Snapchat Pixel' },
      { re: /analytics\.tiktok\.com/, name: 'TikTok Pixel' },
      { re: /insight\.adsrvr\.org/, name: 'The Trade Desk' },
      { re: /px\.moatads\.com/, name: 'Moat Analytics' },
    ];
    const trackingPixels = [
      ...images.filter(img => {
        const is1x1 = img.width === 1 && img.height === 1;
        const known = PIXEL_PATTERNS.some(p => p.re.test(img.src));
        return is1x1 || known;
      }).map(img => {
        const match = PIXEL_PATTERNS.find(p => p.re.test(img.src));
        return { src: img.src, name: match?.name || null, is1x1: img.width === 1 && img.height === 1 };
      }),
      ...Array.from(document.querySelectorAll('noscript')).flatMap(el =>
        PIXEL_PATTERNS.filter(p => p.re.test(el.innerHTML)).map(p => ({ src: null, name: p.name, fromNoscript: true }))
      ),
    ];

    // ── SVGs ──
    const svgs = Array.from(document.querySelectorAll('svg')).slice(0, 50).map(el => ({
      outerHTML: el.outerHTML.substring(0, 5000),
      width: el.getAttribute('width'),
      height: el.getAttribute('height'),
      viewBox: el.getAttribute('viewBox'),
      id: el.id || null,
      class: el.className?.baseVal || null,
    }));

    // ── VIDEOS & AUDIO ──
    const media = Array.from(document.querySelectorAll('video, audio, iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="dailymotion"]')).map(el => ({
      tag: el.tagName.toLowerCase(),
      src: abs(el.src || el.currentSrc || el.getAttribute('src')),
      poster: el.poster ? abs(el.poster) : null,
      autoplay: el.autoplay || false,
      loop: el.loop || false,
      muted: el.muted || false,
      controls: el.controls || false,
      duration: el.duration || null,
      type: el.type || null,
      sources: Array.from(el.querySelectorAll('source')).map(s => ({ src: abs(s.src), type: s.type })),
    }));

    // ── FONTS ──
    const fontFaces = [];
    try {
      Array.from(document.fonts).forEach(f => {
        fontFaces.push({ family: f.family, style: f.style, weight: f.weight, status: f.status });
      });
    } catch {}

    // ── NAVIGATION ──
    const navigation = Array.from(document.querySelectorAll('nav, [role="navigation"]')).map(nav => ({
      id: nav.id || null,
      class: nav.className?.toString().substring(0, 100) || null,
      ariaLabel: nav.getAttribute('aria-label') || null,
      items: Array.from(nav.querySelectorAll('a')).map(a => ({
        text: a.innerText.trim(),
        href: a.href,
        active: a.classList.contains('active') || a.getAttribute('aria-current') === 'page',
      })),
    }));

    // ── FORMS (deep) ──
    const forms = Array.from(document.querySelectorAll('form')).map(form => ({
      id: form.id || null,
      name: form.name || null,
      action: form.action || null,
      method: form.method || 'get',
      enctype: form.enctype || null,
      novalidate: form.noValidate || false,
      fields: Array.from(form.querySelectorAll('input, select, textarea, button')).map(el => ({
        tag: el.tagName.toLowerCase(),
        type: el.type || null,
        name: el.name || null,
        id: el.id || null,
        placeholder: el.placeholder || null,
        label: document.querySelector(`label[for="${el.id}"]`)?.innerText?.trim() || null,
        required: el.required || false,
        disabled: el.disabled || false,
        readonly: el.readOnly || false,
        pattern: el.pattern || null,
        min: el.min || null,
        max: el.max || null,
        maxlength: el.maxLength > 0 ? el.maxLength : null,
        autocomplete: el.autocomplete || null,
        options: el.tagName === 'SELECT'
          ? Array.from(el.options).map(o => ({ value: o.value, text: o.text, selected: o.selected }))
          : undefined,
        value: el.type === 'password' ? '[REDACTED]' : (el.type === 'hidden' ? null : (el.value || null)),
      })),
    }));

    // ── TABLES ──
    const tables = Array.from(document.querySelectorAll('table')).slice(0, 30).map(table => ({
      id: table.id || null,
      caption: table.querySelector('caption')?.innerText.trim() || null,
      headers: Array.from(table.querySelectorAll('th')).map(th => th.innerText.trim()),
      rows: Array.from(table.querySelectorAll('tr'))
        .map(tr => Array.from(tr.querySelectorAll('td, th')).map(td => td.innerText.trim()))
        .filter(r => r.length > 0),
      rowCount: table.rows.length,
      colCount: table.rows[0]?.cells.length || 0,
    }));

    // ── LISTS ──
    const lists = Array.from(document.querySelectorAll('ul, ol, dl')).slice(0, 50).map(list => ({
      type: list.tagName.toLowerCase(),
      items: Array.from(list.querySelectorAll('li, dt, dd')).map(li => li.innerText.trim()).filter(Boolean).slice(0, 100),
    }));

    // ── BUTTONS ──
    const buttons = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]')).map(el => ({
      text: el.innerText?.trim() || el.value || el.getAttribute('aria-label') || null,
      type: el.type || null,
      id: el.id || null,
      class: el.className?.toString().substring(0, 100) || null,
      disabled: el.disabled || false,
      dataAttrs: Object.fromEntries(Array.from(el.attributes).filter(a => a.name.startsWith('data-')).map(a => [a.name, a.value])),
    }));

    // ── IFRAMES ──
    const iframes = Array.from(document.querySelectorAll('iframe')).map(el => ({
      src: abs(el.src),
      name: el.name || null,
      id: el.id || null,
      title: el.title || null,
      width: el.width || null,
      height: el.height || null,
      sandbox: el.sandbox?.toString() || null,
      allow: el.allow || null,
    }));

    // ── SCRIPTS ──
    const scripts = Array.from(document.querySelectorAll('script')).map(el => ({
      src: el.src ? abs(el.src) : null,
      type: el.type || 'text/javascript',
      async: el.async || false,
      defer: el.defer || false,
      module: el.type === 'module',
      inline: !el.src,
      inlineContent: !el.src ? el.textContent?.trim().substring(0, 2000) : null,
      id: el.id || null,
    }));

    // ── THIRD-PARTY SCRIPT INVENTORY ──
    const TP_DOMAINS = {
      'google-analytics.com': 'analytics', 'googletagmanager.com': 'analytics',
      'segment.com': 'analytics', 'mixpanel.com': 'analytics',
      'amplitude.com': 'analytics', 'heap.io': 'analytics',
      'hotjar.com': 'analytics', 'fullstory.com': 'analytics',
      'posthog.com': 'analytics', 'clarity.ms': 'analytics',
      'doubleclick.net': 'advertising', 'googlesyndication.com': 'advertising',
      'facebook.net': 'advertising', 'connect.facebook.net': 'advertising',
      'amazon-adsystem.com': 'advertising', 'outbrain.com': 'advertising',
      'taboola.com': 'advertising', 'criteo.com': 'advertising',
      'ads.twitter.com': 'advertising', 'ads.linkedin.com': 'advertising',
      'sentry.io': 'error-monitoring', 'bugsnag.com': 'error-monitoring',
      'rollbar.com': 'error-monitoring', 'raygun.io': 'error-monitoring',
      'logrocket.com': 'error-monitoring',
      'nr-data.net': 'monitoring', 'datadoghq.com': 'monitoring', 'newrelic.com': 'monitoring',
      'optimizely.com': 'ab-testing', 'launchdarkly.com': 'ab-testing',
      'split.io': 'ab-testing', 'statsig.com': 'ab-testing', 'growthbook.io': 'ab-testing',
      'intercom.io': 'support', 'zdassets.com': 'support',
      'freshworks.com': 'support', 'tawk.to': 'support', 'tidio.com': 'support',
      'hs-scripts.com': 'marketing', 'hubspot.com': 'marketing', 'marketo.net': 'marketing',
      'stripe.com': 'payment', 'paypal.com': 'payment', 'braintreepayments.com': 'payment',
      'cdnjs.cloudflare.com': 'cdn', 'unpkg.com': 'cdn',
      'jsdelivr.net': 'cdn', 'googleapis.com': 'cdn', 'bootstrapcdn.com': 'cdn',
      'platform.twitter.com': 'social', 'platform.linkedin.com': 'social',
    };
    const _ownHost = (() => { try { return new URL(pageUrl).hostname.replace(/^www\./, ''); } catch { return ''; } })();
    const thirdPartyScripts = scripts.filter(s => s.src).map(s => {
      let domain = '';
      try { domain = new URL(s.src).hostname.replace(/^www\./, ''); } catch { return null; }
      if (!domain || domain === _ownHost || domain.endsWith('.' + _ownHost) || _ownHost.endsWith('.' + domain)) return null;
      const catKey = Object.keys(TP_DOMAINS).find(k => domain === k || domain.endsWith('.' + k));
      return { domain, url: s.src, category: catKey ? TP_DOMAINS[catKey] : 'unknown', async: s.async, defer: s.defer };
    }).filter(Boolean);

    // ── STYLESHEETS ──
    const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(el => ({
      href: abs(el.href),
      media: el.media || null,
      crossorigin: el.crossOrigin || null,
    }));

    // ── INLINE STYLES ──
    const inlineStyles = Array.from(document.querySelectorAll('[style]')).slice(0, 100).map(el => ({
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      class: el.className?.toString().substring(0, 60) || null,
      style: el.getAttribute('style'),
    }));

    // ── CSS VARIABLES (design tokens) ──
    const cssVariables = {};
    try {
      const rootStyles = window.getComputedStyle(document.documentElement);
      Array.from(document.styleSheets).forEach(sheet => {
        try {
          Array.from(sheet.cssRules).forEach(rule => {
            if (rule.selectorText === ':root') {
              Array.from(rule.style).forEach(prop => {
                if (prop.startsWith('--')) {
                  cssVariables[prop] = rootStyles.getPropertyValue(prop).trim();
                }
              });
            }
          });
        } catch {}
      });
    } catch {}

    // ── COLORS (unique computed colors on page) — skipped in lightMode ──
    const colors = lightMode ? [] : (() => {
      const colorSet = new Set();
      Array.from(document.querySelectorAll('*')).slice(0, 300).forEach(el => {
        try {
          const cs = window.getComputedStyle(el);
          if (cs.color && cs.color !== 'rgba(0, 0, 0, 0)') colorSet.add(cs.color);
          if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') colorSet.add(cs.backgroundColor);
        } catch {}
      });
      return Array.from(colorSet).slice(0, 100);
    })();

    // ── TYPOGRAPHY — skipped in lightMode ──
    const typography = lightMode ? [] : (() => {
      const fontSet = new Set();
      Array.from(document.querySelectorAll('body, h1, h2, h3, p, a, button, input')).forEach(el => {
        try {
          const cs = window.getComputedStyle(el);
          fontSet.add(JSON.stringify({
            family: cs.fontFamily,
            size: cs.fontSize,
            weight: cs.fontWeight,
            lineHeight: cs.lineHeight,
            element: el.tagName.toLowerCase(),
          }));
        } catch {}
      });
      return Array.from(fontSet).map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
    })();

    // ── CSS ANIMATIONS / KEYFRAMES — skipped in lightMode ──
    const animations = lightMode ? [] : (() => {
      const result = [];
      try {
        Array.from(document.styleSheets).forEach(sheet => {
          try {
            Array.from(sheet.cssRules).forEach(rule => {
              if (rule instanceof CSSKeyframesRule) {
                result.push({ name: rule.name, cssText: rule.cssText.substring(0, 2000) });
              }
            });
          } catch {}
        });
      } catch {}
      return result;
    })();

    // ── MEDIA QUERIES — skipped in lightMode ──
    const mediaQueries = lightMode ? [] : (() => {
      const result = [];
      try {
        Array.from(document.styleSheets).forEach(sheet => {
          try {
            Array.from(sheet.cssRules).forEach(rule => {
              if (rule instanceof CSSMediaRule) {
                result.push({
                  conditionText: rule.conditionText || rule.media?.mediaText,
                  rules: Array.from(rule.cssRules).slice(0, 5).map(r => r.selectorText).filter(Boolean),
                });
              }
            });
          } catch {}
        });
      } catch {}
      return result;
    })();

    // ── ACCESSIBILITY (ARIA) — skipped in lightMode ──
    const ariaElements = lightMode ? [] : Array.from(document.querySelectorAll('[role], [aria-label], [aria-labelledby], [aria-describedby], [aria-hidden], [tabindex]')).slice(0, 200).map(el => ({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      ariaLabel: el.getAttribute('aria-label'),
      ariaLabelledby: el.getAttribute('aria-labelledby'),
      ariaDescribedby: el.getAttribute('aria-describedby'),
      ariaHidden: el.getAttribute('aria-hidden'),
      tabindex: el.getAttribute('tabindex'),
      text: el.innerText?.trim().substring(0, 100) || null,
    }));

    // ── LAYOUT TREE (deep DOM snapshot) — skipped in lightMode ──
    function getLayoutTree(el, depth) {
      if (depth <= 0 || !el || !el.tagName) return null;
      const cs = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const children = Array.from(el.children).slice(0, 30)
        .map(child => getLayoutTree(child, depth - 1)).filter(Boolean);
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        class: el.className?.toString().trim().substring(0, 150) || null,
        text: el.children.length === 0 && el.innerText ? el.innerText.trim().substring(0, 300) : null,
        rect: { top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) },
        display: cs.display,
        position: cs.position !== 'static' ? cs.position : null,
        zIndex: cs.zIndex !== 'auto' ? cs.zIndex : null,
        visible: cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0',
        dataAttrs: Object.fromEntries(Array.from(el.attributes).filter(a => a.name.startsWith('data-')).map(a => [a.name, a.value])),
        ariaRole: el.getAttribute('role') || null,
        children: children.length > 0 ? children : undefined,
      };
    }
    const layoutTree = lightMode ? null : getLayoutTree(document.body, 8);

    // ── LOCAL/SESSION STORAGE ──
    const localStorage_ = {};
    const sessionStorage_ = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k);
        localStorage_[k] = v?.substring(0, 500);
      }
    } catch {}
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        const v = sessionStorage.getItem(k);
        sessionStorage_[k] = v?.substring(0, 500);
      }
    } catch {}

    // ── TECHNOLOGY FINGERPRINTING ──
    const tech = {
      frameworks: [],
      analytics: [],
      cms: [],
      cdn: [],
      other: [],
    };
    const w = window;
    const bodyHTML = document.documentElement.innerHTML;

    // Frontend frameworks
    if (w.React || w.__REACT_DEVTOOLS_GLOBAL_HOOK__ || document.querySelector('[data-reactroot], [data-reactid]')) tech.frameworks.push('React');
    if (w.Vue || w.__vue_app__ || document.querySelector('[data-v-app]')) tech.frameworks.push('Vue.js');
    if (w.angular || w.ng || document.querySelector('[ng-version], [_nghost]')) tech.frameworks.push('Angular');
    if (w.__NUXT__) tech.frameworks.push('Nuxt.js');
    if (w.__NEXT_DATA__ || document.querySelector('#__NEXT_DATA__')) tech.frameworks.push('Next.js');
    if (w.Gatsby || document.querySelector('gatsby-announcer')) tech.frameworks.push('Gatsby');
    if (w.Ember) tech.frameworks.push('Ember.js');
    if (w.Backbone) tech.frameworks.push('Backbone.js');
    if (w.Alpine) tech.frameworks.push('Alpine.js');
    if (w.htmx) tech.frameworks.push('HTMX');
    if (w.Svelte || bodyHTML.includes('svelte')) tech.frameworks.push('Svelte');
    if (w.jQuery || w.$?.fn?.jquery) tech.frameworks.push(`jQuery ${w.jQuery?.fn?.jquery || ''}`);
    if (w.Stimulus) tech.frameworks.push('Stimulus');
    if (w.__REMIX_ROUTER__) tech.frameworks.push('Remix');

    // Analytics
    if (w.ga || w.gtag || w.GoogleAnalyticsObject || bodyHTML.includes('google-analytics')) tech.analytics.push('Google Analytics');
    if (w.fbq || w._fbq) tech.analytics.push('Facebook Pixel');
    if (w.mixpanel) tech.analytics.push('Mixpanel');
    if (w.amplitude) tech.analytics.push('Amplitude');
    if (w.heap) tech.analytics.push('Heap');
    if (w.posthog) tech.analytics.push('PostHog');
    if (w.dataLayer) tech.analytics.push('Google Tag Manager');
    if (w._hsq || bodyHTML.includes('hubspot')) tech.analytics.push('HubSpot');
    if (w.Intercom) tech.analytics.push('Intercom');
    if (w.Hotjar || w.hj) tech.analytics.push('Hotjar');
    if (w.FS || w._fs_namespace) tech.analytics.push('FullStory');
    if (w.Segment || w.analytics?.user) tech.analytics.push('Segment');

    // CMS
    if (document.querySelector('meta[name="generator"]')) {
      const gen = document.querySelector('meta[name="generator"]').content;
      tech.cms.push(gen);
    }
    if (bodyHTML.includes('wp-content') || bodyHTML.includes('wp-includes')) tech.cms.push('WordPress');
    if (bodyHTML.includes('Shopify.shop') || w.Shopify) tech.cms.push('Shopify');
    if (w.__drupalSettings || bodyHTML.includes('drupal')) tech.cms.push('Drupal');
    if (bodyHTML.includes('joomla')) tech.cms.push('Joomla');

    // CDNs
    if (bodyHTML.includes('cloudflare')) tech.cdn.push('Cloudflare');
    if (bodyHTML.includes('cdn.shopify')) tech.cdn.push('Shopify CDN');
    if (bodyHTML.includes('cdnjs')) tech.cdn.push('cdnjs');
    if (bodyHTML.includes('jsdelivr')) tech.cdn.push('jsDelivr');
    if (bodyHTML.includes('unpkg')) tech.cdn.push('unpkg');
    if (bodyHTML.includes('bootstrapcdn') || w.bootstrap) { tech.other.push('Bootstrap'); }
    if (bodyHTML.includes('tailwind') || bodyHTML.includes('tw-')) tech.other.push('Tailwind CSS');

    // ── DOM STATS ──
    const domStats = {
      totalElements: document.querySelectorAll('*').length,
      totalTextNodes: (() => {
        if (!document.body) return 0;
        let count = 0;
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) count++;
        return count;
      })(),
      totalImages: document.images.length,
      totalLinks: document.links.length,
      totalForms: document.forms.length,
      totalScripts: document.scripts.length,
      totalStyleSheets: document.styleSheets.length,
      totalIframes: document.querySelectorAll('iframe').length,
      totalInputs: document.querySelectorAll('input').length,
      totalButtons: document.querySelectorAll('button').length,
      totalTables: document.querySelectorAll('table').length,
      depth: (() => {
        let maxDepth = 0;
        const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT);
        while (walker.nextNode()) {
          let depth = 0, node = walker.currentNode;
          while (node.parentNode) { depth++; node = node.parentNode; }
          if (depth > maxDepth) maxDepth = depth;
        }
        return maxDepth;
      })(),
    };

    // ── HTML SOURCE — skipped in lightMode ──
    const htmlSource = lightMode ? '' : document.documentElement.outerHTML.substring(0, 500000);

    // ── HEAD HTML ──
    const headHTML = document.head.outerHTML;

    // ── CUSTOM ELEMENTS ──
    const customElements_ = Array.from(document.querySelectorAll('*'))
      .filter(el => el.tagName.includes('-'))
      .map(el => el.tagName.toLowerCase())
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 50);

    // ── JS GLOBAL STATE (server-side rendered / framework data stores) ─────────
    // These objects contain the full dataset the page was rendered with —
    // often richer than any individual API call.
    const jsGlobalState = {};
    const _knownStateKeys = [
      ['nextData',        '__NEXT_DATA__'],          // Next.js SSR page props
      ['nuxtData',        '__NUXT__'],               // Nuxt.js
      ['remixContext',    '__remixContext'],          // Remix
      ['apolloState',     '__APOLLO_STATE__'],        // Apollo GraphQL cache
      ['relayStore',      '__RELAY_STORE__'],         // Relay
      ['preloadedState',  '__PRELOADED_STATE__'],     // Generic Redux SSR
      ['reactQueryState', '__REACT_QUERY_STATE__'],   // TanStack Query
      ['svelteKitPage',   '__sveltekit_page'],        // SvelteKit
      ['astroData',       '__astro_data__'],          // Astro
      ['turbolinks',      'Turbolinks'],              // Rails Turbolinks
      ['digitalData',     'digitalData'],            // Adobe Analytics data layer
      ['dataLayer',       'dataLayer'],              // Google Tag Manager
    ];
    for (const [key, winKey] of _knownStateKeys) {
      try {
        if (w[winKey] !== undefined && w[winKey] !== null) {
          const str = JSON.stringify(w[winKey]);
          jsGlobalState[key] = str.length > 100000
            ? { _truncated: true, _size: str.length, preview: JSON.parse(str.substring(0, 100000)) }
            : w[winKey];
        }
      } catch {}
    }
    // Try Redux store (.getState())
    try {
      for (const k of ['__REDUX_STORE__', '__store__', 'store']) {
        if (w[k] && typeof w[k].getState === 'function') {
          const s = w[k].getState();
          const str = JSON.stringify(s);
          jsGlobalState.reduxState = str.length > 100000
            ? { _truncated: true, _size: str.length, preview: JSON.parse(str.substring(0, 100000)) }
            : s;
          break;
        }
      }
    } catch {}
    // Scan for any other __ double-underscore global objects that look like data (skip framework internals)
    const _SKIP_GLOBALS = new Set(['__REACT_DEVTOOLS_GLOBAL_HOOK__', '__webpack_require__', '__webpack_modules__',
      '__webpack_chunk_load__', '__vue_app__', '__VUE_HMR_RUNTIME__', '__REDUX_DEVTOOLS_EXTENSION__',
      '__REDUX_DEVTOOLS_EXTENSION_COMPOSE__', '__react_router_build_manifest', '__BUILD_MANIFEST']);
    try {
      Object.keys(w).filter(k =>
        (k.startsWith('__') || k === 'digitalData') &&
        !_SKIP_GLOBALS.has(k) &&
        !_knownStateKeys.some(([, wk]) => wk === k) &&
        typeof w[k] === 'object' && w[k] !== null && !Array.isArray(w[k])
      ).slice(0, 15).forEach(k => {
        try {
          const str = JSON.stringify(w[k]);
          if (str.length > 20 && str.length < 500000) jsGlobalState[k] = w[k];
        } catch {}
      });
    } catch {}

    // ── RSS / ATOM / JSON FEEDS ──
    const feeds = (() => {
      const found = [];
      const FEED_TYPES = [
        { selector: 'link[type="application/rss+xml"]', type: 'rss' },
        { selector: 'link[type="application/atom+xml"]', type: 'atom' },
        { selector: 'link[type="application/json"]', type: 'json-feed' },
        { selector: 'link[type="application/feed+json"]', type: 'json-feed' },
      ];
      for (const { selector, type } of FEED_TYPES) {
        document.querySelectorAll(selector).forEach(el => {
          found.push({ type, url: el.href, title: el.title || el.getAttribute('title') || null });
        });
      }
      return found;
    })();

    // ── PDF LINKS ──
    const pdfLinks = Array.from(document.querySelectorAll('a[href]'))
      .filter(el => /\.pdf(\?|$)/i.test(el.href) || el.getAttribute('type') === 'application/pdf')
      .slice(0, 100)
      .map(el => ({ url: el.href, text: el.innerText.trim() || el.title || null, download: el.download || null }));

    // ── OPENAPI / SWAGGER SPEC DETECTION ──
    const apiSpecLinks = (() => {
      const specPaths = [
        { pattern: /openapi\.json$/i, format: 'openapi' },
        { pattern: /openapi\.ya?ml$/i, format: 'openapi' },
        { pattern: /swagger\.json$/i, format: 'swagger' },
        { pattern: /swagger\.ya?ml$/i, format: 'swagger' },
        { pattern: /api[-_]?docs(\.json|\.ya?ml)?$/i, format: 'openapi' },
        { pattern: /v\d+\/openapi(\.json|\.ya?ml)?$/i, format: 'openapi' },
        { pattern: /swagger-ui\.html?$/i, format: 'swagger-ui' },
        { pattern: /redoc(\.html?)?$/i, format: 'redoc' },
      ];
      const found = [];
      const seen = new Set();

      // Check all <a href> for spec paths
      document.querySelectorAll('a[href]').forEach(el => {
        for (const { pattern, format } of specPaths) {
          if (pattern.test(el.href) && !seen.has(el.href)) {
            seen.add(el.href);
            found.push({ url: el.href, format, detectedVia: 'link' });
          }
        }
      });

      // Check if swagger-ui-bundle or redoc is loaded as a script
      document.querySelectorAll('script[src]').forEach(el => {
        if (/swagger-ui-bundle/i.test(el.src) && !seen.has('swagger-ui')) {
          seen.add('swagger-ui');
          found.push({ url: null, format: 'swagger-ui', detectedVia: 'script', scriptSrc: el.src });
        }
        if (/redoc/i.test(el.src) && !seen.has('redoc-script')) {
          seen.add('redoc-script');
          found.push({ url: null, format: 'redoc', detectedVia: 'script', scriptSrc: el.src });
        }
      });

      return found;
    })();

    // ── GDPR / COOKIE CONSENT DETECTION ──
    const cookieConsent = (() => {
      const w = window;
      const html = document.documentElement.innerHTML;

      const VENDORS = [
        { vendor: 'OneTrust', detect: () => !!(w.OneTrust || w.OptanonWrapper || html.includes('onetrust') || document.getElementById('onetrust-consent-sdk')) },
        { vendor: 'Cookiebot', detect: () => !!(w.Cookiebot || w.CookieConsent || html.includes('cookiebot.com')) },
        { vendor: 'Osano', detect: () => !!(w.Osano || html.includes('osano.com')) },
        { vendor: 'Quantcast', detect: () => !!(w.__qc || html.includes('quantcast.mgr.consensu.org') || html.includes('quantcast.com/choice')) },
        { vendor: 'TrustArc', detect: () => !!(html.includes('truste.com') || html.includes('trustarc.com') || document.querySelector('.truste_overlay')) },
        { vendor: 'Didomi', detect: () => !!(w.Didomi || html.includes('sdk.privacy-center.org')) },
        { vendor: 'Iubenda', detect: () => !!(w._iub || html.includes('iubenda.com')) },
        { vendor: 'CookieYes', detect: () => !!(html.includes('cookieyes.com') || document.querySelector('.cky-consent-container')) },
        { vendor: 'Usercentrics', detect: () => !!(w.UC_UI || html.includes('usercentrics.eu')) },
        { vendor: 'Termly', detect: () => !!(html.includes('app.termly.io') || document.querySelector('.termly-styles-overlay')) },
      ];

      let detected = false;
      let vendor = null;

      for (const v of VENDORS) {
        try {
          if (v.detect()) { detected = true; vendor = v.vendor; break; }
        } catch { /* ignore */ }
      }

      // Detect consent dialog DOM presence
      const dialogSelectors = [
        '[id*="cookie"][id*="consent"]', '[class*="cookie-consent"]',
        '[id*="gdpr"]', '[class*="gdpr"]', '[role="dialog"][aria-label*="cookie"]',
        '#cookie-banner', '.cookie-banner', '#consent-modal', '.consent-modal',
      ];
      const domPresent = dialogSelectors.some(sel => {
        try { return !!document.querySelector(sel); } catch { return false; }
      });

      // Try to detect model (opt-in vs opt-out) from known APIs
      let model = 'unknown';
      try {
        if (w.OneTrust?.IsAlertBoxClosed?.()) model = 'opt-in';
        else if (w.Cookiebot?.consented) model = 'opt-in';
        else if (detected) model = 'unknown';
      } catch { /* ignore */ }

      // Detect categories from OneTrust/Cookiebot APIs
      const categories = [];
      try {
        if (w.OneTrust?.GetDomainData?.()?.Groups) {
          w.OneTrust.GetDomainData().Groups.forEach(g => categories.push(g.GroupName || g.CustomGroupName));
        } else if (w.Cookiebot?.consent) {
          if (w.Cookiebot.consent.necessary) categories.push('Necessary');
          if (w.Cookiebot.consent.preferences) categories.push('Preferences');
          if (w.Cookiebot.consent.statistics) categories.push('Statistics');
          if (w.Cookiebot.consent.marketing) categories.push('Marketing');
        }
      } catch { /* ignore */ }

      return { detected, vendor, model, domPresent, categories };
    })();

    return {
      meta,
      headings,
      headingOutline,
      fullText,
      textBlocks,
      links,
      images,
      trackingPixels,
      thirdPartyScripts,
      svgs,
      media,
      fontFaces,
      navigation,
      forms,
      buttons,
      tables,
      lists,
      iframes,
      scripts,
      stylesheets,
      inlineStyles,
      cssVariables,
      colors,
      typography,
      animations,
      mediaQueries,
      ariaElements,
      layoutTree,
      localStorage: localStorage_,
      sessionStorage: sessionStorage_,
      tech,
      domStats,
      headHTML,
      htmlSource,
      customElements: customElements_,
      shadowDOMContent,
      jsGlobalState,
      feeds,
      pdfLinks,
      apiSpecLinks,
      cookieConsent,
    };
  }, { pageUrl: url, lightMode: !!opts.lightMode });

  // ── 2. IndexedDB — async, must run outside the main evaluate block ───────────
  try {
    data.indexedDB = await page.evaluate(() => new Promise(resolve => {
      if (!window.indexedDB) { resolve({}); return; }
      const result = {};
      // indexedDB.databases() is not supported in all browsers; fall back to empty list
      const dbListPromise = typeof indexedDB.databases === 'function'
        ? indexedDB.databases()
        : Promise.resolve([]);
      dbListPromise.then(dbList => {
        if (!dbList || dbList.length === 0) { resolve(result); return; }
        let remaining = Math.min(dbList.length, 5);
        if (remaining === 0) { resolve(result); return; }
        for (const dbInfo of dbList.slice(0, 5)) {
          if (!dbInfo.name) { if (--remaining === 0) resolve(result); continue; }
          const openReq = indexedDB.open(dbInfo.name);
          openReq.onerror = () => { result[dbInfo.name] = { error: 'open failed' }; if (--remaining === 0) resolve(result); };
          openReq.onsuccess = (e) => {
            const db = e.target.result;
            const storeNames = Array.from(db.objectStoreNames).slice(0, 10);
            result[dbInfo.name] = {};
            let storesRemaining = storeNames.length;
            if (storesRemaining === 0) { db.close(); if (--remaining === 0) resolve(result); return; }
            for (const storeName of storeNames) {
              try {
                const tx = db.transaction(storeName, 'readonly');
                const getAllReq = tx.objectStore(storeName).getAll();
                getAllReq.onsuccess = (e2) => {
                  const records = (e2.target.result || []).slice(0, 50);
                  result[dbInfo.name][storeName] = records.map(r => {
                    try { return JSON.parse(JSON.stringify(r).substring(0, 2000)); } catch { return '[UNSERIALIZABLE]'; }
                  });
                  if (--storesRemaining === 0) { db.close(); if (--remaining === 0) resolve(result); }
                };
                getAllReq.onerror = () => {
                  result[dbInfo.name][storeName] = { error: 'read failed' };
                  if (--storesRemaining === 0) { db.close(); if (--remaining === 0) resolve(result); }
                };
              } catch {
                result[dbInfo.name][storeName] = { error: 'tx failed' };
                if (--storesRemaining === 0) { db.close(); if (--remaining === 0) resolve(result); }
              }
            }
          };
        }
      }).catch(() => resolve(result));
    })).catch(() => null);
  } catch {
    data.indexedDB = null;
  }

  // ── 3. Screenshot (full page) — only when captureScreenshots is enabled ────
  if (opts.captureScreenshots) {
    try {
      const screenshotBuf = await page.screenshot({ type: 'jpeg', quality: 80, fullPage: true });
      data.screenshot = `data:image/jpeg;base64,${screenshotBuf.toString('base64')}`;
    } catch {
      data.screenshot = null;
    }

    // ── 3. Viewport screenshot ───────────────────────────────────────────────
    try {
      const vpBuf = await page.screenshot({ type: 'jpeg', quality: 80, fullPage: false });
      data.viewportScreenshot = `data:image/jpeg;base64,${vpBuf.toString('base64')}`;
    } catch {
      data.viewportScreenshot = null;
    }
  } else {
    data.screenshot = null;
    data.viewportScreenshot = null;
  }

  // ── 4. Fetch all stylesheet text (parallel) — skipped in lightMode ──────────
  if (opts.lightMode) {
    data.stylesheetContents = [];
  } else {
    data.stylesheetContents = (await Promise.all(
      (data.stylesheets || []).slice(0, 10).map(ss =>
        page.evaluate(async (href) => {
          try {
            const r = await fetch(href);
            return r.ok ? { href, content: (await r.text()).substring(0, 50000) } : null;
          } catch { return null; }
        }, ss.href).catch(() => null)
      )
    )).filter(Boolean);
  }

  // ── 5. Performance metrics — skipped in lightMode ─────────────────────────
  if (opts.lightMode) {
    data.performance = null;
  } else {
    try {
      data.performance = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const paint = performance.getEntriesByType('paint');
        const resources = performance.getEntriesByType('resource').slice(0, 100);
        return {
          navigation: nav ? {
            domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
            loadComplete: Math.round(nav.loadEventEnd - nav.startTime),
            ttfb: Math.round(nav.responseStart - nav.requestStart),
            domInteractive: Math.round(nav.domInteractive - nav.startTime),
            transferSize: nav.transferSize,
            encodedBodySize: nav.encodedBodySize,
            decodedBodySize: nav.decodedBodySize,
            httpVersion: nav.nextHopProtocol || null,
          } : null,
          paint: Object.fromEntries(paint.map(p => [p.name, Math.round(p.startTime)])),
          resources: resources.map(r => ({
            name: r.name.substring(0, 200),
            type: r.initiatorType,
            duration: Math.round(r.duration),
            transferSize: r.transferSize,
            startTime: Math.round(r.startTime),
          })),
          memory: performance.memory ? {
            usedJSHeapSize: performance.memory.usedJSHeapSize,
            totalJSHeapSize: performance.memory.totalJSHeapSize,
          } : null,
        };
      });
    } catch {
      data.performance = null;
    }
  }

  // ── 6. Console logs (captured via page events before this) ────────────────
  // Note: these are injected by scraper.js via page.on('console', ...)
  // data.consoleLogs is filled by scraper.js

  // ── 7. Entity extraction ───────────────────────────────────────────────────
  try {
    data.entities = extractEntities(data.fullText || '');
    // Also scan all link hrefs and text blocks for extra entities
    const allText = [
      ...(data.links || []).map(l => l.href),
      ...(data.textBlocks || []).map(t => t.text),
    ].join(' ');
    const extraEntities = extractEntities(allText);
    // Merge all flat array fields
    for (const key of ['emails', 'phones', 'urls', 'addresses', 'coordinates', 'ipAddresses']) {
      if (Array.isArray(extraEntities[key]) && extraEntities[key].length) {
        data.entities[key] = [...new Set([...(data.entities[key] || []), ...extraEntities[key]])];
      }
    }
    // Merge crypto sub-object
    if (extraEntities.crypto) {
      data.entities.crypto = data.entities.crypto || { bitcoin: [], ethereum: [] };
      for (const coin of ['bitcoin', 'ethereum']) {
        if (Array.isArray(extraEntities.crypto[coin]) && extraEntities.crypto[coin].length) {
          data.entities.crypto[coin] = [...new Set([...data.entities.crypto[coin], ...extraEntities.crypto[coin]])];
        }
      }
    }
    // Merge socials sub-object
    if (extraEntities.socials) {
      data.entities.socials = data.entities.socials || {};
      for (const net of Object.keys(extraEntities.socials)) {
        if (Array.isArray(extraEntities.socials[net]) && extraEntities.socials[net].length) {
          data.entities.socials[net] = [...new Set([...(data.entities.socials[net] || []), ...extraEntities.socials[net]])];
        }
      }
    }
  } catch {
    data.entities = { emails: [], phones: [], urls: [], socials: {}, addresses: [], coordinates: [], ipAddresses: [], crypto: { bitcoin: [], ethereum: [] } };
  }

  // ── 8. Source map detection ───────────────────────────────────────────────
  try {
    const sourceMaps = [];
    const seen = new Set();

    // Check inline scripts for sourceMappingURL comments
    const inlineScripts = data.scripts?.filter(s => s.inline && s.content) || [];
    for (const script of inlineScripts) {
      const match = script.content.match(/\/\/# sourceMappingURL=([^\s]+)/);
      if (match && !seen.has(match[1])) {
        seen.add(match[1]);
        const isAbsolute = match[1].startsWith('http');
        sourceMaps.push({ scriptUrl: '[inline]', mapUrl: match[1], isAbsolute, detectedVia: 'inline-script' });
      }
    }

    // Check external scripts by fetching their last 500 bytes
    const externalScripts = (data.scripts || []).filter(s => s.src || s.href).slice(0, 20);
    await Promise.all(externalScripts.map(async (script) => {
      const src = script.src || script.href;
      try {
        const tail = await page.evaluate(async (url) => {
          try {
            const r = await fetch(url);
            const text = await r.text();
            return text.slice(-1000); // last 1KB — sourceMappingURL is always at the end
          } catch { return null; }
        }, src);
        if (tail) {
          const match = tail.match(/\/\/# sourceMappingURL=([^\s]+)/);
          if (match && !seen.has(src + match[1])) {
            seen.add(src + match[1]);
            const mapUrl = match[1].startsWith('http') ? match[1] : new URL(match[1], src).toString();
            sourceMaps.push({ scriptUrl: src, mapUrl, isAbsolute: match[1].startsWith('http'), detectedVia: 'external-script' });
          }
        }
      } catch { /* skip */ }
    }));

    data.sourceMaps = sourceMaps;
  } catch {
    data.sourceMaps = [];
  }

  return data;
}

module.exports = { extractPageData };
