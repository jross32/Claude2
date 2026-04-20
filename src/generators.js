/**
 * Code generators: React component, CSS extractor, Markdown export, XML Sitemap.
 */

function generateReact(pageData) {
  if (!pageData) return '// No page data available';

  const meta      = pageData.meta || {};
  const headings  = pageData.headings || {};
  const images    = (pageData.images || []).filter((i) => i.src);
  const links     = (pageData.links || []).filter((l) => l.text);
  const nav       = pageData.navigation || [];
  const textBlocks = pageData.textBlocks || [];
  const tables    = pageData.tables || [];
  const forms     = pageData.forms || [];
  const prices    = pageData.prices || [];
  const ratings   = pageData.ratings || [];

  function esc(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;').replace(/"/g, '&quot;');
  }

  // ── Detect page type ───────────────────────────────────────────────────────
  const hasData    = tables.length > 0;
  const hasForms   = forms.length > 0;
  const hasProducts = prices.length > 0 || ratings.length > 0;
  const hasGallery = images.length >= 6;

  // ── Sub-component generators ───────────────────────────────────────────────
  function buildNav() {
    if (!nav.length || !nav[0].items?.length) return '';
    const items = nav[0].items.slice(0, 10).map((i) =>
      `        <li><a href="${esc(i.href)}">${esc(i.text)}</a></li>`
    ).join('\n');
    return `    <nav className="site-nav">\n      <ul>\n${items}\n      </ul>\n    </nav>`;
  }

  function buildTables() {
    return tables.slice(0, 3).map((tbl, ti) => {
      if (!tbl.headers?.length) return '';
      const headers = tbl.headers.map((h) => `          <th>${esc(h)}</th>`).join('\n');
      const rows = (tbl.rows || []).slice(0, 20).map((row) => {
        const cells = row.map((c) => `          <td>${esc(String(c))}</td>`).join('\n');
        return `        <tr>\n${cells}\n        </tr>`;
      }).join('\n');
      return `    <div className="table-wrapper" key={${ti}}>
      <table>
        <thead><tr>\n${headers}\n        </tr></thead>
        <tbody>\n${rows}\n        </tbody>
      </table>
    </div>`;
    }).filter(Boolean).join('\n\n');
  }

  function buildForms() {
    return forms.slice(0, 2).map((form, fi) => {
      const action = esc(form.action || '#');
      const method = esc((form.method || 'get').toUpperCase());
      const fields = (form.fields || []).slice(0, 15).map((f) => {
        const label = esc(f.label || f.name || f.id || '');
        const name  = esc(f.name || f.id || '');
        const type  = esc(f.type || 'text');
        const ph    = esc(f.placeholder || '');
        if (type === 'textarea') {
          return `      <div className="form-field">\n        <label htmlFor="${name}">${label}</label>\n        <textarea id="${name}" name="${name}" placeholder="${ph}" />\n      </div>`;
        }
        if (type === 'select') {
          const opts = (f.options || []).slice(0, 10).map((o) =>
            `          <option value="${esc(o.value || o)}">${esc(o.label || o)}</option>`
          ).join('\n');
          return `      <div className="form-field">\n        <label htmlFor="${name}">${label}</label>\n        <select id="${name}" name="${name}">\n${opts}\n        </select>\n      </div>`;
        }
        return `      <div className="form-field">\n        <label htmlFor="${name}">${label}</label>\n        <input id="${name}" name="${name}" type="${type}" placeholder="${ph}" />\n      </div>`;
      }).join('\n');
      return `    <form key={${fi}} action="${action}" method="${method}" className="scraped-form">
${fields}
      <button type="submit">Submit</button>
    </form>`;
    }).join('\n\n');
  }

  function buildProductCards() {
    const items = [];
    const maxCards = Math.min(images.length, Math.max(prices.length, ratings.length, 6));
    for (let i = 0; i < maxCards; i++) {
      const img   = images[i];
      const price = prices[i];
      const rating = ratings[i];
      items.push(`    <div className="product-card">
      ${img ? `<img src="${esc(img.src)}" alt="${esc(img.alt || '')}" />` : ''}
      ${img?.alt ? `<h3>${esc(img.alt)}</h3>` : ''}
      ${price ? `<span className="price">${esc(String(price.price || price))}</span>` : ''}
      ${rating ? `<span className="rating">★ ${esc(String(rating.value || rating))}</span>` : ''}
    </div>`);
    }
    return items.join('\n');
  }

  function buildGallery() {
    return images.slice(0, 24).map((img) =>
      `      <figure><img src="${esc(img.src)}" alt="${esc(img.alt || '')}" loading="lazy" /></figure>`
    ).join('\n');
  }

  function buildArticle() {
    const h1s = (headings.h1 || []).slice(0, 1).map((h) => `      <h1>${esc(h.text)}</h1>`).join('');
    const h2s = (headings.h2 || []).slice(0, 4).map((h) => `      <h2>${esc(h.text)}</h2>`).join('\n');
    const paragraphs = textBlocks.slice(0, 6).map((b) =>
      `      <p>${esc(b.text.substring(0, 300))}</p>`
    ).join('\n');
    const imgs = images.slice(0, 4).map((img) =>
      `      <img src="${esc(img.src)}" alt="${esc(img.alt || '')}" />`
    ).join('\n');
    const linkList = links.filter((l) => l.isInternal).slice(0, 10).map((l) =>
      `        <li><a href="${esc(l.href)}">${esc(l.text)}</a></li>`
    ).join('\n');
    return `    <article>
${h1s}
${h2s}
${paragraphs}
${imgs}
    </article>
    ${linkList ? `<aside>\n      <ul>\n${linkList}\n      </ul>\n    </aside>` : ''}`;
  }

  // ── Assemble component ─────────────────────────────────────────────────────
  const navJSX  = buildNav();
  let mainJSX;
  if (hasData)     mainJSX = buildTables();
  else if (hasForms)    mainJSX = buildForms();
  else if (hasProducts) mainJSX = buildProductCards();
  else if (hasGallery)  mainJSX = `    <div className="gallery">\n${buildGallery()}\n    </div>`;
  else                  mainJSX = buildArticle();

  const pageType = hasData ? 'data-table' : hasForms ? 'form' : hasProducts ? 'product-grid' : hasGallery ? 'gallery' : 'article';

  return `import React from 'react';

// Auto-generated from WebScraper Pro — layout: ${pageType}
// Source: ${esc(meta.title || meta.url || 'Unknown')}

const ScrapedPage: React.FC = () => {
  return (
    <div className="scraped-page" data-layout="${pageType}">
${navJSX}

      <main>
${mainJSX}
      </main>
    </div>
  );
};

export default ScrapedPage;
`;
}

