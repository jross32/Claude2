/**
 * unit/generators.test.js
 * Tests for src/generators.js — generateReact, extractCSS, generateMarkdown, generateSitemap
 */

const { TestRunner } = require('../runner');
const { generateReact, extractCSS, generateMarkdown, generateSitemap } = require('../../src/generators');

const PAGE_DATA = {
  meta: { url: 'http://example.com', title: 'Test Page', description: 'A test' },
  headings: { h1: [{ text: 'Hello World' }], h2: [{ text: 'Section One' }] },
  links: [
    { href: '/about', text: 'About', isInternal: true },
    { href: 'http://ext.com', text: 'Ext', isInternal: false },
  ],
  images: [{ src: '/img/logo.png', alt: 'Logo', width: 100, height: 100 }],
  navigation: [{ items: [{ href: '/', text: 'Home' }, { href: '/about', text: 'About' }] }],
  textBlocks: [{ text: 'This is sample content for testing.' }],
  colors: ['#333', '#fff'],
  fonts: [{ family: 'Arial', weight: '400' }],
  cssVariables: [{ name: '--primary', value: '#0066cc' }],
  stylesheets: [],
  inlineStyles: [],
  tables: [],
  forms: [],
};

async function main() {
  const runner = new TestRunner('unit');

  // ── generateReact ─────────────────────────────────────────────────────────

  await runner.run('generateReact returns a string', ({ setOutput }) => {
    const jsx = generateReact(PAGE_DATA);
    if (typeof jsx !== 'string') throw new Error('Expected string');
    setOutput({ length: jsx.length });
  });

  await runner.run('generateReact output contains React import', ({ setOutput }) => {
    const jsx = generateReact(PAGE_DATA);
    if (!jsx.includes('React')) throw new Error('Missing React import');
    setOutput({ ok: true });
  });

  await runner.run('generateReact output includes page heading text', ({ setOutput }) => {
    const jsx = generateReact(PAGE_DATA);
    if (!jsx.includes('Hello World')) throw new Error('Heading not in JSX output');
    setOutput({ ok: true });
  });

  await runner.run('generateReact only includes internal links', ({ setOutput }) => {
    const jsx = generateReact(PAGE_DATA);
    if (jsx.includes('ext.com')) throw new Error('External link should not be in output');
    setOutput({ ok: true });
  });

  await runner.run('[chaos] generateReact with null → returns fallback string', ({ setOutput }) => {
    const jsx = generateReact(null);
    if (typeof jsx !== 'string') throw new Error('Expected string');
    setOutput({ result: jsx.slice(0, 40) });
  });

  await runner.run('[chaos] generateReact with empty object → no crash', ({ setOutput }) => {
    const jsx = generateReact({});
    if (typeof jsx !== 'string') throw new Error('Expected string');
    setOutput({ ok: true });
  });

  // ── extractCSS ────────────────────────────────────────────────────────────

  await runner.run('extractCSS returns a string', ({ setOutput }) => {
    const css = extractCSS(PAGE_DATA);
    if (typeof css !== 'string') throw new Error('Expected string');
    setOutput({ length: css.length });
  });

  await runner.run('extractCSS output contains :root block', ({ setOutput }) => {
    const css = extractCSS(PAGE_DATA);
    if (!css.includes(':root')) throw new Error('Missing :root block');
    setOutput({ ok: true });
  });

  await runner.run('[chaos] extractCSS with null → returns fallback string', ({ setOutput }) => {
    const css = extractCSS(null);
    if (typeof css !== 'string') throw new Error('Expected string');
    setOutput({ result: css.slice(0, 40) });
  });

  await runner.run('[chaos] extractCSS with empty object → no crash', ({ setOutput }) => {
    const css = extractCSS({});
    if (typeof css !== 'string') throw new Error('Expected string');
    setOutput({ ok: true });
  });

  // ── generateMarkdown ──────────────────────────────────────────────────────

  await runner.run('generateMarkdown returns a string', ({ setOutput }) => {
    const md = generateMarkdown(PAGE_DATA);
    if (typeof md !== 'string') throw new Error('Expected string');
    setOutput({ length: md.length });
  });

  await runner.run('generateMarkdown output contains h1 heading marker', ({ setOutput }) => {
    const md = generateMarkdown(PAGE_DATA);
    if (!md.includes('#')) throw new Error('Missing heading markers');
    setOutput({ ok: true });
  });

  await runner.run('generateMarkdown includes page title', ({ setOutput }) => {
    const md = generateMarkdown(PAGE_DATA);
    if (!md.includes('Test Page')) throw new Error('Title missing from markdown');
    setOutput({ ok: true });
  });

  await runner.run('generateMarkdown includes links section', ({ setOutput }) => {
    const md = generateMarkdown(PAGE_DATA);
    if (!md.includes('About')) throw new Error('Links section missing');
    setOutput({ ok: true });
  });

  await runner.run('[chaos] generateMarkdown with null → returns fallback string', ({ setOutput }) => {
    const md = generateMarkdown(null);
    if (typeof md !== 'string') throw new Error('Expected string');
    setOutput({ result: md.slice(0, 40) });
  });

  await runner.run('[chaos] generateMarkdown with empty object → no crash', ({ setOutput }) => {
    const md = generateMarkdown({});
    if (typeof md !== 'string') throw new Error('Expected string');
    setOutput({ ok: true });
  });

  // ── generateSitemap ───────────────────────────────────────────────────────

  await runner.run('generateSitemap returns XML string', ({ setOutput }) => {
    const pages = [{ meta: { url: 'http://example.com' } }, { meta: { url: 'http://example.com/about' } }];
    const xml = generateSitemap(pages);
    if (!xml.includes('<?xml')) throw new Error('Missing XML declaration');
    if (!xml.includes('<urlset')) throw new Error('Missing urlset element');
    setOutput({ length: xml.length });
  });

  await runner.run('generateSitemap includes all page URLs', ({ setOutput }) => {
    const pages = [{ meta: { url: 'http://example.com' } }, { meta: { url: 'http://example.com/about' } }];
    const xml = generateSitemap(pages);
    if (!xml.includes('http://example.com/about')) throw new Error('Missing /about URL');
    setOutput({ ok: true });
  });

  await runner.run('generateSitemap escapes & in URLs', ({ setOutput }) => {
    const pages = [{ meta: { url: 'http://example.com/page?a=1&b=2' } }];
    const xml = generateSitemap(pages);
    if (xml.includes('a=1&b=2') && !xml.includes('&amp;')) throw new Error('Ampersand not escaped');
    setOutput({ ok: true });
  });

  await runner.run('[chaos] generateSitemap with null → returns empty sitemap', ({ setOutput }) => {
    const xml = generateSitemap(null);
    if (!xml.includes('<?xml')) throw new Error('Expected XML fallback');
    setOutput({ ok: true });
  });

  await runner.run('[chaos] generateSitemap with empty array → returns empty urlset', ({ setOutput }) => {
    const xml = generateSitemap([]);
    if (!xml.includes('<urlset')) throw new Error('Missing urlset element');
    setOutput({ ok: true });
  });

  await runner.run('[chaos] generateSitemap with pages missing meta → no crash', ({ setOutput }) => {
    const xml = generateSitemap([{}, { meta: {} }, { meta: { url: 'http://ok.com' } }]);
    if (!xml.includes('http://ok.com')) throw new Error('Valid URL should be in output');
    setOutput({ ok: true });
  });

  const result = runner.finish();
  process.exit(result.summary.failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('Test runner crashed:', err.message); process.exit(1); });
