/**
 * unit/diff.test.js
 * Tests for src/diff.js — diffScrapes()
 */

const { TestRunner } = require('../runner');
const { diffScrapes } = require('../../src/diff');

const PAGE_A = { meta: { url: 'http://a.com', title: 'A' }, textBlocks: [{ text: 'Hello' }], links: [{ href: '/home' }], headings: { h1: [{ text: 'Welcome' }] }, images: [] };
const PAGE_B = { meta: { url: 'http://b.com', title: 'B' }, textBlocks: [{ text: 'World' }], links: [{ href: '/about' }], headings: { h1: [{ text: 'About' }] }, images: [{ src: '/logo.png' }] };
const PAGE_A2 = { meta: { url: 'http://a.com/page2' }, textBlocks: [], links: [], headings: {}, images: [] };

async function main() {
  const runner = new TestRunner('unit');

  // ── Return shape ──────────────────────────────────────────────────────────

  await runner.run('returns pages, apiCalls, assets, summary', ({ setOutput }) => {
    const result = diffScrapes({ pages: [PAGE_A] }, { pages: [PAGE_A] });
    const expected = ['pages', 'apiCalls', 'assets', 'summary'];
    for (const k of expected) {
      if (!(k in result)) throw new Error(`Missing key: ${k}`);
    }
    setOutput({ keys: Object.keys(result) });
  });

  // ── Page diff ─────────────────────────────────────────────────────────────

  await runner.run('detects added page in B', ({ setOutput }) => {
    const diff = diffScrapes({ pages: [PAGE_A] }, { pages: [PAGE_A, PAGE_A2] });
    if (!diff.pages.added.includes('http://a.com/page2')) throw new Error('Added page not detected');
    setOutput({ added: diff.pages.added });
  });

  await runner.run('detects removed page from A', ({ setOutput }) => {
    const diff = diffScrapes({ pages: [PAGE_A, PAGE_A2] }, { pages: [PAGE_A] });
    if (!diff.pages.removed.includes('http://a.com/page2')) throw new Error('Removed page not detected');
    setOutput({ removed: diff.pages.removed });
  });

  await runner.run('identical results → pages added/removed are empty', ({ setOutput }) => {
    const diff = diffScrapes({ pages: [PAGE_A] }, { pages: [PAGE_A] });
    if (diff.pages.added.length !== 0) throw new Error('Expected 0 added');
    if (diff.pages.removed.length !== 0) throw new Error('Expected 0 removed');
    setOutput({ ok: true });
  });

  // ── Text / links / images diff ────────────────────────────────────────────

  await runner.run('detects added text block', ({ setOutput }) => {
    const a = { pages: [{ meta: { url: 'http://x.com' }, textBlocks: [{ text: 'Old' }], links: [], headings: {}, images: [] }] };
    const b = { pages: [{ meta: { url: 'http://x.com' }, textBlocks: [{ text: 'Old' }, { text: 'New' }], links: [], headings: {}, images: [] }] };
    const diff = diffScrapes(a, b);
    if (!diff.textContent.added.includes('New')) throw new Error('Expected "New" in textContent.added');
    setOutput({ added: diff.textContent.added });
  });

  await runner.run('detects added link', ({ setOutput }) => {
    const a = { pages: [{ meta: { url: 'http://x.com' }, textBlocks: [], links: [{ href: '/old' }], headings: {}, images: [] }] };
    const b = { pages: [{ meta: { url: 'http://x.com' }, textBlocks: [], links: [{ href: '/old' }, { href: '/new' }], headings: {}, images: [] }] };
    const diff = diffScrapes(a, b);
    if (!diff.links.added.includes('/new')) throw new Error('Expected /new in links.added');
    setOutput({ added: diff.links.added });
  });

  await runner.run('detects added image', ({ setOutput }) => {
    const a = { pages: [{ meta: { url: 'http://x.com' }, textBlocks: [], links: [], headings: {}, images: [] }] };
    const b = { pages: [{ meta: { url: 'http://x.com' }, textBlocks: [], links: [], headings: {}, images: [{ src: '/new.png' }] }] };
    const diff = diffScrapes(a, b);
    if (!diff.images.added.includes('/new.png')) throw new Error('Expected /new.png in images.added');
    setOutput({ added: diff.images.added });
  });

  await runner.run('detects title change', ({ setOutput }) => {
    const a = { pages: [{ meta: { url: 'http://x.com', title: 'Old Title' }, textBlocks: [], links: [], headings: {}, images: [] }] };
    const b = { pages: [{ meta: { url: 'http://x.com', title: 'New Title' }, textBlocks: [], links: [], headings: {}, images: [] }] };
    const diff = diffScrapes(a, b);
    if (!diff.title) throw new Error('Expected title diff');
    if (diff.title.from !== 'Old Title') throw new Error('Wrong from');
    if (diff.title.to !== 'New Title') throw new Error('Wrong to');
    setOutput({ title: diff.title });
  });

  // ── Summary counts ────────────────────────────────────────────────────────

  await runner.run('summary.pages counts match actual arrays', ({ setOutput }) => {
    const diff = diffScrapes({ pages: [PAGE_A] }, { pages: [PAGE_B] });
    if (diff.summary.pages.added !== diff.pages.added.length) throw new Error('summary.pages.added mismatch');
    if (diff.summary.pages.removed !== diff.pages.removed.length) throw new Error('summary.pages.removed mismatch');
    setOutput({ summary: diff.summary.pages });
  });

  // ── Chaos ─────────────────────────────────────────────────────────────────

  await runner.run('[chaos] empty pages arrays → no crash, empty diffs', ({ setOutput }) => {
    const diff = diffScrapes({ pages: [] }, { pages: [] });
    if (!Array.isArray(diff.pages.added)) throw new Error('Expected array');
    setOutput({ ok: true });
  });

  await runner.run('[chaos] missing pages key → no crash', ({ setOutput }) => {
    const diff = diffScrapes({}, {});
    if (!diff.pages) throw new Error('Expected pages key');
    setOutput({ ok: true });
  });

  await runner.run('[chaos] page with no meta → no crash', ({ setOutput }) => {
    const diff = diffScrapes(
      { pages: [{ textBlocks: [], links: [], headings: {}, images: [] }] },
      { pages: [{ textBlocks: [], links: [], headings: {}, images: [] }] }
    );
    if (typeof diff !== 'object') throw new Error('Expected object');
    setOutput({ ok: true });
  });

  await runner.run('[chaos] apiCalls missing in inputs → no crash', ({ setOutput }) => {
    const diff = diffScrapes({ pages: [] }, { pages: [] });
    if (!diff.apiCalls) throw new Error('Expected apiCalls key');
    setOutput({ ok: true });
  });

  const result = runner.finish();
  process.exit(result.summary.failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('Test runner crashed:', err.message); process.exit(1); });