function extractCSS(pageData) {
  if (!pageData) return '/* No page data available */';

  const cssVars = pageData.cssVariables || {};
  const meta    = pageData.meta || {};
  const colors  = pageData.colors || [];

  // ── 1. Extracted site CSS variables ────────────────────────────────────────
  const extractedVars = Object.entries(cssVars).map(([k, v]) => `  ${k}: ${v};`).join('\n');

  // ── 2. Derive a rough color palette from extracted colors ──────────────────
  const brandColors = colors.slice(0, 6);
  const colorTokens = brandColors.length
    ? brandColors.map((c, i) => `  --color-brand-${i}: ${c};`).join('\n')
    : '  --color-brand-0: #0066cc;\n  --color-brand-1: #004499;';

  const titleComment = `/* Generated design system from: ${meta.url || 'unknown'} */\n`;

  const rootBlock = `:root {
  /* ── Site-extracted CSS variables ── */
${extractedVars || '  /* none found */'}

  /* ── Color palette ── */
${colorTokens}
  --color-text:       #1a1a1a;
  --color-text-muted: #6b7280;
  --color-bg:         #ffffff;
  --color-surface:    #f9fafb;
  --color-border:     #e5e7eb;
  --color-accent:     var(--color-brand-0, #0066cc);
  --color-danger:     #dc2626;
  --color-success:    #16a34a;
  --color-warning:    #d97706;

  /* ── Spacing scale (0.25rem steps) ── */
  --space-1:  0.25rem;
  --space-2:  0.5rem;
  --space-3:  0.75rem;
  --space-4:  1rem;
  --space-5:  1.25rem;
  --space-6:  1.5rem;
  --space-8:  2rem;
  --space-10: 2.5rem;
  --space-12: 3rem;
  --space-16: 4rem;
  --space-20: 5rem;
  --space-24: 6rem;

  /* ── Typography scale ── */
  --text-xs:   clamp(0.65rem, 0.6rem + 0.25vw, 0.75rem);
  --text-sm:   clamp(0.8rem,  0.75rem + 0.25vw, 0.875rem);
  --text-base: clamp(0.9rem,  0.85rem + 0.25vw, 1rem);
  --text-lg:   clamp(1rem,    0.95rem + 0.3vw,  1.125rem);
  --text-xl:   clamp(1.1rem,  1rem + 0.5vw,     1.25rem);
  --text-2xl:  clamp(1.25rem, 1.1rem + 0.75vw,  1.5rem);
  --text-3xl:  clamp(1.5rem,  1.2rem + 1.5vw,   2rem);
  --text-4xl:  clamp(1.75rem, 1.3rem + 2.25vw,  2.5rem);
  --font-sans: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: ui-monospace, 'Cascadia Code', 'Fira Code', monospace;
  --leading-tight:  1.25;
  --leading-normal: 1.6;
  --leading-loose:  1.8;
  --tracking-tight: -0.025em;
  --tracking-wide:   0.025em;

  /* ── Border & shape ── */
  --radius-sm: 0.25rem;
  --radius:    0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
  --radius-full: 9999px;

  /* ── Shadows ── */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow:    0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);

  /* ── Transitions ── */
  --transition-fast:   150ms ease;
  --transition-normal: 250ms ease;
  --transition-slow:   400ms ease;

  /* ── Layout ── */
  --container:  1200px;
  --sidebar-w:  260px;
}

/* ── Dark mode ── */
@media (prefers-color-scheme: dark) {
  :root {
    --color-text:       #f9fafb;
    --color-text-muted: #9ca3af;
    --color-bg:         #111827;
    --color-surface:    #1f2937;
    --color-border:     #374151;
  }
}

`;

  const resetStyles = `/* ── Reset ── */
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: var(--leading-normal);
  color: var(--color-text);
  background: var(--color-bg);
}
img, video { max-width: 100%; height: auto; display: block; }
p { margin: 0 0 var(--space-4); }
h1, h2, h3, h4, h5, h6 { margin: 0 0 var(--space-3); line-height: var(--leading-tight); }

`;

  const layoutStyles = `/* ── Layout ── */
.container { max-width: var(--container); margin-inline: auto; padding-inline: var(--space-4); }
.scraped-page { display: flex; flex-direction: column; min-height: 100vh; }

/* ── Responsive breakpoints ── */
/* xs  < 480px   | sm  480-767px  | md  768-1023px
   lg  1024-1279 | xl  1280-1535  | 2xl ≥ 1536px  */
@media (min-width: 768px)  { .container { padding-inline: var(--space-8); } }
@media (min-width: 1280px) { .container { padding-inline: var(--space-12); } }
@media (min-width: 1536px) {
  .container { padding-inline: clamp(var(--space-12), 5vw, var(--space-24)); }
  body { font-size: clamp(1rem, 0.9rem + 0.25vw, 1.125rem); }
}

`;

  const componentStyles = `/* ── Navigation ── */
.site-nav ul { display: flex; gap: var(--space-4); list-style: none; margin: 0; padding: 0; flex-wrap: wrap; }
.site-nav a { text-decoration: none; color: inherit; transition: color var(--transition-fast); }
.site-nav a:hover { color: var(--color-accent); }

/* ── Buttons ── */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2);
  padding: var(--space-2) var(--space-5); border-radius: var(--radius); font-size: var(--text-sm);
  font-weight: 500; border: 1px solid transparent; cursor: pointer; transition: all var(--transition-fast);
  min-height: 44px; white-space: nowrap; }
.btn-primary { background: var(--color-accent); color: #fff; border-color: var(--color-accent); }
.btn-primary:hover { filter: brightness(1.1); }
.btn-secondary { background: transparent; color: var(--color-text); border-color: var(--color-border); }
.btn-secondary:hover { background: var(--color-surface); }
.btn-danger { background: var(--color-danger); color: #fff; border-color: var(--color-danger); }

/* ── Cards ── */
.card { background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: var(--radius-md); padding: var(--space-6); box-shadow: var(--shadow-sm); }

/* ── Product grid ── */
.product-card { display: flex; flex-direction: column; gap: var(--space-2);
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: var(--radius-md); padding: var(--space-4); overflow: hidden; }
.product-card img { width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: var(--radius-sm); }
.product-card h3 { font-size: var(--text-base); margin: 0; }
.product-card .price { font-size: var(--text-lg); font-weight: 700; color: var(--color-accent); }
.product-card .rating { font-size: var(--text-sm); color: var(--color-text-muted); }
[data-layout="product-grid"] main {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-6); }

/* ── Gallery ── */
.gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-4); }
.gallery figure { margin: 0; border-radius: var(--radius); overflow: hidden;
  background: var(--color-surface); }
.gallery img { width: 100%; aspect-ratio: 1; object-fit: cover;
  transition: transform var(--transition-normal); }
.gallery img:hover { transform: scale(1.04); }

/* ── Tables ── */
.table-wrapper { overflow-x: auto; border-radius: var(--radius-md);
  border: 1px solid var(--color-border); }
table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
thead { background: var(--color-surface); position: sticky; top: 0; }
th { text-align: left; padding: var(--space-3) var(--space-4); font-weight: 600;
  border-bottom: 2px solid var(--color-border); white-space: nowrap; }
td { padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--color-border); }
tr:last-child td { border-bottom: none; }
tr:hover td { background: var(--color-surface); }

/* ── Forms ── */
.scraped-form { display: flex; flex-direction: column; gap: var(--space-4);
  max-width: 480px; }
.form-field { display: flex; flex-direction: column; gap: var(--space-1); }
label { font-size: var(--text-sm); font-weight: 500; color: var(--color-text); }
input, textarea, select {
  padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border);
  border-radius: var(--radius); font-size: var(--text-base); font-family: var(--font-sans);
  background: var(--color-bg); color: var(--color-text); transition: border-color var(--transition-fast);
  min-height: 44px; }
input:focus, textarea:focus, select:focus {
  outline: none; border-color: var(--color-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 20%, transparent); }
textarea { resize: vertical; min-height: 100px; }

/* ── Articles ── */
article { max-width: 72ch; }
article h1 { font-size: var(--text-4xl); }
article h2 { font-size: var(--text-3xl); margin-top: var(--space-8); }
article h3 { font-size: var(--text-2xl); margin-top: var(--space-6); }
article p  { color: var(--color-text); }

/* ── Utilities ── */
.flex   { display: flex; }
.grid   { display: grid; }
.hidden { display: none; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.text-xs   { font-size: var(--text-xs); }
.text-sm   { font-size: var(--text-sm); }
.text-lg   { font-size: var(--text-lg); }
.text-xl   { font-size: var(--text-xl); }
.font-bold { font-weight: 700; }
.text-muted { color: var(--color-text-muted); }
.text-accent { color: var(--color-accent); }
.mt-4  { margin-top: var(--space-4); }
.mb-4  { margin-bottom: var(--space-4); }
.gap-4 { gap: var(--space-4); }
.p-4   { padding: var(--space-4); }
.rounded { border-radius: var(--radius); }
.shadow  { box-shadow: var(--shadow); }
.border  { border: 1px solid var(--color-border); }
`;

  return titleComment + rootBlock + resetStyles + layoutStyles + componentStyles;
}

