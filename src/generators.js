/**
 * Code generators: React component, CSS extractor, Markdown export, XML Sitemap.
 */

function generateReact(pageData) {
  if (!pageData) return '// No page data available';

  const meta = pageData.meta || {};
  const headings = pageData.headings || {};
  const images = (pageData.images || []).slice(0, 10);
  const links = (pageData.links || []).filter((l) => l.isInternal).slice(0, 15);
  const navigation = pageData.navigation || [];
  const textBlocks = (pageData.textBlocks || []).slice(0, 10);

  function escapeJSX(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;').replace(/"/g, '&quot;');
  }

  const navJSX = navigation.length > 0
    ? `    <nav>
      <ul>
${navigation[0].items.slice(0, 10).map((item) => `        <li><a href="${escapeJSX(item.href)}">${escapeJSX(item.text)}</a></li>`).join('\n')}
      </ul>
    </nav>`
    : '';

  const headingJSX = Object.entries(headings)
    .flatMap(([tag, items]) =>
      (items || []).slice(0, 3).map((h) => `    <${tag}>${escapeJSX(h.text)}</${tag}>`)
    )
    .slice(0, 10)
    .join('\n');

  const imgJSX = images
    .filter((img) => img.src)
    .map((img) => `    <img src="${escapeJSX(img.src)}" alt="${escapeJSX(img.alt || '')}" />`)
    .join('\n');

  const linksJSX = links
    .filter((l) => l.text)
    .slice(0, 10)
    .map((l) => `    <a href="${escapeJSX(l.href)}">${escapeJSX(l.text)}</a>`)
    .join('\n');

  const textJSX = textBlocks
    .slice(0, 5)
    .map((b) => `    <p>${escapeJSX(b.text.substring(0, 200))}</p>`)
    .join('\n');

  return `import React from 'react';

// Auto-generated from WebScraper Pro
// Page: ${escapeJSX(meta.title || meta.url || 'Unknown')}

const ScrapedPage: React.FC = () => {
  return (
    <div className="scraped-page">
${navJSX}

      <header>
${headingJSX}
      </header>

      <main>
${textJSX}

${imgJSX}

${linksJSX}
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
  const meta = pageData.meta || {};

  const rootVars = Object.entries(cssVars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');

  const headings = pageData.headings || {};
  const h1List = headings.h1 || [];

  const titleComment = `/* Generated CSS from: ${meta.url || 'unknown'} */\n`;

  const rootBlock = rootVars
    ? `:root {\n${rootVars}\n}\n\n`
    : ':root {\n  /* No CSS variables found */\n}\n\n';

  const baseStyles = `/* Base styles */
body {
  font-family: system-ui, -apple-system, sans-serif;
  line-height: 1.6;
  margin: 0;
  padding: 0;
}

.scraped-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1rem;
}

nav ul {
  display: flex;
  gap: 1rem;
  list-style: none;
  padding: 0;
  margin: 0;
}

nav a {
  text-decoration: none;
  color: inherit;
}

h1, h2, h3, h4, h5, h6 {
  margin-bottom: 0.5rem;
}

img {
  max-width: 100%;
  height: auto;
}

p {
  margin-bottom: 1rem;
}

a:hover {
  opacity: 0.8;
}
`;

  return titleComment + rootBlock + baseStyles;
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
