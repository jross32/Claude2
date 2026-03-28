/**
 * Extracts all meaningful data from a Playwright page and formats it as structured JSON.
 */
const { extractEntities } = require('./entity-extractor');

async function extractPageData(page, url) {
  const data = await page.evaluate((pageUrl) => {
    const origin = new URL(pageUrl).origin;

    function absoluteUrl(src) {
      if (!src) return null;
      try {
        return new URL(src, pageUrl).href;
      } catch {
        return src;
      }
    }

    function getComputedStyles(el) {
      try {
        const cs = window.getComputedStyle(el);
        return {
          color: cs.color,
          backgroundColor: cs.backgroundColor,
          fontSize: cs.fontSize,
          fontFamily: cs.fontFamily,
          fontWeight: cs.fontWeight,
        };
      } catch {
        return null;
      }
    }

    // --- META ---
    const meta = {
      title: document.title,
      url: pageUrl,
      charset: document.characterSet,
      lang: document.documentElement.lang,
      viewport: document.querySelector('meta[name="viewport"]')?.content,
      description: document.querySelector('meta[name="description"]')?.content,
      keywords: document.querySelector('meta[name="keywords"]')?.content,
      author: document.querySelector('meta[name="author"]')?.content,
      robots: document.querySelector('meta[name="robots"]')?.content,
      canonical: document.querySelector('link[rel="canonical"]')?.href,
      favicon:
        document.querySelector('link[rel="icon"]')?.href ||
        document.querySelector('link[rel="shortcut icon"]')?.href,
      ogTags: {},
      twitterTags: {},
      jsonLD: [],
    };

    document.querySelectorAll('meta[property^="og:"]').forEach((el) => {
      meta.ogTags[el.getAttribute('property')] = el.content;
    });
    document.querySelectorAll('meta[name^="twitter:"]').forEach((el) => {
      meta.twitterTags[el.getAttribute('name')] = el.content;
    });
    document.querySelectorAll('script[type="application/ld+json"]').forEach((el) => {
      try { meta.jsonLD.push(JSON.parse(el.textContent)); } catch {}
    });

    // --- HEADINGS ---
    const headings = {};
    for (let i = 1; i <= 6; i++) {
      headings[`h${i}`] = Array.from(document.querySelectorAll(`h${i}`)).map((el) => ({
        text: el.innerText.trim(),
        id: el.id || null,
        class: el.className || null,
      }));
    }

    // --- PARAGRAPHS & TEXT BLOCKS ---
    const textBlocks = Array.from(document.querySelectorAll('p, article, section, main'))
      .filter((el) => el.innerText && el.innerText.trim().length > 20)
      .slice(0, 200)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        text: el.innerText.trim().substring(0, 2000),
        id: el.id || null,
        class: el.className || null,
      }));

    // --- LINKS ---
    const links = Array.from(document.querySelectorAll('a[href]')).map((el) => {
      const href = el.href;
      let isInternal = false;
      try {
        isInternal = new URL(href).origin === origin;
      } catch {}
      return {
        text: el.innerText.trim() || el.title || null,
        href,
        isInternal,
        rel: el.rel || null,
        target: el.target || null,
      };
    });

    // --- IMAGES ---
    const images = Array.from(document.querySelectorAll('img')).map((el) => ({
      src: absoluteUrl(el.getAttribute('src')),
      alt: el.alt || null,
      title: el.title || null,
      width: el.naturalWidth || el.width || null,
      height: el.naturalHeight || el.height || null,
      loading: el.loading || null,
      class: el.className || null,
    }));

    // --- VIDEOS ---
    const videos = Array.from(document.querySelectorAll('video, iframe[src*="youtube"], iframe[src*="vimeo"]')).map(
      (el) => ({
        tag: el.tagName.toLowerCase(),
        src: absoluteUrl(el.getAttribute('src') || el.currentSrc),
        type: el.type || null,
        autoplay: el.autoplay || false,
      })
    );

    // --- NAVIGATION ---
    const navigation = Array.from(document.querySelectorAll('nav')).map((nav) => ({
      id: nav.id || null,
      class: nav.className || null,
      items: Array.from(nav.querySelectorAll('a')).map((a) => ({
        text: a.innerText.trim(),
        href: a.href,
      })),
    }));

    // --- FORMS ---
    const forms = Array.from(document.querySelectorAll('form')).map((form) => ({
      id: form.id || null,
      action: form.action || null,
      method: form.method || 'get',
      fields: Array.from(form.querySelectorAll('input, select, textarea, button')).map((el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.type || null,
        name: el.name || null,
        id: el.id || null,
        placeholder: el.placeholder || null,
        required: el.required || false,
        value: el.type === 'password' ? '[REDACTED]' : (el.type !== 'hidden' ? el.value || null : null),
      })),
    }));

    // --- TABLES ---
    const tables = Array.from(document.querySelectorAll('table')).slice(0, 20).map((table) => {
      const headers = Array.from(table.querySelectorAll('th')).map((th) => th.innerText.trim());
      const rows = Array.from(table.querySelectorAll('tr')).map((tr) =>
        Array.from(tr.querySelectorAll('td')).map((td) => td.innerText.trim())
      ).filter((r) => r.length > 0);
      return { headers, rows };
    });

    // --- LISTS ---
    const lists = Array.from(document.querySelectorAll('ul, ol')).slice(0, 30).map((list) => ({
      type: list.tagName.toLowerCase(),
      items: Array.from(list.querySelectorAll('li')).map((li) => li.innerText.trim()).filter(Boolean),
    }));

    // --- STYLES (CSS variables, theme colors) ---
    const cssVariables = {};
    try {
      const rootStyles = window.getComputedStyle(document.documentElement);
      const allProps = Array.from(document.styleSheets)
        .flatMap((sheet) => {
          try {
            return Array.from(sheet.cssRules);
          } catch {
            return [];
          }
        })
        .filter((rule) => rule.selectorText === ':root')
        .flatMap((rule) => Array.from(rule.style))
        .filter((prop) => prop.startsWith('--'));
      allProps.forEach((prop) => {
        cssVariables[prop] = rootStyles.getPropertyValue(prop).trim();
      });
    } catch {}

    // --- STYLESHEETS ---
    const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((el) => ({
      href: el.href,
      media: el.media || null,
    }));

    // --- SCRIPTS ---
    const scripts = Array.from(document.querySelectorAll('script[src]')).map((el) => ({
      src: el.src,
      type: el.type || null,
      async: el.async || false,
      defer: el.defer || false,
    }));

    // --- STRUCTURED LAYOUT ---
    function getLayoutTree(el, depth) {
      if (depth <= 0 || !el) return null;
      const tag = el.tagName ? el.tagName.toLowerCase() : null;
      if (!tag) return null;
      const children = Array.from(el.children)
        .slice(0, 20)
        .map((child) => getLayoutTree(child, depth - 1))
        .filter(Boolean);
      return {
        tag,
        id: el.id || null,
        class: el.className ? el.className.toString().trim().substring(0, 100) : null,
        text: (el.children.length === 0 && el.innerText) ? el.innerText.trim().substring(0, 200) : null,
        children: children.length > 0 ? children : undefined,
      };
    }

    const layoutTree = getLayoutTree(document.body, 5);

    // --- FULL TEXT CONTENT ---
    const fullText = document.body.innerText.replace(/\s+/g, ' ').trim().substring(0, 50000);

    // --- HTML SOURCE ---
    const htmlSource = document.documentElement.outerHTML.substring(0, 200000);

    return {
      meta,
      headings,
      textBlocks,
      links,
      images,
      videos,
      navigation,
      forms,
      tables,
      lists,
      cssVariables,
      stylesheets,
      scripts,
      layoutTree,
      fullText,
      htmlSource,
    };
  }, url);

  // Take screenshot
  try {
    const screenshotBuf = await page.screenshot({ type: 'jpeg', quality: 70 });
    data.screenshot = `data:image/jpeg;base64,${screenshotBuf.toString('base64')}`;
  } catch {
    data.screenshot = null;
  }

  // Extract entities from full text
  try {
    data.entities = extractEntities(data.fullText || '');
  } catch {
    data.entities = { emails: [], phones: [], urls: [], socials: {}, addresses: [] };
  }

  return data;
}

module.exports = { extractPageData };