function generateMarkdown(pageData) {
  if (!pageData) return '# No page data available\n';

  const meta = pageData.meta || {};
  const headings = pageData.headings || {};
  const textBlocks = pageData.textBlocks || [];
  const links = (pageData.links || []).filter((l) => l.text).slice(0, 30);
  const images = (pageData.images || []).filter((img) => img.src).slice(0, 20);
  const tables = pageData.tables || [];

  const lines = [];

  // Title
  lines.push(`# ${meta.title || 'Untitled Page'}\n`);
  if (meta.description) lines.push(`> ${meta.description}\n`);
  if (meta.url) lines.push(`**URL:** ${meta.url}\n`);
  lines.push('---\n');

  // Headings and text
  const hTagMap = { h1: '#', h2: '##', h3: '###', h4: '####', h5: '#####', h6: '######' };
  for (const [tag, prefix] of Object.entries(hTagMap)) {
    const items = headings[tag] || [];
    items.slice(0, 5).forEach((h) => {
      if (h.text) lines.push(`${prefix} ${h.text}\n`);
    });
  }

  // Text blocks
  if (textBlocks.length > 0) {
    lines.push('## Content\n');
    textBlocks.slice(0, 10).forEach((block) => {
      if (block.text && block.text.length > 10) {
        lines.push(block.text.substring(0, 500) + '\n');
      }
    });
  }

  // Images
  if (images.length > 0) {
    lines.push('## Images\n');
    images.forEach((img) => {
      lines.push(`![${img.alt || ''}](${img.src})\n`);
    });
  }

  // Links
  if (links.length > 0) {
    lines.push('## Links\n');
    links.forEach((link) => {
      lines.push(`- [${link.text}](${link.href})\n`);
    });
  }

  // Tables
  tables.slice(0, 5).forEach((table, i) => {
    if (table.headers && table.headers.length > 0) {
      lines.push(`\n## Table ${i + 1}\n`);
      lines.push('| ' + table.headers.join(' | ') + ' |');
      lines.push('| ' + table.headers.map(() => '---').join(' | ') + ' |');
      table.rows.slice(0, 20).forEach((row) => {
        lines.push('| ' + row.join(' | ') + ' |');
      });
      lines.push('');
    }
  });

  return lines.join('\n');
}

function generateSitemap(pages) {
  if (!pages || pages.length === 0) {
    return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>';
  }

  const urls = pages
    .filter((p) => p && p.meta && p.meta.url)
    .map((p) => {
      const loc = p.meta.url.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `  <url><loc>${loc}</loc></url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

module.exports = { generateReact, extractCSS, generateMarkdown, generateSitemap };
