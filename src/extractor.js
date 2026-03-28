/**
 * Extracts EVERYTHING from a Playwright page — the most comprehensive
 * site capture possible without native browser internals.
 */
const { extractEntities } = require('./entity-extractor');

async function extractPageData(page, url, opts = {}) {
  // ── 1. Core DOM + content extraction ──────────────────────────────────────
  const data = await page.evaluate((pageUrl) => {
    const origin = new URL(pageUrl).origin;

    function abs(src) {
      if (!src) return null;
      try { return new URL(src, pageUrl).href; } catch { return src; }
    }

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

    // ── ALL LINKS ──
    const links = Array.from(document.querySelectorAll('a[href]')).map(el => {
      let isInternal = false;
      try { isInternal = new URL(el.href).origin === origin; } catch {}
      return {
        text: el.innerText.trim() || el.title || el.getAttribute('aria-label') || null,
        href: el.href,
        isInternal,
        rel: el.rel || null,
        target: el.target || null,
        download: el.download || null,
        type: el.type || null,
      };
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

    // ── COLORS (unique computed colors on page) ──
    const colorSet = new Set();
    Array.from(document.querySelectorAll('*')).slice(0, 300).forEach(el => {
      try {
        const cs = window.getComputedStyle(el);
        if (cs.color && cs.color !== 'rgba(0, 0, 0, 0)') colorSet.add(cs.color);
        if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') colorSet.add(cs.backgroundColor);
      } catch {}
    });
    const colors = Array.from(colorSet).slice(0, 100);

    // ── TYPOGRAPHY ──
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
    const typography = Array.from(fontSet).map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);

    // ── CSS ANIMATIONS / KEYFRAMES ──
    const animations = [];
    try {
      Array.from(document.styleSheets).forEach(sheet => {
        try {
          Array.from(sheet.cssRules).forEach(rule => {
            if (rule instanceof CSSKeyframesRule) {
              animations.push({ name: rule.name, cssText: rule.cssText.substring(0, 2000) });
            }
          });
        } catch {}
      });
    } catch {}

    // ── MEDIA QUERIES ──
    const mediaQueries = [];
    try {
      Array.from(document.styleSheets).forEach(sheet => {
        try {
          Array.from(sheet.cssRules).forEach(rule => {
            if (rule instanceof CSSMediaRule) {
              mediaQueries.push({
                conditionText: rule.conditionText || rule.media?.mediaText,
                rules: Array.from(rule.cssRules).slice(0, 5).map(r => r.selectorText).filter(Boolean),
              });
            }
          });
        } catch {}
      });
    } catch {}

    // ── ACCESSIBILITY (ARIA) ──
    const ariaElements = Array.from(document.querySelectorAll('[role], [aria-label], [aria-labelledby], [aria-describedby], [aria-hidden], [tabindex]')).slice(0, 200).map(el => ({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      ariaLabel: el.getAttribute('aria-label'),
      ariaLabelledby: el.getAttribute('aria-labelledby'),
      ariaDescribedby: el.getAttribute('aria-describedby'),
      ariaHidden: el.getAttribute('aria-hidden'),
      tabindex: el.getAttribute('tabindex'),
      text: el.innerText?.trim().substring(0, 100) || null,
    }));

    // ── LAYOUT TREE (deep DOM snapshot) ──
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
    const layoutTree = getLayoutTree(document.body, 8);

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

    // ── HTML SOURCE ──
    const htmlSource = document.documentElement.outerHTML.substring(0, 500000);

    // ── HEAD HTML ──
    const headHTML = document.head.outerHTML;

    // ── CUSTOM ELEMENTS ──
    const customElements_ = Array.from(document.querySelectorAll('*'))
      .filter(el => el.tagName.includes('-'))
      .map(el => el.tagName.toLowerCase())
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 50);

    return {
      meta,
      headings,
      fullText,
      textBlocks,
      links,
      images,
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
    };
  }, url);

  // ── 2. Screenshot (full page) — only when captureScreenshots is enabled ────
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

  // ── 4. Fetch all stylesheet text (parallel) ───────────────────────────────
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

  // ── 5. Performance metrics ─────────────────────────────────────────────────
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

  // ── 6. Console logs (captured via page events before this) ────────────────
  // Note: these are injected by scraper.js via page.on('console', ...)
  // data.consoleLogs is filled by scraper.js

  // ── 7. Entity extraction ───────────────────────────────────────────────────
  try {
    data.entities = extractEntities(data.fullText || '');
    // Also scan all link hrefs, image srcs, script srcs for extra emails/phones
    const allText = [
      ...(data.links || []).map(l => l.href),
      ...(data.textBlocks || []).map(t => t.text),
    ].join(' ');
    const extraEntities = extractEntities(allText);
    data.entities.emails = [...new Set([...data.entities.emails, ...extraEntities.emails])];
    data.entities.phones = [...new Set([...data.entities.phones, ...extraEntities.phones])];
  } catch {
    data.entities = { emails: [], phones: [], urls: [], socials: {}, addresses: [] };
  }

  return data;
}

module.exports = { extractPageData };
