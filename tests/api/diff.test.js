/**
 * api/diff.test.js
 * Contract tests for POST /api/diff.
 */

const { TestRunner } = require('../runner');
const { start, stop, post, json } = require('./_server');

const RESULT_A = {
  pages: [
    { meta: { url: 'http://example.com' }, textBlocks: [{ text: 'Hello world' }], links: [{ href: '/about', text: 'About' }], headings: { h1: [{ text: 'Welcome' }] }, images: [] },
  ],
  apiCalls: [],
};

const RESULT_B = {
  pages: [
    { meta: { url: 'http://example.com' }, textBlocks: [{ text: 'Hello world' }, { text: 'New paragraph added' }], links: [{ href: '/about', text: 'About' }, { href: '/contact', text: 'Contact' }], headings: { h1: [{ text: 'Welcome' }] }, images: [] },
    { meta: { url: 'http://example.com/new-page' }, textBlocks: [], links: [], headings: {}, images: [] },
  ],
  apiCalls: [],
};

async function main() {
  const runner = new TestRunner('api');
  await start();

  await runner.run('POST /api/diff with two valid results → 200 + diff object', async ({ setOutput }) => {
    const res = await post('/api/diff', { resultA: RESULT_A, resultB: RESULT_B });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = json(res);
    if (typeof body !== 'object' || Array.isArray(body)) throw new Error('Expected object response');
    setOutput({ status: res.status, keys: Object.keys(body) });
  });

  await runner.run('Diff result shows added page in resultB', async ({ setOutput }) => {
    const res = await post('/api/diff', { resultA: RESULT_A, resultB: RESULT_B });
    const body = json(res);
    if (!body.pages) throw new Error('Diff missing "pages" field');
    if (!Array.isArray(body.pages.added)) throw new Error('Diff pages.added must be array');
    const addedPage = body.pages.added.find(u => u === 'http://example.com/new-page');
    if (!addedPage) throw new Error('Expected new-page to appear in pages.added');
    setOutput({ addedPages: body.pages.added });
  });

  await runner.run('Diff result shows added text in resultB', async ({ setOutput }) => {
    const res = await post('/api/diff', { resultA: RESULT_A, resultB: RESULT_B });
    const body = json(res);
    if (!body.textContent) throw new Error('Diff missing "textContent" field');
    const added = body.textContent.added || [];
    const hasNewParagraph = added.some(t => t.includes('New paragraph added'));
    if (!hasNewParagraph) throw new Error('Expected "New paragraph added" in textContent.added');
    setOutput({ addedTextCount: added.length });
  });

  await runner.run('POST /api/diff identical results → pages added/removed are empty', async ({ setOutput }) => {
    const res = await post('/api/diff', { resultA: RESULT_A, resultB: RESULT_A });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = json(res);
    if (body.pages.added.length !== 0) throw new Error(`Expected 0 added pages, got ${body.pages.added.length}`);
    if (body.pages.removed.length !== 0) throw new Error(`Expected 0 removed pages, got ${body.pages.removed.length}`);
    setOutput({ added: body.pages.added.length, removed: body.pages.removed.length });
  });

  // ── Chaos ──────────────────────────────────────────────────────────────────

  await runner.run('[chaos] POST /api/diff with no body → 400', async ({ setOutput }) => {
    const res = await post('/api/diff', {});
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    setOutput({ status: res.status });
  });

  await runner.run('[chaos] POST /api/diff with empty results → does not 500', async ({ setOutput }) => {
    const res = await post('/api/diff', { resultA: { pages: [] }, resultB: { pages: [] } });
    if (res.status === 500) throw new Error('Server crashed on empty results');
    setOutput({ status: res.status });
  });

  await runner.run('[chaos] POST /api/diff missing resultB → 400', async ({ setOutput }) => {
    const res = await post('/api/diff', { resultA: RESULT_A });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    setOutput({ status: res.status });
  });

  stop();
  const result = runner.finish();
  process.exit(result.summary.failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('Test runner crashed:', err.message); process.exit(1); });
