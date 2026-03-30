/**
 * api/generators.test.js
 * Contract tests for /api/generate/* endpoints.
 */

const { TestRunner } = require('../runner');
const { start, stop, post, json } = require('./_server');

// Minimal pageData fixture that exercises all generators
const PAGE_DATA = {
  meta: { url: 'http://example.com', title: 'Test Page', description: 'A test page' },
  headings: { h1: [{ text: 'Hello World' }], h2: [{ text: 'Section One' }] },
  links: [
    { href: '/about', text: 'About', isInternal: true },
    { href: 'http://external.com', text: 'External', isInternal: false },
  ],
  images: [{ src: '/img/logo.png', alt: 'Logo', width: 100, height: 100 }],
  navigation: [{ items: [{ href: '/', text: 'Home' }, { href: '/about', text: 'About' }] }],
  textBlocks: [{ text: 'This is sample text content for the test page.' }],
  colors: ['#333333', '#ffffff'],
  fonts: [{ family: 'Arial', weight: '400' }],
  cssVariables: [{ name: '--primary', value: '#0066cc' }],
  stylesheets: [],
  inlineStyles: [],
  tables: [],
  forms: [],
};

async function main() {
  const runner = new TestRunner('api');
  await start();

  // ── /api/generate/react ────────────────────────────────────────────────────

  await runner.run('POST /api/generate/react → 200 + { jsx: string }', async ({ setOutput }) => {
    const res = await post('/api/generate/react', { pageData: PAGE_DATA });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = json(res);
    if (typeof body.jsx !== 'string') throw new Error('Expected jsx string');
    if (!body.jsx.includes('React')) throw new Error('JSX output missing React import');
    setOutput({ status: res.status, length: body.jsx.length });
  });

  await runner.run('[chaos] POST /api/generate/react with no pageData → 400', async ({ setOutput }) => {
    const res = await post('/api/generate/react', {});
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    setOutput({ status: res.status });
  });

  // ── /api/generate/css ──────────────────────────────────────────────────────

  await runner.run('POST /api/generate/css → 200 + { css: string }', async ({ setOutput }) => {
    const res = await post('/api/generate/css', { pageData: PAGE_DATA });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = json(res);
    if (typeof body.css !== 'string') throw new Error('Expected css string');
    setOutput({ status: res.status, length: body.css.length });
  });

  await runner.run('[chaos] POST /api/generate/css with no pageData → 400', async ({ setOutput }) => {
    const res = await post('/api/generate/css', {});
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    setOutput({ status: res.status });
  });

  // ── /api/generate/markdown ─────────────────────────────────────────────────

  await runner.run('POST /api/generate/markdown → 200 + { markdown: string }', async ({ setOutput }) => {
    const res = await post('/api/generate/markdown', { pageData: PAGE_DATA });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = json(res);
    if (typeof body.markdown !== 'string') throw new Error('Expected markdown string');
    if (!body.markdown.includes('#')) throw new Error('Markdown output missing headings');
    setOutput({ status: res.status, length: body.markdown.length });
  });

  await runner.run('[chaos] POST /api/generate/markdown with no pageData → 400', async ({ setOutput }) => {
    const res = await post('/api/generate/markdown', {});
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    setOutput({ status: res.status });
  });

  // ── /api/generate/sitemap ──────────────────────────────────────────────────

  await runner.run('POST /api/generate/sitemap → 200 + XML string', async ({ setOutput }) => {
    const pages = [
      { meta: { url: 'http://example.com' } },
      { meta: { url: 'http://example.com/about' } },
    ];
    const res = await post('/api/generate/sitemap', { pages });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (!res.body.includes('<?xml') && !res.body.includes('<urlset')) {
      throw new Error('Response is not XML sitemap format');
    }
    setOutput({ status: res.status, length: res.body.length });
  });

  await runner.run('[chaos] POST /api/generate/sitemap with no pages → 400', async ({ setOutput }) => {
    const res = await post('/api/generate/sitemap', {});
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    setOutput({ status: res.status });
  });

  // ── Chaos: empty pageData ──────────────────────────────────────────────────

  await runner.run('[chaos] POST /api/generate/react with empty pageData → does not 500', async ({ setOutput }) => {
    const res = await post('/api/generate/react', { pageData: {} });
    if (res.status === 500) throw new Error('Server crashed on empty pageData');
    setOutput({ status: res.status });
  });

  stop();
  const result = runner.finish();
  process.exit(result.summary.failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('Test runner crashed:', err.message); process.exit(1); });
